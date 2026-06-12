/**
 * Runs Source — Unit Tests (Phase 1 Run Kernel)
 *
 * Pins the SourceOutcome mapping for the Runs surface:
 * - successful query          -> { ok: true } with parsed snapshot
 * - no runs exist             -> isRunsEmpty() = true
 * - unreachable pool          -> null (degraded)
 * - query failure             -> { ok: false } with sanitized error
 * - group_id is always passed as a bound parameter (tenant invariant)
 * - mixed statuses handled correctly
 *
 * Usage: bun vitest run src/lib/operational-state/sources/runs-source.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock dependencies before importing ────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
}))

// ── Import after mocking ──────────────────────────────────────────────────────

import { getPool } from "@/lib/postgres/connection"
import { resolveOperationalSurface } from "../index"
import { isRunsEmpty, readRuns, type RunsSnapshot } from "./runs-source"

const getPoolMock = getPool as unknown as ReturnType<typeof vi.fn>

const GROUP_ID = "allura-system"

/**
 * Builds a mock pool whose query() fn returns different row sets depending on
 * which SQL statement is being executed. We match on the FROM clause keyword.
 */
function mockPool(opts: {
  activeRows?: Record<string, unknown>[]
  countRows?: Record<string, unknown>[]
  completionRows?: Record<string, unknown>[]
  rejectWith?: Error
}) {
  const { activeRows = [], countRows = [], completionRows = [], rejectWith } = opts

  const query = vi.fn().mockImplementation((sql: string) => {
    if (rejectWith) return Promise.reject(rejectWith)

    // Distinguish the three queries by their ORDER BY / LIMIT markers
    if (/r\.started_at DESC$/.test(sql.trim())) {
      return Promise.resolve({ rows: activeRows })
    }
    if (/GROUP BY status/.test(sql)) {
      return Promise.resolve({ rows: countRows })
    }
    // completions query has LIMIT 5
    if (/LIMIT 5/.test(sql)) {
      return Promise.resolve({ rows: completionRows })
    }
    return Promise.resolve({ rows: [] })
  })

  getPoolMock.mockReturnValue({ query })
  return query
}

describe("readRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ok with a parsed snapshot containing active runs and counts", async () => {
    const startedAt = new Date("2026-06-12T09:00:00.000Z")
    const query = mockPool({
      activeRows: [
        {
          id: "run_001",
          definition_id: "def_abc",
          definition_name: "Nightly ETL",
          status: "running",
          actor_id: "woz-builder",
          started_at: startedAt,
          last_event_at: new Date("2026-06-12T09:05:00.000Z"),
        },
      ],
      countRows: [
        { status: "running", cnt: "1" },
        { status: "completed", cnt: "4" },
        { status: "failed", cnt: "1" },
      ],
      completionRows: [
        {
          id: "run_000",
          definition_name: "Nightly ETL",
          completed_at: new Date("2026-06-12T08:00:00.000Z"),
          status: "completed",
        },
      ],
    })

    const outcome = await readRuns(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")

    // Active runs
    expect(outcome.data.activeRuns).toHaveLength(1)
    expect(outcome.data.activeRuns[0]).toMatchObject({
      id: "run_001",
      definitionId: "def_abc",
      definitionName: "Nightly ETL",
      status: "running",
      actorId: "woz-builder",
      startedAt: "2026-06-12T09:00:00.000Z",
      lastEventAt: "2026-06-12T09:05:00.000Z",
    })

    // Run counts
    expect(outcome.data.runCounts).toEqual({
      total: 6,
      running: 1,
      paused: 0,
      completed: 4,
      failed: 1,
    })

    // Recent completions
    expect(outcome.data.recentCompletions).toHaveLength(1)
    expect(outcome.data.recentCompletions[0]).toMatchObject({
      id: "run_000",
      definitionName: "Nightly ETL",
      completedAt: "2026-06-12T08:00:00.000Z",
      status: "completed",
    })

    expect(typeof outcome.fetchedAt).toBe("string")

    // Tenant invariant: group_id is a bound parameter in every query
    for (const call of query.mock.calls) {
      const [sql, params] = call as [string, unknown[]]
      expect(sql).toContain("group_id = $1")
      expect(params).toEqual([GROUP_ID])
    }
  })

  it("returns empty snapshot when no runs exist", async () => {
    mockPool({
      activeRows: [],
      countRows: [],
      completionRows: [],
    })

    const outcome = await readRuns(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")

    expect(outcome.data.activeRuns).toHaveLength(0)
    expect(outcome.data.recentCompletions).toHaveLength(0)
    expect(outcome.data.runCounts).toEqual({
      total: 0,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
    })
    expect(isRunsEmpty(outcome.data)).toBe(true)
  })

  it("returns null (degraded) when the pool cannot be constructed", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("missing config")
    })

    const outcome = await readRuns(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns null (degraded) when the connection is unreachable (ECONNREFUSED)", async () => {
    mockPool({ rejectWith: new Error("ECONNREFUSED 127.0.0.1:5432") })

    const outcome = await readRuns(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns null (degraded) when the connection is unreachable (authentication)", async () => {
    mockPool({ rejectWith: new Error("password authentication failed for user postgres") })

    const outcome = await readRuns(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns a sanitized error on a genuine query failure", async () => {
    mockPool({
      rejectWith: new Error('relation "process_runs" does not exist secret=hunter2'),
    })

    const outcome = await readRuns(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === true) throw new Error("expected error outcome")
    expect(outcome.error).toBe("Runs query failed")
    expect(outcome.error).not.toContain("hunter2")
    expect(outcome.error).not.toContain("process_runs")
  })

  it("handles mixed statuses correctly — pending and paused counted", async () => {
    mockPool({
      activeRows: [
        {
          id: "run_002",
          definition_id: "def_xyz",
          definition_name: "Batch Export",
          status: "paused",
          actor_id: null,
          started_at: new Date("2026-06-12T07:00:00.000Z"),
          last_event_at: null,
        },
        {
          id: "run_003",
          definition_id: "def_xyz",
          definition_name: "Batch Export",
          status: "pending",
          actor_id: null,
          started_at: new Date("2026-06-12T07:30:00.000Z"),
          last_event_at: null,
        },
      ],
      countRows: [
        { status: "running", cnt: "0" },
        { status: "paused", cnt: "1" },
        { status: "pending", cnt: "1" },
      ],
      completionRows: [],
    })

    const outcome = await readRuns(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")

    expect(outcome.data.activeRuns).toHaveLength(2)
    expect(outcome.data.runCounts.paused).toBe(1)
    expect(outcome.data.runCounts.running).toBe(0)
    expect(outcome.data.runCounts.total).toBe(2)

    // null lastEventAt passes through
    expect(outcome.data.activeRuns[0]?.lastEventAt).toBeNull()
    // null actorId passes through
    expect(outcome.data.activeRuns[0]?.actorId).toBeNull()
  })

  it("parses timestamps when the driver returns strings instead of Date objects", async () => {
    mockPool({
      activeRows: [
        {
          id: "run_004",
          definition_id: "def_abc",
          definition_name: "ETL",
          status: "running",
          actor_id: null,
          started_at: "2026-06-12 09:00:00.000Z",
          last_event_at: "2026-06-12 09:05:00.000Z",
        },
      ],
      countRows: [{ status: "running", cnt: "1" }],
      completionRows: [],
    })

    const outcome = await readRuns(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    expect(outcome.data.activeRuns[0]?.startedAt).toBe("2026-06-12T09:00:00.000Z")
    expect(outcome.data.activeRuns[0]?.lastEventAt).toBe("2026-06-12T09:05:00.000Z")
  })

  it("group_id is passed as a bound parameter to all three queries", async () => {
    const query = mockPool({
      activeRows: [],
      countRows: [],
      completionRows: [],
    })

    await readRuns(GROUP_ID)

    // All three queries must receive group_id
    expect(query.mock.calls.length).toBe(3)
    for (const call of query.mock.calls) {
      const [, params] = call as [string, unknown[]]
      expect(params).toContain(GROUP_ID)
    }
  })
})

describe("isRunsEmpty", () => {
  const base: RunsSnapshot = {
    activeRuns: [],
    runCounts: {
      total: 0,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
    },
    recentCompletions: [],
  }

  it("is empty when total is zero", () => {
    expect(isRunsEmpty(base)).toBe(true)
  })

  it("is not empty when there are active runs", () => {
    expect(
      isRunsEmpty({
        ...base,
        runCounts: { ...base.runCounts, total: 1, running: 1 },
      }),
    ).toBe(false)
  })

  it("is not empty when there are only completed runs", () => {
    expect(
      isRunsEmpty({
        ...base,
        runCounts: { ...base.runCounts, total: 3, completed: 3 },
      }),
    ).toBe(false)
  })
})

describe("operational-state integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("maps a live snapshot with runs to ready via the contract", async () => {
    mockPool({
      activeRows: [
        {
          id: "run_005",
          definition_id: "def_abc",
          definition_name: "ETL",
          status: "running",
          actor_id: null,
          started_at: new Date("2026-06-12T09:00:00.000Z"),
          last_event_at: null,
        },
      ],
      countRows: [{ status: "running", cnt: "1" }],
      completionRows: [],
    })

    const outcome = await readRuns(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "runs", systemOfRecord: "postgres:process_runs" },
      outcome,
      isEmpty: isRunsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("ready")
    expect(surface.data?.runCounts.running).toBe(1)
  })

  it("maps an unreachable source to degraded via the contract", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("no config")
    })

    const outcome = await readRuns(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "runs", systemOfRecord: "postgres:process_runs" },
      outcome,
      isEmpty: isRunsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("degraded")
    expect(surface.data).toBeNull()
  })

  it("maps an empty snapshot to empty via the contract", async () => {
    mockPool({ activeRows: [], countRows: [], completionRows: [] })

    const outcome = await readRuns(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "runs", systemOfRecord: "postgres:process_runs" },
      outcome,
      isEmpty: isRunsEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("empty")
    expect(surface.data).toBeNull()
  })
})
