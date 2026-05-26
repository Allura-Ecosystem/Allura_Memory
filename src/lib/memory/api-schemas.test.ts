/**
 * FR-7: Zod schema validation tests for all 9 Memory API endpoints.
 *
 * Tests that:
 * 1. Valid inputs pass schema validation
 * 2. Invalid inputs are rejected (missing required fields, wrong types)
 * 3. Output schemas accept valid responses and detect drift
 * 4. validateInput throws on bad data; validateOutput logs but doesn't throw
 */
import { describe, expect, it, vi } from "vitest"
import {
  MemoryAddInputSchema,
  MemoryAddOutputSchema,
  MemoryDeleteInputSchema,
  MemoryDeleteOutputSchema,
  MemoryExportInputSchema,
  MemoryExportOutputSchema,
  MemoryGetInputSchema,
  MemoryGetOutputSchema,
  MemoryListInputSchema,
  MemoryListOutputSchema,
  MemoryPromoteInputSchema,
  MemoryPromoteOutputSchema,
  MemoryRestoreInputSchema,
  MemoryRestoreOutputSchema,
  MemorySearchInputSchema,
  MemorySearchOutputSchema,
  MemoryUpdateInputSchema,
  MemoryUpdateOutputSchema,
  validateInput,
  validateOutput,
  validateOutputArray,
} from "@/lib/memory/api-schemas"

// ═══════════════════════════════════════════════════════════════════════════
// 1. memory_add
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryAddInputSchema", () => {
  it("accepts valid input with all required fields", () => {
    const result = MemoryAddInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      content: "Test memory content",
    })
    expect(result.success).toBe(true)
  })

  it("accepts input with optional metadata and threshold", () => {
    const result = MemoryAddInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      content: "Test memory content",
      metadata: { source: "conversation", conversation_id: "conv-1" },
      threshold: 0.9,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing group_id", () => {
    const result = MemoryAddInputSchema.safeParse({
      user_id: "bellard",
      content: "Test memory content",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid group_id pattern", () => {
    const result = MemoryAddInputSchema.safeParse({
      group_id: "invalid-group",
      user_id: "bellard",
      content: "Test memory content",
    })
    expect(result.success).toBe(false)
  })

  it("rejects missing user_id", () => {
    const result = MemoryAddInputSchema.safeParse({
      group_id: "allura-system",
      content: "Test memory content",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty content", () => {
    const result = MemoryAddInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      content: "",
    })
    expect(result.success).toBe(false)
  })

  it("rejects threshold out of range", () => {
    const result = MemoryAddInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      content: "Test",
      threshold: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

describe("MemoryAddOutputSchema", () => {
  it("accepts valid output", () => {
    const result = MemoryAddOutputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      stored: "episodic",
      score: 0.72,
      created_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("accepts output with optional pending_review", () => {
    const result = MemoryAddOutputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      stored: "semantic",
      score: 0.9,
      pending_review: true,
      created_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid storage location", () => {
    const result = MemoryAddOutputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      stored: "disk",
      score: 0.5,
      created_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. memory_search
// ═══════════════════════════════════════════════════════════════════════════

describe("MemorySearchInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = MemorySearchInputSchema.safeParse({
      query: "find memory about Zod",
      group_id: "allura-system",
    })
    expect(result.success).toBe(true)
  })

  it("accepts input with optional fields", () => {
    const result = MemorySearchInputSchema.safeParse({
      query: "find memory",
      group_id: "allura-system",
      user_id: "bellard",
      limit: 5,
      min_score: 0.7,
      include_global: false,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing query", () => {
    const result = MemorySearchInputSchema.safeParse({
      group_id: "allura-system",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty query", () => {
    const result = MemorySearchInputSchema.safeParse({
      query: "",
      group_id: "allura-system",
    })
    expect(result.success).toBe(false)
  })

  it("rejects limit above 100", () => {
    const result = MemorySearchInputSchema.safeParse({
      query: "test",
      group_id: "allura-system",
      limit: 200,
    })
    expect(result.success).toBe(false)
  })

  it("rejects min_score above 1", () => {
    const result = MemorySearchInputSchema.safeParse({
      query: "test",
      group_id: "allura-system",
      min_score: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

describe("MemorySearchOutputSchema", () => {
  it("accepts valid output with results", () => {
    const result = MemorySearchOutputSchema.safeParse({
      results: [
        {
          id: "mem-1",
          content: "Some memory",
          score: 0.85,
          source: "semantic",
          provenance: "conversation",
          created_at: "2026-05-01T10:00:00Z",
        },
      ],
      count: 1,
      latency_ms: 42,
    })
    expect(result.success).toBe(true)
  })

  it("accepts empty results", () => {
    const result = MemorySearchOutputSchema.safeParse({
      results: [],
      count: 0,
      latency_ms: 5,
    })
    expect(result.success).toBe(true)
  })

  it("rejects result with invalid source", () => {
    const result = MemorySearchOutputSchema.safeParse({
      results: [
        {
          id: "mem-1",
          content: "Some memory",
          score: 0.85,
          source: "disk",
          provenance: "conversation",
          created_at: "2026-05-01T10:00:00Z",
        },
      ],
      count: 1,
      latency_ms: 42,
    })
    expect(result.success).toBe(false)
  })

  it("accepts federated retrieval metadata that includes RuVector stores", () => {
    const result = MemorySearchOutputSchema.safeParse({
      results: [],
      count: 0,
      latency_ms: 5,
      meta: {
        contract_version: "v1",
        degraded: false,
        stores_used: ["graph", "ruvector"],
        stores_attempted: ["postgres", "graph", "ruvector"],
        warnings: [],
      },
    })

    expect(result.success).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. memory_list
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryListInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = MemoryListInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
    })
    expect(result.success).toBe(true)
  })

  it("accepts input with all optional fields", () => {
    const result = MemoryListInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      limit: 20,
      offset: 10,
      sort: "score_desc",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid sort order", () => {
    const result = MemoryListInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      sort: "random",
    })
    expect(result.success).toBe(false)
  })

  it("rejects negative offset", () => {
    const result = MemoryListInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      offset: -1,
    })
    expect(result.success).toBe(false)
  })

  it("accepts tenant-scoped listing without user_id for admin/all-users views", () => {
    const result = MemoryListInputSchema.safeParse({
      group_id: "allura-system",
    })

    expect(result.success).toBe(true)
  })
})

describe("MemoryListOutputSchema", () => {
  it("accepts valid paginated output", () => {
    const result = MemoryListOutputSchema.safeParse({
      memories: [
        {
          id: "mem-1",
          content: "Memory content",
          score: 0.8,
          source: "semantic",
          provenance: "manual",
          user_id: "bellard",
          group_id: "allura-system",
          created_at: "2026-05-01T10:00:00Z",
        },
      ],
      total: 1,
      has_more: false,
    })
    expect(result.success).toBe(true)
  })

  it("rejects output with missing has_more", () => {
    const result = MemoryListOutputSchema.safeParse({
      memories: [],
      total: 0,
    })
    expect(result.success).toBe(false)
  })

  it("accepts graph-backed federated retrieval metadata", () => {
    const result = MemoryListOutputSchema.safeParse({
      memories: [],
      total: 0,
      has_more: false,
      meta: {
        contract_version: "v1",
        degraded: false,
        stores_used: ["postgres", "graph"],
        stores_attempted: ["postgres", "graph", "ruvector"],
        warnings: [],
      },
    })

    expect(result.success).toBe(true)
  })

  it("rejects memory list items missing tenant or user provenance", () => {
    const result = MemoryListOutputSchema.safeParse({
      memories: [
        {
          id: "mem-1",
          content: "Memory content",
          score: 0.8,
          source: "semantic",
          provenance: "manual",
          created_at: "2026-05-01T10:00:00Z",
        },
      ],
      total: 1,
      has_more: false,
    })

    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. memory_get
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryGetInputSchema", () => {
  it("accepts valid input", () => {
    const result = MemoryGetInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing id", () => {
    const result = MemoryGetInputSchema.safeParse({
      group_id: "allura-system",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid UUID format for id", () => {
    const result = MemoryGetInputSchema.safeParse({
      id: "not-a-uuid",
      group_id: "allura-system",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid group_id pattern", () => {
    const result = MemoryGetInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "bad-group",
    })
    expect(result.success).toBe(false)
  })
})

describe("MemoryGetOutputSchema", () => {
  it("accepts valid memory item", () => {
    const result = MemoryGetOutputSchema.safeParse({
      id: "mem-1",
      content: "Memory content",
      score: 0.9,
      source: "semantic",
      provenance: "conversation",
      user_id: "bellard",
      group_id: "allura-system",
      created_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("accepts memory with optional fields", () => {
    const result = MemoryGetOutputSchema.safeParse({
      id: "mem-1",
      content: "Memory content",
      score: 0.9,
      source: "both",
      provenance: "manual",
      user_id: "bellard",
      group_id: "allura-system",
      created_at: "2026-05-01T10:00:00Z",
      version: 3,
      superseded_by: "mem-2",
      tags: ["important"],
      recent_usage_count: 5,
    })
    expect(result.success).toBe(true)
  })

  it("preserves read-only provenance and evidence-chain fields for memory detail", () => {
    const result = MemoryGetOutputSchema.safeParse({
      id: "mem-1",
      content: "Memory content",
      score: 0.9,
      source: "semantic",
      provenance: "conversation",
      user_id: "bellard",
      group_id: "allura-system",
      created_at: "2026-05-01T10:00:00Z",
      status: "approved",
      source_event_id: "event-1",
      proposal_id: "proposal-1",
      trace_ref: "trace-1",
      actor: "woz-builder",
      creator: "author-1",
      approver: "curator-1",
      hash: "hash-1",
      previous_hash: "hash-0",
      evidence: [
        { id: "event-1", type: "event", label: "Source event", status: "available" },
        { id: "proposal-1", type: "proposal", label: "Curator proposal", status: "available" },
      ],
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data).toMatchObject({
      group_id: "allura-system",
      status: "approved",
      source_event_id: "event-1",
      proposal_id: "proposal-1",
      trace_ref: "trace-1",
      actor: "woz-builder",
      creator: "author-1",
      approver: "curator-1",
      hash: "hash-1",
      previous_hash: "hash-0",
      evidence: expect.arrayContaining([
        expect.objectContaining({ id: "event-1", type: "event", status: "available" }),
      ]),
    })
  })

  it("rejects detail output missing tenant or user provenance", () => {
    const result = MemoryGetOutputSchema.safeParse({
      id: "mem-1",
      content: "Memory content",
      score: 0.9,
      source: "semantic",
      provenance: "conversation",
      created_at: "2026-05-01T10:00:00Z",
    })

    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. memory_update
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryUpdateInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = MemoryUpdateInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
      content: "Updated content",
    })
    expect(result.success).toBe(true)
  })

  it("accepts input with optional reason and metadata", () => {
    const result = MemoryUpdateInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
      content: "Updated content",
      reason: "Correcting typo",
      metadata: { source: "manual" },
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing content", () => {
    const result = MemoryUpdateInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty content", () => {
    const result = MemoryUpdateInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
      content: "",
    })
    expect(result.success).toBe(false)
  })
})

describe("MemoryUpdateOutputSchema", () => {
  it("accepts valid output", () => {
    const result = MemoryUpdateOutputSchema.safeParse({
      id: "mem-new",
      previous_id: "mem-old",
      stored: "semantic",
      version: 2,
      updated_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing previous_id", () => {
    const result = MemoryUpdateOutputSchema.safeParse({
      id: "mem-new",
      stored: "semantic",
      version: 2,
      updated_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. memory_delete
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryDeleteInputSchema", () => {
  it("accepts valid input", () => {
    const result = MemoryDeleteInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing user_id", () => {
    const result = MemoryDeleteInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid id format", () => {
    const result = MemoryDeleteInputSchema.safeParse({
      id: "not-uuid",
      group_id: "allura-system",
      user_id: "bellard",
    })
    expect(result.success).toBe(false)
  })
})

describe("MemoryDeleteOutputSchema", () => {
  it("accepts valid output", () => {
    const result = MemoryDeleteOutputSchema.safeParse({
      id: "mem-1",
      deleted: true,
      deleted_at: "2026-05-01T10:00:00Z",
      recovery_days: 30,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing deleted field", () => {
    const result = MemoryDeleteOutputSchema.safeParse({
      id: "mem-1",
      deleted_at: "2026-05-01T10:00:00Z",
      recovery_days: 30,
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. memory_promote
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryPromoteInputSchema", () => {
  it("accepts valid input with required fields", () => {
    const result = MemoryPromoteInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
    })
    expect(result.success).toBe(true)
  })

  it("accepts input with optional curator_id and rationale", () => {
    const result = MemoryPromoteInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
      curator_id: "curator-1",
      rationale: "High-confidence insight",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing id", () => {
    const result = MemoryPromoteInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
    })
    expect(result.success).toBe(false)
  })
})

describe("MemoryPromoteOutputSchema", () => {
  it("accepts valid output with queued status", () => {
    const result = MemoryPromoteOutputSchema.safeParse({
      id: "mem-1",
      proposal_id: "prop-1",
      status: "queued",
      queued_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("accepts already_canonical status", () => {
    const result = MemoryPromoteOutputSchema.safeParse({
      id: "mem-1",
      proposal_id: "",
      status: "already_canonical",
      queued_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid status", () => {
    const result = MemoryPromoteOutputSchema.safeParse({
      id: "mem-1",
      proposal_id: "prop-1",
      status: "pending",
      queued_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. memory_restore
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryRestoreInputSchema", () => {
  it("accepts valid input", () => {
    const result = MemoryRestoreInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
      user_id: "bellard",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing user_id", () => {
    const result = MemoryRestoreInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "allura-system",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid group_id", () => {
    const result = MemoryRestoreInputSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      group_id: "invalid",
      user_id: "bellard",
    })
    expect(result.success).toBe(false)
  })
})

describe("MemoryRestoreOutputSchema", () => {
  it("accepts valid output", () => {
    const result = MemoryRestoreOutputSchema.safeParse({
      id: "mem-1",
      restored: true,
      restored_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing restored field", () => {
    const result = MemoryRestoreOutputSchema.safeParse({
      id: "mem-1",
      restored_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 9. memory_export
// ═══════════════════════════════════════════════════════════════════════════

describe("MemoryExportInputSchema", () => {
  it("accepts valid input with required group_id only", () => {
    const result = MemoryExportInputSchema.safeParse({
      group_id: "allura-system",
    })
    expect(result.success).toBe(true)
  })

  it("accepts input with all optional fields", () => {
    const result = MemoryExportInputSchema.safeParse({
      group_id: "allura-system",
      user_id: "bellard",
      canonical_only: true,
      format: "json",
      limit: 5000,
      offset: 100,
    })
    expect(result.success).toBe(true)
  })

  it("rejects limit above 10000", () => {
    const result = MemoryExportInputSchema.safeParse({
      group_id: "allura-system",
      limit: 50000,
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid format", () => {
    const result = MemoryExportInputSchema.safeParse({
      group_id: "allura-system",
      format: "csv",
    })
    expect(result.success).toBe(false)
  })
})

describe("MemoryExportOutputSchema", () => {
  it("accepts valid output", () => {
    const result = MemoryExportOutputSchema.safeParse({
      memories: [],
      count: 0,
      exported_at: "2026-05-01T10:00:00Z",
      canonical_count: 0,
      episodic_count: 0,
    })
    expect(result.success).toBe(true)
  })

  it("accepts output with memories", () => {
    const result = MemoryExportOutputSchema.safeParse({
      memories: [
        {
          id: "mem-1",
          content: "Content",
          score: 0.9,
          source: "semantic",
          provenance: "conversation",
          user_id: "bellard",
          group_id: "allura-system",
          created_at: "2026-05-01T10:00:00Z",
        },
      ],
      count: 1,
      exported_at: "2026-05-01T10:00:00Z",
      canonical_count: 1,
      episodic_count: 0,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing count fields", () => {
    const result = MemoryExportOutputSchema.safeParse({
      memories: [],
      exported_at: "2026-05-01T10:00:00Z",
    })
    expect(result.success).toBe(false)
  })

  it("rejects exported memory items missing tenant or user provenance", () => {
    const result = MemoryExportOutputSchema.safeParse({
      memories: [
        {
          id: "mem-1",
          content: "Content",
          score: 0.9,
          source: "semantic",
          provenance: "conversation",
          created_at: "2026-05-01T10:00:00Z",
        },
      ],
      count: 1,
      exported_at: "2026-05-01T10:00:00Z",
      canonical_count: 1,
      episodic_count: 0,
    })

    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Validation helpers
// ═══════════════════════════════════════════════════════════════════════════

describe("validateInput", () => {
  it("returns parsed data for valid input", () => {
    const data = validateInput(MemoryAddInputSchema, {
      group_id: "allura-system",
      user_id: "bellard",
      content: "Test",
    }, "memory_add")

    expect(data.group_id).toBe("allura-system")
    expect(data.user_id).toBe("bellard")
    expect(data.content).toBe("Test")
  })

  it("throws on invalid input", () => {
    expect(() =>
      validateInput(MemoryAddInputSchema, {
        group_id: "bad",
        user_id: "bellard",
      }, "memory_add")
    ).toThrow()
  })

  it("throws with code VALIDATION_ERROR", () => {
    try {
      validateInput(MemoryAddInputSchema, { group_id: "bad" }, "memory_add")
    } catch (e: any) {
      expect(e.code).toBe("VALIDATION_ERROR")
      expect(e.issues).toBeDefined()
      expect(e.issues.length).toBeGreaterThan(0)
    }
  })

  it("logs validation warnings on invalid input", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      validateInput(MemoryAddInputSchema, { group_id: "bad" }, "memory_add")
    } catch {}
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("validateOutput", () => {
  it("returns zero drift for valid output", () => {
    const result = validateOutput(MemoryAddOutputSchema, {
      id: "mem-1",
      stored: "episodic",
      score: 0.5,
      created_at: "2026-05-01T10:00:00Z",
    }, "memory_add")

    expect(result.driftCount).toBe(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.data).toBeDefined()
  })

  it("returns drift warnings for invalid output without throwing", () => {
    const result = validateOutput(MemoryAddOutputSchema, {
      id: "mem-1",
      stored: "invalid_store",
      score: 5.0, // out of range
      created_at: "2026-05-01T10:00:00Z",
    } as any, "memory_add")

    expect(result.driftCount).toBeGreaterThan(0)
    expect(result.warnings.length).toBeGreaterThan(0)
    // Data still returned — caller not broken
    expect(result.data).toBeDefined()
  })

  it("logs drift warnings to console", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    validateOutput(MemoryAddOutputSchema, {
      id: "mem-1",
      stored: "bad",
      score: 5,
      created_at: "2026-05-01T10:00:00Z",
    } as any, "memory_add")
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("validateOutputArray", () => {
  it("validates array and aggregates drift", () => {
    const items = [
      {
        id: "mem-1",
        content: "Good",
        score: 0.8,
        source: "semantic" as const,
        provenance: "conversation" as const,
        user_id: "bellard",
        group_id: "allura-system",
        created_at: "2026-05-01T10:00:00Z",
      },
      {
        id: "mem-2",
        content: "Bad source",
        score: 0.8,
        source: "invalid" as any,
        provenance: "conversation" as const,
        user_id: "bellard",
        group_id: "allura-system",
        created_at: "2026-05-01T10:00:00Z",
      },
    ]

    const result = validateOutputArray(
      MemoryGetOutputSchema,
      items as any,
      "memory_list"
    )

    expect(result.driftCount).toBeGreaterThan(0)
    expect(result.data).toHaveLength(2)
  })

  it("returns zero drift for all valid items", () => {
    const items = [
      {
        id: "mem-1",
        content: "Good",
        score: 0.8,
        source: "semantic" as const,
        provenance: "conversation" as const,
        user_id: "bellard",
        group_id: "allura-system",
        created_at: "2026-05-01T10:00:00Z",
      },
    ]

    const result = validateOutputArray(MemoryGetOutputSchema, items, "memory_list")
    expect(result.driftCount).toBe(0)
    expect(result.data).toHaveLength(1)
  })
})
