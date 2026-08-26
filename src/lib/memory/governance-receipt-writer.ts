import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import type { AlluraRole } from "@/lib/auth/types";
import { hasPermission } from "@/lib/auth/roles";
import type { ResolvedWorkspaceScope } from "@/lib/db/workspace-scope";
import type { GovernanceReceipt } from "./approve-proposal";

type Queryable = Pick<PoolClient, "query">;
export interface ReceiptPrincipal { actorId: string; role: AlluraRole }
export interface GovernedReceiptCommand {
  proposalId: string;
  action: "reject" | "request_evidence";
  rationale: string;
  policyReference: string;
  policyVersion: string;
  /** Version produced by the locked decision snapshot/transition. */
  proposalVersion: string;
  /** Optional for normal reject; required for request_evidence. */
  evidenceRequestIds?: string[];
}

/**
 * Governed non-approval receipt writer. Approval receipts are owned exclusively
 * by approveProposal() inside its canonical promotion transaction.
 */
export async function writeGovernanceReceipt(
  scope: ResolvedWorkspaceScope,
  principal: ReceiptPrincipal,
  command: GovernedReceiptCommand,
  db: Queryable,
): Promise<GovernanceReceipt> {
  if (principal.actorId !== scope.principalId) throw new Error("Receipt actor must match authenticated workspace principal");
  if (!hasPermission(principal.role, "curator")) throw new Error("Governance receipt requires curator or admin authority");
  if (!command.rationale.trim()) throw new Error("A governed receipt requires nonblank rationale");

  const requestedEvidenceIds = [...new Set((command.evidenceRequestIds ?? []).map((value) => value.trim()).filter(Boolean))].sort();
  if (command.action === "request_evidence" && requestedEvidenceIds.length === 0) {
    throw new Error("request_evidence receipt requires its durable evidence request identity");
  }

  const proposalResult = await db.query(
    `SELECT id, proposal_version, status, approved_memory_id, trace_ref, witness_hash
     FROM canonical_proposals
     WHERE group_id=$1 AND workspace_id=$2 AND id=$3`,
    [scope.tenantId, scope.workspaceId, command.proposalId],
  );
  const proposal = proposalResult.rows[0];
  if (!proposal) throw new Error("Proposal not found in authenticated scope");
  if (String(proposal.proposal_version) !== command.proposalVersion) throw new Error("Proposal version changed outside the locked decision snapshot");
  if (proposal.trace_ref === null || proposal.trace_ref === undefined) throw new Error("Proposal trace evidence is required");

  const source = await db.query(
    `SELECT id FROM events WHERE id=$1 AND group_id=$2 AND workspace_id=$3`,
    [proposal.trace_ref, scope.tenantId, scope.workspaceId],
  );
  const sourceEventId = source.rows[0]?.id;
  if (!sourceEventId) throw new Error("Proposal trace evidence is missing or outside workspace scope");

  if (requestedEvidenceIds.length) {
    const evidence = await db.query(
      `SELECT id FROM evidence_requests
       WHERE group_id=$1 AND workspace_id=$2 AND proposal_id=$3 AND id=ANY($4::uuid[]) ORDER BY id`,
      [scope.tenantId, scope.workspaceId, command.proposalId, requestedEvidenceIds],
    );
    if (evidence.rows.length !== requestedEvidenceIds.length) throw new Error("Evidence request identity is missing or outside proposal scope");
  }

  const evidenceReferences = [`event:${String(sourceEventId)}`, ...requestedEvidenceIds.map((id) => `evidence-request:${id}`)].sort();
  const evidenceIdentityHash = createHash("sha256").update(JSON.stringify(evidenceReferences)).digest("hex");
  const result = await db.query<GovernanceReceipt>(
    `WITH inserted AS (
       INSERT INTO governance_receipts (
         group_id,workspace_id,proposal_id,proposal_version,evidence_identity_hash,evidence_request_id,
         action,actor_id,actor_role,rationale,policy_reference,policy_version,memory_id,outbox_state,
         source_event_id,witness_hash,evidence_references,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'not_applicable',$14,$15,$16::jsonb,NOW())
       ON CONFLICT ON CONSTRAINT governance_receipts_replay_key DO NOTHING
       RETURNING *
     )
     SELECT inserted.*, false AS evidence_membership_finalized FROM inserted
     UNION ALL
     SELECT existing.*, EXISTS(
       SELECT 1 FROM governance_receipt_evidence_requests membership WHERE membership.receipt_id=existing.id
     ) AS evidence_membership_finalized
     FROM governance_receipts existing
      WHERE group_id=$1 AND workspace_id=$2 AND proposal_id=$3 AND proposal_version=$4
        AND evidence_identity_hash=$5 AND action=$7
     LIMIT 1`,
    [scope.tenantId, scope.workspaceId, command.proposalId, command.proposalVersion, evidenceIdentityHash,
      requestedEvidenceIds[0] ?? null, command.action, scope.principalId, principal.role, command.rationale.trim(),
      command.policyReference, command.policyVersion, proposal.approved_memory_id ?? null, sourceEventId,
      proposal.witness_hash ?? null, JSON.stringify(evidenceReferences)],
  );
  const receipt = result.rows[0];
  if (!receipt) throw new Error("Governance receipt persistence failed");
  if (!(receipt as GovernanceReceipt & { evidence_membership_finalized?: boolean }).evidence_membership_finalized) {
    await db.query(`SELECT app.finalize_governance_receipt_evidence($1,$2::uuid[])`, [receipt.id,requestedEvidenceIds]);
  }
  return receipt;
}
