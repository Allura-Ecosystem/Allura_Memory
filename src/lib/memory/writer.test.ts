/**
 * memory() wrapper tests
 *
 * Tests the createEntity(), createRelationship(), query(), and search() API surface
 * of the Allura Memory write wrapper (src/lib/memory/writer.ts).
 *
 * Kernel tests: verify syscall routing when MEMORY_BYPASS_KERNEL is not set
 * (default path). Neo4j fallback tests have been removed — Neo4j is sunset.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock path-mapped imports BEFORE any imports ────────────────────────────

vi.mock("@/lib/validation/group-id", async () => {
  const actual = await vi.importActual("@/lib/validation/group-id")
  return {
    ...(actual as object),
    validateGroupId: vi.fn((groupId: string) => {
      if (!groupId || !groupId.startsWith("allura-")) {
        throw new Error("Invalid group_id: must start with 'allura-'")
      }
      return groupId
    }),
  }
})

// ── Set required env vars before module load ──────────────────────────────────

process.env.RUVIX_KERNEL_SECRET = "test-secret-key-for-ruvix-kernel-proof-engine-32chars"

// ── Import under test (after mocks are in place) ─────────────────────────────

import { memory } from "./writer"

// ─────────────────────────────────────────────────────────────────────────────
// KERNEL ROUTING TESTS (default path — MEMORY_BYPASS_KERNEL unset)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/kernel/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "audit-123" },
  }),
  syscall_query: vi.fn().mockResolvedValue({
    success: true,
    data: [{ node_id: "n1", summary: "test" }],
  }),
}))

import { syscall_mutate, syscall_query } from "@/kernel/syscalls"

describe("memory() — kernel-routed writer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure kernel path is active (default)
    delete process.env.MEMORY_BYPASS_KERNEL
    // Re-stub syscalls after clearAllMocks
    vi.mocked(syscall_mutate).mockResolvedValue({
      success: true,
      data: { affected_rows: 1, auditId: "audit-123" },
    })
    vi.mocked(syscall_query).mockResolvedValue({
      success: true,
      data: [{ node_id: "n1", summary: "test" }],
    })
  })

  describe("createEntity", () => {
    it("should route through syscall_mutate with neo4j:Entity target", async () => {
      const result = await memory().createEntity({
        label: "Insight",
        group_id: "allura-system",
        props: { summary: "Test insight", confidence: 0.9 },
      })

      expect(result.node_id).toBeDefined()
      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "insert",
          target: "neo4j:Entity",
        }),
        expect.objectContaining({ group_id: "allura-system" })
      )
    })

    it("should reject invalid group_id", async () => {
      await expect(
        memory().createEntity({
          label: "Insight",
          group_id: "bad-group",
          props: { summary: "test" },
        })
      ).rejects.toThrow()
    })
  })

  describe("createRelationship", () => {
    it("should route through syscall_mutate with neo4j:Relationship target", async () => {
      await memory().createRelationship({
        fromId: "n1",
        fromLabel: "Agent",
        toId: "n2",
        toLabel: "Insight",
        type: "CONTRIBUTED",
      })

      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({ target: "neo4j:Relationship" }),
        expect.objectContaining({ actor: "system" })
      )
    })
  })

  describe("search", () => {
    it("should route through syscall_query with neo4j:Query target", async () => {
      const results = await memory().search({
        label: "Insight",
        group_id: "allura-system",
        props: { status: "active" },
        limit: 5,
      })

      expect(results).toHaveLength(1)
      expect(syscall_query).toHaveBeenCalledWith(
        expect.objectContaining({ target: "neo4j:Query" }),
        expect.objectContaining({ group_id: "allura-system" })
      )
    })
  })

  describe("query", () => {
    it("should route raw cypher through syscall_query", async () => {
      const results = await memory().query(
        "MATCH (n:Insight) RETURN n LIMIT 5",
        { group_id: "allura-system" }
      )

      expect(results).toHaveLength(1)
      expect(syscall_query).toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("throws when syscall_mutate returns success: false", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: false,
        error: "Kernel policy denied",
      })

      await expect(
        memory().createEntity({
          label: "Insight",
          group_id: "allura-system",
          props: { summary: "test" },
        })
      ).rejects.toThrow("Kernel policy denied")
    })

    it("throws when createRelationship syscall_mutate returns failure", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: false,
        error: "Relationship write denied",
      })

      await expect(
        memory().createRelationship({
          fromId: "n1",
          fromLabel: "Agent",
          toId: "n2",
          toLabel: "Insight",
          type: "CONTRIBUTED",
        })
      ).rejects.toThrow("Relationship write denied")
    })
  })
})