import type { ChannelInvitation, InvitationApproval, MessagingReceipt, MessagingReceiptSink, MessagingScope, MessagingStore, NamedContact, RestrictedMessage } from "./restricted-messaging"

export class RestrictedMessagingFixture implements MessagingStore, MessagingReceiptSink {
  scope: MessagingScope
  contacts: NamedContact[] = []
  approvals: InvitationApproval[] = []
  invitations: ChannelInvitation[] = []
  messages: RestrictedMessage[] = []
  receipts: MessagingReceipt[] = []
  failReceipts = false
  mismatchReceipts = false
  seenReceiptIds = new Set<string>()
  beforeCommit: (() => void) | null = null
  nextId = 0
  constructor(scope: MessagingScope) { this.scope = { ...scope } }
  currentScope(): Promise<MessagingScope> { return Promise.resolve({ ...this.scope }) }
  namedContacts(_tenantId: string, _workspaceId: string, projectId: string): Promise<NamedContact[]> { return Promise.resolve(this.contacts.filter(c => c.projectId === projectId)) }
  verifiedApproval(approvalId: string): Promise<InvitationApproval | null> { return Promise.resolve(this.approvals.find(a => a.approvalId === approvalId && a.verified) ?? null) }
  invitation(input: Pick<ChannelInvitation, "tenantId" | "workspaceId" | "projectId" | "channelId" | "inviteeId">): Promise<ChannelInvitation | null> {
    return Promise.resolve(this.invitations.find(i => Object.entries(input).every(([key, value]) => i[key as keyof ChannelInvitation] === value)) ?? null)
  }
  commitInvitationIfAuthorized({ scope, invitation }: { scope: MessagingScope; invitation: ChannelInvitation }): Promise<boolean> {
    this.beforeCommit?.()
    if (JSON.stringify(this.scope) !== JSON.stringify(scope)) return Promise.resolve(false)
    const owner = this.approvals.find(a => a.approvalId === invitation.ownerApprovalId)
    const administrator = this.approvals.find(a => a.approvalId === invitation.membershipAdminApprovalId)
    const exact = (value: InvitationApproval | undefined, role: InvitationApproval["approverRole"]) => Boolean(value?.verified &&
      value.approverRole === role && value.revokedAt === null && value.tenantId === scope.tenantId &&
      value.workspaceId === scope.workspaceId && value.projectId === invitation.projectId &&
      value.channelId === invitation.channelId && value.inviteeId === invitation.inviteeId && value.policyEpoch === scope.policyEpoch)
    if (!exact(owner, "project_owner") || !exact(administrator, "workspace_membership_admin") ||
      owner?.approverId === administrator?.approverId) return Promise.resolve(false)
    this.invitations.push(invitation)
    return Promise.resolve(true)
  }
  commitMessageIfAuthorized({ scope, message }: { scope: MessagingScope; message: RestrictedMessage }): Promise<boolean> {
    this.beforeCommit?.()
    if (JSON.stringify(this.scope) !== JSON.stringify(scope)) return Promise.resolve(false)
    if (message.channelId) {
      const invitation = this.invitations.find(i => i.tenantId === scope.tenantId && i.workspaceId === scope.workspaceId &&
        i.projectId === message.projectId && i.channelId === message.channelId && i.inviteeId === scope.principalId &&
        i.revokedAt === null && i.policyEpoch === scope.policyEpoch)
      if (!invitation) return Promise.resolve(false)
      const approvals = [this.approvals.find(a => a.approvalId === invitation.ownerApprovalId),
        this.approvals.find(a => a.approvalId === invitation.membershipAdminApprovalId)]
      const [owner, administrator] = approvals
      const exact = (value: InvitationApproval | undefined, role: InvitationApproval["approverRole"]) => Boolean(value?.verified &&
        value.approverRole === role && value.revokedAt === null && value.tenantId === scope.tenantId &&
        value.workspaceId === scope.workspaceId && value.projectId === invitation.projectId &&
        value.channelId === invitation.channelId && value.inviteeId === scope.principalId &&
        value.policyEpoch === scope.policyEpoch)
      if (!exact(owner, "project_owner") || !exact(administrator, "workspace_membership_admin") ||
        owner?.approverId === administrator?.approverId) return Promise.resolve(false)
    } else if (!this.contacts.some(c => c.tenantId === scope.tenantId && c.workspaceId === scope.workspaceId &&
      c.projectId === message.projectId && c.principalId === message.recipientId &&
      (c.role === "project_owner" || c.role === "project_manager"))) return Promise.resolve(false)
    this.messages.push(message)
    return Promise.resolve(true)
  }
  message(messageId: string): Promise<RestrictedMessage | null> { return Promise.resolve(this.messages.find(m => m.messageId === messageId) ?? null) }
  persist(receipt: MessagingReceipt): Promise<{ receiptId: string; witnessHash: string }> {
    if (this.failReceipts) return Promise.reject(new Error("receipt sink unavailable"))
    if (this.seenReceiptIds.has(receipt.receiptId)) return Promise.reject(new Error("receipt replay"))
    this.seenReceiptIds.add(receipt.receiptId)
    this.receipts.push(receipt)
    if (this.mismatchReceipts) return Promise.resolve({ receiptId: "wrong", witnessHash: receipt.witnessHash })
    return Promise.resolve({ receiptId: receipt.receiptId, witnessHash: receipt.witnessHash })
  }
  deps() { return { store: this, receipts: this, ids: () => `id-${++this.nextId}` } }
}
