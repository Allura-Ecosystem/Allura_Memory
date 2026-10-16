import { describe, expect, it, vi } from "vitest"
import type { PoolClient } from "pg"
import { resolveApprovedProjection } from "./approved-projection"
import type { KnowledgeInsight } from "./knowledge-promotion"

const insight: KnowledgeInsight = { id: "42", proposal_id: "proposal-a", group_id: "allura-test", workspace_id: "workspace-a", content: "approved", source: "requester", confidence: 0.9, postgres_trace_id: "42", topic: "x", category: "Decision", notion_page_id: "" }
const approved = { approved_memory_id: "canonical-a", group_id: insight.group_id, workspace_id: insight.workspace_id, content: "approved", semantic_content: "approved", source: "requester", score: "0.9", trace_ref: "42" }
describe("approved projection binding", () => {
  it.each([{ workspace_id: "workspace-b" }, { group_id: "allura-other" }, { content: "substituted" }, { source: "impersonator" }, { id: "new-id" }, { postgres_trace_id: "43" }, { confidence: 1 }, { supersedes_id: "other" }])("rejects substitution %j", async (change) => {
    const db = { query: vi.fn(async () => ({ rows: [approved] })) } as unknown as PoolClient
    await expect(resolveApprovedProjection(db, { ...insight, ...change })).rejects.toThrow(/mismatch/)
  })
  it("rejects missing approval evidence", async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) } as unknown as PoolClient
    await expect(resolveApprovedProjection(db, insight)).rejects.toThrow(/Approval required/)
  })
  it("returns only the authoritative approved identity and does not write", async () => {
    const query = vi.fn(async () => ({ rows: [approved] }))
    expect(await resolveApprovedProjection({ query } as unknown as PoolClient, insight)).toBe("canonical-a")
    expect(query).toHaveBeenCalledWith(expect.stringContaining("JOIN governance_receipts"), ["proposal-a", "allura-test", "workspace-a"])
    expect(query.mock.calls).toHaveLength(1)
  })
})
