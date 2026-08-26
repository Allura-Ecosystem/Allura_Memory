import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { hasRole, hasScope, hasWildcardTenant, PrincipalAuthError, type PrincipalContext } from "@/lib/auth/principal-context";
import { validateGroupId } from "@/lib/validation/group-id";

export type PromotionFailurePoint = "canonical" | "proposal" | "audit" | "outbox" | "receipt" | "idempotency";

export interface ApproveProposalInput {
  principal: PrincipalContext;
  groupId?: string;
  workspaceId: string;
  proposalId: string;
  rationale: string;
  idempotencyKey: string;
  evidenceRequestIds?: string[];
  pool: Pool;
  failAt?: PromotionFailurePoint;
}

/** The persisted governance_receipts row is the sole approval result contract. */
export interface GovernanceReceipt {
  id: string;
  group_id: string;
  workspace_id: string;
  proposal_id: string;
  proposal_version: string;
  evidence_request_id: string | null;
  evidence_identity_hash: string;
  action: "approve" | "reject" | "request_evidence";
  actor_id: string;
  actor_role: "curator" | "admin";
  rationale: string;
  policy_reference: string;
  policy_version: string;
  memory_id: string | null;
  result_ref: string | null;
  outbox_state: "not_enqueued" | "queued" | "synced" | "failed" | "not_applicable";
  source_event_id: string | number;
  witness_hash: string | null;
  evidence_references: unknown;
  occurred_at: string;
  created_at: string;
}

type ProposalRow = {
  id: string;
  group_id: string;
  workspace_id: string;
  content: string;
  score: string | number;
  tier: string;
  status: "pending" | "approved" | "rejected";
  trace_ref: string | number | null;
  approved_memory_id: string | null;
  proposal_version: string | number;
};

export class PromotionDecisionError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "ALREADY_DECIDED" | "UNAUTHORIZED" | "INVALID_EVIDENCE" | "IDEMPOTENCY_CONFLICT" | "FAILURE_INJECTED",
    message: string,
  ) {
    super(message);
    this.name = "PromotionDecisionError";
  }
}

function deterministicMemoryId(proposalId: string, groupId: string): string {
  const hex = createHash("sha256").update(`${groupId}:${proposalId}`).digest("hex");
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function authorize(principal: PrincipalContext, groupId: string): "curator" | "admin" {
  const role = hasRole(principal, "admin") ? "admin" : hasRole(principal, "curator") ? "curator" : undefined;
  if (!role || !hasScope(principal, "review:approve")) {
    throw new PrincipalAuthError("ROLE_INSUFFICIENT", "Atomic proposal approval requires a verified curator/admin with review:approve");
  }
  if (!hasWildcardTenant(principal) && !principal.tenantIds.includes(groupId)) {
    throw new PrincipalAuthError("TENANT_MISMATCH", `Principal '${principal.principalId}' is not authorized for tenant '${groupId}'`);
  }
  return role;
}

function maybeFail(point: PromotionFailurePoint, requested?: PromotionFailurePoint): void {
  if (requested === point) throw new PromotionDecisionError("FAILURE_INJECTED", `Injected failure after ${point} write`);
}

function parseReceipt(value: unknown): GovernanceReceipt {
  if (!value || typeof value !== "object") throw new Error("Stored approval receipt is malformed");
  const receipt = value as GovernanceReceipt;
  if (!receipt.id || receipt.action !== "approve" || !receipt.proposal_id || !receipt.memory_id || !receipt.source_event_id) {
    throw new Error("Stored approval receipt is incomplete");
  }
  return receipt;
}

function setLocal(name: string, value: string): string {
  return `SET LOCAL ${name} = '${value.replace(/'/g, "''")}'`;
}

/**
 * Sole approval transaction. The locked proposal snapshot is the authority for
 * scope, version, source evidence, requester provenance and every durable write.
 */
export async function approveProposal(input: ApproveProposalInput): Promise<GovernanceReceipt> {
  const proposalId = String(input.proposalId ?? "").trim();
  const workspaceId = String(input.workspaceId ?? "").trim();
  const requestedGroupId = input.groupId ? validateGroupId(input.groupId) : undefined;
  const rationale = String(input.rationale ?? "").trim();
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!proposalId || !workspaceId || !rationale || !idempotencyKey) throw new Error("proposalId, workspaceId, rationale, and idempotencyKey are required");

  const client = await input.pool.connect();
  let resolvedGroupId: string | undefined;
  try {
    await client.query("BEGIN");
    if (requestedGroupId) {
      await client.query(setLocal("app.current_group_id", requestedGroupId));
      await client.query(setLocal("app.current_tenant", requestedGroupId));
    }
    await client.query(setLocal("app.current_workspace_id", workspaceId));
    await client.query(setLocal("app.current_principal", input.principal.principalId));

    const proposalResult = await client.query<ProposalRow>(
      `SELECT id, group_id, workspace_id, content, score, tier, status, trace_ref, approved_memory_id, proposal_version
       FROM canonical_proposals
       WHERE id=$1 AND workspace_id=$2 AND ($3::text IS NULL OR group_id=$3)
       FOR UPDATE`,
      [proposalId, workspaceId, requestedGroupId ?? null],
    );
    const proposal = proposalResult.rows[0];
    if (!proposal) throw new PromotionDecisionError("NOT_FOUND", "Proposal not found");
    const groupId = validateGroupId(proposal.group_id);
    resolvedGroupId = groupId;
    if (requestedGroupId && groupId !== requestedGroupId) throw new PromotionDecisionError("NOT_FOUND", "Proposal not found");
    const actorRole = authorize(input.principal, groupId);

    // Set authoritative scope after resolving it for legacy owner-pool callers.
    await client.query(setLocal("app.current_group_id", groupId));
    await client.query(setLocal("app.current_tenant", groupId));

    const replay = await client.query<{ proposal_id: string; result: GovernanceReceipt }>(
      `SELECT proposal_id,result FROM promotion_idempotency
       WHERE group_id=$1 AND workspace_id=$2 AND idempotency_key=$3 FOR UPDATE`,
      [groupId, workspaceId, idempotencyKey],
    );
    if (replay.rows[0]) {
      if (replay.rows[0].proposal_id !== proposal.id) {
        throw new PromotionDecisionError("IDEMPOTENCY_CONFLICT", "Idempotency key is already bound to a different proposal");
      }
      await client.query("COMMIT");
      return parseReceipt(replay.rows[0].result);
    }
    if (proposal.status !== "pending") throw new PromotionDecisionError("ALREADY_DECIDED", `Proposal is already ${proposal.status}`);
    if (proposal.trace_ref === null || proposal.trace_ref === undefined) {
      throw new PromotionDecisionError("INVALID_EVIDENCE", "Proposal trace evidence is required before approval");
    }

    const source = await client.query<{ id: string | number; agent_id: string | null }>(
      `SELECT id, agent_id FROM events WHERE id=$1 AND group_id=$2 AND workspace_id=$3`,
      [proposal.trace_ref, groupId, workspaceId],
    );
    const sourceEvent = source.rows[0];
    if (!sourceEvent) throw new PromotionDecisionError("INVALID_EVIDENCE", "Proposal trace evidence is missing or outside workspace scope");
    if (!sourceEvent.agent_id) throw new PromotionDecisionError("UNAUTHORIZED", "Proposal requester provenance is required before approval");
    if (sourceEvent.agent_id === input.principal.principalId) throw new PromotionDecisionError("UNAUTHORIZED", "Segregation of duties violation: requester and approver must be different actors");

    const evidenceIds = [...new Set((input.evidenceRequestIds ?? []).map(String).map((id) => id.trim()).filter(Boolean))].sort();
    if (evidenceIds.length) {
      const evidence = await client.query<{ id: string }>(
        `SELECT id FROM evidence_requests
         WHERE group_id=$1 AND workspace_id=$2 AND proposal_id=$3 AND id=ANY($4::uuid[]) ORDER BY id`,
        [groupId, workspaceId, proposal.id, evidenceIds],
      );
      if (evidence.rows.length !== evidenceIds.length) throw new PromotionDecisionError("INVALID_EVIDENCE", "Evidence request identity is missing or outside proposal scope");
    }

    const memoryId = deterministicMemoryId(proposal.id, groupId);
    const decidedAt = new Date().toISOString();
    const witnessHash = createHash("shake256", { outputLength: 64 })
      .update(`${proposal.id}|${groupId}|${proposal.content}|${proposal.score}|${proposal.tier}|approved|${decidedAt}|${input.principal.principalId}`)
      .digest("hex");

    await client.query(
      `INSERT INTO graph_memories (id,group_id,workspace_id,workspace_scope_state,user_id,content,score,provenance,version,deprecated)
       VALUES ($1,$2,$3,'workspace_scoped',$4,$5,$6,'manual',1,false)`,
      [memoryId, groupId, workspaceId, input.principal.principalId, proposal.content, Number(proposal.score)],
    );
    maybeFail("canonical", input.failAt);

    const transition = await client.query<{ proposal_version: string }>(
      `UPDATE canonical_proposals
       SET status='approved', decided_at=$1, decided_by=$2, rationale=$3, witness_hash=$4, approved_memory_id=$5
       WHERE id=$6 AND group_id=$7 AND workspace_id=$8 AND proposal_version=$9 AND status='pending'
       RETURNING proposal_version`,
      [decidedAt, input.principal.principalId, rationale, witnessHash, memoryId, proposal.id, groupId, workspaceId, proposal.proposal_version],
    );
    if (!transition.rows[0]) throw new PromotionDecisionError("ALREADY_DECIDED", "Proposal is no longer pending");
    maybeFail("proposal", input.failAt);
    // The canonical proposal transition trigger emits the workspace-scoped approval event.
    maybeFail("audit", input.failAt);

    await client.query(
      `INSERT INTO promotion_outbox (group_id,workspace_id,workspace_scope_state,proposal_id,memory_id,payload)
       VALUES ($1,$2,'workspace_scoped',$3,$4,$5)`,
      [groupId, workspaceId, proposal.id, memoryId, JSON.stringify({ proposal_id: proposal.id, memory_id: memoryId, group_id: groupId, workspace_id: workspaceId })],
    );
    maybeFail("outbox", input.failAt);

    const evidenceReferences = [`event:${String(sourceEvent.id)}`, ...evidenceIds.map((id) => `evidence-request:${id}`)].sort();
    const evidenceIdentityHash = createHash("sha256").update(JSON.stringify(evidenceReferences)).digest("hex");
    const receiptResult = await client.query<GovernanceReceipt>(
      `INSERT INTO governance_receipts (
         group_id,workspace_id,proposal_id,proposal_version,evidence_identity_hash,evidence_request_id,
         action,actor_id,actor_role,rationale,policy_reference,policy_version,memory_id,outbox_state,
         source_event_id,witness_hash,evidence_references)
       VALUES ($1,$2,$3,$4,$5,$6,'approve',$7,$8,$9,$10,$11,$12,'queued',$13,$14,$15::jsonb)
       RETURNING *`,
      [groupId, workspaceId, proposal.id, String(transition.rows[0].proposal_version), evidenceIdentityHash,
        evidenceIds[0] ?? null, input.principal.principalId, actorRole, rationale,
        "policy://allura/curator-decision", "25.2a/v1", memoryId, sourceEvent.id, witnessHash,
        JSON.stringify(evidenceReferences)],
    );
    const receipt = parseReceipt(receiptResult.rows[0]);
    await client.query(`SELECT app.finalize_governance_receipt_evidence($1,$2::uuid[])`, [receipt.id,evidenceIds]);
    maybeFail("receipt", input.failAt);

    await client.query(
      `INSERT INTO promotion_idempotency (group_id,workspace_id,workspace_scope_state,idempotency_key,proposal_id,result)
       VALUES ($1,$2,'workspace_scoped',$3,$4,$5)`,
      [groupId, workspaceId, idempotencyKey, proposal.id, JSON.stringify(receipt)],
    );
    maybeFail("idempotency", input.failAt);
    await client.query("COMMIT");
    return receipt;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const pgError = error as { code?: string; constraint?: string };
    if (pgError.code === "23505" && pgError.constraint === "promotion_idempotency_scope_key" && resolvedGroupId) {
      await client.query("BEGIN");
      try {
        await client.query(setLocal("app.current_group_id", resolvedGroupId));
        await client.query(setLocal("app.current_tenant", resolvedGroupId));
        await client.query(setLocal("app.current_workspace_id", workspaceId));
        await client.query(setLocal("app.current_principal", input.principal.principalId));
        const replay = await client.query<{ proposal_id:string; result:GovernanceReceipt }>(
          `SELECT proposal_id,result FROM promotion_idempotency WHERE group_id=$1 AND workspace_id=$2 AND idempotency_key=$3`,
          [resolvedGroupId,workspaceId,idempotencyKey],
        );
        await client.query("COMMIT");
        if (replay.rows[0]?.proposal_id === proposalId) return parseReceipt(replay.rows[0].result);
        throw new PromotionDecisionError("IDEMPOTENCY_CONFLICT", "Idempotency key is already bound to a different proposal");
      } catch (raceError) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw raceError;
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
