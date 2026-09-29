import { describe, expect, it, vi } from "vitest"
import { ProductionMembershipStore } from "./workspace-membership-production"
const scope = { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "admin", sessionId: "s", role: "admin" as const, policyEpoch: 1 }
describe("production membership provenance adapter", () => {
  it("rechecks the exact current database actor instead of echoing caller authority", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ role: "admin", policyEpoch: "1" }] })
    const store = new ProductionMembershipStore({ query } as never)
    await expect(store.currentActor(scope)).resolves.toEqual(scope)
    expect(query.mock.calls[0][0]).toContain("current_setting('app.current_principal'")
    expect(query.mock.calls[0][1]).toEqual(["allura-test", "workspace-a", "admin", 1])
    query.mockResolvedValueOnce({ rows: [{ role: "viewer", policyEpoch: "1" }] })
    await expect(store.currentActor(scope)).resolves.toBeNull()
  })
  it("uses restricted exact-scope reads and maps verified approvals", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ approvalId: "a", action: "grant", tenantId: "allura-test", workspaceId: "workspace-a", subjectUserId: "u", approverId: "admin", approverRole: "workspace_membership_admin", provenanceRef: "control-plane:a", verified: true, policyEpoch: 1, revokedAt: null }] })
    const store = new ProductionMembershipStore({ query } as never)
    await expect(store.verifiedApproval("a")).resolves.toMatchObject({ verified: true, provenanceRef: "control-plane:a" })
    expect(query.mock.calls[0][0]).toContain("current_setting('app.current_group_id'")
  })
  it("uses only the governed transaction function for a verified exact-scope transition", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ tenantId: "allura-test", workspaceId: "workspace-a", userId: "member", approvedBy: "membership-admin", approvalId: "00000000-0000-0000-0000-000000000001", policyEpoch: 1, revokedAt: null }] })
    const transaction = vi.fn(async (work: (tx: { query: typeof query }) => Promise<boolean>) => work({ query }))
    const store = new ProductionMembershipStore({ query, transaction } as never)
    const input = {
      actor: scope, subject: { tenantId: "allura-test", workspaceId: "workspace-a", userId: "member" },
      approval: { approvalId: "00000000-0000-0000-0000-000000000001", action: "grant" as const, tenantId: "allura-test", workspaceId: "workspace-a", subjectUserId: "member", approverId: "membership-admin", approverRole: "workspace_membership_admin" as const, provenanceRef: "verified-control-plane", verified: true as const, policyEpoch: 1, revokedAt: null },
      expectedEpoch: 0, targetEpoch: 1,
    }
    await expect(store.commitGrant(input)).resolves.toBe(true)
    expect(transaction).toHaveBeenCalledOnce()
    expect(query.mock.calls[0][0]).toContain("app.commit_brain_workspace_membership")
    expect(query.mock.calls[0][1]).toEqual([input.approval.approvalId, "grant", 1, 0, 1])
  })
  it("refuses malformed or database-refused writes without a fallback DML path", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const transaction = vi.fn(async (work: (tx: { query: typeof query }) => Promise<boolean>) => work({ query }))
    const store = new ProductionMembershipStore({ query, transaction } as never)
    const input = {
      actor: scope, subject: { tenantId: "allura-test", workspaceId: "workspace-a", userId: "member" },
      approval: { approvalId: "00000000-0000-0000-0000-000000000002", action: "revoke" as const, tenantId: "allura-test", workspaceId: "workspace-a", subjectUserId: "member", approverId: "membership-admin", approverRole: "workspace_membership_admin" as const, provenanceRef: "verified-control-plane", verified: true as const, policyEpoch: 1, revokedAt: null },
      expectedEpoch: 1, targetEpoch: 2,
    }
    await expect(store.commitRevoke(input)).resolves.toBe(false)
    await expect(store.commitGrant({ ...input, approval: { ...input.approval, action: "grant" } })).resolves.toBe(false)
    expect(query.mock.calls[0][0]).toContain("app.commit_brain_workspace_membership")
  })
  it("excludes legacy or mismatched target memberships without approval provenance", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const store = new ProductionMembershipStore({ query } as never)
    await expect(store.currentMembership({ tenantId: "allura-test", workspaceId: "workspace-a", userId: "member" })).resolves.toBeNull()
    expect(query.mock.calls[0][0]).toContain("membership.approval_id IS NOT NULL")
    expect(query.mock.calls[0][0]).toContain("approval.subject_user_id=membership.user_id")
    expect(query.mock.calls[0][0]).toContain("approval.action='revoke'")
  })
  it("does not accept owner-pool or client-authority configuration", () => {
    expect(ProductionMembershipStore.length).toBe(1)
    expect(scope.role).toBe("admin")
  })
})
