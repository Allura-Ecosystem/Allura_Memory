/**
 * Curator proposals read boundary.
 *
 * Tenant, workspace, and principal are derived exclusively from the verified
 * authenticated identity. URL scope values are equality assertions only: they
 * may narrow nothing and a mismatch is rejected before any database access.
 */
import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";
import { captureException } from "@/lib/observability/sentry";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const PROPOSAL_STATUSES = new Set(["pending", "approved", "rejected", "all"]);

type ProposalRow = {
  id: string;
  group_id: string;
  workspace_id: string;
  content: string;
  score: string | number;
  reasoning: string | null;
  tier: string;
  status: "pending" | "approved" | "rejected";
  trace_ref: string | number | null;
  created_at: string;
};

type EvidenceRow = {
  id: string;
  proposal_id: string;
  requested_by: string;
  requested_at: string;
  state: string;
  reason: string;
  resolved_at: string | null;
  resolved_by: string | null;
  evidence_references: unknown;
};

type ReceiptRow = {
  id: string;
  proposal_id: string;
  action: "approve" | "reject" | "request_evidence";
  actor_id: string;
  actor_role: "curator" | "admin";
  rationale: string;
  policy_reference: string;
  policy_version: string;
  memory_id: string | null;
  result_ref: string | null;
  outbox_state: string;
  evidence_request_id: string | null;
  evidence_references: unknown;
  occurred_at: string;
};

function parseLimit(raw: string | null): number {
  if (raw === null) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function selectorMismatch(searchParams: URLSearchParams, groupId: string, workspaceId: string): boolean {
  const hasExactlyOne = (name: "group_id" | "workspace_id", expected: string) => {
    const values = searchParams.getAll(name);
    return values.length === 0 || (values.length === 1 && values[0] === expected);
  };

  return !hasExactlyOne("group_id", groupId) || !hasExactlyOne("workspace_id", workspaceId);
}

/** GET /api/curator/proposals — workspace-scoped proposal/evidence/receipt read. */
export async function GET(request: NextRequest) {
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) return unauthorizedResponse();
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck);

  const user = roleCheck.user;
  if (!user.workspaceId) {
    return NextResponse.json({ error: "Authenticated workspace scope is required" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    if (selectorMismatch(searchParams, user.groupId, user.workspaceId)) {
      return NextResponse.json({ error: "Forged curator scope is forbidden" }, { status: 403 });
    }

    const status = searchParams.get("status") ?? "pending";
    if (!PROPOSAL_STATUSES.has(status)) {
      return NextResponse.json({ error: "status must be pending, approved, rejected, or all" }, { status: 400 });
    }

    const limit = parseLimit(searchParams.get("limit"));
    const scope = { tenantId: user.groupId, workspaceId: user.workspaceId, principalId: user.id };

    const { proposals, evidence, receipts } = await withWorkspaceTransaction(scope, async (db) => {
      const proposalParams: unknown[] = [scope.tenantId, scope.workspaceId];
      const conditions = ["group_id = $1", "workspace_id = $2"];
      if (status !== "all") {
        proposalParams.push(status);
        conditions.push("status = $3");
      }
      proposalParams.push(limit);
      const proposalResult = await db.query<ProposalRow>(
        `SELECT id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref, created_at
           FROM canonical_proposals
          WHERE ${conditions.join(" AND ")}
          ORDER BY score DESC, created_at DESC
          LIMIT $${proposalParams.length}`,
        proposalParams,
      );
      const proposalIds = proposalResult.rows.map((proposal) => proposal.id);
      if (proposalIds.length === 0) return { proposals: proposalResult.rows, evidence: [] as EvidenceRow[], receipts: [] as ReceiptRow[] };

      const [evidenceResult, receiptResult] = await Promise.all([
        db.query<EvidenceRow>(
          `SELECT id, proposal_id, requested_by, requested_at, state, reason, resolved_at, resolved_by, evidence_references
             FROM evidence_requests
            WHERE group_id = $1 AND workspace_id = $2 AND proposal_id = ANY($3::uuid[])
            ORDER BY requested_at DESC, id`,
          [scope.tenantId, scope.workspaceId, proposalIds],
        ),
        db.query<ReceiptRow>(
          `SELECT DISTINCT ON (proposal_id)
                  id, proposal_id, action, actor_id, actor_role, rationale, policy_reference, policy_version,
                  memory_id, result_ref, outbox_state, evidence_request_id, evidence_references, occurred_at
             FROM governance_receipts
            WHERE group_id = $1 AND workspace_id = $2 AND proposal_id = ANY($3::uuid[])
            ORDER BY proposal_id, occurred_at DESC, id DESC`,
          [scope.tenantId, scope.workspaceId, proposalIds],
        ),
      ]);
      return { proposals: proposalResult.rows, evidence: evidenceResult.rows, receipts: receiptResult.rows };
    });

    const evidenceByProposal = new Map<string, EvidenceRow[]>();
    for (const row of evidence) {
      const rows = evidenceByProposal.get(row.proposal_id) ?? [];
      rows.push(row);
      evidenceByProposal.set(row.proposal_id, rows);
    }
    const receiptByProposal = new Map(receipts.map((receipt) => [receipt.proposal_id, receipt]));

    return NextResponse.json({
      proposals: proposals.map((proposal) => ({
        ...proposal,
        score: Number(proposal.score),
        evidence: evidenceByProposal.get(proposal.id) ?? [],
        // The immutable workspace-scoped governance_receipts row is the only
        // decision authority exposed here. Legacy events metadata is excluded.
        decision_receipt: receiptByProposal.get(proposal.id) ?? null,
      })),
    });
  } catch (error) {
    captureException(error, { tags: { route: "/api/curator/proposals", method: "GET" } });
    console.error("Failed to fetch proposals:", error);
    return NextResponse.json({ error: "Failed to fetch proposals" }, { status: 500 });
  }
}
