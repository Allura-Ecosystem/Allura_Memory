import type { MembershipLifecycleStore, MembershipScope, MembershipSubject, VerifiedMembershipApproval, WorkspaceMembership } from "./workspace-membership-lifecycle"

export interface RestrictedMembershipQuery { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number }> }
export interface RestrictedMembershipTransaction extends RestrictedMembershipQuery { transaction<T>(work: (tx: RestrictedMembershipQuery) => Promise<T>): Promise<T> }

/** SQL adapter contract. Caller must supply the authenticated restricted transaction; no pool or client authority is accepted here. */
export class ProductionMembershipStore implements MembershipLifecycleStore {
  constructor(private readonly db: RestrictedMembershipTransaction) {}
  async currentActor(scope: MembershipScope): Promise<MembershipScope | null> {
    const result = await this.db.query<{ role: string; policyEpoch: string | number }>(`SELECT tenant_membership.role, workspace_membership.policy_epoch AS "policyEpoch"
      FROM memberships AS tenant_membership
      JOIN brain_workspace_memberships AS workspace_membership
        ON workspace_membership.group_id=tenant_membership.group_id
       AND workspace_membership.user_id=tenant_membership.user_id
      WHERE tenant_membership.group_id=$1 AND workspace_membership.workspace_id=$2
        AND tenant_membership.user_id=$3 AND tenant_membership.removed_at IS NULL
        AND workspace_membership.revoked_at IS NULL
        AND tenant_membership.role='admin' AND workspace_membership.policy_epoch=$4::bigint
        AND current_setting('app.current_group_id',true)=$1
        AND current_setting('app.current_workspace_id',true)=$2
        AND current_setting('app.current_principal',true)=$3`, [scope.tenantId, scope.workspaceId, scope.principalId, scope.policyEpoch])
    const row = result.rows[0]
    return row?.role === "admin" && Number(row.policyEpoch) === scope.policyEpoch ? { ...scope, role: "admin" } : null
  }
  async verifiedApproval(id: string): Promise<VerifiedMembershipApproval | null> {
    const result = await this.db.query<VerifiedMembershipApproval>(`SELECT approval_id AS "approvalId", action, group_id AS "tenantId", workspace_id AS "workspaceId", subject_user_id AS "subjectUserId", approver_id AS "approverId", approver_role AS "approverRole", provenance_ref AS "provenanceRef", true AS verified, policy_epoch AS "policyEpoch", revoked_at AS "revokedAt" FROM brain_membership_approvals WHERE approval_id=$1 AND group_id=current_setting('app.current_group_id',true) AND workspace_id=current_setting('app.current_workspace_id',true)`, [id])
    return result.rows[0] ?? null
  }
  async currentMembership(subject: MembershipSubject): Promise<WorkspaceMembership | null> { return this.read(subject) }
  async readBack(subject: MembershipSubject): Promise<WorkspaceMembership | null> { return this.read(subject) }
  private async read(subject: MembershipSubject): Promise<WorkspaceMembership | null> {
    const result = await this.db.query<WorkspaceMembership>(`SELECT membership.group_id AS "tenantId", membership.workspace_id AS "workspaceId", membership.user_id AS "userId", membership.approved_by AS "approvedBy", membership.approval_id AS "approvalId", membership.policy_epoch AS "policyEpoch", membership.revoked_at AS "revokedAt"
      FROM brain_workspace_memberships AS membership
      JOIN brain_membership_approvals AS approval
        ON approval.approval_id=membership.approval_id
       AND approval.group_id=membership.group_id
       AND approval.workspace_id=membership.workspace_id
       AND approval.subject_user_id=membership.user_id
      WHERE membership.group_id=$1 AND membership.workspace_id=$2 AND membership.user_id=$3
        AND membership.approval_id IS NOT NULL AND approval.revoked_at IS NULL
        AND ((membership.revoked_at IS NULL AND approval.action='grant')
          OR (membership.revoked_at IS NOT NULL AND approval.action='revoke'))`, [subject.tenantId, subject.workspaceId, subject.userId])
    return result.rows[0] ?? null
  }
  async commitGrant(input: { actor: MembershipScope; subject: MembershipSubject; approval: VerifiedMembershipApproval; expectedEpoch: number; targetEpoch: number }): Promise<boolean> {
    return this.commit("grant", input)
  }
  async commitRevoke(input: { actor: MembershipScope; subject: MembershipSubject; approval: VerifiedMembershipApproval; expectedEpoch: number; targetEpoch: number }): Promise<boolean> {
    return this.commit("revoke", input)
  }
  private async commit(action: "grant" | "revoke", input: { actor: MembershipScope; subject: MembershipSubject; approval: VerifiedMembershipApproval; expectedEpoch: number; targetEpoch: number }): Promise<boolean> {
    if (input.approval.action !== action || input.approval.tenantId !== input.subject.tenantId ||
        input.approval.workspaceId !== input.subject.workspaceId || input.approval.subjectUserId !== input.subject.userId ||
        input.approval.policyEpoch !== input.actor.policyEpoch || input.targetEpoch !== input.expectedEpoch + 1) return false
    return this.db.transaction(async (tx) => {
      const result = await tx.query<WorkspaceMembership>(`SELECT tenant_id AS "tenantId", workspace_id AS "workspaceId", user_id AS "userId", approved_by AS "approvedBy", approval_id AS "approvalId", policy_epoch AS "policyEpoch", revoked_at AS "revokedAt"
        FROM app.commit_brain_workspace_membership($1::uuid,$2::text,$3::bigint,$4::bigint,$5::bigint)`,
      [input.approval.approvalId, action, input.actor.policyEpoch, input.expectedEpoch, input.targetEpoch])
      const row = result.rows[0]
      return Boolean(row && row.tenantId === input.subject.tenantId && row.workspaceId === input.subject.workspaceId &&
        row.userId === input.subject.userId && row.approvalId === input.approval.approvalId &&
        Number(row.policyEpoch) === input.targetEpoch && (action === "grant" ? row.revokedAt === null : row.revokedAt !== null))
    })
  }
}
