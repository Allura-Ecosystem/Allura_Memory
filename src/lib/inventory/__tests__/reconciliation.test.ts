/**
 * Bumblebee Guard -- inventory reconciliation.
 *
 * Mocks withWorkspaceTransaction, matching src/curator/approve-cli.test.ts's
 * convention. Uses an in-memory fake standing in for inventory_records.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ResolvedWorkspaceScope } from "../../db/workspace-scope"
import type { InventorySourceRecord } from "../types"

const { withWorkspaceTransaction } = vi.hoisted(() => ({ withWorkspaceTransaction: vi.fn() }))
vi.mock("../../db/tenant-transaction", () => ({ withWorkspaceTransaction }))

const { reconcileInventory, hydrateInventoryService } = await import("../reconciliation")

interface FakeRow {
  id: string
  group_id: string
  workspace_id: string
  artifact_type: string
  ecosystem: string
  package: string
  version: string
  hash: string
  publisher: string
  workflow_reference: string
  source_ref: string
  trust_state: string
  freshness_state: string
}

function makeFakeInventoryTable() {
  const rows = new Map<string, FakeRow>()

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO inventory_records")) {
      const [id, group_id, workspace_id, artifact_type, ecosystem, pkg, version, hash, publisher, workflow_reference, source_ref, trust_state, freshness_state] = params as [
        string, string, string, string, string, string, string, string, string, string, string, string, string,
      ]
      rows.set(`${group_id}::${workspace_id}::${id}`, {
        id, group_id, workspace_id, artifact_type, ecosystem, package: pkg, version, hash,
        publisher, workflow_reference, source_ref, trust_state, freshness_state,
      })
      return { rows: [], rowCount: 1 }
    }

    if (sql.includes("UPDATE inventory_records")) {
      const [group_id, workspace_id, source_ref, currentIds] = params as [string, string, string, string[]]
      let count = 0
      for (const row of rows.values()) {
        if (
          row.group_id === group_id &&
          row.workspace_id === workspace_id &&
          row.source_ref === source_ref &&
          row.freshness_state !== "stale" &&
          !currentIds.includes(row.id)
        ) {
          row.freshness_state = "stale"
          count++
        }
      }
      return { rows: [], rowCount: count }
    }

    if (sql.includes("SELECT id, artifact_type")) {
      const [group_id, workspace_id] = params as [string, string]
      const matched = [...rows.values()].filter((r) => r.group_id === group_id && r.workspace_id === workspace_id)
      return { rows: matched, rowCount: matched.length }
    }

    throw new Error(`unexpected query in fake inventory table: ${sql}`)
  })

  return { rows, query }
}

function scope(): ResolvedWorkspaceScope {
  return { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "guard-reconciler" }
}

function makeRecord(fields: Partial<InventorySourceRecord> & { id: string; package: string; version: string }): InventorySourceRecord {
  return {
    artifact_type: "lockfile",
    ecosystem: "npm",
    hash: "sha512-fake",
    publisher: "npm registry",
    workflow_reference: "bun.lock",
    source_ref: "bun.lock",
    trust_state: "verified",
    freshness_state: "fresh",
    ...fields,
  }
}

describe("Story 26.2 Guard — reconcileInventory", () => {
  let fake: ReturnType<typeof makeFakeInventoryTable>

  beforeEach(() => {
    fake = makeFakeInventoryTable()
    withWorkspaceTransaction.mockReset()
    withWorkspaceTransaction.mockImplementation(async (_scope: unknown, callback: (c: unknown) => unknown) => callback({ query: fake.query }))
  })

  it("upserts every current record", async () => {
    const result = await reconcileInventory(scope(), "bun.lock", [
      makeRecord({ id: "bunlock:lodash@4.17.23", package: "lodash", version: "4.17.23" }),
      makeRecord({ id: "bunlock:zod@4.3.6", package: "zod", version: "4.3.6" }),
    ])
    expect(result.upserted).toBe(2)
    expect(fake.rows.size).toBe(2)
  })

  it("marks a record no longer present as stale, without deleting it", async () => {
    await reconcileInventory(scope(), "bun.lock", [
      makeRecord({ id: "bunlock:old-pkg@1.0.0", package: "old-pkg", version: "1.0.0" }),
    ])
    // Second cycle: old-pkg is gone, new-pkg appears.
    const result = await reconcileInventory(scope(), "bun.lock", [
      makeRecord({ id: "bunlock:new-pkg@2.0.0", package: "new-pkg", version: "2.0.0" }),
    ])

    expect(result.markedStale).toBe(1)
    expect(fake.rows.size).toBe(2) // old-pkg row still exists, just stale
    const oldRow = [...fake.rows.values()].find((r) => r.package === "old-pkg")
    expect(oldRow!.freshness_state).toBe("stale")
  })

  it("does not mark anything stale on an empty current-records list (treats it as a read failure, not removal)", async () => {
    await reconcileInventory(scope(), "bun.lock", [
      makeRecord({ id: "bunlock:lodash@4.17.23", package: "lodash", version: "4.17.23" }),
    ])
    const result = await reconcileInventory(scope(), "bun.lock", [])

    expect(result.upserted).toBe(0)
    expect(result.markedStale).toBe(0)
    expect(withWorkspaceTransaction).toHaveBeenCalledTimes(1) // second call short-circuited before any DB call
    const row = [...fake.rows.values()][0]
    expect(row!.freshness_state).toBe("fresh") // untouched
  })

  it("does not mark a different source_ref's records stale", async () => {
    await reconcileInventory(scope(), "other-source", [
      makeRecord({ id: "other:pkg@1.0.0", package: "pkg", version: "1.0.0", source_ref: "other-source" }),
    ])
    await reconcileInventory(scope(), "bun.lock", [
      makeRecord({ id: "bunlock:pkg@1.0.0", package: "pkg", version: "1.0.0" }),
    ])

    const otherRow = [...fake.rows.values()].find((r) => r.source_ref === "other-source")
    expect(otherRow!.freshness_state).toBe("fresh")
  })
})

describe("Story 26.2 Guard — hydrateInventoryService", () => {
  let fake: ReturnType<typeof makeFakeInventoryTable>

  beforeEach(() => {
    fake = makeFakeInventoryTable()
    withWorkspaceTransaction.mockReset()
    withWorkspaceTransaction.mockImplementation(async (_scope: unknown, callback: (c: unknown) => unknown) => callback({ query: fake.query }))
  })

  it("hydrates an in-memory InventoryService from persisted records", async () => {
    await reconcileInventory(scope(), "bun.lock", [
      makeRecord({ id: "bunlock:lodash@4.17.23", package: "lodash", version: "4.17.23" }),
    ])

    const service = await hydrateInventoryService(scope())
    const result = service.queryInventory({ group_id: "allura-test", workspace_id: "workspace-a" }, {})
    expect(result.records).toHaveLength(1)
    expect(result.records[0]!.package).toBe("lodash")
  })

  it("returns an empty, valid service when nothing is persisted yet", async () => {
    const service = await hydrateInventoryService(scope())
    const result = service.queryInventory({ group_id: "allura-test", workspace_id: "workspace-a" }, {})
    expect(result.records).toEqual([])
  })
})
