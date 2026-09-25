import { describe, expect, it, vi } from "vitest"
import { RestrictedMessagingProductionStore } from "./restricted-messaging-production"
const scope = { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "contractor", sessionId: "session", role: "contractor" as const, policyEpoch: 1 }
describe("restricted messaging durable boundary", () => {
  it("reads contacts, approvals, invitations, and messages with exact scope predicates", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [] }) }
    const store = new RestrictedMessagingProductionStore(db)
    await store.namedContacts(scope, "p")
    await store.verifiedApproval(scope, "a")
    await store.invitation(scope, { projectId: "p", channelId: "c", inviteeId: "u" })
    await store.message(scope, "m")
    expect(db.query.mock.calls.every(([sql]) => sql.includes("group_id") && sql.includes("workspace_id"))).toBe(true)
    expect(db.query.mock.calls[2][0]).toContain("owner_approval.approver_role='project_owner'")
    expect(db.query.mock.calls[2][0]).toContain("invitation.invitee_id=$6")
    expect(db.query.mock.calls[3][0]).toContain("sender_id=$4")
    expect(db.query.mock.calls[1][0]).toContain("verification_source='trusted_approval_adapter'")
  })
  it("has no implicit write or provider delivery path", async () => {
    const store = new RestrictedMessagingProductionStore({ query: vi.fn() })
    await expect(store.commitInvitation()).rejects.toThrow(/no implicit write/)
    await expect(store.commitMessage()).rejects.toThrow(/no implicit write/)
  })
})
