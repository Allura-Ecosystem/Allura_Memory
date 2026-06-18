/**
 * Search Page Contract Test
 *
 * Verifies the response shape of `unifiedSearch` (the server action backing the
 * Search dashboard page). Imports the action directly — no mocks, no HTTP
 * overhead. Requires a live PostgreSQL stack.
 *
 * Run:
 *   bun run test:integration
 *   bun vitest run tests/integration/search-page-contract.test.ts
 *
 * Gating: tests skip gracefully when the DB is unavailable.
 *
 * Reference: src/server/actions/search.ts, docs/allura/BLUEPRINT.md
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { z } from "zod"
import { getPool } from "@/lib/postgres/connection"

// ── Lazy import to avoid "server-only" guard triggering outside Next.js ──────
// unifiedSearch is a "use server" action and guards against window. We import
// after a DB probe so the import only runs in a Node/Bun context (safe here).
let unifiedSearch: typeof import("@/server/actions/search").unifiedSearch
let resetConnections: (() => void) | undefined

// ── DB availability probe ─────────────────────────────────────────────────────

async function isDbAvailable(): Promise<boolean> {
  try {
    const pool = getPool()
    await pool.query("SELECT 1")
    return true
  } catch {
    return false
  }
}

let dbAvailable = false

// ── Zod response-shape schemas ────────────────────────────────────────────────

/**
 * Contract for a single SearchResult as returned by unifiedSearch.
 * Matches the exported SearchResult interface in src/server/actions/search.ts.
 */
const SearchResultSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["run", "work-item", "project", "evidence", "handoff", "memory", "definition"]),
  title: z.string().min(1),
  summary: z.string(),
  score: z.number().min(0).max(1).optional(),
  created_at: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const SearchResultsSchema = z.array(SearchResultSchema)

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Search Page Contract — unifiedSearch response shape", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable()

    if (!dbAvailable) {
      console.warn(
        "[search-page-contract] DB unavailable — all tests will be skipped. " +
          "Start the Brain stack with: bun run brain:up"
      )
      return
    }

    // Import after DB probe — server-only guard checks `window`, safe in Bun/Node
    const mod = await import("@/server/actions/search")
    unifiedSearch = mod.unifiedSearch

    // Import pool reset if available (same pattern as brain-contract.test.ts)
    try {
      const connMod = await import("@/lib/postgres/connection")
      if ("resetConnections" in connMod && typeof connMod.resetConnections === "function") {
        resetConnections = connMod.resetConnections as () => void
      }
    } catch {
      // resetConnections is optional — connection module may not export it
    }
  })

  afterAll(() => {
    if (resetConnections) resetConnections()
  })

  // ── empty query returns empty array ──────────────────────────────────────────

  describe("empty query guard", () => {
    it("returns an empty array for a blank query without hitting the DB", async () => {
      if (!dbAvailable) return

      const results = await unifiedSearch("", { group_id: "allura-system" })
      expect(Array.isArray(results)).toBe(true)
      expect(results).toHaveLength(0)
    })
  })

  // ── full-corpus shape check ───────────────────────────────────────────────────

  describe("response shape for a broad query", () => {
    it("each result satisfies the SearchResult contract", async () => {
      if (!dbAvailable) return

      const results = await unifiedSearch("a", {
        group_id: "allura-system",
        limit: 20,
      })

      // Must be an array (possibly empty if the DB has no matching data)
      expect(Array.isArray(results)).toBe(true)

      const parsed = SearchResultsSchema.safeParse(results)
      if (!parsed.success) {
        throw new Error(
          `unifiedSearch response shape violation:\n${parsed.error.toString()}`
        )
      }

      for (const result of parsed.data) {
        // id is always present and non-empty
        expect(result.id).toBeTruthy()

        // type must be one of the known enum values
        expect([
          "run",
          "work-item",
          "project",
          "evidence",
          "handoff",
          "memory",
          "definition",
        ]).toContain(result.type)

        // title and summary must be strings
        expect(typeof result.title).toBe("string")
        expect(typeof result.summary).toBe("string")

        // created_at must be a non-empty string (ISO date or similar)
        expect(result.created_at).toBeTruthy()
        expect(typeof result.created_at).toBe("string")

        // score is optional but when present must be in [0, 1]
        if (result.score !== undefined) {
          expect(result.score).toBeGreaterThanOrEqual(0)
          expect(result.score).toBeLessThanOrEqual(1)
        }
      }
    })
  })

  // ── type filter narrows results ───────────────────────────────────────────────

  describe("type filtering", () => {
    it("results match the requested type when type filter is applied", async () => {
      if (!dbAvailable) return

      // Query with a type filter — all returned items must be of that type
      const results = await unifiedSearch("a", {
        group_id: "allura-system",
        types: ["run"],
        limit: 10,
      })

      expect(Array.isArray(results)).toBe(true)

      for (const result of results) {
        expect(result.type).toBe("run")
      }
    })

    it("memory results carry a score field", async () => {
      if (!dbAvailable) return

      const results = await unifiedSearch("memory", {
        group_id: "allura-system",
        types: ["memory"],
        limit: 5,
      })

      for (const result of results) {
        expect(result.type).toBe("memory")
        // Memory results from RuVector always carry a score
        expect(result.score).toBeDefined()
        expect(typeof result.score).toBe("number")
      }
    })
  })

  // ── limit is respected ───────────────────────────────────────────────────────

  describe("limit option", () => {
    it("result count does not exceed the requested limit", async () => {
      if (!dbAvailable) return

      const LIMIT = 5
      const results = await unifiedSearch("a", {
        group_id: "allura-system",
        limit: LIMIT,
      })

      expect(results.length).toBeLessThanOrEqual(LIMIT)
    })
  })

  // ── group_id isolation ───────────────────────────────────────────────────────

  describe("group_id validation", () => {
    it("throws on an invalid group_id (non allura-* prefix)", async () => {
      if (!dbAvailable) return

      await expect(
        unifiedSearch("test", { group_id: "invalid-group" })
      ).rejects.toThrow()
    })
  })
})
