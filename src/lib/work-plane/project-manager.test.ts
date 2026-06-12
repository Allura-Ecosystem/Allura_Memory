/**
 * Project Manager Tests
 * Work Plane Phase 2
 *
 * Unit tests using a mocked Pool — no live DB required.
 * Pattern mirrors run-manager.test.ts: { query } as unknown as Pool.
 */

import { describe, expect, it, vi } from "vitest"
import type { Pool, QueryResult } from "pg"
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  updateProject,
} from "./project-manager"
import type { StoredProject } from "./types"

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW_ISO = "2026-01-01T00:00:00.000Z"
const NOW_DATE = new Date(NOW_ISO)

function makeProjectRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "proj-001",
    group_id: "allura-system",
    name: "Test Project",
    description: "A test project",
    status: "active",
    owner_id: "woz-builder",
    team_id: null,
    created_at: NOW_DATE,
    updated_at: NOW_DATE,
    archived_at: null,
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

// ── createProject ─────────────────────────────────────────────────────────────

describe("createProject", () => {
  it("inserts a project and returns StoredProject", async () => {
    const row = makeProjectRow()
    const pool = mockPoolReturning([row])

    const result = await createProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      name: "Test Project",
    })

    expect(result.id).toBe("proj-001")
    expect(result.group_id).toBe("allura-system")
    expect(result.name).toBe("Test Project")
    expect(result.status).toBe("active")
  })

  it("passes groupId as a query parameter", async () => {
    const pool = mockPoolReturning([makeProjectRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await createProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      name: "Test Project",
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("allura-system")
  })

  it("falls back to fetching existing row on ON CONFLICT DO NOTHING", async () => {
    const existingRow = makeProjectRow({ name: "Existing Project" })
    // First call: insert returns no rows (conflict), second call: fetch returns existing
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as unknown as QueryResult)
      .mockResolvedValueOnce({ rows: [existingRow], rowCount: 1 } as unknown as QueryResult)
    const pool = { query } as unknown as Pool

    const result = await createProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      name: "Test Project",
    })

    expect(result.name).toBe("Existing Project")
    expect(query).toHaveBeenCalledTimes(2)
  })

  it("stores optional description, ownerId, teamId", async () => {
    const pool = mockPoolReturning([makeProjectRow({ description: "Desc", owner_id: "alice", team_id: "team-a" })])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await createProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      name: "Test Project",
      description: "Desc",
      ownerId: "alice",
      teamId: "team-a",
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("Desc")
    expect(params).toContain("alice")
    expect(params).toContain("team-a")
  })
})

// ── getProject ────────────────────────────────────────────────────────────────

describe("getProject", () => {
  it("returns StoredProject when row exists", async () => {
    const row = makeProjectRow()
    const pool = mockPoolReturning([row])

    const result = await getProject(pool, { id: "proj-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredProject).id).toBe("proj-001")
  })

  it("returns null when no row found", async () => {
    const pool = mockPoolReturning([])

    const result = await getProject(pool, { id: "proj-missing", groupId: "allura-system" })

    expect(result).toBeNull()
  })

  it("passes both id and groupId as query parameters", async () => {
    const pool = mockPoolReturning([makeProjectRow()])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await getProject(pool, { id: "proj-001", groupId: "allura-system" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("proj-001")
    expect(params).toContain("allura-system")
  })
})

// ── listProjects ──────────────────────────────────────────────────────────────

describe("listProjects", () => {
  it("returns all projects for groupId when no status filter given", async () => {
    const rows = [makeProjectRow({ id: "proj-001" }), makeProjectRow({ id: "proj-002" })]
    const pool = mockPoolReturning(rows)

    const result = await listProjects(pool, { groupId: "allura-system" })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("proj-001")
    expect(result[1].id).toBe("proj-002")
  })

  it("filters by status when provided", async () => {
    const pool = mockPoolReturning([makeProjectRow({ status: "archived" })])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listProjects(pool, { groupId: "allura-system", status: "archived" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("archived")
  })

  it("applies default limit of 50", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listProjects(pool, { groupId: "allura-system" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(50)
  })

  it("applies caller-supplied limit", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listProjects(pool, { groupId: "allura-system", limit: 10 })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(10)
  })

  it("returns empty array when no projects match", async () => {
    const pool = mockPoolReturning([])

    const result = await listProjects(pool, { groupId: "allura-empty" })

    expect(result).toHaveLength(0)
  })
})

// ── updateProject ─────────────────────────────────────────────────────────────

describe("updateProject", () => {
  it("returns updated StoredProject on lock match", async () => {
    const updated = makeProjectRow({ name: "Updated Name", updated_at: new Date("2026-01-01T01:00:00.000Z") })
    const pool = mockPoolReturning([updated], 1)

    const result = await updateProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      name: "Updated Name",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredProject).name).toBe("Updated Name")
  })

  it("returns null when optimistic lock fails (stale timestamp)", async () => {
    const pool = mockPoolReturning([], 0)

    const result = await updateProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      name: "Updated Name",
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    })

    expect(result).toBeNull()
  })

  it("passes expectedUpdatedAt as a query parameter", async () => {
    const pool = mockPoolReturning([makeProjectRow()], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await updateProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      name: "New Name",
      expectedUpdatedAt: NOW_ISO,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain(NOW_ISO)
  })

  it("passes id and groupId as query parameters", async () => {
    const pool = mockPoolReturning([makeProjectRow()], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await updateProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      status: "paused",
      expectedUpdatedAt: NOW_ISO,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("proj-001")
    expect(params).toContain("allura-system")
  })
})

// ── archiveProject ────────────────────────────────────────────────────────────

describe("archiveProject", () => {
  it("returns archived StoredProject on lock match", async () => {
    const archivedRow = makeProjectRow({
      status: "archived",
      archived_at: new Date("2026-01-01T02:00:00.000Z"),
    })
    const pool = mockPoolReturning([archivedRow], 1)

    const result = await archiveProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      expectedUpdatedAt: NOW_ISO,
    })

    expect(result).not.toBeNull()
    expect((result as StoredProject).status).toBe("archived")
    expect((result as StoredProject).archived_at).not.toBeNull()
  })

  it("returns null when optimistic lock fails (stale timestamp)", async () => {
    const pool = mockPoolReturning([], 0)

    const result = await archiveProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
    })

    expect(result).toBeNull()
  })

  it("passes id, groupId, and expectedUpdatedAt as parameters", async () => {
    const pool = mockPoolReturning([makeProjectRow({ status: "archived" })], 1)
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await archiveProject(pool, {
      id: "proj-001",
      groupId: "allura-system",
      expectedUpdatedAt: NOW_ISO,
    })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("proj-001")
    expect(params).toContain("allura-system")
    expect(params).toContain(NOW_ISO)
  })
})

// ── Date serialisation ────────────────────────────────────────────────────────

describe("date serialisation", () => {
  it("converts Date objects in PG rows to ISO strings", async () => {
    const created = new Date("2026-01-01T10:00:00.000Z")
    const updated = new Date("2026-01-01T10:05:00.000Z")
    const archived = new Date("2026-01-01T10:10:00.000Z")

    const row = makeProjectRow({
      created_at: created,
      updated_at: updated,
      archived_at: archived,
      status: "archived",
    })
    const pool = mockPoolReturning([row])

    const result = await getProject(pool, { id: "proj-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredProject).created_at).toBe(created.toISOString())
    expect((result as StoredProject).updated_at).toBe(updated.toISOString())
    expect((result as StoredProject).archived_at).toBe(archived.toISOString())
  })

  it("preserves null for archived_at on active projects", async () => {
    const pool = mockPoolReturning([makeProjectRow({ archived_at: null })])

    const result = await getProject(pool, { id: "proj-001", groupId: "allura-system" })

    expect(result).not.toBeNull()
    expect((result as StoredProject).archived_at).toBeNull()
  })
})

// ── group_id isolation ────────────────────────────────────────────────────────

describe("group_id isolation", () => {
  it("listProjects always includes groupId in query params", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await listProjects(pool, { groupId: "allura-project-x" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("allura-project-x")
  })

  it("getProject always includes groupId in query params", async () => {
    const pool = mockPoolReturning([])
    const querySpy = pool.query as ReturnType<typeof vi.fn>

    await getProject(pool, { id: "proj-001", groupId: "allura-project-x" })

    const [, params] = querySpy.mock.calls[0] as [string, unknown[]]
    expect(params).toContain("allura-project-x")
  })
})
