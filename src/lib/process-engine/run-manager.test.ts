/**
 * Run Manager Tests
 * Phase 1: Production Run Kernel (AD-P1-02)
 *
 * Unit tests using a mocked Pool — no live DB required.
 * Pattern mirrors replay.test.ts: { query } as unknown as Pool.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Pool, QueryResult } from "pg"
import {
  createRun,
  getRun,
  listRuns,
  updateRunSnapshot,
} from "./run-manager"
import type { ProcessState, ProcessStatus, StoredRun } from "./types"

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW_ISO = "2026-01-01T00:00:00.000Z"
const NOW_DATE = new Date(NOW_ISO)

/**
 * Produce a µs-precise token string (matching PG to_char format) from a Date.
 * In real PG queries this is returned by:
 *   to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
 * Mocked rows must include this field so rowToStoredRun can read it.
 */
function toUpdatedAtToken(date: Date): string {
  // toISOString() gives ms precision; pad with 000 to simulate µs precision.
  // e.g. "2026-01-01T00:00:00.000Z" → "2026-01-01T00:00:00.000000Z"
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z")
}

function makeRunRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const updatedAt = (overrides.updated_at as Date | undefined) ?? NOW_DATE
  return {
    id: "run-001",
    definition_id: "def-001",
    definition_revision: 1,
    group_id: "allura-system",
    status: "pending",
    state_json: { processId: "run-001" },
    actor_id: "woz-builder",
    started_at: NOW_DATE,
    updated_at: NOW_DATE,
    // µs-precise token — mirrors what PG returns via to_char(updated_at ...) AS updated_at_token
    updated_at_token: toUpdatedAtToken(updatedAt),
    completed_at: null,
    ...overrides,
  }
}

function makeInitialState(): ProcessState {
  return {
    processId: "run-001",
    definitionId: "def-001",
    definitionRevision: "1",
    groupId: "allura-system",
    status: "pending",
    currentStepIndex: 0,
    stepStates: {},
    stepResults: {},
    startedAt: NOW_ISO,
    updatedAt: NOW_ISO,
  }
}

function mockPoolReturning(rows: unknown[], rowCount?: number): Pool {
  const query = vi.fn().mockResolvedValue({
    rows,
    rowCount: rowCount ?? rows.length,
  } as unknown as QueryResult)
  return { query } as unknown as Pool
}

// ── createRun ─────────────────────────────────────────────────────────────────

describe("createRun", () => {
  it("inserts a snapshot and returns StoredRun", async () => {
    const row = makeRunRow()
    const pool = mockPoolReturning([row])

    const result = await createRun(pool, {
      id: "run-001",
      definitionId: "def-001",
      definitionRevision: 1,
      groupId: "allura-system",
      actorId: "woz-builder",
      initialState: makeInitialState(),
    })

    expect(result.id).toBe("run-001")
    expect(result.definition_id).toBe("def-001")
    expect(result.definition_revision).toBe(1)
    expect(result.group_id).toBe("allura-system")
    expect(result.status).toBe("pending")
    expect(result.actor_id).toBe("woz-builder")
    expect(result.completed_at).toBeNull()
  })

  it("passes groupId as a query parameter", async () => {
    const pool = mockPoolReturning([makeRunRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await createRun(pool, {
      id: "run-001",
      definitionId: "def-001",
      definitionRevision: 1,
      groupId: "allura-system",
      actorId: "woz-builder",
      initialState: makeInitialState(),
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("allura-system")
  })

  it("serialises initialState as JSON in the query", async () => {
    const pool = mockPoolReturning([makeRunRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>
    const state = makeInitialState()

    await createRun(pool, {
      id: "run-001",
      definitionId: "def-001",
      definitionRevision: 1,
      groupId: "allura-system",
      actorId: "woz-builder",
      initialState: state,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    // state_json param should be the JSON string of the initial state
    expect(params).toContain(JSON.stringify(state))
  })
})

// ── getRun ────────────────────────────────────────────────────────────────────

describe("getRun", () => {
  it("returns StoredRun when row exists", async () => {
    const row = makeRunRow({ status: "running" })
    const pool = mockPoolReturning([row])

    const result = await getRun(pool, { id: "run-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredRun).id).toBe("run-001")
    expect((result as StoredRun).status).toBe("running")
  })

  it("returns null when no row found", async () => {
    const pool = mockPoolReturning([])

    const result = await getRun(pool, { id: "run-missing", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("passes both id and groupId as parameters", async () => {
    const pool = mockPoolReturning([makeRunRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await getRun(pool, { id: "run-001", groupId: "allura-system" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("run-001")
    expect(params).toContain("allura-system")
  })
})

// ── listRuns ──────────────────────────────────────────────────────────────────

describe("listRuns", () => {
  it("returns all runs for groupId when no status filter given", async () => {
    const rows = [makeRunRow({ id: "run-001" }), makeRunRow({ id: "run-002" })]
    const pool = mockPoolReturning(rows)

    const result = await listRuns(pool, { groupId: "allura-system" })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("run-001")
    expect(result[1].id).toBe("run-002")
  })

  it("filters by status when provided", async () => {
    const rows = [makeRunRow({ id: "run-003", status: "running" })]
    const pool = mockPoolReturning(rows)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    const result = await listRuns(pool, { groupId: "allura-system", status: "running" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("running")
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe("running")
  })

  it("passes groupId as a query parameter", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listRuns(pool, { groupId: "allura-system" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("allura-system")
  })

  it("returns empty array when no runs match", async () => {
    const pool = mockPoolReturning([])

    const result = await listRuns(pool, { groupId: "allura-empty-group" })

    expect(result).toHaveLength(0)
  })

  it("applies default limit of 50 when not specified", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listRuns(pool, { groupId: "allura-system" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(50)
  })

  it("applies caller-supplied limit", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listRuns(pool, { groupId: "allura-system", limit: 10 })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(10)
  })
})

// ── updateRunSnapshot ─────────────────────────────────────────────────────────

describe("updateRunSnapshot", () => {
  it("returns updated StoredRun on successful update", async () => {
    const updatedRow = makeRunRow({ status: "running", updated_at: new Date("2026-01-01T00:01:00.000Z") })
    const pool = mockPoolReturning([updatedRow], 1)

    const result = await updateRunSnapshot(pool, {
      id: "run-001",
      groupId: "allura-system",
      status: "running",
      stateJson: { processId: "run-001", currentStepIndex: 1 },
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredRun).status).toBe("running")
  })

  it("returns null when expectedUpdatedAt does not match (optimistic lock miss)", async () => {
    // Simulate stale: rowCount = 0, no rows returned
    const pool = mockPoolReturning([], 0)

    const result = await updateRunSnapshot(pool, {
      id: "run-001",
      groupId: "allura-system",
      status: "running",
      stateJson: { processId: "run-001" },
      expectedUpdatedAt: "2025-01-01T00:00:00.000Z", // stale timestamp
    })

    expect(result).toBeNull()
  })

  it("passes id, groupId, and expectedUpdatedAt as parameters", async () => {
    const pool = mockPoolReturning([makeRunRow({ status: "running" })], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await updateRunSnapshot(pool, {
      id: "run-001",
      groupId: "allura-system",
      status: "running",
      stateJson: {},
      expectedUpdatedAt: NOW_ISO,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("run-001")
    expect(params).toContain("allura-system")
    expect(params).toContain(NOW_ISO)
  })

  it("sets completedAt when provided", async () => {
    const completedAt = "2026-01-01T01:00:00.000Z"
    const completedRow = makeRunRow({
      status: "completed",
      completed_at: new Date(completedAt),
    })
    const pool = mockPoolReturning([completedRow], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    const result = await updateRunSnapshot(pool, {
      id: "run-001",
      groupId: "allura-system",
      status: "completed",
      stateJson: { processId: "run-001" },
      expectedUpdatedAt: NOW_ISO,
      completedAt,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(completedAt)
    expect(result).not.toBeNull()
    expect((result as StoredRun).status).toBe("completed")
    expect((result as StoredRun).completed_at).toBe(completedAt)
  })

  it("does not include completedAt parameter when not provided", async () => {
    const pool = mockPoolReturning([makeRunRow({ status: "running" })], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await updateRunSnapshot(pool, {
      id: "run-001",
      groupId: "allura-system",
      status: "running",
      stateJson: {},
      expectedUpdatedAt: NOW_ISO,
      // completedAt intentionally omitted
    })

    const [sql] = querySpy.mock.calls[0] as [string, unknown[]]
    // When completedAt is not provided, the query should not include completed_at
    expect(sql).not.toContain("completed_at")
  })

  it("serialises stateJson as JSON in the query", async () => {
    const pool = mockPoolReturning([makeRunRow({ status: "running" })], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>
    const stateJson = { processId: "run-001", currentStepIndex: 3 }

    await updateRunSnapshot(pool, {
      id: "run-001",
      groupId: "allura-system",
      status: "running",
      stateJson,
      expectedUpdatedAt: NOW_ISO,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(JSON.stringify(stateJson))
  })

  it("returns null with rowCount 0 regardless of returned rows array", async () => {
    // Edge case: DB returns rows array but rowCount is 0 (shouldn't happen in
    // practice but verifies we key off rowCount, not rows.length)
    const query = vi.fn().mockResolvedValue({
      rows: [makeRunRow()],
      rowCount: 0,
    } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await updateRunSnapshot(pool, {
      id: "run-001",
      groupId: "allura-system",
      status: "running",
      stateJson: {},
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    })

    expect(result).toBeNull()
  })
})

// ── Date serialisation ────────────────────────────────────────────────────────

describe("date serialisation", () => {
  it("converts Date objects in PG rows to ISO strings", async () => {
    const started = new Date("2026-01-01T10:00:00.000Z")
    const updated = new Date("2026-01-01T10:05:00.000Z")
    const completed = new Date("2026-01-01T10:10:00.000Z")

    const row = makeRunRow({
      started_at: started,
      updated_at: updated,
      completed_at: completed,
      status: "completed" as ProcessStatus,
    })
    const pool = mockPoolReturning([row])

    const result = await getRun(pool, { id: "run-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredRun).started_at).toBe(started.toISOString())
    // updated_at is now the µs-precise token (from PG to_char), not a JS toISOString() string.
    // The mock's toUpdatedAtToken() pads ms to µs, so "2026-01-01T10:05:00.000Z" becomes
    // "2026-01-01T10:05:00.000000Z". This is the value that round-trips through the optimistic lock.
    expect((result as StoredRun).updated_at).toBe(toUpdatedAtToken(updated))
    expect((result as StoredRun).completed_at).toBe(completed.toISOString())
  })
})
