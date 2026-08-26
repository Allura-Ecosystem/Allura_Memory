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

vi.mock("../../db/tenant-transaction", () => ({
  withWorkspaceTransaction: vi.fn(),
}))

import { getPool } from "../../postgres/connection"
import { withWorkspaceTransaction } from "../../db/tenant-transaction"
import {
  linkInsightToAgent,
  type KnowledgeInsight,
  promoteToNeo4j,
  queryApprovedInsights,
} from "../knowledge-promotion"

const mockGetPool = getPool as unknown as ReturnType<typeof vi.fn>
const mockWithWorkspaceTransaction = withWorkspaceTransaction as unknown as ReturnType<typeof vi.fn>

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
  workspace_id: "workspace-a",
  notion_page_id: "notion-page-001",
  postgres_trace_id: "trace-001",
}

describe("promoteToNeo4j approval guard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPool.mockReturnValue(createApprovalPool())
    mockWithWorkspaceTransaction.mockImplementation(async (_scope, callback) =>
      callback({ query: vi.fn(async () => ({ rows: [], rowCount: 1 })) })
    )
  })

  it("writes a promoted memory through the app-role workspace transaction", async () => {
    const appClient = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) }
    mockWithWorkspaceTransaction.mockImplementation(async (_scope, callback) => callback(appClient))

    await promoteToNeo4j(APPROVED_INSIGHT)

    expect(mockWithWorkspaceTransaction).toHaveBeenCalledWith(
      {
        tenantId: "allura-system",
        workspaceId: "workspace-a",
        principalId: "brooks-architect",
      },
      expect.any(Function)
    )
    expect(appClient.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO graph_memories[\s\S]*workspace_id[\s\S]*workspace_scope_state/),
      expect.arrayContaining(["allura-system", "workspace-a", "workspace_scoped"])
    )
  })

  it("queries approved proposals inside an explicit workspace boundary", async () => {
    const appClient = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }
    mockGetPool.mockReturnValue({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) })
    mockWithWorkspaceTransaction.mockImplementation(async (_scope, callback) => callback(appClient))
    await (queryApprovedInsights as unknown as (
      groupId: string,
      workspaceId: string,
      principalId: string,
      limit: number,
    ) => Promise<unknown>)("allura-system", "workspace-a", "agent-a", 10)
    expect(mockWithWorkspaceTransaction).toHaveBeenCalledWith(
      { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "agent-a" },
      expect.any(Function),
    )
    expect(appClient.query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE group_id = \$1[\s\S]*workspace_id = \$2/),
      ["allura-system", "workspace-a", 10],
    )
  })

  it("links an agent through the app-role workspace transaction", async () => {
    const appClient = { query: vi.fn(async (_sql: string) => ({ rows: [], rowCount: 1 })) }
    mockWithWorkspaceTransaction.mockImplementation(async (_scope, callback) => callback(appClient))
    await (linkInsightToAgent as unknown as (
      agentId: string,
      insightId: string,
      confidence: number,
      groupId: string,
      workspaceId: string,
    ) => Promise<void>)("agent-a", "memory-a", 0.9, "allura-system", "workspace-a")
    expect(mockWithWorkspaceTransaction).toHaveBeenCalledWith(
      { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "agent-a" },
      expect.any(Function),
    )
    const sql = appClient.query.mock.calls.map(([statement]) => String(statement)).join("\n")
    expect(sql).toContain("workspace_id")
    expect(sql).toContain("workspace_scope_state")
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
    // The owner-backed pool performs only the approval read. The write must
    // cross the restricted app-role workspace transaction boundary.
    expect(pool.query).toHaveBeenCalledTimes(1)
    expect(mockWithWorkspaceTransaction).toHaveBeenCalledTimes(1)
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