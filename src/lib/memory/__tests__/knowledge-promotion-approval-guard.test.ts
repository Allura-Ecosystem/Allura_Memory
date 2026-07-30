/**
 * Knowledge promotion approval guard tests.
 *
 * These tests prove that promotion cannot proceed unless a matching
 * PostgreSQL approval audit event exists first.
 *
 * Neo4j is sunset — promoteToNeo4j now writes directly to PostgreSQL
 * (graph_memories table) instead of calling createInsight.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../postgres/connection", () => ({
  getPool: vi.fn(),
}))

import { getPool } from "../../postgres/connection"
import { type KnowledgeInsight, promoteToNeo4j } from "../knowledge-promotion"

const mockGetPool = getPool as unknown as ReturnType<typeof vi.fn>

function createApprovalPool(rows: Array<{ id: number }> = [{ id: 42 }]) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  }
}

const APPROVED_INSIGHT: KnowledgeInsight = {
  id: "trace-001",
  proposal_id: "prop-001",
  topic: "Approval Guard",
  category: "Decision",
  content: "Promotions require a prior approval audit event.",
  source: "brooks-architect",
  confidence: 0.92,
  group_id: "allura-system",
  notion_page_id: "notion-page-001",
  postgres_trace_id: "trace-001",
}

describe("promoteToNeo4j approval guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPool.mockReturnValue(createApprovalPool())
  })

  it("requires approval before creating an insight", async () => {
    const pool = createApprovalPool()
    mockGetPool.mockReturnValue(pool)

    await promoteToNeo4j(APPROVED_INSIGHT)

    // The first query must be the approval check
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("metadata->>'proposal_id' = $3"),
      ["allura-system", "proposal_approved", "prop-001"]
    )
    // At least 2 queries: approval check + insert
    expect(pool.query).toHaveBeenCalledTimes(expect.any(Number))
    expect(pool.query.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it("does not create an insight when approval is missing", async () => {
    // Approval pool returns empty rows (no approval event found)
    mockGetPool.mockReturnValue(createApprovalPool([]))

    await expect(promoteToNeo4j(APPROVED_INSIGHT)).rejects.toThrow(
      "Approval required before promotion"
    )

    // Only the approval check query should have been made, no INSERT
    expect(mockGetPool).toHaveBeenCalledTimes(1)
  })

  it("requires an explicit proposal_id instead of falling back to insight id", async () => {
    const missingProposalId = {
      ...APPROVED_INSIGHT,
      proposal_id: undefined,
    } as unknown as KnowledgeInsight

    await expect(promoteToNeo4j(missingProposalId)).rejects.toThrow(
      "Proposal ID is required for promotion approval"
    )

    expect(mockGetPool).not.toHaveBeenCalled()
  })
})