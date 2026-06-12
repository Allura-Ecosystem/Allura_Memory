/**
 * Scheduled Tasks Source — Unit Tests (Phase 0 Story 6)
 *
 * Pins the SourceOutcome mapping for the Scheduled Tasks surface:
 * - successful query -> { ok: true } with parsed snapshot
 * - empty activity   -> isScheduledTasksEmpty() = true
 * - unreachable pool -> null (degraded)
 * - query failure    -> { ok: false } with sanitized error
 * - group_id is always passed as a bound parameter (tenant invariant)
 *
 * Usage: bun vitest run src/lib/operational-state/sources/scheduled-tasks-source.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock dependencies before importing ────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
}))

// ── Import after mocking ──────────────────────────────────────────────────────

import { getPool } from "@/lib/postgres/connection"
import { resolveOperationalSurface } from "../index"
import {
  isScheduledTasksEmpty,
  readScheduledTasks,
  type ScheduledTasksSnapshot,
} from "./scheduled-tasks-source"

const getPoolMock = getPool as unknown as ReturnType<typeof vi.fn>

const GROUP_ID = "allura-system"

function mockQueryResult(row: Record<string, unknown> | undefined) {
  const query = vi.fn().mockResolvedValue({ rows: row === undefined ? [] : [row] })
  getPoolMock.mockReturnValue({ query })
  return query
}

describe("readScheduledTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns ok with a parsed snapshot on a successful query", async () => {
    const heartbeat = new Date("2026-06-12T10:00:00.000Z")
    const query = mockQueryResult({
      last_heartbeat_at: heartbeat,
      heartbeats24h: "12",
      blockers24h: "1",
      backfill24h: "3",
      proposals24h: "7",
    })

    const outcome = await readScheduledTasks(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    expect(outcome.data).toEqual({
      groupId: GROUP_ID,
      lastHeartbeatAt: "2026-06-12T10:00:00.000Z",
      heartbeats24h: 12,
      blockers24h: 1,
      backfill24h: 3,
      proposals24h: 7,
    })
    expect(typeof outcome.fetchedAt).toBe("string")

    // Tenant invariant: group_id is a bound parameter, present in the WHERE clause.
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("WHERE group_id = $1")
    expect(params).toEqual([GROUP_ID])
  })

  it("parses last_heartbeat_at when the driver returns a string instead of a Date", async () => {
    mockQueryResult({
      last_heartbeat_at: "2026-06-12 10:00:00.000Z",
      heartbeats24h: "1",
      blockers24h: "0",
      backfill24h: "0",
      proposals24h: "0",
    })

    const outcome = await readScheduledTasks(GROUP_ID)

    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    expect(outcome.data.lastHeartbeatAt).toBe("2026-06-12T10:00:00.000Z")
  })

  it("treats a missing row as zero activity (not an error)", async () => {
    mockQueryResult(undefined)

    const outcome = await readScheduledTasks(GROUP_ID)

    if (outcome === null || outcome.ok === false) throw new Error("expected ok outcome")
    expect(outcome.data.lastHeartbeatAt).toBeNull()
    expect(outcome.data.heartbeats24h).toBe(0)
    expect(isScheduledTasksEmpty(outcome.data)).toBe(true)
  })

  it("returns null (degraded) when the pool cannot be constructed", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("missing config")
    })

    const outcome = await readScheduledTasks(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns null (degraded) when the connection is unreachable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:5432"))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readScheduledTasks(GROUP_ID)
    expect(outcome).toBeNull()
  })

  it("returns a sanitized error on a genuine query failure", async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('relation "events" does not exist secret=hunter2'))
    getPoolMock.mockReturnValue({ query })

    const outcome = await readScheduledTasks(GROUP_ID)

    expect(outcome).not.toBeNull()
    if (outcome === null || outcome.ok === true) throw new Error("expected error outcome")
    expect(outcome.error).toBe("Scheduled tasks query failed")
    expect(outcome.error).not.toContain("hunter2")
  })
})

describe("isScheduledTasksEmpty", () => {
  const base: ScheduledTasksSnapshot = {
    groupId: GROUP_ID,
    lastHeartbeatAt: null,
    heartbeats24h: 0,
    blockers24h: 0,
    backfill24h: 0,
    proposals24h: 0,
  }

  it("is empty when there is no activity at all", () => {
    expect(isScheduledTasksEmpty(base)).toBe(true)
  })

  it("is still empty when the only heartbeat is older than 24h (stale heartbeat must not suppress onboarding)", () => {
    expect(isScheduledTasksEmpty({ ...base, lastHeartbeatAt: "2026-01-01T00:00:00.000Z" })).toBe(
      true,
    )
  })

  it("is not empty when heartbeats occurred in the last 24h", () => {
    expect(isScheduledTasksEmpty({ ...base, heartbeats24h: 1 })).toBe(false)
  })

  it("is not empty when any 24h counter is non-zero", () => {
    expect(isScheduledTasksEmpty({ ...base, blockers24h: 1 })).toBe(false)
    expect(isScheduledTasksEmpty({ ...base, backfill24h: 2 })).toBe(false)
    expect(isScheduledTasksEmpty({ ...base, proposals24h: 3 })).toBe(false)
  })
})

describe("operational-state integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("maps a live snapshot to ready via the contract", async () => {
    mockQueryResult({
      last_heartbeat_at: new Date("2026-06-12T10:00:00.000Z"),
      heartbeats24h: "4",
      blockers24h: "0",
      backfill24h: "0",
      proposals24h: "2",
    })

    const outcome = await readScheduledTasks(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "scheduled-tasks", systemOfRecord: "postgres:events" },
      outcome,
      isEmpty: isScheduledTasksEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("ready")
    expect(surface.data?.proposals24h).toBe(2)
  })

  it("maps an unreachable source to degraded via the contract", async () => {
    getPoolMock.mockImplementation(() => {
      throw new Error("no config")
    })

    const outcome = await readScheduledTasks(GROUP_ID)
    const surface = resolveOperationalSurface({
      source: { id: "scheduled-tasks", systemOfRecord: "postgres:events" },
      outcome,
      isEmpty: isScheduledTasksEmpty,
      freshnessMs: 30_000,
    })

    expect(surface.status).toBe("degraded")
    expect(surface.data).toBeNull()
  })
})
