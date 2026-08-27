/**
 * Story 26.4 — scheduled discovery and alert routing.
 *
 * Uses the REAL Story 26.3 matcher/inventory and Story 26.5 draft generator
 * (all in-memory, already tested elsewhere) and mocks only the DB
 * transaction layer, matching src/curator/approve-cli.test.ts's convention.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { createInventoryService } from "../../inventory/service"
import type { InventorySourceRecord, TenantScope } from "../../inventory/types"
import type { ResolvedWorkspaceScope } from "../../db/workspace-scope"
import type { ThreatAdvisory } from "../../exposure/types"

const { withWorkspaceTransaction } = vi.hoisted(() => ({
  withWorkspaceTransaction: vi.fn(),
}))

vi.mock("../../db/tenant-transaction", () => ({ withWorkspaceTransaction }))

const { markAlertStale, persistAlert, runDiscoveryCycle } = await import("../worker")

interface FakeRow {
  id: string
  group_id: string
  workspace_id: string
  inventory_ref: string
  artifact_ref: string
  advisory_refs: string
  match_type: string
  confidence: number
  severity: string
  evidence_ids: string
  dedup_key: string
  lifecycle_state: string
  created_at: Date
  updated_at: Date
}

/** In-memory fake standing in for the threat_alerts table across a test. */
function makeFakeAlertsTable() {
  const rows = new Map<string, FakeRow>()

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO threat_alerts")) {
      const [id, group_id, workspace_id, inventory_ref, artifact_ref, advisory_refs, match_type, confidence, severity, evidence_ids, dedup_key] = params as [
        string, string, string, string, string, string, string, number, string, string, string,
      ]
      const key = `${group_id}::${workspace_id}::${dedup_key}`
      if ([...rows.values()].some((r) => `${r.group_id}::${r.workspace_id}::${r.dedup_key}` === key)) {
        return { rows: [] }
      }
      const row: FakeRow = {
        id, group_id, workspace_id, inventory_ref, artifact_ref, advisory_refs, match_type,
        confidence, severity, evidence_ids, dedup_key, lifecycle_state: "new",
        created_at: new Date(), updated_at: new Date(),
      }
      rows.set(id, row)
      return { rows: [row] }
    }

    if (sql.includes("SELECT * FROM threat_alerts WHERE group_id")) {
      const [group_id, workspace_id, dedup_key] = params as [string, string, string]
      const row = [...rows.values()].find(
        (r) => r.group_id === group_id && r.workspace_id === workspace_id && r.dedup_key === dedup_key,
      )
      return { rows: row ? [row] : [] }
    }

    if (sql.includes("UPDATE threat_alerts")) {
      const [id, group_id, workspace_id] = params as [string, string, string]
      const row = rows.get(id)
      if (row && row.group_id === group_id && row.workspace_id === workspace_id && row.lifecycle_state !== "resolved") {
        row.lifecycle_state = "stale"
        row.updated_at = new Date()
      }
      return { rows: [] }
    }

    if (sql.includes("INSERT INTO events")) {
      return { rows: [] }
    }

    throw new Error(`unexpected query in fake alerts table: ${sql}`)
  })

  return { rows, query }
}

function makeScope(): ResolvedWorkspaceScope {
  return { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "threat-discovery-worker" }
}

function tenantScopeOf(scope: ResolvedWorkspaceScope): TenantScope {
  return { group_id: scope.tenantId, workspace_id: scope.workspaceId }
}

function makeSource(fields: Partial<InventorySourceRecord> & { id: string; package: string; version: string; hash: string }): InventorySourceRecord {
  const { id, package: pkg, version, hash, ...rest } = fields
  return {
    id, artifact_type: "package_manifest", ecosystem: "npm", package: pkg, version, hash,
    publisher: "trusted-publisher", workflow_reference: ".github/workflows/ci.yml",
    source_ref: `source-${id}`, trust_state: "verified", freshness_state: "fresh", ...rest,
  }
}

function baseAdvisory(override?: Partial<ThreatAdvisory>): ThreatAdvisory {
  return {
    id: "advisory-1", source_id: "osv-1", source_url: "https://example.com/advisory-1",
    publisher: "test-publisher", published_at: "2026-08-25T00:00:00Z", fetched_at: "2026-08-25T01:00:00Z",
    source_revision: "rev-1", content_hash: "sha256-advisory-1", trust_state: "verified",
    freshness_state: "fresh", classification: "compromised-dependency", retention_disposition: "preserve",
    severity: "high", evidence_ids: ["evidence-1"], indicators: [], ...override,
  } as ThreatAdvisory
}

describe("Story 26.4 — persistAlert", () => {
  let fake: ReturnType<typeof makeFakeAlertsTable>

  beforeEach(() => {
    fake = makeFakeAlertsTable()
    withWorkspaceTransaction.mockReset()
    withWorkspaceTransaction.mockImplementation(async (_scope: unknown, callback: (c: unknown) => unknown) => callback({ query: fake.query }))
  })

  it("persists a new alert with lifecycle_state 'new'", async () => {
    const scope = makeScope()
    const inventory = createInventoryService()
    const tenantScope = tenantScopeOf(scope)
    inventory.ingestSources(tenantScope, [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])

    const { createExposureMatcher } = await import("../../exposure/matcher")
    const matcher = createExposureMatcher()
    const advisory = baseAdvisory({ indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }] })
    const matches = matcher.matchAdvisory(tenantScope, inventory, advisory)
    const [alert] = matcher.createAlerts(tenantScope, matches)

    const { row, isNew } = await persistAlert(scope, alert)
    expect(isNew).toBe(true)
    expect(row.lifecycle_state).toBe("new")
    expect(row.dedup_key).toBe(alert.dedup_key)
  })

  it("does not create a duplicate row for the same dedup_key (AC-5)", async () => {
    const scope = makeScope()
    const inventory = createInventoryService()
    const tenantScope = tenantScopeOf(scope)
    inventory.ingestSources(tenantScope, [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])

    const { createExposureMatcher } = await import("../../exposure/matcher")
    const matcher = createExposureMatcher()
    const advisory = baseAdvisory({ indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }] })
    const matches = matcher.matchAdvisory(tenantScope, inventory, advisory)
    const [alert] = matcher.createAlerts(tenantScope, matches)

    const first = await persistAlert(scope, alert)
    const second = await persistAlert(scope, alert)

    expect(first.isNew).toBe(true)
    expect(second.isNew).toBe(false)
    expect(second.row.id).toBe(first.row.id)
    expect(fake.rows.size).toBe(1)
  })

  it("rejects an alert whose tenant scope does not match the caller scope", async () => {
    const scope = makeScope()
    const inventory = createInventoryService()
    const tenantScope = tenantScopeOf(scope)
    inventory.ingestSources(tenantScope, [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])
    const { createExposureMatcher } = await import("../../exposure/matcher")
    const matcher = createExposureMatcher()
    const advisory = baseAdvisory({ indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }] })
    const [alert] = matcher.createAlerts(tenantScope, matcher.matchAdvisory(tenantScope, inventory, advisory))

    await expect(persistAlert({ ...scope, tenantId: "allura-other" }, alert)).rejects.toThrow(/tenant scope/i)
  })
})

describe("Story 26.4 — markAlertStale", () => {
  let fake: ReturnType<typeof makeFakeAlertsTable>

  beforeEach(() => {
    fake = makeFakeAlertsTable()
    withWorkspaceTransaction.mockReset()
    withWorkspaceTransaction.mockImplementation(async (_scope: unknown, callback: (c: unknown) => unknown) => callback({ query: fake.query }))
  })

  it("transitions a non-resolved alert to stale", async () => {
    const scope = makeScope()
    fake.rows.set("alert-1", {
      id: "alert-1", group_id: scope.tenantId, workspace_id: scope.workspaceId,
      inventory_ref: "i", artifact_ref: "a", advisory_refs: "[]", match_type: "package_version",
      confidence: 1, severity: "high", evidence_ids: "[]", dedup_key: "d1", lifecycle_state: "acknowledged",
      created_at: new Date(), updated_at: new Date(),
    })

    await markAlertStale(scope, "alert-1")
    expect(fake.rows.get("alert-1")!.lifecycle_state).toBe("stale")
  })

  it("never overwrites a resolved alert (resolved is terminal)", async () => {
    const scope = makeScope()
    fake.rows.set("alert-1", {
      id: "alert-1", group_id: scope.tenantId, workspace_id: scope.workspaceId,
      inventory_ref: "i", artifact_ref: "a", advisory_refs: "[]", match_type: "package_version",
      confidence: 1, severity: "high", evidence_ids: "[]", dedup_key: "d1", lifecycle_state: "resolved",
      created_at: new Date(), updated_at: new Date(),
    })

    await markAlertStale(scope, "alert-1")
    expect(fake.rows.get("alert-1")!.lifecycle_state).toBe("resolved")
  })
})

describe("Story 26.4 — runDiscoveryCycle", () => {
  let fake: ReturnType<typeof makeFakeAlertsTable>

  beforeEach(() => {
    fake = makeFakeAlertsTable()
    withWorkspaceTransaction.mockReset()
    withWorkspaceTransaction.mockImplementation(async (_scope: unknown, callback: (c: unknown) => unknown) => callback({ query: fake.query }))
  })

  it("creates one alert and a simulated draft for a high-severity match (AC-7)", async () => {
    const scope = makeScope()
    const tenantScope = tenantScopeOf(scope)
    const inventory = createInventoryService()
    inventory.ingestSources(tenantScope, [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])

    const advisory = baseAdvisory({
      severity: "high",
      indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }],
    })

    const result = await runDiscoveryCycle(scope, inventory, [advisory])

    expect(result.alertsCreated).toHaveLength(1)
    expect(result.alertsCreated[0]!.lifecycle_state).toBe("new")
    expect(result.draftsGenerated).toHaveLength(1)
    expect(result.draftsGenerated[0]!.draft.authority_state).toBe("simulated_only")
    expect(result.heartbeat.alerts_created).toBe(1)
    expect(result.heartbeat.drafts_generated).toBe(1)
  })

  it("does not generate a draft for a low-severity match", async () => {
    const scope = makeScope()
    const tenantScope = tenantScopeOf(scope)
    const inventory = createInventoryService()
    inventory.ingestSources(tenantScope, [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])

    const advisory = baseAdvisory({
      severity: "low",
      indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }],
    })

    const result = await runDiscoveryCycle(scope, inventory, [advisory])

    expect(result.alertsCreated).toHaveLength(1)
    expect(result.draftsGenerated).toHaveLength(0)
  })

  it("processes the same exposure across two advisories into exactly one alert (AC-5)", async () => {
    const scope = makeScope()
    const tenantScope = tenantScopeOf(scope)
    const inventory = createInventoryService()
    inventory.ingestSources(tenantScope, [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])

    const advisoryA = baseAdvisory({ id: "adv-a", indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }] })
    const advisoryB = baseAdvisory({ id: "adv-b", indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }] })

    const result = await runDiscoveryCycle(scope, inventory, [advisoryA, advisoryB])

    expect(result.alertsCreated).toHaveLength(1)
    expect(result.alertsAlreadyKnown).toBe(1)
    expect(fake.rows.size).toBe(1)
  })

  it("does not leak alerts across tenants", async () => {
    const scopeA = makeScope()
    const scopeB: ResolvedWorkspaceScope = { tenantId: "allura-other", workspaceId: "workspace-b", principalId: "threat-discovery-worker" }

    const inventoryA = createInventoryService()
    inventoryA.ingestSources(tenantScopeOf(scopeA), [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])
    const inventoryB = createInventoryService()
    inventoryB.ingestSources(tenantScopeOf(scopeB), [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])

    const advisory = baseAdvisory({ indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }] })

    await runDiscoveryCycle(scopeA, inventoryA, [advisory])
    await runDiscoveryCycle(scopeB, inventoryB, [advisory])

    const tenantAAlerts = [...fake.rows.values()].filter((r) => r.group_id === "allura-test")
    const tenantBAlerts = [...fake.rows.values()].filter((r) => r.group_id === "allura-other")
    expect(tenantAAlerts).toHaveLength(1)
    expect(tenantBAlerts).toHaveLength(1)
  })

  it("counts a per-advisory match failure without aborting the whole cycle", async () => {
    const scope = makeScope()
    const tenantScope = tenantScopeOf(scope)
    const inventory = createInventoryService()
    inventory.ingestSources(tenantScope, [makeSource({ id: "pkg-1", package: "evil-lib", version: "1.2.3", hash: "hash-a" })])

    const badAdvisory = baseAdvisory({ id: "adv-bad", group_id: "wrong-scope" } as Partial<ThreatAdvisory>)
    const goodAdvisory = baseAdvisory({ id: "adv-good", indicators: [{ type: "package", value: "evil-lib" }, { type: "version", value: "1.2.3" }] })

    // Force a matcher failure for the first advisory by handing it a scope
    // mismatch it cannot possibly satisfy: use a matcher call the module
    // wraps in try/catch by making the advisory fail its own schema
    // expectations at match time (missing required indicator shape).
    const brokenAdvisory = { ...goodAdvisory, indicators: null } as unknown as ThreatAdvisory

    const result = await runDiscoveryCycle(scope, inventory, [brokenAdvisory, goodAdvisory])

    expect(result.heartbeat.advisories_failed).toBe(1)
    expect(result.alertsCreated).toHaveLength(1)
  })
})
