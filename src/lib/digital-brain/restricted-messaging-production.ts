import type { ChannelInvitation, InvitationApproval, MessagingScope, NamedContact, RestrictedMessage } from "./restricted-messaging"

export interface RestrictedMessagingDb {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>
}

/** Read-only durable boundary. Provider delivery is intentionally absent. */
export class RestrictedMessagingProductionStore {
  constructor(private readonly db: RestrictedMessagingDb) {}
  async namedContacts(scope: MessagingScope, projectId: string): Promise<NamedContact[]> {
    const result = await this.db.query<NamedContact>(`SELECT group_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId", principal_id AS "principalId", contact_role AS role FROM brain_project_contacts WHERE group_id=$1 AND workspace_id=$2 AND project_id=$3 AND revoked_at IS NULL`, [scope.tenantId, scope.workspaceId, projectId])
    return result.rows
  }
  async verifiedApproval(scope: MessagingScope, approvalId: string): Promise<InvitationApproval | null> {
    const result = await this.db.query<InvitationApproval>(`SELECT approval_id AS "approvalId", group_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId", channel_id AS "channelId", invitee_id AS "inviteeId", approver_id AS "approverId", approver_role AS "approverRole", policy_epoch AS "policyEpoch", revoked_at AS "revokedAt", true AS verified FROM brain_messaging_approvals WHERE approval_id=$1 AND group_id=$2 AND workspace_id=$3 AND revoked_at IS NULL AND verification_source='trusted_approval_adapter' AND length(btrim(provenance_ref)) > 0`, [approvalId, scope.tenantId, scope.workspaceId])
    return result.rows[0] ?? null
  }
  async invitation(scope: MessagingScope, input: Pick<ChannelInvitation, "projectId" | "channelId" | "inviteeId">): Promise<ChannelInvitation | null> {
    const result = await this.db.query<ChannelInvitation>(`SELECT invitation.group_id AS "tenantId", invitation.workspace_id AS "workspaceId", invitation.project_id AS "projectId", invitation.channel_id AS "channelId", invitation.invitee_id AS "inviteeId", invitation.owner_approval_id AS "ownerApprovalId", invitation.membership_admin_approval_id AS "membershipAdminApprovalId", invitation.policy_epoch AS "policyEpoch", invitation.revoked_at AS "revokedAt" FROM brain_channel_invitations AS invitation JOIN brain_messaging_approvals AS owner_approval ON owner_approval.approval_id=invitation.owner_approval_id AND owner_approval.approver_role='project_owner' AND owner_approval.revoked_at IS NULL JOIN brain_messaging_approvals AS admin_approval ON admin_approval.approval_id=invitation.membership_admin_approval_id AND admin_approval.approver_role='workspace_membership_admin' AND admin_approval.revoked_at IS NULL WHERE invitation.group_id=$1 AND invitation.workspace_id=$2 AND invitation.project_id=$3 AND invitation.channel_id=$4 AND invitation.invitee_id=$5 AND invitation.invitee_id=$6 AND invitation.revoked_at IS NULL AND owner_approval.policy_epoch=invitation.policy_epoch AND admin_approval.policy_epoch=invitation.policy_epoch`, [scope.tenantId, scope.workspaceId, input.projectId, input.channelId, input.inviteeId, scope.principalId])
    return result.rows[0] ?? null
  }
  async message(scope: MessagingScope, messageId: string): Promise<RestrictedMessage | null> {
    const result = await this.db.query<RestrictedMessage>(`SELECT message_id AS "messageId", group_id AS "tenantId", workspace_id AS "workspaceId", project_id AS "projectId", channel_id AS "channelId", sender_id AS "senderId", recipient_id AS "recipientId", body FROM brain_restricted_messages WHERE group_id=$1 AND workspace_id=$2 AND message_id=$3 AND sender_id=$4`, [scope.tenantId, scope.workspaceId, messageId, scope.principalId])
    return result.rows[0] ?? null
  }
  async commitInvitation(): Promise<never> { throw new Error("provider-neutral messaging store has no implicit write or delivery path") }
  async commitMessage(): Promise<never> { throw new Error("provider-neutral messaging store has no implicit write or delivery path") }
}
