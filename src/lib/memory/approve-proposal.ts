import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { hasRole, hasScope, hasWildcardTenant, PrincipalAuthError, type PrincipalContext } from "@/lib/auth/principal-context";
import { validateGroupId } from "@/lib/validation/group-id";

export type PromotionFailurePoint = "canonical" | "proposal" | "audit" | "outbox" | "idempotency";

export interface ApproveProposalInput {
  principal: PrincipalContext;
  proposalId: string;
  rationale: string;
  idempotencyKey: string;
  pool: Pool;
  failAt?: PromotionFailurePoint;
}

export interface ApprovalResult {
  outcome: "approved";
  proposalId: string;
  groupId: string;
  memoryId: string;
  decidedAt: string;
  replayed: boolean;
}

type ProposalRow = {
  id: string;
  group_id: string;
  content: string;
  score: string | number;
  tier: string;
  status: "pending" | "approved" | "rejected";
  trace_ref: string | number | null;
  approved_memory_id: string | null;
};

export class PromotionDecisionError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "ALREADY_DECIDED" | "UNAUTHORIZED" | "FAILURE_INJECTED",
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

function authorize(principal: PrincipalContext, groupId: string): void {
  if (!(hasRole(principal, "curator") || hasRole(principal, "admin")) || !hasScope(principal, "review:approve")) {
    throw new PrincipalAuthError("ROLE_INSUFFICIENT", "Atomic proposal approval requires a verified curator/admin with review:approve");
  }
  if (!hasWildcardTenant(principal) && !principal.tenantIds.includes(groupId)) {
    throw new PrincipalAuthError("TENANT_MISMATCH", `Principal '${principal.principalId}' is not authorized for tenant '${groupId}'`);
  }
}

function maybeFail(point: PromotionFailurePoint, requested?: PromotionFailurePoint): void {
  if (requested === point) throw new PromotionDecisionError("FAILURE_INJECTED", `Injected failure after ${point} write`);
}

function parseResult(value: unknown): ApprovalResult {
  if (!value || typeof value !== "object") throw new Error("Stored promotion idempotency result is malformed");
  const result = value as ApprovalResult;
  if (result.outcome !== "approved" || !result.memoryId || !result.proposalId || !result.groupId || !result.decidedAt) {
    throw new Error("Stored promotion idempotency result is incomplete");
  }
  return { ...result, replayed: true };
}

/**
 * The sole approval domain operation. Every durable write uses one checked-out
 * PostgreSQL client. External projection is represented only by a retryable
 * outbox row and runs after this transaction commits.
 */
export async function approveProposal(input: ApproveProposalInput): Promise<ApprovalResult> {
  const proposalId = String(input.proposalId ?? "").trim();
  const rationale = String(input.rationale ?? "").trim();
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  if (!proposalId || !rationale || !idempotencyKey) throw new Error("proposalId, rationale, and idempotencyKey are required");

  const client = await input.pool.connect();
  let committedResult: ApprovalResult | undefined;
  try {
    await client.query("BEGIN");
    // Suppress the legacy proposal_decided trigger during the atomic service
    // transaction — the service writes its own complete audit event explicitly.
    // Use a DO block with IF EXISTS to handle DB states where the trigger is absent.
    await client.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_proposal_decided' AND tgrelid = 'canonical_proposals'::regclass) THEN
        ALTER TABLE canonical_proposals DISABLE TRIGGER trigger_proposal_decided;
      END IF;
    END $$`);
    const proposalResult = await client.query<ProposalRow>(
      `SELECT id, group_id, content, score, tier, status, trace_ref, approved_memory_id
       FROM canonical_proposals WHERE id = $1 FOR UPDATE`,
      [proposalId],
    );
    const proposal = proposalResult.rows[0];
    if (!proposal) throw new PromotionDecisionError("NOT_FOUND", "Proposal not found");
    const groupId = validateGroupId(proposal.group_id);
    authorize(input.principal, groupId);

    const replay = await client.query<{ result: ApprovalResult }>(
      "SELECT result FROM promotion_idempotency WHERE group_id = $1 AND idempotency_key = $2 FOR UPDATE",
      [groupId, idempotencyKey],
    );
    if (replay.rows[0]) {
      await client.query("COMMIT");
      return parseResult(replay.rows[0].result);
    }
    if (proposal.status !== "pending") {
      throw new PromotionDecisionError("ALREADY_DECIDED", `Proposal is already ${proposal.status}`);
    }

    const memoryId = deterministicMemoryId(proposal.id, groupId);
    const decidedAt = new Date().toISOString();
    const witnessHash = createHash("shake256", { outputLength: 64 })
      .update(`${proposal.id}|${groupId}|${proposal.content}|${proposal.score}|${proposal.tier}|approved|${decidedAt}|${input.principal.principalId}`)
      .digest("hex");

    await client.query(
      `INSERT INTO graph_memories (id, group_id, user_id, content, score, provenance, version, deprecated)
       VALUES ($1, $2, $3, $4, $5, 'manual', 1, false)`,
      [memoryId, groupId, input.principal.principalId, proposal.content, Number(proposal.score)],
    );
    maybeFail("canonical", input.failAt);

    await client.query(
      `UPDATE canonical_proposals
       SET status = 'approved', decided_at = $1, decided_by = $2, rationale = $3,
           witness_hash = $4, approved_memory_id = $5
       WHERE id = $6 AND group_id = $7 AND status = 'pending'`,
      [decidedAt, input.principal.principalId, rationale, witnessHash, memoryId, proposal.id, groupId],
    );
    maybeFail("proposal", input.failAt);

    await client.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, 'proposal_approved', $2, 'completed', $3, $4)`,
      [groupId, input.principal.principalId, JSON.stringify({ proposal_id: proposal.id, memory_id: memoryId, curator_id: input.principal.principalId, rationale, score: Number(proposal.score), tier: proposal.tier, trace_ref: proposal.trace_ref }), decidedAt],
    );
    maybeFail("audit", input.failAt);

    await client.query(
      `INSERT INTO promotion_outbox (group_id, proposal_id, memory_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [groupId, proposal.id, memoryId, JSON.stringify({ proposal_id: proposal.id, memory_id: memoryId, group_id: groupId })],
    );
    maybeFail("outbox", input.failAt);

    const result: ApprovalResult = { outcome: "approved", proposalId: proposal.id, groupId, memoryId, decidedAt, replayed: false };
    committedResult = result;
    await client.query(
      `INSERT INTO promotion_idempotency (group_id, idempotency_key, proposal_id, result)
       VALUES ($1, $2, $3, $4)`,
      [groupId, idempotencyKey, proposal.id, JSON.stringify(result)],
    );
    maybeFail("idempotency", input.failAt);
    await client.query("COMMIT");
    // Re-enable the trigger after commit if it existed and was disabled
    await client.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_proposal_decided' AND tgrelid = 'canonical_proposals'::regclass AND tgenabled = 'D') THEN
        ALTER TABLE canonical_proposals ENABLE TRIGGER trigger_proposal_decided;
      END IF;
    END $$`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_proposal_decided' AND tgrelid = 'canonical_proposals'::regclass AND tgenabled = 'D') THEN
        ALTER TABLE canonical_proposals ENABLE TRIGGER trigger_proposal_decided;
      END IF;
    END $$`).catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const proposal = await input.pool.query<{ group_id: string; decided_at: string }>(
    "SELECT group_id, decided_at FROM canonical_proposals WHERE id = $1",
    [proposalId],
  );
  const groupId = proposal.rows[0]?.group_id;
  if (!groupId) throw new Error("Committed proposal is unavailable after approval");
  const committed = await input.pool.query<{ id: string }>(
    "SELECT id FROM graph_memories WHERE id = $1 AND group_id = $2 AND deprecated = false",
    [deterministicMemoryId(proposalId, groupId), groupId],
  );
  if (committed.rows.length !== 1) throw new Error("Committed promotion is not retrievable by approved canonical memory id");
  const row = committed.rows[0];
  return committedResult ?? (() => { throw new Error("Committed promotion result is unavailable"); })();
}
