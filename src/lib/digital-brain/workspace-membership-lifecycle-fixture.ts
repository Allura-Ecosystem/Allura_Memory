import type { MembershipLifecycleDeps, MembershipLifecycleStore, MembershipReceipt, MembershipReceiptSink, MembershipScope, MembershipSubject, VerifiedMembershipApproval, WorkspaceMembership } from "./workspace-membership-lifecycle"

export class WorkspaceMembershipLifecycleFixture implements MembershipLifecycleStore, MembershipReceiptSink {
  actor: MembershipScope
  approvals: VerifiedMembershipApproval[] = []
  memberships: WorkspaceMembership[] = []
  receipts: MembershipReceipt[] = []
  consumedApprovals: string[] = []
  seenReceiptIds: string[] = []
  failReceipts = false
  mismatchReceipt = false
  beforeAtomicCommit: (() => void) | null = null
  nextId = 0
  constructor(actor: MembershipScope) { this.actor = { ...actor } }
  private key(subject: MembershipSubject) { return `${subject.tenantId}:${subject.workspaceId}:${subject.userId}` }
  private actorMatches(actor: MembershipScope) { return JSON.stringify(this.actor) === JSON.stringify(actor) }
  private approvalMatches(actor: MembershipScope, subject: MembershipSubject, approval: VerifiedMembershipApproval, action: "grant" | "revoke") {
    const stored = this.approvals.find(value => value.approvalId === approval.approvalId)
    return stored === approval && !this.consumedApprovals.includes(approval.approvalId) && approval.verified && approval.action === action && approval.revokedAt === null && approval.tenantId === actor.tenantId && approval.workspaceId === actor.workspaceId && approval.subjectUserId === subject.userId && approval.policyEpoch === actor.policyEpoch
  }
  currentActor(): Promise<MembershipScope> { return Promise.resolve({ ...this.actor }) }
  verifiedApproval(id: string): Promise<VerifiedMembershipApproval | null> { return Promise.resolve(this.approvals.find(value => value.approvalId === id) ?? null) }
  currentMembership(subject: MembershipSubject): Promise<WorkspaceMembership | null> { return this.readBack(subject) }
  commitGrant(input: { actor: MembershipScope; subject: MembershipSubject; approval: VerifiedMembershipApproval; expectedEpoch: number; targetEpoch: number }): Promise<boolean> {
    this.beforeAtomicCommit?.()
    const current = this.memberships.find(value => this.key(value) === this.key(input.subject))
    const currentEpoch = current?.policyEpoch ?? 0
    if (!this.actorMatches(input.actor) || !this.approvalMatches(input.actor, input.subject, input.approval, "grant") || current?.revokedAt === null || currentEpoch !== input.expectedEpoch || input.targetEpoch !== input.expectedEpoch + 1) return Promise.resolve(false)
    this.consumedApprovals.push(input.approval.approvalId)
    this.memberships = this.memberships.filter(value => this.key(value) !== this.key(input.subject))
    this.memberships.push({ ...input.subject, approvedBy: input.approval.approverId, approvalId: input.approval.approvalId, policyEpoch: input.targetEpoch, revokedAt: null })
    return Promise.resolve(true)
  }
  commitRevoke(input: { actor: MembershipScope; subject: MembershipSubject; approval: VerifiedMembershipApproval; expectedEpoch: number; targetEpoch: number }): Promise<boolean> {
    this.beforeAtomicCommit?.()
    const current = this.memberships.find(value => this.key(value) === this.key(input.subject))
    if (!this.actorMatches(input.actor) || !this.approvalMatches(input.actor, input.subject, input.approval, "revoke") || !current || current.revokedAt !== null || current.policyEpoch !== input.expectedEpoch || input.targetEpoch !== input.expectedEpoch + 1) return Promise.resolve(false)
    this.consumedApprovals.push(input.approval.approvalId)
    this.memberships = this.memberships.filter(value => this.key(value) !== this.key(input.subject))
    this.memberships.push({ ...current, approvedBy: input.approval.approverId, approvalId: input.approval.approvalId, policyEpoch: input.targetEpoch, revokedAt: "revoked" })
    return Promise.resolve(true)
  }
  readBack(subject: MembershipSubject): Promise<WorkspaceMembership | null> { const value = this.memberships.find(item => this.key(item) === this.key(subject)); return Promise.resolve(value ? { ...value } : null) }
  persist(receipt: MembershipReceipt): Promise<{ receiptId: string; witnessHash: string }> {
    if (this.failReceipts || this.seenReceiptIds.includes(receipt.receiptId)) return Promise.reject(new Error("receipt refused"))
    this.seenReceiptIds.push(receipt.receiptId); this.receipts.push(receipt)
    return Promise.resolve(this.mismatchReceipt ? { receiptId: "wrong", witnessHash: receipt.witnessHash } : { receiptId: receipt.receiptId, witnessHash: receipt.witnessHash })
  }
  deps(ids?: () => string): MembershipLifecycleDeps { return { store: this, receipts: this, ids: ids ?? (() => `receipt-${++this.nextId}`) } }
}
