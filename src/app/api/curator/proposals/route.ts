/**
 * Curator Proposals API
 * 
 * GET /api/curator/proposals - List pending proposals
 * 
 * Reference: docs/allura/BLUEPRINT.md (Requirements F13-F15)
 */

import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { buildCuratorDecisionReceipt } from "@/lib/memory/approval-audit";
import { captureException } from "@/lib/observability/sentry";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

/**
 * GET /api/curator/proposals
 * 
 * Query params:
 * - group_id: Required tenant identifier
 * - status: Proposal status (pending | approved | rejected | all)
 * - limit: Max results (default: 20)
 */
export async function GET(request: NextRequest) {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("group_id");
    const status = searchParams.get("status") || "pending";
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!groupId) {
      return NextResponse.json(
        { error: "group_id is required" },
        { status: 400 }
      );
    }

    // Validate group_id format (ARCH-001: enforces allura-* pattern)
    let validatedGroupId: string;
    try {
      validatedGroupId = validateGroupId(groupId);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    const pool = getPool();

    // Build query based on status
    let query: string;
    let params: unknown[];

    if (status === "all") {
      query = `
        SELECT id, group_id, content, score, reasoning, tier, status, trace_ref, created_at
        FROM canonical_proposals
        WHERE group_id = $1
        ORDER BY score DESC, created_at DESC
        LIMIT $2
      `;
      params = [validatedGroupId, limit];
    } else {
      query = `
        SELECT id, group_id, content, score, reasoning, tier, status, trace_ref, created_at
        FROM canonical_proposals
        WHERE group_id = $1 AND status = $2
        ORDER BY score DESC, created_at DESC
        LIMIT $3
      `;
      params = [validatedGroupId, status, limit];
    }

    const result = await pool.query(query, params);
    const proposalIds = result.rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
    const decisionEvents = proposalIds.length > 0
      ? await pool.query(
        `SELECT DISTINCT ON (metadata->>'proposal_id')
            event_type, agent_id, created_at, metadata
         FROM events
         WHERE group_id = $1
           AND event_type IN ('proposal_approved', 'proposal_rejected', 'proposal_evidence_requested')
           AND metadata->>'proposal_id' = ANY($2::text[])
         ORDER BY metadata->>'proposal_id', created_at DESC`,
        [validatedGroupId, proposalIds]
      )
      : { rows: [] };
    const decisionEventsByProposalId = new Map(
      decisionEvents.rows.map((event) => [event.metadata?.proposal_id, event])
    );

    return NextResponse.json({
      proposals: result.rows.map((row) => ({
        id: row.id,
        group_id: row.group_id,
        content: row.content,
        score: parseFloat(row.score),
        reasoning: row.reasoning,
        tier: row.tier,
        status: row.status,
        trace_ref: row.trace_ref,
        created_at: row.created_at,
        decision_receipt: decisionEventsByProposalId.has(row.id) || row.status !== "pending"
          ? buildCuratorDecisionReceipt({
            proposal: {
              id: row.id,
              group_id: row.group_id,
              status: row.status,
              trace_ref: row.trace_ref === null || row.trace_ref === undefined ? null : String(row.trace_ref),
            },
            event: decisionEventsByProposalId.get(row.id) ?? null,
          })
          : null,
      })),
    });
  } catch (error) {
    captureException(error, { tags: { route: "/api/curator/proposals", method: "GET" } });
    console.error("Failed to fetch proposals:", error);
    return NextResponse.json(
      { error: "Failed to fetch proposals" },
      { status: 500 }
    );
  }
}
