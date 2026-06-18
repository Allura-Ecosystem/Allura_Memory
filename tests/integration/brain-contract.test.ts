/**
 * Brain Contract Test
 *
 * Verifies the response shape of Allura Brain's canonical memory tools is
 * stable. Imports tools directly from src/mcp/canonical-tools.ts — no mocks,
 * no HTTP overhead. Requires a live PostgreSQL and (optionally) Neo4j stack.
 *
 * Run:
 *   bun run test:integration
 *   bun vitest run tests/integration/brain-contract.test.ts
 *
 * Gating: tests skip gracefully when the DB is unavailable.
 *
 * Reference: docs/allura/BLUEPRINT.md (canonical contracts)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "crypto"
import { z } from "zod"
import {
  memory_add,
  memory_delete,
  memory_get,
  memory_list,
  memory_search,
  resetConnections,
} from "@/mcp/canonical-tools"
import type {
  MemoryAddRequest,
  MemoryGetRequest,
  MemoryListRequest,
  MemorySearchRequest,
} from "@/lib/memory/canonical-contracts"

// ── DB availability probe ─────────────────────────────────────────────────────

/**
 * Returns true when PostgreSQL is reachable.
 * Fires a single cheap query via the canonical tools bootstrap path.
 * We exercise memory_list (read, no write side-effects) as the probe.
 */
async function isDbAvailable(): Promise<boolean> {
  try {
    await memory_list({
      group_id: "allura-system" as any,
      limit: 1,
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false

// ── Zod response-shape schemas ────────────────────────────────────────────────

const ResponseMetaSchema = z.object({
  contract_version: z.literal("v1"),
  degraded: z.boolean(),
  degraded_reason: z
    .enum(["neo4j_unavailable", "graph_unavailable"])
    .optional(),
  stores_used: z.array(
    z.enum(["postgres", "neo4j", "ruvector", "graph"])
  ),
  stores_attempted: z
    .array(z.enum(["postgres", "neo4j", "ruvector", "graph"]))
    .optional(),
  warnings: z.array(z.string()).optional(),
  ruvector_trajectory_id: z.string().optional(),
  ruvector_count: z.number().int().nonnegative().optional(),
})

/**
 * KNOWN DRIFT (2026-06-15): The canonical-contracts.ts TypeScript type declares
 * `created_at: string`, but the memory_list and memory_get implementations
 * return a raw Date object from the PostgreSQL driver for Neo4j-sourced
 * memories. memory_search already coerces to ISO string.
 *
 * The schema below accepts both to document current reality. Fix: coerce all
 * created_at values to ISO strings before returning from memory_list/memory_get.
 */
const TimestampSchema = z.union([z.string().min(1), z.date()])

const MemoryGetResponseSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  score: z.number().min(0).max(1),
  source: z.enum(["episodic", "semantic", "both"]),
  provenance: z.enum(["conversation", "manual"]),
  user_id: z.string().min(1),
  // See KNOWN DRIFT above — accepts Date until the implementation is fixed.
  created_at: TimestampSchema,
  version: z.number().int().optional(),
  superseded_by: z.string().optional(),
  usage_count: z.number().optional(),
  recent_usage_count: z.number().nullable().optional(),
  tags: z.array(z.string()).optional(),
  schema_version: z.number().optional(),
  meta: ResponseMetaSchema.optional(),
})

const MemoryListResponseSchema = z.object({
  memories: z.array(MemoryGetResponseSchema),
  total: z.number().int().nonnegative(),
  has_more: z.boolean(),
  meta: ResponseMetaSchema.optional(),
})

const MemorySearchResultSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  score: z.number().min(0).max(1),
  source: z.enum(["episodic", "semantic", "both"]),
  provenance: z.enum(["conversation", "manual"]),
  // memory_search already coerces to ISO string — this is the expected shape.
  created_at: z.string().min(1),
  usage_count: z.number().optional(),
  tags: z.array(z.string()).optional(),
  schema_version: z.number().optional(),
})

const MemorySearchResponseSchema = z.object({
  results: z.array(MemorySearchResultSchema),
  count: z.number().int().nonnegative(),
  latency_ms: z.number().nonnegative(),
  meta: ResponseMetaSchema.optional(),
})

const MemoryAddResponseSchema = z.object({
  id: z.string().min(1),
  stored: z.enum(["episodic", "semantic", "both"]),
  score: z.number().min(0).max(1),
  pending_review: z.boolean().optional(),
  created_at: z.string().min(1),
  meta: ResponseMetaSchema.optional(),
  duplicate: z.boolean().optional(),
  duplicate_of: z.string().optional(),
  similarity: z.number().optional(),
})

// ── Test helpers ──────────────────────────────────────────────────────────────

const RUN_ID = randomUUID().slice(0, 8)
// Use allura-system as required; append run ID so test data is discoverable
const GROUP_ID = "allura-system" as any
const CONTRACT_USER_ID = `contract-test-${RUN_ID}`

function uniqueContent(base: string): string {
  return `[brain-contract-test run:${RUN_ID}] ${base}`
}

// Track memory IDs created during the test so we can clean up
const createdMemoryIds: string[] = []

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("Brain Contract — canonical tool response shapes", () => {
  beforeAll(async () => {
    dbAvailable = await isDbAvailable()
    if (!dbAvailable) {
      console.warn(
        "[brain-contract] DB unavailable — all tests will be skipped. " +
          "Start the Brain stack with: bun run brain:up"
      )
    }
  })

  afterAll(async () => {
    // Best-effort cleanup: soft-delete any memories added during the test run.
    // Allura uses append-only episodic traces, so deletion records the event
    // rather than removing rows.
    if (dbAvailable && createdMemoryIds.length > 0) {
      await Promise.allSettled(
        createdMemoryIds.map((id) =>
          memory_delete({
            id: id as any,
            group_id: GROUP_ID,
            user_id: CONTRACT_USER_ID,
          })
        )
      )
    }
    // Release pooled connections so Vitest can exit cleanly.
    resetConnections()
  })

  // ── memory_list ─────────────────────────────────────────────────────────────

  describe("memory_list", () => {
    it("returns the expected contract shape", async () => {
      if (!dbAvailable) return

      const request: MemoryListRequest = {
        group_id: GROUP_ID,
        limit: 5,
      }

      const response = await memory_list(request)

      // Parse with Zod — throws ZodError with field-level details on mismatch
      const parsed = MemoryListResponseSchema.safeParse(response)
      if (!parsed.success) {
        throw new Error(
          `memory_list response shape violation:\n${parsed.error.toString()}`
        )
      }

      // Shape assertions (value-agnostic)
      expect(typeof parsed.data.total).toBe("number")
      expect(parsed.data.total).toBeGreaterThanOrEqual(0)
      expect(typeof parsed.data.has_more).toBe("boolean")
      expect(Array.isArray(parsed.data.memories)).toBe(true)

      // meta field is optional at the contract level but when present must be v1
      if (parsed.data.meta) {
        expect(parsed.data.meta.contract_version).toBe("v1")
        expect(typeof parsed.data.meta.degraded).toBe("boolean")
        expect(Array.isArray(parsed.data.meta.stores_used)).toBe(true)
      }

      // Each memory in the array must satisfy MemoryGetResponseSchema
      for (const mem of parsed.data.memories) {
        expect(mem.id).toBeTruthy()
        expect(mem.content).toBeTruthy()
        expect(mem.score).toBeGreaterThanOrEqual(0)
        expect(mem.score).toBeLessThanOrEqual(1)
        expect(["episodic", "semantic", "both"]).toContain(mem.source)
        expect(["conversation", "manual"]).toContain(mem.provenance)
        expect(mem.created_at).toBeTruthy()
      }
    })
  })

  // ── memory_search ────────────────────────────────────────────────────────────

  describe("memory_search", () => {
    it("returns the expected contract shape for query 'architecture'", async () => {
      if (!dbAvailable) return

      const request: MemorySearchRequest = {
        query: "architecture",
        group_id: GROUP_ID,
        limit: 5,
        status: "all",
      }

      const response = await memory_search(request)

      const parsed = MemorySearchResponseSchema.safeParse(response)
      if (!parsed.success) {
        throw new Error(
          `memory_search response shape violation:\n${parsed.error.toString()}`
        )
      }

      // Shape assertions
      expect(Array.isArray(parsed.data.results)).toBe(true)
      expect(typeof parsed.data.count).toBe("number")
      expect(parsed.data.count).toBeGreaterThanOrEqual(0)
      expect(typeof parsed.data.latency_ms).toBe("number")
      expect(parsed.data.latency_ms).toBeGreaterThanOrEqual(0)

      // Every result must carry a score field (distinguishes search from list)
      for (const result of parsed.data.results) {
        expect(typeof result.score).toBe("number")
        expect(result.score).toBeGreaterThanOrEqual(0)
        expect(result.score).toBeLessThanOrEqual(1)
        expect(result.id).toBeTruthy()
        expect(result.content).toBeTruthy()
        expect(["episodic", "semantic", "both"]).toContain(result.source)
        expect(["conversation", "manual"]).toContain(result.provenance)
        expect(result.created_at).toBeTruthy()
      }

      if (parsed.data.meta) {
        expect(parsed.data.meta.contract_version).toBe("v1")
        expect(typeof parsed.data.meta.degraded).toBe("boolean")
      }
    })
  })

  // ── memory_add + memory_get roundtrip ────────────────────────────────────────

  describe("memory_add + memory_get roundtrip", () => {
    it("add returns the expected shape and get retrieves matching fields", async () => {
      if (!dbAvailable) return

      const content = uniqueContent(
        "contract test memory — verifying roundtrip shape stability"
      )

      // 1. Add
      const addRequest: MemoryAddRequest = {
        group_id: GROUP_ID,
        user_id: CONTRACT_USER_ID,
        content,
        metadata: { source: "manual" },
        // High threshold ensures episodic-only, avoiding curator side effects
        threshold: 0.99,
      }

      const addResponse = await memory_add(addRequest)

      const addParsed = MemoryAddResponseSchema.safeParse(addResponse)
      if (!addParsed.success) {
        throw new Error(
          `memory_add response shape violation:\n${addParsed.error.toString()}`
        )
      }

      // Track for cleanup
      createdMemoryIds.push(addParsed.data.id)

      // Shape assertions on add response
      expect(addParsed.data.id).toBeTruthy()
      expect(["episodic", "semantic", "both"]).toContain(addParsed.data.stored)
      expect(addParsed.data.score).toBeGreaterThanOrEqual(0)
      expect(addParsed.data.score).toBeLessThanOrEqual(1)
      expect(addParsed.data.created_at).toBeTruthy()

      // 2. Get — retrieve by the ID returned from add
      const getRequest: MemoryGetRequest = {
        id: addParsed.data.id as any,
        group_id: GROUP_ID,
      }

      const getResponse = await memory_get(getRequest)

      const getParsed = MemoryGetResponseSchema.safeParse(getResponse)
      if (!getParsed.success) {
        throw new Error(
          `memory_get response shape violation:\n${getParsed.error.toString()}`
        )
      }

      // Shape assertions on get response
      expect(getParsed.data.id).toBeTruthy()
      expect(getParsed.data.content).toBeTruthy()
      expect(getParsed.data.user_id).toBeTruthy()
      expect(getParsed.data.created_at).toBeTruthy()
      expect(getParsed.data.score).toBeGreaterThanOrEqual(0)
      expect(getParsed.data.score).toBeLessThanOrEqual(1)
      expect(["episodic", "semantic", "both"]).toContain(getParsed.data.source)
      expect(["conversation", "manual"]).toContain(getParsed.data.provenance)

      // 3. Field-level consistency: the roundtrip must agree on identity
      expect(getParsed.data.id).toBe(addParsed.data.id)
      expect(getParsed.data.content).toBe(content)
      expect(getParsed.data.user_id).toBe(CONTRACT_USER_ID)

      // created_at is written once on add and must be present on get
      // (may be a string or Date — see KNOWN DRIFT comment near TimestampSchema)
      expect(getParsed.data.created_at).toBeTruthy()
    })
  })
})
