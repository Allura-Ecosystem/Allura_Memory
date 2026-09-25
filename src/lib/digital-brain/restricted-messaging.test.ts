import { describe, expect, it } from "vitest"

import { RestrictedMessagingFixture } from "./restricted-messaging-fixture"
import {
  createExactChannelInvitation,
  discoverNamedContacts,
  readBackRestrictedMessage,
  sendRestrictedMessage,
  type InvitationApproval,
  type MessagingScope,
  type NamedContact,
} from "./restricted-messaging"

const scope: MessagingScope = { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "contractor",
  sessionId: "session-a", role: "contractor", policyEpoch: 1 }
const admin: MessagingScope = { ...scope, principalId: "admin", sessionId: "admin-session", role: "admin" }
const owner: NamedContact = { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
  projectId: "project-a", principalId: "owner", role: "project_owner" }
const manager: NamedContact = { ...owner, principalId: "manager", role: "project_manager" }

function approval(approvalId: string, approverRole: InvitationApproval["approverRole"],
  overrides: Partial<InvitationApproval> = {}): InvitationApproval {
  return { approvalId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: "project-a",
    channelId: "channel-a", inviteeId: scope.principalId,
    approverId: approverRole === "project_owner" ? "owner" : "membership-admin",
    approverRole, policyEpoch: 1, revokedAt: null, verified: true, ...overrides }
}

function fixture() {
  const value = new RestrictedMessagingFixture(scope)
  value.contacts = [owner, manager]
  return value
}

async function invite(f: RestrictedMessagingFixture) {
  f.scope = { ...admin }
  f.approvals = [approval("owner-approval", "project_owner"), approval("admin-approval", "workspace_membership_admin")]
  const result = await createExactChannelInvitation(admin, { projectId: "project-a", channelId: "channel-a",
    inviteeId: scope.principalId, ownerApprovalId: "owner-approval", membershipAdminApprovalId: "admin-approval" }, f.deps())
  f.scope = { ...scope }
  return result
}

describe("provider-neutral restricted messaging", () => {
  it("discovers only exact-scope named roles and sends explicit direct contact", async () => {
    const f = fixture()
    f.contacts.push({ ...owner, workspaceId: "hidden", principalId: "hidden" })
    await expect(discoverNamedContacts(scope, "project-a", f.deps())).resolves.toEqual({ ok: true, value: [owner, manager] })
    const result = await sendRestrictedMessage(scope, { projectId: "project-a", recipientId: "owner", body: "hello" }, f.deps())
    expect(result.ok).toBe(true)
    expect(f.messages).toHaveLength(1)
    expect(JSON.stringify(f.receipts)).not.toContain("hello")
    expect(f.receipts.every(({ witnessHash }) => /^[a-f0-9]{64}$/.test(witnessHash))).toBe(true)
  })

  it("requires two current independent exact-scope approvals", async () => {
    const f = fixture()
    f.scope = { ...admin }
    f.approvals = [approval("owner-approval", "project_owner")]
    const request = { projectId: "project-a", channelId: "channel-a", inviteeId: scope.principalId,
      ownerApprovalId: "owner-approval", membershipAdminApprovalId: "admin-approval" }
    await expect(createExactChannelInvitation(admin, request, f.deps())).resolves.toEqual({ ok: false, code: "DENIED" })
    f.approvals.push(approval("admin-approval", "workspace_membership_admin", { approverId: "owner" }))
    await expect(createExactChannelInvitation(admin, request, f.deps())).resolves.toEqual({ ok: false, code: "DENIED" })
    f.approvals[1] = approval("admin-approval", "workspace_membership_admin", { channelId: "other-channel" })
    await expect(createExactChannelInvitation(admin, request, f.deps())).resolves.toEqual({ ok: false, code: "DENIED" })
    f.approvals[1] = approval("admin-approval", "workspace_membership_admin")
    await expect(createExactChannelInvitation(admin, request, f.deps())).resolves.toMatchObject({ ok: true })
  })

  it("sends and reads back only through a current exact-channel invitation", async () => {
    const f = fixture()
    await expect(invite(f)).resolves.toMatchObject({ ok: true })
    const sent = await sendRestrictedMessage(scope, { projectId: "project-a", channelId: "channel-a", body: "channel message" }, f.deps())
    expect(sent).toMatchObject({ ok: true })
    const messageId = sent.ok ? sent.value.messageId : "missing"
    await expect(readBackRestrictedMessage(scope, messageId, f.deps())).resolves.toMatchObject({ ok: true })
    f.invitations[0].revokedAt = new Date().toISOString()
    await expect(readBackRestrictedMessage(scope, messageId, f.deps())).resolves.toEqual({ ok: false, code: "DENIED" })
  })

  it("fails before mutation on receipt outage, mismatch, or replay", async () => {
    const request = { projectId: "project-a", recipientId: "owner", body: "hello" }
    const outage = fixture(); outage.failReceipts = true
    await expect(sendRestrictedMessage(scope, request, outage.deps())).resolves.toEqual({ ok: false, code: "UNAVAILABLE" })
    expect(outage.messages).toEqual([])
    const mismatch = fixture(); mismatch.mismatchReceipts = true
    await expect(sendRestrictedMessage(scope, request, mismatch.deps())).resolves.toEqual({ ok: false, code: "UNAVAILABLE" })
    expect(mismatch.messages).toEqual([])
    const replay = fixture(); const replayDeps = { ...replay.deps(), ids: () => "fixed-id" }
    await expect(sendRestrictedMessage(scope, request, replayDeps)).resolves.toMatchObject({ ok: true })
    await expect(sendRestrictedMessage(scope, request, replayDeps)).resolves.toEqual({ ok: false, code: "UNAVAILABLE" })
    expect(replay.messages).toHaveLength(1)
  })

  it("rejects bots, attachments, mentions, history, broadcasts, and ambiguous targets", async () => {
    const f = fixture()
    for (const extra of [{ botId: "bot" }, { attachments: [] }, { mentions: [] }, { history: true }, { broadcast: true }]) {
      await expect(sendRestrictedMessage(scope, { projectId: "project-a", recipientId: "owner", body: "hello", ...extra }, f.deps()))
        .resolves.toEqual({ ok: false, code: "DENIED" })
    }
    await expect(sendRestrictedMessage(scope, { projectId: "project-a", recipientId: "owner", channelId: "channel-a", body: "hello" }, f.deps()))
      .resolves.toEqual({ ok: false, code: "DENIED" })
    expect(f.messages).toEqual([])
    expect(f.receipts).toEqual([])
  })

  it("binds tenant, workspace, principal, session, role, and policy epoch", async () => {
    for (const changed of [{ tenantId: "other" }, { workspaceId: "other" }, { principalId: "other" },
      { sessionId: "other" }, { role: "member" as const }, { policyEpoch: 2 }]) {
      const f = fixture()
      await expect(discoverNamedContacts({ ...scope, ...changed }, "project-a", f.deps()))
        .resolves.toEqual({ ok: false, code: "DENIED" })
    }
  })

  it("rechecks authority and direct-contact status after receipt acknowledgement", async () => {
    const authority = fixture(); const authorityPersist = authority.persist.bind(authority)
    authority.persist = async value => { const result = await authorityPersist(value); authority.scope.policyEpoch = 2; return result }
    await expect(sendRestrictedMessage(scope, { projectId: "project-a", recipientId: "owner", body: "hello" }, authority.deps()))
      .resolves.toEqual({ ok: false, code: "DENIED" })
    expect(authority.messages).toEqual([])

    const contact = fixture(); const contactPersist = contact.persist.bind(contact)
    contact.persist = async value => { const result = await contactPersist(value); contact.contacts = []; return result }
    await expect(sendRestrictedMessage(scope, { projectId: "project-a", recipientId: "owner", body: "hello" }, contact.deps()))
      .resolves.toEqual({ ok: false, code: "DENIED" })
    expect(contact.messages).toEqual([])
  })

  it("atomically refuses revocation in the final-check-to-commit window", async () => {
    const direct = fixture()
    direct.beforeCommit = () => { direct.scope.policyEpoch = 2 }
    await expect(sendRestrictedMessage(scope, { projectId: "project-a", recipientId: "owner", body: "hello" }, direct.deps()))
      .resolves.toEqual({ ok: false, code: "DENIED" })
    expect(direct.messages).toEqual([])

    const channel = fixture()
    await invite(channel)
    channel.beforeCommit = () => { channel.invitations[0].revokedAt = new Date().toISOString() }
    await expect(sendRestrictedMessage(scope, { projectId: "project-a", channelId: "channel-a", body: "hello" }, channel.deps()))
      .resolves.toEqual({ ok: false, code: "DENIED" })
    expect(channel.messages).toEqual([])
  })

  it("exposes no Brain read or arbitrary history capability", () => {
    expect(Object.keys(new RestrictedMessagingFixture(scope))).not.toContain("history")
    expect(Object.keys(new RestrictedMessagingFixture(scope))).not.toContain("documents")
  })
})
