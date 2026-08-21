/**
 * memory() wrapper tests
 *
 * Tests the createEntity(), createRelationship(), query(), and search() API surface
 * of the Allura Memory write wrapper (src/lib/memory/writer.ts).
 *
 * ControlPlane tests: verify syscall routing when MEMORY_BYPASS_CONTROL_PLANE is not set
 * (default path). Neo4j fallback tests have been removed — Neo4j is sunset.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

process.env.RUVIX_CONTROL_PLANE_SECRET = "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars"

// ── Import under test (after mocks are in place) ─────────────────────────────

import { memory } from "./writer"

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL_PLANE ROUTING TESTS (default path — MEMORY_BYPASS_CONTROL_PLANE unset)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/control-plane/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "audit-123" },
  }),
  syscall_query: vi.fn().mockResolvedValue({
    success: true,
    data: [{ node_id: "n1", summary: "test" }],
  }),
}))

import { syscall_mutate, syscall_query } from "@/control-plane/syscalls"

describe("memory() — controlPlane-routed writer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure controlPlane path is active (default)
    delete process.env.MEMORY_BYPASS_CONTROL_PLANE
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
        error: "ControlPlane policy denied",
      })

      await expect(
        memory().createEntity({
          label: "Insight",
          group_id: "allura-system",
          props: { summary: "test" },
        })
      ).rejects.toThrow("ControlPlane policy denied")
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

// ─────────────────────────────────────────────────────────────────────────────
// DEPRECATED BYPASS FALLBACK
// MEMORY_BYPASS_KERNEL is the pre-rename name. It is still honoured so an
// operator mid-migration does not silently lose the bypass and get rerouted
// through syscall_mutate, where different policies apply.
// ─────────────────────────────────────────────────────────────────────────────

describe("memory() — MEMORY_BYPASS_KERNEL deprecated fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.MEMORY_BYPASS_CONTROL_PLANE
    delete process.env.MEMORY_BYPASS_KERNEL
  })

  afterEach(() => {
    delete process.env.MEMORY_BYPASS_CONTROL_PLANE
    delete process.env.MEMORY_BYPASS_KERNEL
  })

  it("honours the legacy MEMORY_BYPASS_KERNEL name — does not route to syscall_mutate", async () => {
    process.env.MEMORY_BYPASS_KERNEL = "true"
    await memory()
      .createEntity({ label: "Insight", group_id: "allura-system", props: { summary: "legacy" } })
      .catch(() => undefined)
    expect(syscall_mutate).not.toHaveBeenCalled()
  })

  it("prefers MEMORY_BYPASS_CONTROL_PLANE when both are set", async () => {
    process.env.MEMORY_BYPASS_KERNEL = "true"
    process.env.MEMORY_BYPASS_CONTROL_PLANE = "false"
    await memory()
      .createEntity({ label: "Insight", group_id: "allura-system", props: { summary: "new wins" } })
      .catch(() => undefined)
    expect(syscall_mutate).toHaveBeenCalled()
  })

  it("routes through the control plane when neither is set", async () => {
    await memory()
      .createEntity({ label: "Insight", group_id: "allura-system", props: { summary: "default" } })
      .catch(() => undefined)
    expect(syscall_mutate).toHaveBeenCalled()
  })
})
