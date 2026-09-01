import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrincipalContext } from "@/lib/auth/principal-context"

const transaction = vi.fn()
const resolveLane = vi.fn()
const open = vi.fn()
const run = vi.fn()
const review = vi.fn()

vi.mock("@/lib/db/tenant-transaction", () => ({
  withWorkspaceTransaction: (...args: unknown[]) => transaction(...args),
}))
vi.mock("@/lib/branch-workflows/lane-config", () => ({
  resolveAuthoritativeLane: (...args: unknown[]) => resolveLane(...args),
}))
vi.mock("@/lib/branch-workflows/workflow-runner", () => ({
  openLane: (...args: unknown[]) => open(...args),
  runLaneWork: (...args: unknown[]) => run(...args),
  reviewLaneEvidence: (...args: unknown[]) => review(...args),
}))

import { governedLaneOpen, governedLaneReview, governedLaneSnapshot } from "./governed-lane-tools"

const principal: PrincipalContext = {
  principalId: "woz",
  workspaceId: "workspace-verified",
  tenantIds: ["allura-system"],
  roles: ["curator"],
  scopes: ["memory:write", "review:approve"] as never,
  authMethod: "mcp_token",
  sessionId: "session-1",
}

const lane = { id: "agent-lane-woz", branchId: "ram/agent/woz", writer: "woz", reviewers: ["pike", "fowler"] }

beforeEach(() => {
  vi.clearAllMocks()
  resolveLane.mockReturnValue(lane)
  transaction.mockImplementation(async (_scope: unknown, fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => unknown) => fn({
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM governed_lane_authority")) {
        return {
          rows: [{
            id: "snapshot-1",
            snapshot_hash: "a".repeat(64),
            base_revision: "base-1",
            diff: { added: [{ id: "mem-1", content: "governed value", score: 0.9, provenance: "manual", tags: [] }], overridden: [], deleted: [] },
            evidence_refs: ["event:1"],
            writer_id: "woz",
            branch_id: lane.branchId,
            authority_writer_id: "woz",
            reviewer_ids: ["pike", "fowler"],
            status: "active",
          }],
        }
      }
      return { rows: [] }
    }),
  }))
  open.mockResolvedValue({
    lane_id: lane.id,
    branch_id: lane.branchId,
    writer_id: lane.writer,
    reviewer_ids: lane.reviewers,
    group_id: "allura-system",
    workspace_id: "workspace-verified",
    base_revision: "base-1",
    evidence: [],
  })
  run.mockResolvedValue({
    lane_id: lane.id,
    branch_id: lane.branchId,
    writer_id: lane.writer,
    reviewer_ids: lane.reviewers,
    group_id: "allura-system",
    workspace_id: "workspace-verified",
    base_revision: "base-1",
    evidence: [{ snapshot_id: "snapshot-1", snapshot_hash: "a".repeat(64), base_revision: "base-1", diff: { added: [{ id: "mem-1", content: "governed value", score: 0.9, provenance: "manual", tags: [] }], overridden: [], deleted: [] }, evidence_refs: ["event:1"] }],
  })
  review.mockResolvedValue({ approved: true, proposal: { proposal_id: "proposal-1", canonical_proposal_id: "canonical-1", status: "pending", trace_id: "promo-1" } })
})

describe("governed lane MCP tools", () => {
  it("opens a lane with verified workspace scope and repository-owned authority", async () => {
    const result = await governedLaneOpen({ group_id: "allura-system", lane_id: "agent-lane-woz", base_revision: "base-1" }, principal)

    expect(resolveLane).toHaveBeenCalledWith("agent-lane-woz")
    expect(transaction).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "allura-system", workspaceId: "workspace-verified", principalId: "woz" }),
      expect.any(Function),
    )
    expect(open).toHaveBeenCalledWith(
      lane,
      expect.objectContaining({ group_id: "allura-system", workspace_id: "workspace-verified", actor_id: "woz" }),
      expect.anything(),
    )
    expect(result).toMatchObject({ lane_id: lane.id, branch_id: lane.branchId, writer_id: "woz", status: "active" })
  })

  it("rejects an MCP caller without a verified workspace before opening authority", async () => {
    const unscoped = { ...principal, workspaceId: undefined }
    await expect(governedLaneOpen({ group_id: "allura-system", lane_id: "agent-lane-woz", base_revision: "base-1" }, unscoped)).rejects.toThrow(/workspace/i)
    expect(transaction).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it("materializes a snapshot and routes review through the canonical queue workflow", async () => {
    const snapshot = await governedLaneSnapshot({
      group_id: "allura-system", lane_id: "agent-lane-woz", base_revision: "base-1",
      diff: { added: [{ id: "mem-1", content: "governed value", score: 0.9, provenance: "manual", tags: [] }], overridden: [], deleted: [] }, evidence_refs: ["event:1"],
    }, principal)
    expect(snapshot).toMatchObject({ snapshot_id: "snapshot-1", status: "active" })
    expect(run).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evidence_refs: ["event:1"] }), "woz", expect.anything())

    const result = await governedLaneReview({
      group_id: "allura-system", lane_id: "agent-lane-woz", snapshot_id: "snapshot-1",
      verdict: "approved", reason: "independent review complete",
    }, { ...principal, principalId: "pike" })
    expect(review).toHaveBeenCalledWith(expect.objectContaining({ lane_id: lane.id }), expect.objectContaining({ reviewer: "pike", verdict: "approved" }), expect.anything())
    expect(result).toMatchObject({ approved: true, proposal: { canonical_proposal_id: "canonical-1" } })
  })

  it.each([
    ["undeclared top-level fields", {
      group_id: "allura-system", lane_id: "agent-lane-woz", base_revision: "base-1", hostile: true,
    }],
    ["undeclared nested fields", {
      group_id: "allura-system", lane_id: "agent-lane-woz", base_revision: "base-1",
      diff: { added: [{ id: "mem-1", content: "value", score: 0.9, provenance: "manual", tags: [], hostile: true }], overridden: [], deleted: [] },
      evidence_refs: ["event:1"],
    }],
    ["out-of-range scores", {
      group_id: "allura-system", lane_id: "agent-lane-woz", base_revision: "base-1",
      diff: { added: [{ id: "mem-1", content: "value", score: 2, provenance: "manual", tags: [] }], overridden: [], deleted: [] },
      evidence_refs: ["event:1"],
    }],
    ["empty evidence references", {
      group_id: "allura-system", lane_id: "agent-lane-woz", base_revision: "base-1",
      diff: { added: [{ id: "mem-1", content: "value", score: 0.9, provenance: "manual", tags: [] }], overridden: [], deleted: [] },
      evidence_refs: [""],
    }],
  ])("rejects %s at the governed tool boundary", async (_label, args) => {
    const operation = "diff" in args
      ? governedLaneSnapshot(args, principal)
      : governedLaneOpen(args, principal)
    await expect(operation).rejects.toThrow()
    expect(transaction).not.toHaveBeenCalled()
  })
})
