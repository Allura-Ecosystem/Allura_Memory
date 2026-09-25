import { createHash, randomUUID } from "node:crypto"

export interface MembershipScope { tenantId: string; workspaceId: string; principalId: string; sessionId: string; role: "member" | "admin"; policyEpoch: number }
export interface MembershipSubject { tenantId: string; workspaceId: string; userId: string }
export interface VerifiedMembershipApproval { approvalId: string; action: "grant" | "revoke"; tenantId: string; workspaceId: string; subjectUserId: string; approverId: string; approverRole: "workspace_membership_admin"; provenanceRef: string; verified: true; policyEpoch: number; revokedAt: string | null }
export interface WorkspaceMembership { tenantId: string; workspaceId: string; userId: string; approvedBy: string; approvalId: string; policyEpoch: number; revokedAt: string | null }
export interface MembershipReceipt { receiptId: string; action: "membership_grant" | "membership_revoke" | "membership_read_back"; decision: "allow_candidate"; tenantId: string; workspaceId: string; actorId: string; subjectUserId: string; approvalId: string | null; authorityEpoch: number; targetEpoch: number; witnessHash: string }

export interface MembershipLifecycleStore {
  currentActor(scope: MembershipScope): Promise<MembershipScope | null>
  verifiedApproval(approvalId: string): Promise<VerifiedMembershipApproval | null>
  currentMembership(subject: MembershipSubject): Promise<WorkspaceMembership | null>
  /** Atomically rechecks actor, unused verified approval and expected membership epoch before persisting. */
  commitGrant(input: { actor: MembershipScope; subject: MembershipSubject; approval: VerifiedMembershipApproval; expectedEpoch: number; targetEpoch: number }): Promise<boolean>
  /** Atomically rechecks actor, unused verified approval and expected active membership before persisting. */
  commitRevoke(input: { actor: MembershipScope; subject: MembershipSubject; approval: VerifiedMembershipApproval; expectedEpoch: number; targetEpoch: number }): Promise<boolean>
  readBack(subject: MembershipSubject): Promise<WorkspaceMembership | null>
}
export interface MembershipReceiptSink { persist(receipt: MembershipReceipt): Promise<{ receiptId: string; witnessHash: string }> }
export interface MembershipLifecycleDeps { store: MembershipLifecycleStore; receipts: MembershipReceiptSink; ids?: () => string }
export type MembershipLifecycleResult<T> = { ok: true; value: T } | { ok: false; code: "DENIED" | "UNAVAILABLE" }

const deny = <T>(): MembershipLifecycleResult<T> => ({ ok: false, code: "DENIED" })
const unavailable = <T>(): MembershipLifecycleResult<T> => ({ ok: false, code: "UNAVAILABLE" })
const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
function validScope(scope: MembershipScope): boolean { return validId(scope.tenantId) && validId(scope.workspaceId) && validId(scope.principalId) && validId(scope.sessionId) && ["member", "admin"].includes(scope.role) && Number.isSafeInteger(scope.policyEpoch) && scope.policyEpoch > 0 }
function sameActor(expected: MembershipScope, current: MembershipScope | null): boolean { return Boolean(current && validScope(expected) && validScope(current) && expected.tenantId === current.tenantId && expected.workspaceId === current.workspaceId && expected.principalId === current.principalId && expected.sessionId === current.sessionId && expected.role === current.role && expected.policyEpoch === current.policyEpoch) }
function exactSubject(scope: MembershipScope, subject: MembershipSubject): boolean { return validId(subject.userId) && subject.tenantId === scope.tenantId && subject.workspaceId === scope.workspaceId }
function approvalMatches(scope: MembershipScope, subject: MembershipSubject, approvalId: string, action: "grant" | "revoke", approval: VerifiedMembershipApproval | null): approval is VerifiedMembershipApproval {
  return Boolean(approval?.verified === true && approval.approvalId === approvalId && approval.action === action && approval.approverRole === "workspace_membership_admin" && approval.revokedAt === null && approval.tenantId === scope.tenantId && approval.workspaceId === scope.workspaceId && approval.subjectUserId === subject.userId && approval.policyEpoch === scope.policyEpoch && validId(approval.approverId) && validId(approval.provenanceRef))
}
async function persistReceipt(deps: MembershipLifecycleDeps, input: Omit<MembershipReceipt, "receiptId" | "witnessHash">): Promise<boolean> {
  const receipt = { ...input, receiptId: deps.ids?.() ?? randomUUID(), witnessHash: createHash("sha256").update(JSON.stringify(input)).digest("hex") }
  try { const ack = await deps.receipts.persist(receipt); return ack.receiptId === receipt.receiptId && ack.witnessHash === receipt.witnessHash } catch { return false }
}

export async function grantWorkspaceMembership(scope: MembershipScope, subject: MembershipSubject, approvalId: string, deps: MembershipLifecycleDeps): Promise<MembershipLifecycleResult<WorkspaceMembership>> {
  if (scope.role !== "admin" || !validScope(scope) || !exactSubject(scope, subject) || !validId(approvalId)) return deny()
  try {
    const [actor, approval, current] = await Promise.all([deps.store.currentActor(scope), deps.store.verifiedApproval(approvalId), deps.store.currentMembership(subject)])
    if (!sameActor(scope, actor) || !approvalMatches(scope, subject, approvalId, "grant", approval) || current?.revokedAt === null) return deny()
    const expectedEpoch = current?.policyEpoch ?? 0; const targetEpoch = expectedEpoch + 1
    if (!(await persistReceipt(deps, { action: "membership_grant", decision: "allow_candidate", tenantId: scope.tenantId, workspaceId: scope.workspaceId, actorId: scope.principalId, subjectUserId: subject.userId, approvalId, authorityEpoch: scope.policyEpoch, targetEpoch }))) return unavailable()
    const [finalActor, finalApproval] = await Promise.all([deps.store.currentActor(scope), deps.store.verifiedApproval(approvalId)])
    if (!sameActor(scope, finalActor) || !approvalMatches(scope, subject, approvalId, "grant", finalApproval)) return deny()
    if (!(await deps.store.commitGrant({ actor: scope, subject, approval: finalApproval, expectedEpoch, targetEpoch }))) return deny()
    const stored = await deps.store.readBack(subject)
    return stored && stored.revokedAt === null && stored.policyEpoch === targetEpoch && stored.approvalId === approvalId && stored.approvedBy === finalApproval.approverId ? { ok: true, value: stored } : unavailable()
  } catch { return unavailable() }
}

export async function revokeWorkspaceMembership(scope: MembershipScope, subject: MembershipSubject, approvalId: string, deps: MembershipLifecycleDeps): Promise<MembershipLifecycleResult<WorkspaceMembership>> {
  if (scope.role !== "admin" || !validScope(scope) || !exactSubject(scope, subject) || !validId(approvalId)) return deny()
  try {
    const [actor, approval, current] = await Promise.all([deps.store.currentActor(scope), deps.store.verifiedApproval(approvalId), deps.store.currentMembership(subject)])
    if (!sameActor(scope, actor) || !approvalMatches(scope, subject, approvalId, "revoke", approval) || !current || current.revokedAt !== null) return deny()
    const targetEpoch = current.policyEpoch + 1
    if (!(await persistReceipt(deps, { action: "membership_revoke", decision: "allow_candidate", tenantId: scope.tenantId, workspaceId: scope.workspaceId, actorId: scope.principalId, subjectUserId: subject.userId, approvalId, authorityEpoch: scope.policyEpoch, targetEpoch }))) return unavailable()
    const [finalActor, finalApproval] = await Promise.all([deps.store.currentActor(scope), deps.store.verifiedApproval(approvalId)])
    if (!sameActor(scope, finalActor) || !approvalMatches(scope, subject, approvalId, "revoke", finalApproval)) return deny()
    if (!(await deps.store.commitRevoke({ actor: scope, subject, approval: finalApproval, expectedEpoch: current.policyEpoch, targetEpoch }))) return deny()
    const stored = await deps.store.readBack(subject)
    return stored && stored.revokedAt !== null && stored.policyEpoch === targetEpoch && stored.approvalId === approvalId ? { ok: true, value: stored } : unavailable()
  } catch { return unavailable() }
}

export async function readBackWorkspaceMembership(scope: MembershipScope, subject: MembershipSubject, deps: MembershipLifecycleDeps): Promise<MembershipLifecycleResult<WorkspaceMembership>> {
  if (scope.role !== "admin" || !validScope(scope) || !exactSubject(scope, subject)) return deny()
  try {
    const actor = await deps.store.currentActor(scope); const candidate = await deps.store.readBack(subject)
    if (!sameActor(scope, actor) || !candidate || candidate.tenantId !== scope.tenantId || candidate.workspaceId !== scope.workspaceId || candidate.userId !== subject.userId) return deny()
    if (!(await persistReceipt(deps, { action: "membership_read_back", decision: "allow_candidate", tenantId: scope.tenantId, workspaceId: scope.workspaceId, actorId: scope.principalId, subjectUserId: subject.userId, approvalId: candidate.approvalId, authorityEpoch: scope.policyEpoch, targetEpoch: candidate.policyEpoch }))) return unavailable()
    const finalActor = await deps.store.currentActor(scope); const current = await deps.store.readBack(subject)
    return sameActor(scope, finalActor) && current && JSON.stringify(current) === JSON.stringify(candidate) ? { ok: true, value: current } : deny()
  } catch { return unavailable() }
}
