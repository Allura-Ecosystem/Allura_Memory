import { describe, expect, it, vi } from "vitest"
import { RestrictedMessagingProductionStore } from "./restricted-messaging-production"
const scope = { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "contractor", sessionId: "session", role: "contractor" as const, policyEpoch: 1 }
describe("restricted messaging durable boundary", () => {
  it("implements the kernel store with current exact-scope and epoch rechecks", async () => {
    const db = { query: vi.fn().mockImplementation(async (sql: string) => ({ rows: sql.includes("brain_workspace_memberships")
      ? [{ tenantId: scope.tenantId, workspaceId: scope.workspaceId, principalId: scope.principalId,
        tenantRole: "viewer", policyEpoch: scope.policyEpoch }]
      : [] })) }
    const store = new RestrictedMessagingProductionStore(db, scope)
    await expect(store.currentScope(scope)).resolves.toEqual(scope)
    await store.namedContacts(scope.tenantId, scope.workspaceId, "p")
    await store.verifiedApproval("a")
    await store.invitation({ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      projectId: "p", channelId: "c", inviteeId: scope.principalId })
    await store.message("m")
    expect(db.query.mock.calls.every(([sql]) => sql.includes("group_id") && sql.includes("workspace_id"))).toBe(true)
    expect(db.query.mock.calls[0][0]).toContain("approval.policy_epoch=workspace_membership.policy_epoch")
    expect(db.query.mock.calls[1][0]).toContain("policy_epoch=$4")
    expect(db.query.mock.calls[2][0]).toContain("verification_source='trusted_approval_adapter'")
    expect(db.query.mock.calls[3][0]).toContain("owner_approval.approver_role='project_owner'")
    expect(db.query.mock.calls[3][0]).toContain("owner_approval.verification_source='trusted_approval_adapter'")
    expect(db.query.mock.calls[4][0]).toContain("sender_id=$4")
  })

  it("fails closed before SQL for bound-scope mismatches", async () => {
    const db = { query: vi.fn() }
    const store = new RestrictedMessagingProductionStore(db, scope)
    await expect(store.currentScope({ ...scope, policyEpoch: 2 })).resolves.toBeNull()
    await expect(store.namedContacts("allura-other", scope.workspaceId, "p")).resolves.toEqual([])
    await expect(store.invitation({ tenantId: scope.tenantId, workspaceId: "other",
      projectId: "p", channelId: "c", inviteeId: scope.principalId })).resolves.toBeNull()
    await expect(store.invitation({ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      projectId: "p", channelId: "c", inviteeId: "other-user" })).resolves.toBeNull()
    expect(db.query).not.toHaveBeenCalled()
  })

  it("rejects stale authority rows and admin-role mismatches", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ tenantId: scope.tenantId,
      workspaceId: scope.workspaceId, principalId: scope.principalId, tenantRole: "viewer", policyEpoch: 2 }] }) }
    await expect(new RestrictedMessagingProductionStore(db, scope).currentScope(scope)).resolves.toBeNull()

    const adminScope = { ...scope, role: "admin" as const }
    db.query.mockResolvedValueOnce({ rows: [{ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      principalId: scope.principalId, tenantRole: "viewer", policyEpoch: scope.policyEpoch }] })
    await expect(new RestrictedMessagingProductionStore(db, adminScope).currentScope(adminScope)).resolves.toBeNull()
  })

  it("fails closed without an explicitly supplied restricted transaction", async () => {
    const db = { query: vi.fn() }
    const store = new RestrictedMessagingProductionStore(db, scope)
    await expect(store.commitInvitationIfAuthorized()).resolves.toBe(false)
    await expect(store.commitMessageIfAuthorized()).resolves.toBe(false)
    expect(db.query).not.toHaveBeenCalled()
  })

  it("uses the governed database functions only through a bound transaction", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ committed: true }] })
    const transaction = vi.fn(async (work: (tx: { query: typeof query }) => Promise<boolean>) => work({ query }))
    const adminScope = { ...scope, principalId: "admin", role: "admin" as const }
    const adminStore = new RestrictedMessagingProductionStore({ query, transaction } as never, adminScope)
    const invited = await adminStore.commitInvitationIfAuthorized({ scope: adminScope, invitation: {
      tenantId: adminScope.tenantId, workspaceId: adminScope.workspaceId, projectId: "project-a", channelId: "channel-a", inviteeId: scope.principalId,
      ownerApprovalId: "00000000-0000-0000-0000-000000000001", membershipAdminApprovalId: "00000000-0000-0000-0000-000000000002", policyEpoch: 1, revokedAt: null,
    } })
    const contractorStore = new RestrictedMessagingProductionStore({ query, transaction } as never, scope)
    const sent = await contractorStore.commitMessageIfAuthorized({ scope, message: {
      messageId: "00000000-0000-0000-0000-000000000003", tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: "project-a",
      channelId: "channel-a", recipientId: null, senderId: scope.principalId, body: "Approved message",
    } })
    expect(invited).toBe(true)
    expect(sent).toBe(true)
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0][0]).toContain("app.commit_brain_channel_invitation")
    expect(query.mock.calls[1][0]).toContain("app.commit_brain_restricted_message")
  })
})
