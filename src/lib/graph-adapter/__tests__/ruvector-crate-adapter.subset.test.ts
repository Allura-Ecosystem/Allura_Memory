/**
 * Subset parity tests — ruvector-crate adapter (Option A).
 *
 * These tests run ANYWHERE: they drive the adapter's LOGIC against the fake
 * native binding (`fixtures/fake-ruvector-graph-node.cjs`), which faithfully
 * replicates the 2026-06-24 spike semantics — async createNode/createEdge/query,
 * the B2 `String("...")` property leak, the non-atomic rollback no-op (B1), the
 * absence of updateNode (B3), querySync stats-only, kHop traversal, and edge-only
 * searchHyperedges.
 *
 * Scope is the HONEST SUBSET this binding supports (Option A, AD-50):
 *   create / retrieve / list / count / search (keyword) / link / health
 *   G3 tenant scoping enforced adapter-side
 *   B2 property-leak unwrap proven on round-trip
 *   supersedes / softDelete / restore MUST throw `unsupported:` (B1/B3)
 *
 * This is NOT the real three-way parity run against the vendored `.node`
 * (workstation-gated). It validates adapter behavior so the real-binding run is
 * a thin confirmation, not a discovery.
 */

import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import { RuvectorCrateGraphAdapter } from "../ruvector-crate-adapter"
import type { ConfidenceScore, GroupId, MemoryId, MemoryProvenance } from "@/lib/memory/canonical-contracts"

// Absolute path to the fake binding — require()-loadable at runtime.
const FAKE_BINDING_PATH = fileURLToPath(
  new URL("./fixtures/fake-ruvector-graph-node.cjs", import.meta.url)
)

// The same subset runs against the REAL vendored .node when these env vars are
// set (workstation / CI with the artifact present); otherwise it runs against
// the fake fixture above. This is what proves the fake matches reality.
//
// NOTE: the real binding has NO in-memory mode (AD-50 structural limits). Passing
// ":memory:" makes the real .so create a literal file named ":memory:" in cwd. The
// fake fixture ignores storagePath, so the default below is safe for the fake run;
// for a real-binding run, set RUVECTOR_TEST_STORAGE_PATH to a real temp dir
// (e.g. `RUVECTOR_TEST_STORAGE_PATH=$(mktemp -d)`) and clean it up afterward.
const BINDING_PATH = process.env.RUVECTOR_TEST_BINDING_PATH ?? FAKE_BINDING_PATH
const STORAGE_PATH = process.env.RUVECTOR_TEST_STORAGE_PATH ?? ":memory:"

const TEST_GROUP_ID = "allura-test" as GroupId
const OTHER_GROUP_ID = "allura-other" as GroupId
// Malformed tenant key for the guard test (no valid allura- prefix).
const MALFORMED_GROUP_ID = "not-a-valid-namespace" as GroupId

/** Deterministic 8-dim embedder — dimension is irrelevant to the fake binding. */
const embed = async (text: string): Promise<Float32Array> =>
  new Float32Array(Array.from({ length: 8 }, (_, i) => Math.sin(text.length + i)))

function newAdapter(): RuvectorCrateGraphAdapter {
  return new RuvectorCrateGraphAdapter({
    modulePath: BINDING_PATH,
    storagePath: STORAGE_PATH,
    embed,
  })
}

function seedParams(overrides: Partial<{
  id: MemoryId
  group_id: GroupId
  user_id: string | null
  content: string
  score: ConfidenceScore
  provenance: MemoryProvenance
  created_at: string
}> = {}) {
  return {
    id: "mem-001" as MemoryId,
    group_id: TEST_GROUP_ID,
    user_id: null,
    content: "halal supply chain logistics note",
    score: 0.9 as ConfidenceScore,
    provenance: "stated" as MemoryProvenance,
    created_at: "2026-06-24T00:00:00.000Z",
    ...overrides,
  }
}

describe("ruvector-crate adapter — subset parity (Option A)", () => {
  let adapter: RuvectorCrateGraphAdapter

  beforeEach(() => {
    // Fresh in-memory DB per test (the fake opens a new Map-backed instance).
    adapter = newAdapter()
  })

  describe("createMemory + getMemory (round-trip, B2 unwrap, G3)", () => {
    it("round-trips a node and unwraps the B2 String(\"...\") leak", async () => {
      const params = seedParams()
      const returnedId = await adapter.createMemory(params)
      expect(returnedId).toBe(params.id)

      const { node } = await adapter.getMemory({ id: params.id, group_id: TEST_GROUP_ID })
      expect(node).not.toBeNull()
      // If the B2 leak were NOT unwrapped these would read as `String("...")`.
      expect(node?.id).toBe(params.id)
      expect(node?.group_id).toBe(TEST_GROUP_ID)
      expect(node?.content).toBe(params.content)
      expect(node?.score).toBe(0.9)
      expect(node?.provenance).toBe("stated")
      expect(node?.version).toBe(1)
      expect(node?.deprecated).toBe(false)
      expect(node?.user_id).toBeNull()
      expect(node?.tags).toEqual([])
    })

    it("scopes reads by group_id (G3) — other tenant cannot see the node", async () => {
      await adapter.createMemory(seedParams())
      const { node } = await adapter.getMemory({ id: "mem-001" as MemoryId, group_id: OTHER_GROUP_ID })
      expect(node).toBeNull()
    })

    it("rejects a malformed group_id before touching the store", async () => {
      await expect(
        adapter.createMemory(seedParams({ group_id: MALFORMED_GROUP_ID }))
      ).rejects.toThrow(/invalid group_id/)
    })
  })

  describe("checkDuplicate", () => {
    it("finds an existing node with identical content in the same tenant", async () => {
      await adapter.createMemory(seedParams())
      const res = await adapter.checkDuplicate({
        group_id: TEST_GROUP_ID,
        user_id: null,
        content: "halal supply chain logistics note",
      })
      expect(res.existingId).toBe("mem-001")
    })

    it("returns null when content differs", async () => {
      await adapter.createMemory(seedParams())
      const res = await adapter.checkDuplicate({
        group_id: TEST_GROUP_ID,
        user_id: null,
        content: "totally different content",
      })
      expect(res.existingId).toBeNull()
    })
  })

  describe("searchMemories (keyword ranking — node vector search unsupported)", () => {
    it("ranks by keyword relevance and respects the limit", async () => {
      await adapter.createMemory(seedParams({ id: "mem-a" as MemoryId, content: "halal halal logistics" }))
      await adapter.createMemory(seedParams({ id: "mem-b" as MemoryId, content: "halal note" }))
      await adapter.createMemory(seedParams({ id: "mem-c" as MemoryId, content: "unrelated topic" }))

      const results = await adapter.searchMemories({ query: "halal", group_id: TEST_GROUP_ID, limit: 10 })
      expect(results.map((r) => r.id)).toEqual(["mem-a", "mem-b"])
      expect(results[0].relevance).toBeGreaterThan(results[1].relevance)
    })

    it("does not leak across tenants", async () => {
      await adapter.createMemory(seedParams({ id: "mem-a" as MemoryId, content: "halal note" }))
      await adapter.createMemory(
        seedParams({ id: "mem-x" as MemoryId, group_id: OTHER_GROUP_ID, content: "halal note" })
      )
      const results = await adapter.searchMemories({ query: "halal", group_id: TEST_GROUP_ID, limit: 10 })
      expect(results.map((r) => r.id)).toEqual(["mem-a"])
    })
  })

  describe("listMemories / countMemories", () => {
    it("lists and counts only the tenant's nodes", async () => {
      await adapter.createMemory(seedParams({ id: "mem-a" as MemoryId }))
      await adapter.createMemory(seedParams({ id: "mem-b" as MemoryId }))
      await adapter.createMemory(seedParams({ id: "mem-x" as MemoryId, group_id: OTHER_GROUP_ID }))

      const list = await adapter.listMemories({ group_id: TEST_GROUP_ID, user_id: null })
      expect(list.total).toBe(2)
      expect(list.memories.map((m) => m.id).sort()).toEqual(["mem-a", "mem-b"])

      const count = await adapter.countMemories({ group_id: TEST_GROUP_ID, user_id: null })
      expect(count.total).toBe(2)
    })

    it("filters by user_id when provided", async () => {
      await adapter.createMemory(seedParams({ id: "mem-a" as MemoryId, user_id: "u1" }))
      await adapter.createMemory(seedParams({ id: "mem-b" as MemoryId, user_id: "u2" }))
      const list = await adapter.listMemories({ group_id: TEST_GROUP_ID, user_id: "u1" })
      expect(list.memories.map((m) => m.id)).toEqual(["mem-a"])
    })
  })

  describe("checkCanonical / getVersion", () => {
    it("reports a present node as canonical at version 1", async () => {
      await adapter.createMemory(seedParams())
      const canonical = await adapter.checkCanonical({ id: "mem-001" as MemoryId, group_id: TEST_GROUP_ID })
      expect(canonical.isCanonical).toBe(true)

      const version = await adapter.getVersion({ id: "mem-001" as MemoryId, group_id: TEST_GROUP_ID })
      expect(version).toEqual({ version: 1, exists: true })
    })

    it("reports a missing node as not canonical / not existing", async () => {
      const canonical = await adapter.checkCanonical({ id: "nope" as MemoryId, group_id: TEST_GROUP_ID })
      expect(canonical.isCanonical).toBe(false)
      const version = await adapter.getVersion({ id: "nope" as MemoryId, group_id: TEST_GROUP_ID })
      expect(version).toEqual({ version: null, exists: false })
    })
  })

  describe("exportMemories (pagination)", () => {
    it("paginates with offset + limit", async () => {
      for (let i = 0; i < 5; i++) {
        await adapter.createMemory(seedParams({ id: `mem-${i}` as MemoryId }))
      }
      const page = await adapter.exportMemories({
        group_id: TEST_GROUP_ID,
        user_id: null,
        offset: 2,
        limit: 2,
      })
      expect(page.memories).toHaveLength(2)
    })
  })

  describe("linkMemoryContext (edges are first-class)", () => {
    it("creates AUTHORED_BY + RELATES_TO when endpoints exist", async () => {
      await adapter.createMemory(seedParams())
      await adapter.createMemory(seedParams({ id: "agent-1" as MemoryId, content: "agent node" }))
      await adapter.createMemory(seedParams({ id: "project-1" as MemoryId, content: "project node" }))

      const res = await adapter.linkMemoryContext({
        memory_id: "mem-001" as MemoryId,
        group_id: TEST_GROUP_ID,
        agent_id: "agent-1",
        project_id: "project-1",
      })
      expect(res).toEqual({ authored_by: true, relates_to: true })
    })

    it("skips silently when the endpoint node is absent (MERGE-skip contract)", async () => {
      await adapter.createMemory(seedParams())
      const res = await adapter.linkMemoryContext({
        memory_id: "mem-001" as MemoryId,
        group_id: TEST_GROUP_ID,
        agent_id: "missing-agent",
        project_id: null,
      })
      expect(res).toEqual({ authored_by: false, relates_to: false })
    })
  })

  describe("getDeprecatedMemories", () => {
    it("returns empty under Option A (no node is ever deprecated)", async () => {
      await adapter.createMemory(seedParams())
      const map = await adapter.getDeprecatedMemories({ ids: ["mem-001"], group_id: TEST_GROUP_ID })
      expect(map.size).toBe(0)
    })
  })

  describe("isHealthy", () => {
    it("is healthy when the binding answers stats()", async () => {
      expect(await adapter.isHealthy()).toBe(true)
    })
  })

  // ── Unsupported under Option A — B1 (no atomicity) / B3 (no node mutation) ──
  // These are explicit refusals, NOT skipped behavior. Faking success would
  // silently violate the SUPERSEDES/soft-delete invariants. For real versioning
  // and lifecycle, GRAPH_BACKEND=neo4j is the supported path.

  describe("unsupported operations refuse honestly", () => {
    it("supersedesMemory throws unsupported: (B1 + B3)", async () => {
      await expect(
        adapter.supersedesMemory({
          prev_id: "mem-001" as MemoryId,
          new_id: "mem-002" as MemoryId,
          group_id: TEST_GROUP_ID,
          user_id: null,
          content: "v2",
          version: 2,
          created_at: "2026-06-24T01:00:00.000Z",
        })
      ).rejects.toThrow(/unsupported:/)
    })

    it("softDeleteMemory throws unsupported: (B3)", async () => {
      await expect(
        adapter.softDeleteMemory({
          id: "mem-001" as MemoryId,
          group_id: TEST_GROUP_ID,
          deleted_at: "2026-06-24T02:00:00.000Z",
        })
      ).rejects.toThrow(/unsupported:/)
    })

    it("restoreMemory throws unsupported: (B3)", async () => {
      await expect(
        adapter.restoreMemory({
          id: "mem-001" as MemoryId,
          group_id: TEST_GROUP_ID,
          restored_at: "2026-06-24T03:00:00.000Z",
        })
      ).rejects.toThrow(/unsupported:/)
    })
  })

  describe("interface contract — all 16 methods present", () => {
    it("implements the full IGraphAdapter surface", () => {
      const required = [
        "createMemory",
        "checkDuplicate",
        "supersedesMemory",
        "softDeleteMemory",
        "restoreMemory",
        "getMemory",
        "searchMemories",
        "listMemories",
        "countMemories",
        "checkCanonical",
        "getVersion",
        "exportMemories",
        "getDeprecatedMemories",
        "linkMemoryContext",
        "isHealthy",
        "close",
      ]
      for (const m of required) {
        expect(typeof (adapter as unknown as Record<string, unknown>)[m]).toBe("function")
      }
    })
  })
})
