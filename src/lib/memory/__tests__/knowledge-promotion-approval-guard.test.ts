/**
 * Regression coverage for the retired legacy knowledge-promotion mutations.
 *
 * An approval event is not an authority-bearing receipt: it cannot be replayed
 * with caller-selected content, workspace, identity, or projection targets.
 * Read-only lookup helpers remain available while every legacy mutation fails
 * before database, credential, or remote-client access.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../postgres/connection", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../db/tenant-transaction", () => ({
  withWorkspaceTransaction: vi.fn(),
}))

vi.mock("../../postgres/queries/insert-trace", () => ({
  insertEvent: vi.fn(),
}))

import { withWorkspaceTransaction } from "../../db/tenant-transaction"
import { getPool } from "../../postgres/connection"
import { insertEvent } from "../../postgres/queries/insert-trace"
import {
  type KnowledgeInsight,
  type NotionMCPClient,
  linkInsightToAgent,
  logPromotionEvent,
  processApprovedInsights,
  promoteSingleInsight,
  promoteToKnowledgeHub,
  promoteToNeo4j,
  queryApprovedInsightById,
  queryApprovedInsights,
  queryKnowledgeHubBySourceId,
  updateApprovalQueueItem,
  updateNotionWithNeo4jId,
} from "../knowledge-promotion"

const mockGetPool = vi.mocked(getPool)
const mockWithWorkspaceTransaction = vi.mocked(withWorkspaceTransaction)
const mockInsertEvent = vi.mocked(insertEvent)
const RETIRED_ERROR = "Legacy knowledge-promotion mutations are retired; use the canonical approval service"

const APPROVED_INSIGHT: KnowledgeInsight = {
  id: "trace-001",
  proposal_id: "proposal-with-a-real-approval-event",
  topic: "Approval replay",
  category: "Decision",
  content: "caller-substituted content",
  source: "automated-caller",
  confidence: 0.99,
  group_id: "allura-system",
  workspace_id: "caller-selected-workspace",
  notion_page_id: "caller-selected-page",
  postgres_trace_id: "caller-selected-trace",
}

function createNotionClient(): NotionMCPClient {
  return {
    createPages: vi.fn(async () => [{ pageId: "created", pageUrl: "https://example.invalid/created" }]),
    updatePage: vi.fn(async () => ({ success: true })),
    search: vi.fn(async () => []),
    fetch: vi.fn(async () => ({ pageId: "page", title: "title" })),
  }
}

describe("retired legacy knowledge-promotion mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPool.mockReturnValue({
      query: vi.fn(async () => ({ rows: [{ id: 42 }], rowCount: 1 })),
    } as never)
  })

  it("rejects approval-event replay with arbitrary content before database access", async () => {
    await expect(promoteToNeo4j(APPROVED_INSIGHT)).rejects.toThrow(RETIRED_ERROR)

    expect(mockGetPool).not.toHaveBeenCalled()
    expect(mockWithWorkspaceTransaction).not.toHaveBeenCalled()
  })

  it("rejects approval-event replay into a caller-selected workspace before database access", async () => {
    await expect(
      promoteToNeo4j({ ...APPROVED_INSIGHT, workspace_id: "another-workspace" }),
    ).rejects.toThrow(RETIRED_ERROR)

    expect(mockGetPool).not.toHaveBeenCalled()
    expect(mockWithWorkspaceTransaction).not.toHaveBeenCalled()
  })

  it("fails closed at batch and single-item entrypoints before approved-proposal reads", async () => {
    const notion = createNotionClient()

    await expect(
      processApprovedInsights("allura-system", "workspace-a", "automated-caller", 10, notion),
    ).rejects.toThrow(RETIRED_ERROR)
    await expect(
      promoteSingleInsight(
        "00000000-0000-4000-8000-000000000001",
        "allura-system",
        "workspace-a",
        "automated-caller",
        "claimed-approver",
        notion,
      ),
    ).rejects.toThrow(RETIRED_ERROR)

    expect(mockGetPool).not.toHaveBeenCalled()
    expect(mockWithWorkspaceTransaction).not.toHaveBeenCalled()
    expect(notion.search).not.toHaveBeenCalled()
    expect(notion.createPages).not.toHaveBeenCalled()
    expect(notion.updatePage).not.toHaveBeenCalled()
  })

  it("fails closed at every direct legacy mutation helper before local or remote access", async () => {
    const notion = createNotionClient()
    const hubParams = {
      content: "caller-substituted content",
      topic: "Approval replay",
      category: "Decision" as const,
      confidence: 0.99,
      source: "automated-caller",
      group_id: "allura-system",
      postgres_trace_id: "trace-001",
      neo4j_id: "memory-001",
      tier: "emerging",
    }

    await expect(promoteToKnowledgeHub(hubParams, notion)).rejects.toThrow(RETIRED_ERROR)
    await expect(
      linkInsightToAgent("agent", "memory-001", 0.99, "allura-system", "workspace-a"),
    ).rejects.toThrow(RETIRED_ERROR)
    await expect(updateNotionWithNeo4jId("page", "memory-001", "reviewer", notion)).rejects.toThrow(
      RETIRED_ERROR,
    )
    await expect(updateApprovalQueueItem("page", "memory-001", "reviewer", notion)).rejects.toThrow(
      RETIRED_ERROR,
    )
    await expect(
      logPromotionEvent("allura-system", "agent", "memory-001", "memory-001", "page", "promoted"),
    ).rejects.toThrow(RETIRED_ERROR)

    expect(mockGetPool).not.toHaveBeenCalled()
    expect(mockWithWorkspaceTransaction).not.toHaveBeenCalled()
    expect(mockInsertEvent).not.toHaveBeenCalled()
    expect(notion.search).not.toHaveBeenCalled()
    expect(notion.createPages).not.toHaveBeenCalled()
    expect(notion.updatePage).not.toHaveBeenCalled()
  })
})

describe("preserved legacy knowledge-promotion reads", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps approved-proposal lookups available inside the requested workspace boundary", async () => {
    const appClient = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }
    mockWithWorkspaceTransaction.mockImplementation(async (_scope, callback) => callback(appClient as never))

    await expect(queryApprovedInsights("allura-system", "workspace-a", "reader", 10)).resolves.toEqual([])
    await expect(
      queryApprovedInsightById(
        "00000000-0000-4000-8000-000000000001",
        "allura-system",
        "workspace-a",
        "reader",
      ),
    ).resolves.toBeNull()

    expect(mockWithWorkspaceTransaction).toHaveBeenNthCalledWith(
      1,
      { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "reader" },
      expect.any(Function),
    )
    expect(mockWithWorkspaceTransaction).toHaveBeenNthCalledWith(
      2,
      { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "reader" },
      expect.any(Function),
    )
  })

  it("keeps Knowledge Hub lookup available without invoking mutation methods", async () => {
    const notion = createNotionClient()

    await expect(queryKnowledgeHubBySourceId("memory-001", notion)).resolves.toBeNull()

    expect(notion.search).toHaveBeenCalledTimes(1)
    expect(notion.createPages).not.toHaveBeenCalled()
    expect(notion.updatePage).not.toHaveBeenCalled()
  })
})
