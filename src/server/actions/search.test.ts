/**
 * Tests for unifiedSearch server action.
 *
 * All external dependencies (postgres pool, retrieveMemories) are mocked.
 * Tests verify: entity type coverage, type filtering, empty-query guard,
 * merge ranking (memory results first), and graceful degradation on
 * RuVector failure.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"

// ── Hoisted mock state (must be defined before vi.mock factory runs) ──────────

const { mockQuery, mockRetrieveMemories } = vi.hoisted(() => {
  const mockQuery = vi.fn()
  const mockRetrieveMemories = vi.fn()
  return { mockQuery, mockRetrieveMemories }
})

// ── Mock postgres pool ────────────────────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: () => ({ query: mockQuery }),
}))

// ── Mock RuVector bridge ──────────────────────────────────────────────────────

vi.mock("@/lib/ruvector/bridge", () => ({
  retrieveMemories: mockRetrieveMemories,
}))

// Import AFTER mocks are registered
import { unifiedSearch } from "./search"
import type { SearchResult } from "./search"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "test-id",
    created_at: new Date("2026-01-01T10:00:00Z"),
    ...overrides,
  }
}

const GROUP_ID = "allura-system"
const QUERY = "machine learning"

/** Default memory result from retrieveMemories mock */
function mockMemoryResult() {
  return {
    memories: [
      {
        id: "mem-1",
        content: "Machine learning models can be fine-tuned on specific datasets.",
        memoryType: "episodic" as const,
        score: 0.92,
      },
    ],
    total: 1,
    latencyMs: 12,
    trajectoryId: "traj-abc",
    modesUsed: ["hybrid" as const],
  }
}

/** Default empty rows for structured entity queries */
function emptyRows(): { rows: unknown[] } {
  return { rows: [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: all structured queries return empty rows; memory returns one hit
  mockQuery.mockResolvedValue(emptyRows())
  mockRetrieveMemories.mockResolvedValue(mockMemoryResult())
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("unifiedSearch", () => {
  describe("empty query guard", () => {
    it("returns empty array for blank query without hitting any datasource", async () => {
      const results = await unifiedSearch("", { group_id: GROUP_ID })
      expect(results).toHaveLength(0)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockRetrieveMemories).not.toHaveBeenCalled()
    })

    it("returns empty array for whitespace-only query", async () => {
      const results = await unifiedSearch("   ", { group_id: GROUP_ID })
      expect(results).toHaveLength(0)
      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  describe("all entity types coverage", () => {
    it("queries all entity types when no type filter is specified", async () => {
      await unifiedSearch(QUERY, { group_id: GROUP_ID })

      // retrieveMemories called with correct params
      expect(mockRetrieveMemories).toHaveBeenCalledOnce()
      expect(mockRetrieveMemories).toHaveBeenCalledWith(
        expect.objectContaining({ userId: GROUP_ID, query: QUERY }),
      )

      // At least 6 SQL queries: runs, definitions, work_items, projects, evidence, handoffs
      expect(mockQuery.mock.calls.length).toBeGreaterThanOrEqual(6)

      // Each structured query must include group_id as a parameter
      for (const call of mockQuery.mock.calls) {
        const params = call[1] as unknown[]
        expect(params).toContain(GROUP_ID)
      }
    })

    it("returns memory results when RuVector has matches", async () => {
      const results = await unifiedSearch(QUERY, { group_id: GROUP_ID })
      const memoryResult = results.find((r) => r.type === "memory")
      expect(memoryResult).toBeDefined()
      expect(memoryResult?.id).toBe("mem-1")
      expect(memoryResult?.score).toBe(0.92)
    })

    it("includes structured entity results alongside memory results", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            makeRow({
              id: "run-1",
              definition_id: "def-workflow",
              status: "completed",
              started_at: new Date("2026-01-01"),
              state_json: {},
            }),
          ],
        })
        .mockResolvedValue(emptyRows())

      const results = await unifiedSearch(QUERY, { group_id: GROUP_ID })
      const runResult = results.find((r) => r.type === "run")
      expect(runResult).toBeDefined()
      expect(runResult?.id).toBe("run-1")
    })
  })

  describe("type filtering", () => {
    it("only queries memory when types=['memory']", async () => {
      await unifiedSearch(QUERY, { group_id: GROUP_ID, types: ["memory"] })

      expect(mockRetrieveMemories).toHaveBeenCalledOnce()
      // No SQL queries for structured entities
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("skips memory when types does not include 'memory'", async () => {
      await unifiedSearch(QUERY, { group_id: GROUP_ID, types: ["run", "project"] })

      expect(mockRetrieveMemories).not.toHaveBeenCalled()
      // Should have queries for runs and projects
      expect(mockQuery.mock.calls.length).toBe(2)
    })

    it("only queries specified structured types", async () => {
      await unifiedSearch(QUERY, { group_id: GROUP_ID, types: ["project"] })

      expect(mockRetrieveMemories).not.toHaveBeenCalled()
      expect(mockQuery).toHaveBeenCalledOnce()

      const sqlText = mockQuery.mock.calls[0][0] as string
      expect(sqlText).toContain("projects")
    })

    it("handles types=['work-item'] without querying other tables", async () => {
      await unifiedSearch(QUERY, { group_id: GROUP_ID, types: ["work-item"] })

      expect(mockQuery).toHaveBeenCalledOnce()
      const sqlText = mockQuery.mock.calls[0][0] as string
      expect(sqlText).toContain("work_items")
    })
  })

  describe("result merging and ranking", () => {
    it("places memory results before structured results", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeRow({
            id: "proj-1",
            name: "ML Pipeline",
            description: "Machine learning pipeline project",
            status: "active",
          }),
        ],
      }).mockResolvedValue(emptyRows())

      const results = await unifiedSearch(QUERY, { group_id: GROUP_ID })

      const firstMemoryIdx = results.findIndex((r) => r.type === "memory")
      const firstStructuredIdx = results.findIndex((r) => r.type !== "memory")

      // Memory results with scores should appear before structured results
      if (firstMemoryIdx !== -1 && firstStructuredIdx !== -1) {
        expect(firstMemoryIdx).toBeLessThan(firstStructuredIdx)
      }
    })

    it("respects the limit option", async () => {
      // Simulate many hits for each query by returning 3 rows per query
      const rows = Array.from({ length: 3 }, (_, i) =>
        makeRow({
          id: `item-${i}`,
          definition_id: `def-${i}`,
          status: "completed",
          started_at: new Date(),
          state_json: {},
        }),
      )
      mockQuery.mockResolvedValue({ rows })

      const results = await unifiedSearch(QUERY, {
        group_id: GROUP_ID,
        limit: 5,
      })

      expect(results.length).toBeLessThanOrEqual(5)
    })
  })

  describe("graceful degradation", () => {
    it("returns structured results even when RuVector throws", async () => {
      mockRetrieveMemories.mockRejectedValue(new Error("RuVector unavailable"))
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeRow({
            id: "proj-ok",
            name: "My Project",
            description: "Working project",
            status: "active",
          }),
        ],
      }).mockResolvedValue(emptyRows())

      const results = await unifiedSearch(QUERY, { group_id: GROUP_ID })

      // No memory results (RuVector down), but structured results present
      const memoryResults = results.filter((r) => r.type === "memory")
      expect(memoryResults).toHaveLength(0)
      // At least one structured result
      expect(results.length).toBeGreaterThan(0)
    })

    it("does not throw when all sources return empty", async () => {
      mockRetrieveMemories.mockResolvedValue({
        memories: [],
        total: 0,
        latencyMs: 5,
        trajectoryId: "traj-empty",
        modesUsed: [],
      })
      mockQuery.mockResolvedValue(emptyRows())

      const results = await unifiedSearch(QUERY, { group_id: GROUP_ID })
      expect(results).toHaveLength(0)
    })
  })

  describe("result shape", () => {
    it("each result has required fields", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          makeRow({
            id: "def-1",
            revision: 3,
            name: "Ingest Pipeline",
          }),
        ],
      }).mockResolvedValue(emptyRows())

      const results = await unifiedSearch(QUERY, {
        group_id: GROUP_ID,
        types: ["definition"],
      })

      expect(results.length).toBeGreaterThan(0)
      for (const r of results) {
        expect(r).toHaveProperty("id")
        expect(r).toHaveProperty("type")
        expect(r).toHaveProperty("title")
        expect(r).toHaveProperty("summary")
        expect(r).toHaveProperty("created_at")
      }
    })

    it("memory results have a score field", async () => {
      const results = await unifiedSearch(QUERY, {
        group_id: GROUP_ID,
        types: ["memory"],
      })

      expect(results.length).toBe(1)
      expect(results[0]?.score).toBeDefined()
      expect(typeof results[0]?.score).toBe("number")
    })
  })
})
