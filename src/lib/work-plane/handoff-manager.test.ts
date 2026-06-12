/**
 * Handoff Manager Tests — Work Plane Phase 2
 *
 * Covers:
 *   createHandoff        — insert with status='pending', optional fields
 *   getHandoff           — fetch by (id, group_id), returns null when missing
 *   listPendingHandoffs  — filters status='pending', optional toActorId, limit
 *   acknowledgeHandoff   — pending → acknowledged, returns null on non-pending
 *   rejectHandoff        — pending → rejected, returns null on non-pending
 */

import { describe, expect, it, vi } from "vitest"
import type { Pool, QueryResult } from "pg"
import {
  createHandoff,
  getHandoff,
  listPendingHandoffs,
  acknowledgeHandoff,
  rejectHandoff,
} from "./handoff-manager"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHandoffRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "hoff_001",
    group_id: "allura-system",
    work_item_id: null,
    from_actor_id: "agent-a",
    to_actor_id: "agent-b",
    message: null,
    status: "pending",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    acknowledged_at: null,
    ...overrides,
  }
}

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

// ── createHandoff ─────────────────────────────────────────────────────────────

describe("createHandoff", () => {
  it("inserts and returns a pending handoff", async () => {
    const row = makeHandoffRow()
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createHandoff(pool, {
      id: "hoff_001",
      groupId: "allura-system",
      fromActorId: "agent-a",
      toActorId: "agent-b",
    })

    expect(result.id).toBe("hoff_001")
    expect(result.status).toBe("pending")
    expect(result.from_actor_id).toBe("agent-a")
    expect(result.to_actor_id).toBe("agent-b")
    expect(result.acknowledged_at).toBeNull()
  })

  it("includes message and workItemId when provided", async () => {
    const row = makeHandoffRow({ message: "please review", work_item_id: "wi_001" })
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createHandoff(pool, {
      id: "hoff_002",
      groupId: "allura-system",
      fromActorId: "agent-a",
      toActorId: "agent-b",
      message: "please review",
      workItemId: "wi_001",
    })

    expect(result.message).toBe("please review")
    expect(result.work_item_id).toBe("wi_001")
    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[2]).toBe("wi_001")
    expect(params[5]).toBe("please review")
  })

  it("defaults message and workItemId to null when omitted", async () => {
    const row = makeHandoffRow()
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    await createHandoff(pool, {
      id: "hoff_003",
      groupId: "allura-system",
      fromActorId: "agent-a",
      toActorId: "agent-b",
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[2]).toBeNull() // workItemId
    expect(params[5]).toBeNull() // message
  })

  it("hardcodes status='pending' in the INSERT query", async () => {
    const row = makeHandoffRow()
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    await createHandoff(pool, {
      id: "hoff_004",
      groupId: "allura-system",
      fromActorId: "agent-a",
      toActorId: "agent-b",
    })

    const sql: string = querySpy.mock.calls[0][0]
    expect(sql).toContain("'pending'")
  })

  it("returned created_at is an ISO-8601 string", async () => {
    const row = makeHandoffRow()
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await createHandoff(pool, {
      id: "hoff_005",
      groupId: "allura-system",
      fromActorId: "agent-a",
      toActorId: "agent-b",
    })

    expect(typeof result.created_at).toBe("string")
    expect(new Date(result.created_at).toISOString()).toBe(result.created_at)
  })
})

// ── getHandoff ────────────────────────────────────────────────────────────────

describe("getHandoff", () => {
  it("returns the matching handoff", async () => {
    const row = makeHandoffRow()
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await getHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect(result!.id).toBe("hoff_001")
    expect(querySpy.mock.calls[0][1]).toEqual(["hoff_001", "allura-system"])
  })

  it("returns null when no handoff matches", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await getHandoff(pool, { id: "missing", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("scopes query to group_id", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await getHandoff(pool, { id: "hoff_001", groupId: "allura-test" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe("allura-test")
  })
})

// ── listPendingHandoffs ───────────────────────────────────────────────────────

describe("listPendingHandoffs", () => {
  it("returns pending handoffs for the group", async () => {
    const rows = [makeHandoffRow({ id: "hoff_a" }), makeHandoffRow({ id: "hoff_b" })]
    const { pool } = mockPool([{ rows, rowCount: rows.length }])

    const result = await listPendingHandoffs(pool, { groupId: "allura-system" })

    expect(result).toHaveLength(2)
    expect(result.every((h) => h.status === "pending")).toBe(true)
  })

  it("filters by toActorId when provided", async () => {
    const rows = [makeHandoffRow({ to_actor_id: "agent-b" })]
    const { pool, querySpy } = mockPool([{ rows, rowCount: 1 }])

    await listPendingHandoffs(pool, {
      groupId: "allura-system",
      toActorId: "agent-b",
    })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe("agent-b")
  })

  it("uses only group_id and status in query when toActorId is omitted", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listPendingHandoffs(pool, { groupId: "allura-system" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[0]).toBe("allura-system")
    // The only params should be groupId and limit (no toActorId)
    expect(params).toHaveLength(2)
  })

  it("defaults limit to 100", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listPendingHandoffs(pool, { groupId: "allura-system" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[params.length - 1]).toBe(100)
  })

  it("respects caller-supplied limit", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await listPendingHandoffs(pool, { groupId: "allura-system", limit: 5 })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[params.length - 1]).toBe(5)
  })

  it("returns empty array when no pending handoffs exist", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await listPendingHandoffs(pool, { groupId: "allura-system" })

    expect(result).toEqual([])
  })
})

// ── acknowledgeHandoff ────────────────────────────────────────────────────────

describe("acknowledgeHandoff", () => {
  it("returns the acknowledged handoff on success", async () => {
    const row = makeHandoffRow({ status: "acknowledged", acknowledged_at: new Date("2026-01-02T00:00:00.000Z") })
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await acknowledgeHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect(result!.status).toBe("acknowledged")
    expect(result!.acknowledged_at).not.toBeNull()
  })

  it("returns null when handoff is already acknowledged (idempotent)", async () => {
    // The UPDATE filters status='pending', so an already-acknowledged row → 0 rowCount
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await acknowledgeHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("returns null when handoff is already rejected (idempotent)", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await acknowledgeHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("returns null when handoff does not exist", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await acknowledgeHandoff(pool, { id: "missing", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("uses UPDATE SET status='acknowledged' WHERE status='pending'", async () => {
    const row = makeHandoffRow({ status: "acknowledged", acknowledged_at: new Date() })
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    await acknowledgeHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    const sql: string = querySpy.mock.calls[0][0]
    expect(sql).toContain("'acknowledged'")
    expect(sql).toContain("acknowledged_at = NOW()")
    expect(sql).toContain("status = 'pending'")
  })

  it("scopes UPDATE to group_id", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await acknowledgeHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe("allura-system")
  })
})

// ── rejectHandoff ─────────────────────────────────────────────────────────────

describe("rejectHandoff", () => {
  it("returns the rejected handoff on success", async () => {
    const row = makeHandoffRow({ status: "rejected", acknowledged_at: new Date("2026-01-02T00:00:00.000Z") })
    const { pool } = mockPool([{ rows: [row], rowCount: 1 }])

    const result = await rejectHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect(result!.status).toBe("rejected")
    expect(result!.acknowledged_at).not.toBeNull()
  })

  it("returns null when handoff is already rejected (idempotent)", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await rejectHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("returns null when handoff is already acknowledged (idempotent)", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await rejectHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("returns null when handoff does not exist", async () => {
    const { pool } = mockPool([{ rows: [], rowCount: 0 }])

    const result = await rejectHandoff(pool, { id: "missing", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("uses UPDATE SET status='rejected' WHERE status='pending'", async () => {
    const row = makeHandoffRow({ status: "rejected", acknowledged_at: new Date() })
    const { pool, querySpy } = mockPool([{ rows: [row], rowCount: 1 }])

    await rejectHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    const sql: string = querySpy.mock.calls[0][0]
    expect(sql).toContain("'rejected'")
    expect(sql).toContain("acknowledged_at = NOW()")
    expect(sql).toContain("status = 'pending'")
  })

  it("scopes UPDATE to group_id", async () => {
    const { pool, querySpy } = mockPool([{ rows: [], rowCount: 0 }])

    await rejectHandoff(pool, { id: "hoff_001", groupId: "allura-system" })

    const params = querySpy.mock.calls[0][1] as unknown[]
    expect(params[1]).toBe("allura-system")
  })
})
