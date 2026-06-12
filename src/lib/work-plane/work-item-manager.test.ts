/**
 * Work Item Manager Tests
 * Work Plane Phase 2
 *
 * Unit tests using a mocked Pool — no live DB required.
 * Pattern mirrors run-manager.test.ts: { query } as unknown as Pool.
 */

import { describe, expect, it, vi } from "vitest"
import type { Pool, QueryResult } from "pg"
import {
  createWorkItem,
  getWorkItem,
  linkRunToWorkItem,
  listWorkItems,
  transitionWorkItem,
} from "./work-item-manager"
import type { StoredWorkItem } from "./types"

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW_ISO = "2026-01-01T00:00:00.000Z"
const NOW_DATE = new Date(NOW_ISO)

function makeWorkItemRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "wi-001",
    project_id: "proj-001",
    lane_id: null,
    group_id: "allura-system",
    title: "Implement login",
    description: null,
    status: "backlog",
    priority: "medium",
    owner_id: null,
    team_id: null,
    acceptance_criteria: [],
    linked_run_id: null,
    latest_receipt_id: null,
    blocker: null,
    created_at: NOW_DATE,
    updated_at: NOW_DATE,
    completed_at: null,
    ...overrides,
  }
}

function mockPoolReturning(rows: unknown[], rowCount?: number): Pool {
  const query = vi.fn().mockResolvedValue({
    rows,
    rowCount: rowCount ?? rows.length,
  } as unknown as QueryResult)
  return { query } as unknown as Pool
}

// ── createWorkItem ────────────────────────────────────────────────────────────

describe("createWorkItem", () => {
  it("inserts a work item and returns StoredWorkItem", async () => {
    const row = makeWorkItemRow()
    const pool = mockPoolReturning([row])

    const result = await createWorkItem(pool, {
      id: "wi-001",
      projectId: "proj-001",
      groupId: "allura-system",
      title: "Implement login",
    })

    expect(result.id).toBe("wi-001")
    expect(result.project_id).toBe("proj-001")
    expect(result.group_id).toBe("allura-system")
    expect(result.title).toBe("Implement login")
    expect(result.status).toBe("backlog")
    expect(result.priority).toBe("medium")
    expect(result.acceptance_criteria).toEqual([])
  })

  it("passes groupId and projectId as query parameters", async () => {
    const pool = mockPoolReturning([makeWorkItemRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await createWorkItem(pool, {
      id: "wi-001",
      projectId: "proj-001",
      groupId: "allura-system",
      title: "Implement login",
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("allura-system")
    expect(params).toContain("proj-001")
  })

  it("stores optional fields when provided", async () => {
    const pool = mockPoolReturning([makeWorkItemRow({ priority: "high", owner_id: "alice", lane_id: "lane-1" })])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await createWorkItem(pool, {
      id: "wi-001",
      projectId: "proj-001",
      groupId: "allura-system",
      title: "Implement login",
      priority: "high",
      ownerId: "alice",
      laneId: "lane-1",
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("high")
    expect(params).toContain("alice")
    expect(params).toContain("lane-1")
  })

  it("serialises acceptanceCriteria as JSON", async () => {
    const pool = mockPoolReturning([makeWorkItemRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>
    const criteria = [{ description: "Must pass tests" }]

    await createWorkItem(pool, {
      id: "wi-001",
      projectId: "proj-001",
      groupId: "allura-system",
      title: "Implement login",
      acceptanceCriteria: criteria,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(JSON.stringify(criteria))
  })

  it("falls back to fetching existing row on ON CONFLICT DO NOTHING", async () => {
    const existingRow = makeWorkItemRow({ title: "Existing Item" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await createWorkItem(pool, {
      id: "wi-001",
      projectId: "proj-001",
      groupId: "allura-system",
      title: "Implement login",
    })

    expect(result.title).toBe("Existing Item")
    expect(query).toHaveBeenCalledTimes(2)
  })
})

// ── getWorkItem ───────────────────────────────────────────────────────────────

describe("getWorkItem", () => {
  it("returns StoredWorkItem when row exists", async () => {
    const row = makeWorkItemRow({ status: "in_progress" })
    const pool = mockPoolReturning([row])

    const result = await getWorkItem(pool, { id: "wi-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).id).toBe("wi-001")
    expect((result as StoredWorkItem).status).toBe("in_progress")
  })

  it("returns null when no row found", async () => {
    const pool = mockPoolReturning([])

    const result = await getWorkItem(pool, { id: "wi-missing", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("passes both id and groupId as query parameters", async () => {
    const pool = mockPoolReturning([makeWorkItemRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await getWorkItem(pool, { id: "wi-001", groupId: "allura-system" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("wi-001")
    expect(params).toContain("allura-system")
  })
})

// ── listWorkItems ─────────────────────────────────────────────────────────────

describe("listWorkItems", () => {
  it("returns all work items for project/group when no filters", async () => {
    const rows = [makeWorkItemRow({ id: "wi-001" }), makeWorkItemRow({ id: "wi-002" })]
    const pool = mockPoolReturning(rows)

    const result = await listWorkItems(pool, { projectId: "proj-001", groupId: "allura-system" })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("wi-001")
  })

  it("filters by status when provided", async () => {
    const pool = mockPoolReturning([makeWorkItemRow({ status: "in_progress" })])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listWorkItems(pool, { projectId: "proj-001", groupId: "allura-system", status: "in_progress" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("in_progress")
  })

  it("filters by laneId when provided", async () => {
    const pool = mockPoolReturning([makeWorkItemRow({ lane_id: "lane-1" })])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listWorkItems(pool, { projectId: "proj-001", groupId: "allura-system", laneId: "lane-1" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("lane-1")
  })

  it("applies default limit of 100", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listWorkItems(pool, { projectId: "proj-001", groupId: "allura-system" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(100)
  })

  it("returns empty array when no items match", async () => {
    const pool = mockPoolReturning([])

    const result = await listWorkItems(pool, { projectId: "proj-empty", groupId: "allura-system" })

    expect(result).toHaveLength(0)
  })
})

// ── transitionWorkItem ────────────────────────────────────────────────────────

describe("transitionWorkItem", () => {
  it("returns updated work item on valid transition (backlog → ready)", async () => {
    const currentRow = makeWorkItemRow({ status: "backlog" })
    const updatedRow = makeWorkItemRow({ status: "ready", updated_at: new Date("2026-01-01T01:00:00.000Z") })
    // First call is getWorkItem (SELECT), second call is the UPDATE
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "ready",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).status).toBe("ready")
  })

  it("returns null for invalid transition (backlog → done)", async () => {
    const currentRow = makeWorkItemRow({ status: "backlog" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "done",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    // No UPDATE should be called — invalid transition guard
    expect(result).toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("returns null when optimistic lock fails (stale timestamp)", async () => {
    const currentRow = makeWorkItemRow({ status: "ready" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "in_progress",
      actorId: "woz-builder",
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    })

    expect(result).toBeNull()
  })

  it("returns null when work item not found", async () => {
    const pool = mockPoolReturning([])

    const result = await transitionWorkItem(pool, {
      id: "wi-missing",
      groupId: "allura-system",
      toStatus: "ready",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).toBeNull()
  })

  it("sets completed_at when transitioning to done", async () => {
    const currentRow = makeWorkItemRow({ status: "in_progress" })
    const doneRow = makeWorkItemRow({
      status: "done",
      completed_at: new Date("2026-01-01T02:00:00.000Z"),
    })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [doneRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "done",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).status).toBe("done")
    expect((result as StoredWorkItem).completed_at).not.toBeNull()

    // Verify the UPDATE SQL includes completed_at
    const [sql] = query.mock.calls[1] as [string, unknown[]]
    expect(sql).toContain("completed_at")
  })

  it("sets completed_at when transitioning to cancelled", async () => {
    const currentRow = makeWorkItemRow({ status: "in_progress" })
    const cancelledRow = makeWorkItemRow({
      status: "cancelled",
      completed_at: new Date("2026-01-01T03:00:00.000Z"),
    })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [cancelledRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "cancelled",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).status).toBe("cancelled")
    expect((result as StoredWorkItem).completed_at).not.toBeNull()
  })

  it("does not SET completed_at for non-terminal transitions", async () => {
    const currentRow = makeWorkItemRow({ status: "backlog" })
    const readyRow = makeWorkItemRow({ status: "ready" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [readyRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "ready",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    const [sql] = query.mock.calls[1] as [string, unknown[]]
    // The SET clause must not assign completed_at; it may appear in RETURNING columns
    expect(sql).not.toMatch(/SET[^W]*completed_at\s*=/)
  })

  it("rejects transition from done (terminal state)", async () => {
    const currentRow = makeWorkItemRow({ status: "done" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "in_progress",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).toBeNull()
    expect(query).toHaveBeenCalledTimes(1) // Only the SELECT, no UPDATE
  })

  it("rejects transition from cancelled (terminal state)", async () => {
    const currentRow = makeWorkItemRow({ status: "cancelled" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "backlog",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it("allows in_review → in_progress (rework path)", async () => {
    const currentRow = makeWorkItemRow({ status: "in_review" })
    const updatedRow = makeWorkItemRow({ status: "in_progress" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "in_progress",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).status).toBe("in_progress")
  })

  it("allows blocked → in_progress (unblock path)", async () => {
    const currentRow = makeWorkItemRow({ status: "blocked" })
    const updatedRow = makeWorkItemRow({ status: "in_progress" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "in_progress",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).status).toBe("in_progress")
  })

  it("rejects in_review → backlog (not in transition map)", async () => {
    const currentRow = makeWorkItemRow({ status: "in_review" })
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [currentRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await transitionWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      toStatus: "backlog",
      actorId: "woz-builder",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).toBeNull()
    expect(query).toHaveBeenCalledTimes(1)
  })
})

// ── linkRunToWorkItem ─────────────────────────────────────────────────────────

describe("linkRunToWorkItem", () => {
  it("returns updated work item with linked_run_id on lock match", async () => {
    const updatedRow = makeWorkItemRow({ linked_run_id: "run-001" })
    const pool = mockPoolReturning([updatedRow], 1)

    const result = await linkRunToWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      runId: "run-001",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).linked_run_id).toBe("run-001")
  })

  it("returns null when optimistic lock fails (stale timestamp)", async () => {
    const pool = mockPoolReturning([], 0)

    const result = await linkRunToWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      runId: "run-001",
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    })

    expect(result).toBeNull()
  })

  it("passes runId, id, groupId, and expectedUpdatedAt as parameters", async () => {
    const pool = mockPoolReturning([makeWorkItemRow({ linked_run_id: "run-001" })], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await linkRunToWorkItem(pool, {
      id: "wi-001",
      groupId: "allura-system",
      runId: "run-001",
      expectedUpdatedAt: NOW_ISO,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("run-001")
    expect(params).toContain("wi-001")
    expect(params).toContain("allura-system")
    expect(params).toContain(NOW_ISO)
  })
})

// ── Date serialisation ────────────────────────────────────────────────────────

describe("date serialisation", () => {
  it("converts Date objects in PG rows to ISO strings", async () => {
    const created = new Date("2026-01-01T10:00:00.000Z")
    const updated = new Date("2026-01-01T10:05:00.000Z")
    const completed = new Date("2026-01-01T10:10:00.000Z")

    const row = makeWorkItemRow({
      created_at: created,
      updated_at: updated,
      completed_at: completed,
      status: "done",
    })
    const pool = mockPoolReturning([row])

    const result = await getWorkItem(pool, { id: "wi-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).created_at).toBe(created.toISOString())
    expect((result as StoredWorkItem).updated_at).toBe(updated.toISOString())
    expect((result as StoredWorkItem).completed_at).toBe(completed.toISOString())
  })

  it("preserves null completed_at for non-terminal items", async () => {
    const pool = mockPoolReturning([makeWorkItemRow({ completed_at: null })])

    const result = await getWorkItem(pool, { id: "wi-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredWorkItem).completed_at).toBeNull()
  })
})
