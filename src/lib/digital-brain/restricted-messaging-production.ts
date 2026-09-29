import type {
  ChannelInvitation,
  InvitationApproval,
  MessagingScope,
  MessagingStore,
  NamedContact,
  RestrictedMessage,
} from "./restricted-messaging"

export interface RestrictedMessagingDb {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>
  /** Must be an already server-bound restricted transaction; owner pools are forbidden. */
  transaction?<T>(work: (tx: Pick<RestrictedMessagingDb, "query">) => Promise<T>): Promise<T>
}

interface CurrentMessagingAuthorityRow {
  tenantId: string
  workspaceId: string
  principalId: string
  tenantRole: "viewer" | "curator" | "admin"
  policyEpoch: string | number
}

function sameBoundScope(expected: MessagingScope, actual: MessagingScope): boolean {
  return expected.tenantId === actual.tenantId && expected.workspaceId === actual.workspaceId &&
    expected.principalId === actual.principalId && expected.sessionId === actual.sessionId &&
    expected.role === actual.role && expected.policyEpoch === actual.policyEpoch
}

/**
 * Read-only durable messaging boundary bound to one server-derived authority
 * envelope. Provider delivery and database mutation remain deliberately absent.
 */
export class RestrictedMessagingProductionStore implements MessagingStore {
  constructor(
    private readonly db: RestrictedMessagingDb,
    private readonly boundScope: MessagingScope,
  ) {}

  async currentScope(scope: MessagingScope): Promise<MessagingScope | null> {
    if (!sameBoundScope(this.boundScope, scope)) return null
    const result = await this.db.query<CurrentMessagingAuthorityRow>(`SELECT
      current_setting('app.current_group_id', true) AS "tenantId",
      current_setting('app.current_workspace_id', true) AS "workspaceId",
      current_setting('app.current_principal', true) AS "principalId",
      tenant_membership.role AS "tenantRole",
      workspace_membership.policy_epoch AS "policyEpoch"
      FROM brain_workspace_memberships AS workspace_membership
      JOIN memberships AS tenant_membership
        ON tenant_membership.group_id=workspace_membership.group_id
       AND tenant_membership.user_id=workspace_membership.user_id
      JOIN brain_membership_approvals AS approval
        ON approval.approval_id=workspace_membership.approval_id
       AND approval.group_id=workspace_membership.group_id
       AND approval.workspace_id=workspace_membership.workspace_id
       AND approval.subject_user_id=workspace_membership.user_id
       AND approval.policy_epoch=workspace_membership.policy_epoch
      WHERE workspace_membership.group_id=$1
        AND workspace_membership.workspace_id=$2
        AND workspace_membership.user_id=$3
        AND workspace_membership.revoked_at IS NULL
        AND tenant_membership.removed_at IS NULL
        AND approval.action='grant'
        AND approval.approver_role='workspace_membership_admin'
        AND approval.verified_at IS NOT NULL
        AND approval.revoked_at IS NULL`, [scope.tenantId, scope.workspaceId, scope.principalId])
    if (result.rows.length !== 1) return null
    const row = result.rows[0]
    const policyEpoch = Number(row.policyEpoch)
    const roleMatches = scope.role === "admin" ? row.tenantRole === "admin" : row.tenantRole !== "admin"
    if (row.tenantId !== scope.tenantId || row.workspaceId !== scope.workspaceId ||
        row.principalId !== scope.principalId || !roleMatches ||
        !Number.isSafeInteger(policyEpoch) || policyEpoch !== scope.policyEpoch) return null
    return { ...scope }
  }

  async namedContacts(tenantId: string, workspaceId: string, projectId: string): Promise<NamedContact[]> {
    if (tenantId !== this.boundScope.tenantId || workspaceId !== this.boundScope.workspaceId) return []
    const result = await this.db.query<NamedContact>(`SELECT group_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId", principal_id AS "principalId", contact_role AS role FROM brain_project_contacts WHERE group_id=$1 AND workspace_id=$2 AND project_id=$3 AND revoked_at IS NULL AND policy_epoch=$4`, [tenantId, workspaceId, projectId, this.boundScope.policyEpoch])
    return result.rows
  }

  async verifiedApproval(approvalId: string): Promise<InvitationApproval | null> {
    const result = await this.db.query<InvitationApproval>(`SELECT approval_id AS "approvalId", group_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId", channel_id AS "channelId", invitee_id AS "inviteeId", approver_id AS "approverId", approver_role AS "approverRole", policy_epoch AS "policyEpoch", revoked_at AS "revokedAt", true AS verified FROM brain_messaging_approvals WHERE approval_id=$1 AND group_id=$2 AND workspace_id=$3 AND policy_epoch=$4 AND revoked_at IS NULL AND verification_source='trusted_approval_adapter' AND length(btrim(provenance_ref)) > 0`, [approvalId, this.boundScope.tenantId, this.boundScope.workspaceId, this.boundScope.policyEpoch])
    return result.rows[0] ?? null
  }

  async invitation(input: Pick<ChannelInvitation, "tenantId" | "workspaceId" | "projectId" | "channelId" | "inviteeId">): Promise<ChannelInvitation | null> {
    if (input.tenantId !== this.boundScope.tenantId || input.workspaceId !== this.boundScope.workspaceId ||
        input.inviteeId !== this.boundScope.principalId) return null
    const result = await this.db.query<ChannelInvitation>(`SELECT invitation.group_id AS "tenantId", invitation.workspace_id AS "workspaceId", invitation.project_id AS "projectId", invitation.channel_id AS "channelId", invitation.invitee_id AS "inviteeId", invitation.owner_approval_id AS "ownerApprovalId", invitation.membership_admin_approval_id AS "membershipAdminApprovalId", invitation.policy_epoch AS "policyEpoch", invitation.revoked_at AS "revokedAt" FROM brain_channel_invitations AS invitation JOIN brain_messaging_approvals AS owner_approval ON owner_approval.approval_id=invitation.owner_approval_id AND owner_approval.approver_role='project_owner' AND owner_approval.verification_source='trusted_approval_adapter' AND length(btrim(owner_approval.provenance_ref)) > 0 AND owner_approval.revoked_at IS NULL JOIN brain_messaging_approvals AS admin_approval ON admin_approval.approval_id=invitation.membership_admin_approval_id AND admin_approval.approver_role='workspace_membership_admin' AND admin_approval.verification_source='trusted_approval_adapter' AND length(btrim(admin_approval.provenance_ref)) > 0 AND admin_approval.revoked_at IS NULL WHERE invitation.group_id=$1 AND invitation.workspace_id=$2 AND invitation.project_id=$3 AND invitation.channel_id=$4 AND invitation.invitee_id=$5 AND invitation.revoked_at IS NULL AND invitation.policy_epoch=$6 AND owner_approval.policy_epoch=invitation.policy_epoch AND admin_approval.policy_epoch=invitation.policy_epoch`, [input.tenantId, input.workspaceId, input.projectId, input.channelId, input.inviteeId, this.boundScope.policyEpoch])
    return result.rows[0] ?? null
  }

  async message(messageId: string): Promise<RestrictedMessage | null> {
    const result = await this.db.query<RestrictedMessage>(`SELECT message_id AS "messageId", group_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId", channel_id AS "channelId", sender_id AS "senderId", recipient_id AS "recipientId", body FROM brain_restricted_messages WHERE group_id=$1 AND workspace_id=$2 AND message_id=$3 AND sender_id=$4`, [this.boundScope.tenantId, this.boundScope.workspaceId, messageId, this.boundScope.principalId])
    return result.rows[0] ?? null
  }

  async commitInvitationIfAuthorized(input?: { scope: MessagingScope; invitation: ChannelInvitation }): Promise<boolean> {
    if (!input) return false
    const { scope, invitation } = input
    if (!this.db.transaction || !sameBoundScope(this.boundScope, scope) || scope.role !== "admin" ||
        invitation.tenantId !== scope.tenantId || invitation.workspaceId !== scope.workspaceId ||
        invitation.policyEpoch !== scope.policyEpoch || !invitation.projectId || !invitation.channelId || !invitation.inviteeId ||
        invitation.ownerApprovalId === invitation.membershipAdminApprovalId) return false
    try {
      return this.db.transaction(async (tx) => {
        const result = await tx.query<{ committed: boolean }>(`SELECT app.commit_brain_channel_invitation(
          $1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::bigint) AS committed`, [
          invitation.ownerApprovalId, invitation.membershipAdminApprovalId, invitation.projectId,
          invitation.channelId, invitation.inviteeId, invitation.policyEpoch,
        ])
        return result.rows[0]?.committed === true
      })
    } catch { return false }
  }

  async commitMessageIfAuthorized(input?: { scope: MessagingScope; message: RestrictedMessage }): Promise<boolean> {
    if (!input) return false
    const { scope, message } = input
    if (!this.db.transaction || !sameBoundScope(this.boundScope, scope) || scope.role !== "contractor" ||
        message.tenantId !== scope.tenantId || message.workspaceId !== scope.workspaceId ||
        message.senderId !== scope.principalId || !message.messageId || !message.projectId ||
        !message.body.trim() || message.body.length > 4000 || (message.channelId === null) === (message.recipientId === null)) return false
    try {
      return this.db.transaction(async (tx) => {
        const result = await tx.query<{ committed: boolean }>(`SELECT app.commit_brain_restricted_message(
          $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::bigint) AS committed`, [
          message.messageId, message.projectId, message.channelId, message.recipientId, message.body, scope.policyEpoch,
        ])
        return result.rows[0]?.committed === true
      })
    } catch { return false }
  }
}
