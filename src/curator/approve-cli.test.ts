import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Pool } from "pg"

const { approveProposal, getAppPool, withWorkspaceTransaction } = vi.hoisted(() => ({
  approveProposal: vi.fn(), getAppPool: vi.fn(), withWorkspaceTransaction: vi.fn(),
}))
vi.mock("../lib/memory/approve-proposal", () => ({ approveProposal }))
vi.mock("../lib/postgres/connection", () => ({ getAppPool, closePool: vi.fn() }))
vi.mock("../lib/db/tenant-transaction", () => ({ withWorkspaceTransaction }))

import { getPendingProposals, parseArgs, processProposal } from "./approve-cli"

const scope = { tenantId: "allura-cli", workspaceId: "workspace-a", principalId: "curator-cli" }
const principal = {
  principalId: "curator-cli", workspaceId: "workspace-a", tenantIds: ["allura-cli"], roles: ["curator"],
  scopes: ["review:approve"], authMethod: "mcp_token", sessionId: "cli-test",
} as const
const proposal = {
  id: "00000000-0000-4000-8000-000000000001", group_id: "allura-cli", workspace_id: "workspace-a",
  content: "governed", score: "0.9", reasoning: "approved", tier: "mainstream",
  created_at: new Date().toISOString(), trace_ref: 1,
}

describe("curator approval CLI adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    approveProposal.mockResolvedValue({ action: "approve", proposal_id: proposal.id, memory_id: "memory-1" })
  })

  it("requires an explicit workspace and never treats auto approval as a default", () => {
    expect(() => parseArgs(["--group-id=allura-cli", "--auto-approve"])).toThrow(/workspace/i)
    expect(parseArgs(["--group-id=allura-cli", "--workspace-id=workspace-a"])).toMatchObject({ autoApprove: false })
  })

  it("discovers pending proposals through an app-role workspace transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [proposal] })
    withWorkspaceTransaction.mockImplementation(async (_scope, callback) => callback({ query }))
    await expect(getPendingProposals(scope)).resolves.toEqual([proposal])
    expect(withWorkspaceTransaction).toHaveBeenCalledWith(scope, expect.any(Function))
    expect(String(query.mock.calls[0][0])).toContain("workspace_id = $2")
    expect(query.mock.calls[0][1]).toEqual(["allura-cli", "workspace-a"])
  })

  it("fails closed without --auto-approve and verifies actor authority before mutation", async () => {
    await expect(processProposal(proposal, scope, principal as never, false)).resolves.toMatchObject({ status: "skipped", reason: expect.stringContaining("--auto-approve") })
    await expect(processProposal(proposal, scope, { ...principal, principalId: "spoofed" } as never, true)).rejects.toThrow(/verified actor/i)
    expect(approveProposal).not.toHaveBeenCalled()
  })

  it("uses the app pool and exact verified workspace for explicit auto approval", async () => {
    const appPool = {} as Pool
    getAppPool.mockReturnValue(appPool)
    await expect(processProposal(proposal, scope, principal as never, true)).resolves.toMatchObject({ action: "approve" })
    expect(approveProposal).toHaveBeenCalledWith(expect.objectContaining({
      pool: appPool, groupId: scope.tenantId, workspaceId: scope.workspaceId,
      principal, proposalId: proposal.id,
    }))
  })
})
