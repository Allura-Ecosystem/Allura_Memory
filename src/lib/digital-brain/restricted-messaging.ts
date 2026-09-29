import { createHash, randomUUID } from "node:crypto"

export type MessagingRole = "contractor" | "member" | "admin"
export type NamedRole = "project_owner" | "project_manager"

export interface MessagingScope {
  tenantId: string
  workspaceId: string
  principalId: string
  sessionId: string
  role: MessagingRole
  policyEpoch: number
}

export interface NamedContact {
  tenantId: string
  workspaceId: string
  projectId: string
  principalId: string
  role: NamedRole
}

export interface InvitationApproval {
  approvalId: string
  tenantId: string
  workspaceId: string
  projectId: string
  channelId: string
  inviteeId: string
  approverId: string
  approverRole: "project_owner" | "workspace_membership_admin"
  policyEpoch: number
  revokedAt: string | null
  /** Set only by the trusted approval-authority adapter after provenance verification. */
  verified: true
}

export interface ChannelInvitation {
  tenantId: string
  workspaceId: string
  projectId: string
  channelId: string
  inviteeId: string
  ownerApprovalId: string
  membershipAdminApprovalId: string
  policyEpoch: number
  revokedAt: string | null
}

export interface RestrictedMessage {
  messageId: string
  tenantId: string
  workspaceId: string
  projectId: string
  channelId: string | null
  senderId: string
  recipientId: string | null
  body: string
}

export interface MessagingReceipt {
  receiptId: string
  action: "discover_contact" | "invite_channel" | "send_message" | "read_back"
  decision: "allow" | "deny"
  tenantId: string
  workspaceId: string
  actorId: string
  resourceId: string
  policyEpoch: number
  witnessHash: string
}

export interface MessagingReceiptSink {
  persist(receipt: MessagingReceipt): Promise<{ receiptId: string; witnessHash: string }>
}

export interface MessagingStore {
  currentScope(scope: MessagingScope): Promise<MessagingScope | null>
  namedContacts(tenantId: string, workspaceId: string, projectId: string): Promise<NamedContact[]>
  verifiedApproval(approvalId: string): Promise<InvitationApproval | null>
  invitation(input: Pick<ChannelInvitation, "tenantId" | "workspaceId" | "projectId" | "channelId" | "inviteeId">): Promise<ChannelInvitation | null>
  /** Atomically rechecks scope + verified approvals and persists, or returns false without mutation. */
  commitInvitationIfAuthorized(input: { scope: MessagingScope; invitation: ChannelInvitation }): Promise<boolean>
  /** Atomically rechecks scope + current contact/invitation authority and persists, or returns false without mutation. */
  commitMessageIfAuthorized(input: { scope: MessagingScope; message: RestrictedMessage }): Promise<boolean>
  message(messageId: string): Promise<RestrictedMessage | null>
}

export interface InvitationRequest {
  projectId: string
  channelId: string
  inviteeId: string
  ownerApprovalId: string
  membershipAdminApprovalId: string
}

export interface MessageRequest {
  projectId: string
  channelId?: string
  recipientId?: string
  body: string
  botId?: string
  attachments?: readonly unknown[]
  mentions?: readonly unknown[]
  history?: boolean
  broadcast?: boolean
}

export interface MessagingDeps {
  store: MessagingStore
  receipts: MessagingReceiptSink
  now?: () => string
  ids?: () => string
}

export type MessagingResult<T> = { ok: true; value: T } | { ok: false; code: "DENIED" | "UNAVAILABLE" }

const deny = <T>(): MessagingResult<T> => ({ ok: false, code: "DENIED" })
const unavailable = <T>(): MessagingResult<T> => ({ ok: false, code: "UNAVAILABLE" })

function validScope(scope: MessagingScope): boolean {
  return validId(scope.tenantId) && validId(scope.workspaceId) && validId(scope.principalId) &&
    validId(scope.sessionId) && ["contractor", "member", "admin"].includes(scope.role) &&
    Number.isSafeInteger(scope.policyEpoch) && scope.policyEpoch > 0
}

function sameScope(expected: MessagingScope, current: MessagingScope): boolean {
  return validScope(expected) && validScope(current) && expected.tenantId === current.tenantId &&
    expected.workspaceId === current.workspaceId && expected.principalId === current.principalId &&
    expected.sessionId === current.sessionId && expected.role === current.role &&
    expected.policyEpoch === current.policyEpoch
}

function sameResource(scope: MessagingScope, value: { tenantId: string; workspaceId: string }): boolean {
  return value.tenantId === scope.tenantId && value.workspaceId === scope.workspaceId
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    value === value.trim() && !/[\x00-\x1f\x7f]/.test(value)
}

function invalidMessage(request: MessageRequest): boolean {
  return !validId(request.projectId) || (request.channelId !== undefined && !validId(request.channelId)) ||
    (request.recipientId !== undefined && !validId(request.recipientId)) ||
    typeof request.body !== "string" || request.body.trim().length === 0 || request.body.length > 4000 ||
    request.botId !== undefined || request.attachments !== undefined || request.mentions !== undefined ||
    request.history === true || request.broadcast === true
}

async function receipt(deps: MessagingDeps, input: Omit<MessagingReceipt, "receiptId" | "witnessHash">): Promise<boolean> {
  const witnessHash = createHash("sha256").update(JSON.stringify([
    input.action, input.decision, input.tenantId, input.workspaceId, input.actorId, input.resourceId, input.policyEpoch,
  ])).digest("hex")
  const value = { ...input, receiptId: deps.ids?.() ?? randomUUID(), witnessHash }
  try {
    const ack = await deps.receipts.persist(value)
    return ack.receiptId === value.receiptId && ack.witnessHash === value.witnessHash
  } catch { return false }
}

export async function discoverNamedContacts(scope: MessagingScope, projectId: string, deps: MessagingDeps): Promise<MessagingResult<NamedContact[]>> {
  if (scope.role !== "contractor" || !validId(projectId) || !validScope(scope)) return deny()
  try {
    const current = await deps.store.currentScope(scope)
    if (!current || !sameScope(scope, current)) return deny()
    const contacts = (await deps.store.namedContacts(scope.tenantId, scope.workspaceId, projectId))
      .filter(contact => sameResource(scope, contact) && contact.projectId === projectId && validId(contact.principalId) &&
        (contact.role === "project_owner" || contact.role === "project_manager"))
    if (!(await receipt(deps, { action: "discover_contact", decision: "allow", tenantId: scope.tenantId, workspaceId: scope.workspaceId, actorId: scope.principalId, resourceId: projectId, policyEpoch: scope.policyEpoch }))) return unavailable()
    const final = await deps.store.currentScope(scope)
    if (!final || !sameScope(scope, final)) return deny()
    const refreshed = (await deps.store.namedContacts(scope.tenantId, scope.workspaceId, projectId))
      .filter(contact => sameResource(scope, contact) && contact.projectId === projectId && validId(contact.principalId) &&
        (contact.role === "project_owner" || contact.role === "project_manager"))
    if (JSON.stringify(refreshed) !== JSON.stringify(contacts)) return deny()
    return { ok: true, value: refreshed }
  } catch { return unavailable() }
}

function approvalMatches(
  approval: InvitationApproval | null,
  scope: MessagingScope,
  request: InvitationRequest,
  role: InvitationApproval["approverRole"],
): approval is InvitationApproval {
  return Boolean(approval?.verified === true && approval.approverRole === role && approval.revokedAt === null &&
    approval.policyEpoch === scope.policyEpoch && sameResource(scope, approval) &&
    approval.projectId === request.projectId && approval.channelId === request.channelId &&
    approval.inviteeId === request.inviteeId && validId(approval.approverId))
}

async function currentApprovals(
  scope: MessagingScope,
  request: InvitationRequest,
  deps: MessagingDeps,
): Promise<boolean> {
  const [owner, administrator] = await Promise.all([
    deps.store.verifiedApproval(request.ownerApprovalId),
    deps.store.verifiedApproval(request.membershipAdminApprovalId),
  ])
  return request.ownerApprovalId !== request.membershipAdminApprovalId &&
    approvalMatches(owner, scope, request, "project_owner") &&
    approvalMatches(administrator, scope, request, "workspace_membership_admin") &&
    owner.approverId !== administrator.approverId
}

async function invitationAuthorityCurrent(
  scope: MessagingScope,
  invitation: ChannelInvitation,
  deps: MessagingDeps,
): Promise<boolean> {
  return currentApprovals(scope, {
    projectId: invitation.projectId,
    channelId: invitation.channelId,
    inviteeId: invitation.inviteeId,
    ownerApprovalId: invitation.ownerApprovalId,
    membershipAdminApprovalId: invitation.membershipAdminApprovalId,
  }, deps)
}

export async function createExactChannelInvitation(scope: MessagingScope, request: InvitationRequest, deps: MessagingDeps): Promise<MessagingResult<ChannelInvitation>> {
  if (scope.role !== "admin" || !validScope(scope)) return deny()
  if (![request.projectId, request.channelId, request.inviteeId, request.ownerApprovalId, request.membershipAdminApprovalId].every(validId)) return deny()
  try {
    const current = await deps.store.currentScope(scope)
    if (!current || !sameScope(scope, current) || !(await currentApprovals(scope, request, deps))) return deny()
    const invitation: ChannelInvitation = { tenantId: scope.tenantId, workspaceId: scope.workspaceId, ...request, policyEpoch: scope.policyEpoch, revokedAt: null }
    if (!(await receipt(deps, { action: "invite_channel", decision: "allow", tenantId: scope.tenantId, workspaceId: scope.workspaceId, actorId: scope.principalId, resourceId: `${request.projectId}:${request.channelId}:${request.inviteeId}`, policyEpoch: scope.policyEpoch }))) return unavailable()
    const final = await deps.store.currentScope(scope)
    if (!final || !sameScope(scope, final) || !(await currentApprovals(scope, request, deps))) return deny()
    if (!(await deps.store.commitInvitationIfAuthorized({ scope, invitation }))) return deny()
    const stored = await deps.store.invitation(invitation)
    if (!stored || JSON.stringify(stored) !== JSON.stringify(invitation)) return unavailable()
    return { ok: true, value: invitation }
  } catch { return unavailable() }
}

function invitationMatches(scope: MessagingScope, request: MessageRequest, invitation: ChannelInvitation | null): invitation is ChannelInvitation {
  return Boolean(invitation && invitation.revokedAt === null && invitation.policyEpoch === scope.policyEpoch &&
    sameResource(scope, invitation) && invitation.projectId === request.projectId &&
    invitation.channelId === request.channelId && invitation.inviteeId === scope.principalId &&
    invitation.ownerApprovalId !== invitation.membershipAdminApprovalId)
}

function contactMatches(scope: MessagingScope, request: MessageRequest, contact: NamedContact): boolean {
  return sameResource(scope, contact) && contact.projectId === request.projectId &&
    contact.principalId === request.recipientId &&
    (contact.role === "project_owner" || contact.role === "project_manager")
}

export async function sendRestrictedMessage(scope: MessagingScope, request: MessageRequest, deps: MessagingDeps): Promise<MessagingResult<RestrictedMessage>> {
  if (scope.role !== "contractor" || !validScope(scope)) return deny()
  if (invalidMessage(request) || (!request.channelId && !request.recipientId) || (request.channelId && request.recipientId)) return deny()
  try {
    const current = await deps.store.currentScope(scope)
    if (!current || !sameScope(scope, current)) return deny()
    let invitation: ChannelInvitation | null = null
    if (request.channelId) {
      invitation = await deps.store.invitation({ tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: request.projectId, channelId: request.channelId, inviteeId: scope.principalId })
      if (!invitationMatches(scope, request, invitation) || !(await invitationAuthorityCurrent(scope, invitation, deps))) return deny()
    } else {
      const contacts = await deps.store.namedContacts(scope.tenantId, scope.workspaceId, request.projectId)
      if (!contacts.some(contact => contactMatches(scope, request, contact))) return deny()
    }
    const message: RestrictedMessage = { messageId: deps.ids?.() ?? randomUUID(), tenantId: scope.tenantId, workspaceId: scope.workspaceId, projectId: request.projectId, channelId: request.channelId ?? null, senderId: scope.principalId, recipientId: request.recipientId ?? null, body: request.body }
    if (!(await receipt(deps, { action: "send_message", decision: "allow", tenantId: scope.tenantId, workspaceId: scope.workspaceId, actorId: scope.principalId, resourceId: message.messageId, policyEpoch: scope.policyEpoch }))) return unavailable()
    const final = await deps.store.currentScope(scope)
    if (!final || !sameScope(scope, final)) return deny()
    if (invitation) {
      const latest = await deps.store.invitation(invitation)
      if (!invitationMatches(scope, request, latest) || !(await invitationAuthorityCurrent(scope, latest, deps))) return deny()
    } else {
      const contacts = await deps.store.namedContacts(scope.tenantId, scope.workspaceId, request.projectId)
      if (!contacts.some(contact => contactMatches(scope, request, contact))) return deny()
    }
    if (!(await deps.store.commitMessageIfAuthorized({ scope, message }))) return deny()
    return { ok: true, value: message }
  } catch { return unavailable() }
}

export async function readBackRestrictedMessage(scope: MessagingScope, messageId: string, deps: MessagingDeps): Promise<MessagingResult<RestrictedMessage>> {
  if (scope.role !== "contractor" || !validScope(scope) || !validId(messageId)) return deny()
  try {
    const current = await deps.store.currentScope(scope)
    if (!current || !sameScope(scope, current)) return deny()
    const message = await deps.store.message(messageId)
    if (!message || !sameResource(scope, message) || message.senderId !== scope.principalId) return deny()
    const request: MessageRequest = { projectId: message.projectId, body: message.body,
      ...(message.channelId ? { channelId: message.channelId } : { recipientId: message.recipientId ?? undefined }) }
    if (message.channelId) {
      const invitation = await deps.store.invitation({ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
        projectId: message.projectId, channelId: message.channelId, inviteeId: scope.principalId })
      if (!invitationMatches(scope, request, invitation) || !(await invitationAuthorityCurrent(scope, invitation, deps))) return deny()
    } else {
      const contacts = await deps.store.namedContacts(scope.tenantId, scope.workspaceId, message.projectId)
      if (!contacts.some(contact => contactMatches(scope, request, contact))) return deny()
    }
    if (!(await receipt(deps, { action: "read_back", decision: "allow", tenantId: scope.tenantId, workspaceId: scope.workspaceId, actorId: scope.principalId, resourceId: messageId, policyEpoch: scope.policyEpoch }))) return unavailable()
    const final = await deps.store.currentScope(scope)
    if (!final || !sameScope(scope, final)) return deny()
    if (message.channelId) {
      const invitation = await deps.store.invitation({ tenantId: scope.tenantId, workspaceId: scope.workspaceId,
        projectId: message.projectId, channelId: message.channelId, inviteeId: scope.principalId })
      if (!invitationMatches(scope, request, invitation) || !(await invitationAuthorityCurrent(scope, invitation, deps))) return deny()
    } else {
      const contacts = await deps.store.namedContacts(scope.tenantId, scope.workspaceId, message.projectId)
      if (!contacts.some(contact => contactMatches(scope, request, contact))) return deny()
    }
    return { ok: true, value: message }
  } catch { return unavailable() }
}
