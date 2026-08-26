/** Curator decision boundary: authenticate/validate HTTP input, then delegate. */
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { resolveWebApprovalTenant } from "@/lib/auth/web-principal";
import { createPrincipalContext, PrincipalAuthError } from "@/lib/auth/principal-context";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";
import { getAppPool } from "@/lib/postgres/connection";
import { approveProposal, PromotionDecisionError } from "@/lib/memory/approve-proposal";
import { logApprovalEvent, logProposalNeedsEvidenceEvent, SegregationOfDutiesError } from "@/lib/memory/approval-audit";
import { writeGovernanceReceipt } from "@/lib/memory/governance-receipt-writer";
import { captureException } from "@/lib/observability/sentry";

const POLICY_REFERENCE = "policy://allura/curator-decision";
const POLICY_VERSION = "25.2a/v1";

class DecisionRouteError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function POST(request: NextRequest) {
  const roleCheck = requireRole(request, "curator");
  if (!roleCheck.user) return unauthorizedResponse();
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck);

  try {
    const body = await request.json();
    const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
    const decision = body.decision;
    const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
    if (!proposalId) return NextResponse.json({ error: "proposal_id is required" }, { status: 400 });
    if (!body.group_id) return NextResponse.json({ error: "group_id is required" }, { status: 400 });
    if (!["approve", "reject", "request_evidence"].includes(decision)) {
      return NextResponse.json({ error: "decision must be 'approve', 'reject', or 'request_evidence'" }, { status: 400 });
    }
    if (!rationale) return NextResponse.json({ error: "rationale is required for curator decisions" }, { status: 400 });

    const user = roleCheck.user;
    let groupId: string;
    try {
      groupId = resolveWebApprovalTenant(user, body.group_id);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Authenticated tenant could not be resolved" }, { status: 403 });
    }
    if (!user.workspaceId) return NextResponse.json({ error: "Authenticated workspace could not be resolved" }, { status: 403 });
    const workspaceId = user.workspaceId;
    const actorRole = user.role === "admin" ? "admin" : "curator";
    const scope = { tenantId: groupId, workspaceId, principalId: user.id };

    if (decision === "approve") {
      const principal = createPrincipalContext({
        principalId: user.id,
        tenantIds: [groupId],
        roles: [actorRole],
        scopes: ["review:approve"],
        authMethod: "web_session",
        sessionId: user.sessionId ?? `web:${user.id}`,
      });
      const idempotencyKey = request.headers.get("idempotency-key")?.trim() || `${proposalId}:approve:${user.id}`;
      const receipt = await approveProposal({
        principal,
        groupId,
        workspaceId,
        proposalId,
        rationale,
        idempotencyKey,
        evidenceRequestIds: Array.isArray(body.evidence_request_ids) ? body.evidence_request_ids : [],
        pool: getAppPool(),
      });
      return NextResponse.json(receipt);
    }

    const receipt = await withWorkspaceTransaction(scope, async (client) => {
      const locked = await client.query(
        `SELECT id,content,score,tier,status,trace_ref,proposal_version
         FROM canonical_proposals
         WHERE id=$1 AND group_id=$2 AND workspace_id=$3 FOR UPDATE`,
        [proposalId, groupId, workspaceId],
      );
      const proposal = locked.rows[0];
      if (!proposal) throw new DecisionRouteError(404, "Proposal not found");
      if (proposal.status !== "pending") throw new DecisionRouteError(400, `Proposal already ${proposal.status}`);
      if (proposal.trace_ref === null || proposal.trace_ref === undefined) throw new DecisionRouteError(400, "Proposal trace evidence is required");
      const source = await client.query(
        `SELECT id,agent_id FROM events WHERE id=$1 AND group_id=$2 AND workspace_id=$3`,
        [proposal.trace_ref, groupId, workspaceId],
      );
      const sourceEvent = source.rows[0];
      if (!sourceEvent) throw new DecisionRouteError(400, "Proposal trace evidence is missing or outside workspace scope");
      if (sourceEvent.agent_id === user.id) throw new SegregationOfDutiesError(user.id);

      const decidedAt = new Date().toISOString();
      let version = String(proposal.proposal_version);
      let evidenceRequestIds: string[] = [];
      if (decision === "request_evidence") {
        const evidenceRequestId = await logProposalNeedsEvidenceEvent({
          proposal_id: proposalId, group_id: groupId, workspace_id: workspaceId,
          memory_id: String(proposal.trace_ref), requested_by: sourceEvent.agent_id ?? undefined,
          curator_id: user.id, decision_actor_role: actorRole, decision: "needs_evidence",
          resulting_status: "pending", rationale, score: Number(proposal.score), tier: proposal.tier,
          approved_at: decidedAt,
        }, client as never);
        evidenceRequestIds = [evidenceRequestId];
      } else {
        const witnessHash = createHash("shake256", { outputLength: 64 })
          .update(`${proposalId}|${groupId}|${proposal.content}|${proposal.score}|${proposal.tier}|reject|${decidedAt}|${user.id}`)
          .digest("hex");
        const transition = await client.query(
          `UPDATE canonical_proposals
           SET status='rejected',decided_at=$1,decided_by=$2,rationale=$3,witness_hash=$4,approved_memory_id=NULL
           WHERE id=$5 AND group_id=$6 AND workspace_id=$7 AND proposal_version=$8 AND status='pending'
           RETURNING proposal_version`,
          [decidedAt, user.id, rationale, witnessHash, proposalId, groupId, workspaceId, proposal.proposal_version],
        );
        if (!transition.rows[0]) throw new DecisionRouteError(409, "Proposal is no longer pending");
        version = String(transition.rows[0].proposal_version);
        await logApprovalEvent({
          proposal_id: proposalId, group_id: groupId, workspace_id: workspaceId,
          memory_id: String(proposal.trace_ref), requested_by: sourceEvent.agent_id ?? undefined,
          curator_id: user.id, decision_actor_role: actorRole, decision: "rejected",
          resulting_status: "rejected", rationale, score: Number(proposal.score), tier: proposal.tier,
          approved_at: decidedAt,
        }, client as never);
      }

      return writeGovernanceReceipt(scope, { actorId: user.id, role: actorRole }, {
        proposalId, proposalVersion: version, action: decision, rationale,
        policyReference: POLICY_REFERENCE, policyVersion: POLICY_VERSION, evidenceRequestIds,
      }, client);
    });
    return NextResponse.json(receipt);
  } catch (error) {
    if (error instanceof DecisionRouteError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PrincipalAuthError) return NextResponse.json(error.toErrorPayload(), { status: error.httpStatus });
    if (error instanceof PromotionDecisionError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "ALREADY_DECIDED" ? 409 : error.code === "UNAUTHORIZED" ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof SegregationOfDutiesError) return NextResponse.json({ error: error.message }, { status: 403 });
    captureException(error, { tags: { route: "/api/curator/approve", method: "POST" } });
    return NextResponse.json({ error: "Failed to process curator decision" }, { status: 500 });
  }
}
