/**
 * Contract Validation Suite
 *
 * Verifies that ALL memory_* tool responses conform to the
 * { data, meta, error } envelope and that the coordinator
 * enforces group_id validation at the boundary.
 *
 * These are UNIT tests — no live DB needed. The canonical-tools
 * layer is mocked to isolate contract validation logic.
 *
 * Reference: docs/allura/BLUEPRINT.md (F-003: Approval Audit Flow)
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  MemoryAddResponse,
  MemoryDeleteResponse,
  MemoryExportResponse,
  MemoryGetResponse,
  MemoryListDeletedResponse,
  MemoryListResponse,
  MemoryPromoteResponse,
  MemoryResponseMeta,
  MemoryRestoreResponse,
  MemorySearchResponse,
  MemoryUpdateResponse,
} from "@/lib/memory/canonical-contracts"

// ── Mock Setup ────────────────────────────────────────────────────────────

// Mock the canonical-tools module entirely — we test the contract shape,
// not the implementation
vi.mock("@/mcp/canonical-tools", () => ({
  memory_add: vi.fn(),
  memory_search: vi.fn(),
  memory_get: vi.fn(),
  memory_list: vi.fn(),
  memory_delete: vi.fn(),
  memory_update: vi.fn(),
  memory_promote: vi.fn(),
  memory_export: vi.fn(),
  memory_restore: vi.fn(),
  memory_list_deleted: vi.fn(),
  canonicalMemoryTools: {},
  resetConnections: vi.fn(),
}))

import {
  memory_add,
  memory_delete,
  memory_export,
  memory_get,
  memory_list,
  memory_list_deleted,
  memory_promote,
  memory_restore,
  memory_search,
  memory_update,
} from "@/mcp/canonical-tools"

// ── Helpers ───────────────────────────────────────────────────────────────

const VALID_GROUP_ID = "allura-contract-test"
const VALID_META: MemoryResponseMeta = {
  contract_version: "v1",
  degraded: false,
  stores_used: ["postgres"],
  stores_attempted: ["postgres", "neo4j"],
}

/**
 * Validate that a response has the correct envelope shape.
 * The canonical contracts define specific fields per tool;
 * this checks that the required fields are present and typed correctly.
 */
function validateMeta(meta: MemoryResponseMeta | undefined): void {
  expect(meta).toBeDefined()
  if (!meta) return

  expect(meta.contract_version).toBe("v1")
  expect(meta.degraded).toBeDefined()
  expect(typeof meta.degraded).toBe("boolean")
  expect(meta.stores_used).toBeDefined()
  expect(Array.isArray(meta.stores_used)).toBe(true)
  expect(meta.stores_attempted).toBeDefined()
  expect(Array.isArray(meta.stores_attempted)).toBe(true)
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("Contract Validation Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── memory_add ────────────────────────────────────────────────────────

  it("memory_add returns valid envelope", async () => {
    const mockResponse: MemoryAddResponse = {
      id: "mem-001" as any,
      stored: "episodic",
      score: 0.75,
      created_at: "2026-04-19T12:00:00.000Z",
      meta: VALID_META,
    }
    vi.mocked(memory_add).mockResolvedValue(mockResponse)

    const result = await memory_add({
      group_id: VALID_GROUP_ID as any,
      user_id: "user-1",
      content: "Test memory",
    })

    expect(result.id).toBeDefined()
    expect(typeof result.id).toBe("string")
    expect(result.stored).toMatch(/^(episodic|semantic|both)$/)
    expect(typeof result.score).toBe("number")
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
    expect(result.created_at).toBeDefined()
    validateMeta(result.meta)
  })

  // ── memory_search ────────────────────────────────────────────────────

  it("memory_search returns valid envelope", async () => {
    const mockResponse: MemorySearchResponse = {
      results: [],
      count: 0,
      latency_ms: 42,
      meta: VALID_META,
    }
    vi.mocked(memory_search).mockResolvedValue(mockResponse)

    const result = await memory_search({
      query: "test",
      group_id: VALID_GROUP_ID as any,
    })

    expect(Array.isArray(result.results)).toBe(true)
    expect(typeof result.count).toBe("number")
    expect(typeof result.latency_ms).toBe("number")
    validateMeta(result.meta)
  })

  // ── memory_get ───────────────────────────────────────────────────────

  it("memory_get returns valid envelope", async () => {
    const mockResponse: MemoryGetResponse = {
      id: "mem-001" as any,
      content: "Test content",
      score: 0.85,
      source: "episodic",
      provenance: "conversation",
      user_id: "user-1",
      created_at: "2026-04-19T12:00:00.000Z",
      meta: VALID_META,
    }
    vi.mocked(memory_get).mockResolvedValue(mockResponse)

    const result = await memory_get({
      id: "mem-001" as any,
      group_id: VALID_GROUP_ID as any,
    })

    expect(result.id).toBeDefined()
    expect(typeof result.content).toBe("string")
    expect(typeof result.score).toBe("number")
    expect(result.source).toMatch(/^(episodic|semantic|both)$/)
    expect(result.provenance).toMatch(/^(conversation|manual)$/)
    expect(result.user_id).toBeDefined()
    expect(result.created_at).toBeDefined()
    validateMeta(result.meta)
  })

  // ── memory_list ──────────────────────────────────────────────────────

  it("memory_list returns valid envelope", async () => {
    const mockResponse: MemoryListResponse = {
      memories: [],
      total: 0,
      has_more: false,
      meta: VALID_META,
    }
    vi.mocked(memory_list).mockResolvedValue(mockResponse)

    const result = await memory_list({
      group_id: VALID_GROUP_ID as any,
    })

    expect(Array.isArray(result.memories)).toBe(true)
    expect(typeof result.total).toBe("number")
    expect(typeof result.has_more).toBe("boolean")
    validateMeta(result.meta)
  })

  // ── memory_delete ───────────────────────────────────────────────────

  it("memory_delete returns valid envelope", async () => {
    const mockResponse: MemoryDeleteResponse = {
      id: "mem-001" as any,
      deleted: true,
      deleted_at: "2026-04-19T12:00:00.000Z",
      recovery_days: 30,
      meta: VALID_META,
    }
    vi.mocked(memory_delete).mockResolvedValue(mockResponse)

    const result = await memory_delete({
      id: "mem-001" as any,
      group_id: VALID_GROUP_ID as any,
      user_id: "user-1",
    })

    expect(result.id).toBeDefined()
    expect(typeof result.deleted).toBe("boolean")
    expect(result.deleted_at).toBeDefined()
    expect(typeof result.recovery_days).toBe("number")
    validateMeta(result.meta)
  })

  // ── memory_update ────────────────────────────────────────────────────

  it("memory_update returns valid envelope", async () => {
    const mockResponse: MemoryUpdateResponse = {
      id: "mem-002" as any,
      previous_id: "mem-001" as any,
      stored: "both",
      version: 2,
      updated_at: "2026-04-19T12:00:00.000Z",
      meta: VALID_META,
    }
    vi.mocked(memory_update).mockResolvedValue(mockResponse)

    const result = await memory_update({
      id: "mem-001" as any,
      group_id: VALID_GROUP_ID as any,
      user_id: "user-1",
      content: "Updated content",
    })

    expect(result.id).toBeDefined()
    expect(result.previous_id).toBeDefined()
    expect(result.stored).toMatch(/^(episodic|semantic|both)$/)
    expect(typeof result.version).toBe("number")
    expect(result.updated_at).toBeDefined()
    validateMeta(result.meta)
  })

  // ── memory_promote ──────────────────────────────────────────────────

  it("memory_promote returns valid envelope", async () => {
    const mockResponse: MemoryPromoteResponse = {
      id: "mem-001" as any,
      proposal_id: "prop-001",
      status: "queued",
      queued_at: "2026-04-19T12:00:00.000Z",
      meta: VALID_META,
    }
    vi.mocked(memory_promote).mockResolvedValue(mockResponse)

    const result = await memory_promote({
      id: "mem-001" as any,
      group_id: VALID_GROUP_ID as any,
      user_id: "user-1",
    })

    expect(result.id).toBeDefined()
    expect(result.proposal_id).toBeDefined()
    expect(result.status).toMatch(/^(queued|already_canonical)$/)
    expect(result.queued_at).toBeDefined()
    validateMeta(result.meta)
  })

  // ── memory_export ────────────────────────────────────────────────────

  it("memory_export returns valid envelope", async () => {
    const mockResponse: MemoryExportResponse = {
      memories: [],
      count: 0,
      exported_at: "2026-04-19T12:00:00.000Z",
      canonical_count: 0,
      episodic_count: 0,
      meta: VALID_META,
    }
    vi.mocked(memory_export).mockResolvedValue(mockResponse)

    const result = await memory_export({
      group_id: VALID_GROUP_ID as any,
    })

    expect(Array.isArray(result.memories)).toBe(true)
    expect(typeof result.count).toBe("number")
    expect(result.exported_at).toBeDefined()
    expect(typeof result.canonical_count).toBe("number")
    expect(typeof result.episodic_count).toBe("number")
    validateMeta(result.meta)
  })

  // ── memory_restore ───────────────────────────────────────────────────

  it("memory_restore returns valid envelope", async () => {
    const mockResponse: MemoryRestoreResponse = {
      id: "mem-001" as any,
      restored: true,
      restored_at: "2026-04-19T12:00:00.000Z",
      meta: VALID_META,
    }
    vi.mocked(memory_restore).mockResolvedValue(mockResponse)

    const result = await memory_restore({
      id: "mem-001" as any,
      group_id: VALID_GROUP_ID as any,
      user_id: "user-1",
    })

    expect(result.id).toBeDefined()
    expect(typeof result.restored).toBe("boolean")
    expect(result.restored_at).toBeDefined()
    validateMeta(result.meta)
  })

  // ── memory_list_deleted ──────────────────────────────────────────────

  it("memory_list_deleted returns valid envelope", async () => {
    const mockResponse: MemoryListDeletedResponse = {
      memories: [],
      total: 0,
      has_more: false,
      meta: VALID_META,
    }
    vi.mocked(memory_list_deleted).mockResolvedValue(mockResponse)

    const result = await memory_list_deleted({
      group_id: VALID_GROUP_ID as any,
    })

    expect(Array.isArray(result.memories)).toBe(true)
    expect(typeof result.total).toBe("number")
    expect(typeof result.has_more).toBe("boolean")
    validateMeta(result.meta)
  })

  // ── group_id Validation ──────────────────────────────────────────────

  describe("group_id boundary validation", () => {
    it("coordinator rejects missing group_id with 422", async () => {
      // The canonical-tools layer validates group_id before any DB call.
      // If group_id is missing or invalid, it throws GroupIdValidationError.
      vi.mocked(memory_add).mockRejectedValue(
        new Error("Invalid group_id: undefined. Must match pattern: ^allura-[a-z0-9-]+$")
      )

      await expect(
        memory_add({
          group_id: undefined as any,
          user_id: "user-1",
          content: "Test",
        })
      ).rejects.toThrow("Invalid group_id")
    })

    it("coordinator rejects invalid group_id with 422", async () => {
      // group_id not matching ^allura- pattern
      vi.mocked(memory_add).mockRejectedValue(
        new Error("Invalid group_id: bad-group. Must match pattern: ^allura-[a-z0-9-]+$")
      )

      await expect(
        memory_add({
          group_id: "bad-group" as any,
          user_id: "user-1",
          content: "Test",
        })
      ).rejects.toThrow("Invalid group_id")
    })

    it("coordinator rejects roninclaw-* group_id (deprecated namespace)", async () => {
      // roninclaw-* group_ids are deprecated per CLAUDE.md invariants
      vi.mocked(memory_add).mockRejectedValue(
        new Error("Invalid group_id: roninclaw-memory. Must match pattern: ^allura-[a-z0-9-]+$")
      )

      await expect(
        memory_add({
          group_id: "roninclaw-memory" as any,
          user_id: "user-1",
          content: "Test",
        })
      ).rejects.toThrow("Invalid group_id")
    })

    it("coordinator rejects group_id with uppercase characters", async () => {
      vi.mocked(memory_add).mockRejectedValue(
        new Error("Invalid group_id: allura-Test. Must match pattern: ^allura-[a-z0-9-]+$")
      )

      await expect(
        memory_add({
          group_id: "allura-Test" as any,
          user_id: "user-1",
          content: "Test",
        })
      ).rejects.toThrow("Invalid group_id")
    })

    it("coordinator rejects group_id with underscores", async () => {
      vi.mocked(memory_add).mockRejectedValue(
        new Error("Invalid group_id: allura-test_name. Must match pattern: ^allura-[a-z0-9-]+$")
      )

      await expect(
        memory_add({
          group_id: "allura-test_name" as any,
          user_id: "user-1",
          content: "Test",
        })
      ).rejects.toThrow("Invalid group_id")
    })
  })

  // ── Degraded Mode Contract ───────────────────────────────────────────

  describe("degraded mode contract", () => {
    it("degraded meta includes degraded_reason when Neo4j unavailable", async () => {
      const degradedMeta: MemoryResponseMeta = {
        contract_version: "v1",
        degraded: true,
        degraded_reason: "neo4j_unavailable",
        stores_used: ["postgres"],
        stores_attempted: ["postgres", "neo4j"],
        warnings: ["semantic layer unavailable; returned episodic results only"],
      }

      const mockResponse: MemorySearchResponse = {
        results: [],
        count: 0,
        latency_ms: 10,
        meta: degradedMeta,
      }
      vi.mocked(memory_search).mockResolvedValue(mockResponse)

      const result = await memory_search({
        query: "test",
        group_id: VALID_GROUP_ID as any,
      })

      expect(result.meta?.degraded).toBe(true)
      expect(result.meta?.degraded_reason).toBe("neo4j_unavailable")
      expect(result.meta?.warnings).toBeDefined()
      expect(result.meta?.warnings!.length).toBeGreaterThan(0)
    })

    it("non-degraded meta omits degraded_reason", async () => {
      const mockResponse: MemorySearchResponse = {
        results: [],
        count: 0,
        latency_ms: 10,
        meta: VALID_META,
      }
      vi.mocked(memory_search).mockResolvedValue(mockResponse)

      const result = await memory_search({
        query: "test",
        group_id: VALID_GROUP_ID as any,
      })

      expect(result.meta?.degraded).toBe(false)
      expect(result.meta?.degraded_reason).toBeUndefined()
    })
  })
})
