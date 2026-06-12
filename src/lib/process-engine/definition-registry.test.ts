/**
 * Definition Registry Tests — Story 12.1, AD-P1-01
 *
 * Covers:
 *   createDefinition — insert + auto-revision increment + ON CONFLICT fallback
 *   getDefinition    — fetch by (id, revision, group_id) including soft-deleted
 *   getLatestDefinition — highest active revision
 *   listDefinitions  — filters by group_id, excludes deleted
 *   softDeleteDefinition — sets deleted_at, returns false when already deleted
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Pool, QueryResult } from "pg"
import {
  createDefinition,
  getDefinition,
  getLatestDefinition,
  listDefinitions,
  softDeleteDefinition,
} from "./definition-registry"
import type { ProcessDefinition, StoredDefinition } from "./types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDefinition(overrides: Partial<ProcessDefinition> = {}): ProcessDefinition {
  return {
    id: "test-proc",
    name: "Test Process",
    group_id: "allura-system",
    steps: [],
    ...overrides,
  }
}

function makeStoredRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "test-proc",
    revision: 1,
    group_id: "allura-system",
    name: "Test Process",
    definition_json: {},
    created_at: new Date("2025-01-01T00:00:00.000Z"),
    deleted_at: null,
    ...overrides,
  }
}

/**
 * Create a mock Pool whose query() method is a spy.
 * Each call in `responses` is returned in call order.
 * If responses run out, returns { rows: [], rowCount: 0 }.
 */
function mockPool(responses: Array<Partial<QueryResult>>): { pool: Pool; querySpy: ReturnType<typeof vi.fn> } {
  let callIndex = 0
  const querySpy = vi.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? { rows: [], rowCount: 0 }
    callIndex++
    return Promise.resolve({
      rows: [],
      rowCount: 0,
      ...response,
    } as QueryResult)
  })
  const pool = { query: querySpy } as unknown as Pool
  return { pool, querySpy }
}

// ── createDefinition ──────────────────────────────────────────────────────────

describe("createDefinition", () => {
  it("inserts the first revision with revision=1", async () => {
    const storedRow = makeStoredRow()
    const { pool, querySpy } = mockPool([
      // 1. MAX(revision) query → 0, so next = 1
      { rows: [{ next_revision: "1" }], rowCount: 1 },
      // 2. INSERT RETURNING → new row
      { rows: [storedRow], rowCount: 1 },
    ])

    const result = await createDefinition(pool, {
      id: "test-proc",
      name: "Test Process",
      groupId: "allura-system",
      definition: makeDefinition(),
    })

    expect(result.id).toBe("test-proc")
    expect(result.revision).toBe(1)
    expect(result.group_id).toBe("allura-system")
    expect(result.deleted_at).toBeNull()
    // First query must be the MAX(revision) SELECT
    expect(querySpy.mock.calls[0][0]).toContain("COALESCE(MAX(revision)")
    expect(querySpy.mock.calls[0][1]).toEqual(["test-proc", "allura-system"])
  })

  it("auto-increments revision when prior revisions exist", async () => {
    const storedRow = makeStoredRow({ revision: 3 })
    const { pool } = mockPool([
      // MAX(revision) = 2, next = 3
      { rows: [{ next_revision: "3" }], rowCount: 1 },
      // INSERT → success
      { rows: [storedRow], rowCount: 1 },
    ])

    const result = await createDefinition(pool, {
      id: "test-proc",
      name: "Test Process",
      groupId: "allura-system",
      definition: makeDefinition(),
    })

    expect(result.revision).toBe(3)
  })

  it("falls back to SELECT when ON CONFLICT DO NOTHING returns no rows", async () => {
    const storedRow = makeStoredRow()
    const { pool, querySpy } = mockPool([
      // MAX(revision) query
      { rows: [{ next_revision: "1" }], rowCount: 1 },
      // INSERT → conflict, 0 rows returned
      { rows: [], rowCount: 0 },
      // Fallback SELECT
      { rows: [storedRow], rowCount: 1 },
    ])

    const result = await createDefinition(pool, {
      id: "test-proc",
      name: "Test Process",
      groupId: "allura-system",
      definition: makeDefinition(),
    })

    expect(result.id).toBe("test-proc")
    // Should have made 3 queries total
    expect(querySpy).toHaveBeenCalledTimes(3)
  })

  it("serialises definition as JSON in the INSERT query", async () => {
    const def = makeDefinition({ id: "my-proc", name: "My Proc" })
    const storedRow = makeStoredRow({ definition_json: def })
    const { pool, querySpy } = mockPool([
      { rows: [{ next_revision: "1" }], rowCount: 1 },
      { rows: [storedRow], rowCount: 1 },
    ])

    await createDefinition(pool, {
      id: "my-proc",
      name: "My Proc",
      groupId: "allura-system",
      definition: def,
    })

    // The INSERT param at index 4 (0-based) must be a JSON string
    const insertParams = querySpy.mock.calls[1][1] as unknown[]
    expect(typeof insertParams[4]).toBe("string")
    expect(JSON.parse(insertParams[4] as string)).toMatchObject({ id: "my-proc" })
  })

  it("returned created_at is an ISO-8601 string", async () => {
    const storedRow = makeStoredRow()
    const { pool } = mockPool([
      { rows: [{ next_revision: "1" }], rowCount: 1 },
      { rows: [storedRow], rowCount: 1 },
    ])

    const result = await createDefinition(pool, {
      id: "test-proc",
      name: "Test Process",
      groupId: "allura-system",
      definition: makeDefinition(),
    })

    expect(typeof result.created_at).toBe("string")
    expect(new Date(result.created_at).toISOString()).toBe(result.created_at)
  })
})

// ── getDefinition ─────────────────────────────────────────────────────────────

describe("getDefinition", () => {
  it("returns the matching definition row", async () => {
    const storedRow = makeStoredRow({ revision: 2 })
    const { pool, querySpy } = mockPool([{ rows: [storedRow], rowCount: 1 }])

    const result = await getDefinition(pool, {
      id: "test-proc",
      revision: 2,
      groupId: "allura-system",
    })

    expect(result).not.toBeNull()
    expect(result!.revision).toBe(2)
    // Must use parameterised $1/$2/$3
    expect(querySpy.mock.calls[0][1]).toEqual(["test-proc", 2, "allura-system"])
  })

  it("returns null when no row matches", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await getDefinition(pool, {
      id: "missing",
      revision: 99,
      groupId: "allura-system",
    })

    expect(result).toBeNull()
  })

  it("returns soft-deleted definitions (run-pinned lookups)", async () => {
    const deletedRow = makeStoredRow({
      deleted_at: new Date("2025-06-01T00:00:00.000Z"),
    })
    const { pool } = mockPool([{ rows: [deletedRow], rowCount: 1 }])

    const result = await getDefinition(pool, {
      id: "test-proc",
      revision: 1,
      groupId: "allura-system",
    })

    expect(result).not.toBeNull()
    expect(result!.deleted_at).not.toBeNull()
    // Confirm the query does NOT filter on deleted_at
    // (query text check)
  })

  it("does NOT include deleted_at IS NULL in the query", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await getDefinition(pool, { id: "x", revision: 1, groupId: "allura-system" })

    const sql: string = querySpy.mock.calls[0][0]
    expect(sql).not.toContain("deleted_at IS NULL")
  })
})

// ── getLatestDefinition ───────────────────────────────────────────────────────

describe("getLatestDefinition", () => {
  it("returns the highest active revision", async () => {
    const latestRow = makeStoredRow({ revision: 5 })
    const { pool } = mockPool([{ rows: [latestRow], rowCount: 1 }])

    const result = await getLatestDefinition(pool, {
      id: "test-proc",
      groupId: "allura-system",
    })

    expect(result).not.toBeNull()
    expect(result!.revision).toBe(5)
  })

  it("returns null when all revisions are deleted", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await getLatestDefinition(pool, {
      id: "test-proc",
      groupId: "allura-system",
    })

    expect(result).toBeNull()
  })

  it("filters deleted_at IS NULL", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await getLatestDefinition(pool, { id: "test-proc", groupId: "allura-system" })

    const sql: string = querySpy.mock.calls[0][0]
    expect(sql).toContain("deleted_at IS NULL")
  })

  it("orders by revision DESC and limits to 1", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await getLatestDefinition(pool, { id: "test-proc", groupId: "allura-system" })

    const sql: string = querySpy.mock.calls[0][0]
    expect(sql).toContain("ORDER BY revision DESC")
    expect(sql).toContain("LIMIT 1")
  })
})

// ── listDefinitions ───────────────────────────────────────────────────────────

describe("listDefinitions", () => {
  it("returns all active definitions for the group", async () => {
    const rows = [
      makeStoredRow({ id: "proc-a", revision: 2 }),
      makeStoredRow({ id: "proc-a", revision: 1 }),
      makeStoredRow({ id: "proc-b", revision: 1 }),
    ]
    const { pool } = mockPool([{ rows, rowCount: rows.length }])

    const result = await listDefinitions(pool, { groupId: "allura-system" })

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe("proc-a")
    expect(result[0].revision).toBe(2)
  })

  it("excludes soft-deleted rows", async () => {
    // The SQL query filters deleted_at IS NULL — verified via spy
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listDefinitions(pool, { groupId: "allura-system" })

    const sql: string = querySpy.mock.calls[0][0]
    expect(sql).toContain("deleted_at IS NULL")
  })

  it("scopes query to the provided groupId", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listDefinitions(pool, { groupId: "allura-test" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[0]).toBe("allura-test")
  })

  it("defaults limit to 100 when not specified", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listDefinitions(pool, { groupId: "allura-system" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe(100)
  })

  it("respects the caller-supplied limit", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listDefinitions(pool, { groupId: "allura-system", limit: 25 })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe(25)
  })

  it("returns an empty array when no active definitions exist", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await listDefinitions(pool, { groupId: "allura-system" })

    expect(result).toEqual([])
  })
})

// ── softDeleteDefinition ──────────────────────────────────────────────────────

describe("softDeleteDefinition", () => {
  it("returns true when a row was updated", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 1 }])

    const result = await softDeleteDefinition(pool, {
      id: "test-proc",
      revision: 1,
      groupId: "allura-system",
    })

    expect(result).toBe(true)
  })

  it("returns false when the row did not exist", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await softDeleteDefinition(pool, {
      id: "missing",
      revision: 99,
      groupId: "allura-system",
    })

    expect(result).toBe(false)
  })

  it("returns false when the row was already deleted (idempotent)", async () => {
    // The UPDATE includes AND deleted_at IS NULL, so a deleted row → 0 rowCount
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await softDeleteDefinition(pool, {
      id: "test-proc",
      revision: 1,
      groupId: "allura-system",
    })

    expect(result).toBe(false)
  })

  it("uses UPDATE SET deleted_at = NOW() with correct params", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 1 }])

    await softDeleteDefinition(pool, {
      id: "test-proc",
      revision: 2,
      groupId: "allura-system",
    })

    const sql: string = querySpy.mock.calls[0][0]
    const params = querySpy.mock.calls[0][1] as unknown[]

    expect(sql).toContain("SET deleted_at = NOW()")
    expect(sql).toContain("deleted_at IS NULL")
    expect(params).toEqual(["test-proc", 2, "allura-system"])
  })

  it("getDefinition still returns soft-deleted rows after delete", async () => {
    // Simulate: getDefinition does NOT filter on deleted_at
    const deletedRow = makeStoredRow({
      deleted_at: new Date("2025-06-01T00:00:00.000Z"),
    })
    const { pool } = mockPool([{ rows: [deletedRow], rowCount: 1 }])

    const result = await getDefinition(pool, {
      id: "test-proc",
      revision: 1,
      groupId: "allura-system",
    })

    expect(result).not.toBeNull()
    expect(result!.deleted_at).not.toBeNull()
  })
})
