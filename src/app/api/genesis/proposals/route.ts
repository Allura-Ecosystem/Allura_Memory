/**
 * GET /api/genesis/proposals
 * Story 2.2: Genesis Engine — List active pattern proposals.
 *
 * Query Parameters:
 * - group_id: Required tenant namespace (format: allura-*).
 * - status: Optional filter (proposed | approved | rejected | all).
 *   Default: "proposed" (active proposals awaiting HITL review).
 * - limit: Max results (default 50, max 1000).
 *
 * Reads are direct (not kernel-gated) — only writes flow through
 * syscall_mutate (AD-40). group_id is parameterised for tenant isolation.
 *
 * Auth: requires viewer role or above.
 */

import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { captureException } from "@/lib/observability/sentry";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

const VALID_STATUSES = new Set(["proposed", "approved", "rejected", "all"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) {
    return unauthorizedResponse();
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck);
  }

  try {
    const { searchParams } = new URL(request.url);

    // ── Validate group_id (tenant isolation) ──
    const groupIdParam = searchParams.get("group_id") ?? "";
    let group_id: string;
    try {
      group_id = validateGroupId(groupIdParam);
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 }
        );
      }
      throw error;
    }

    // ── Parse status filter ──
    const status = searchParams.get("status") ?? "proposed";
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Invalid status: '${status}'. Valid values: proposed, approved, rejected, all` },
        { status: 400 }
      );
    }

    // ── Parse limit ──
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return NextResponse.json(
        { error: `Invalid limit: '${limitParam}'. Must be 1-1000.` },
        { status: 400 }
      );
    }

    const pool = getPool();

    let query: string;
    let params: unknown[];

    if (status === "all") {
      query = `
        SELECT id, group_id, pattern_description, pattern_type, frequency,
               suggested_skill, confidence, status, created_at, reviewed_at
        FROM pattern_proposals
        WHERE group_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `;
      params = [group_id, limit];
    } else {
      query = `
        SELECT id, group_id, pattern_description, pattern_type, frequency,
               suggested_skill, confidence, status, created_at, reviewed_at
        FROM pattern_proposals
        WHERE group_id = $1 AND status = $2
        ORDER BY created_at DESC
        LIMIT $3
      `;
      params = [group_id, status, limit];
    }

    const result = await pool.query(query, params);

    return NextResponse.json({
      proposals: result.rows.map((row) => ({
        id: row.id,
        group_id: row.group_id,
        pattern_description: row.pattern_description,
        pattern_type: row.pattern_type,
        frequency: row.frequency,
        suggested_skill: row.suggested_skill,
        confidence: parseFloat(row.confidence),
        status: row.status,
        created_at: row.created_at,
        reviewed_at: row.reviewed_at,
      })),
    });
  } catch (error) {
    captureException(error, { tags: { route: "/api/genesis/proposals", method: "GET" } });
    console.error("[/api/genesis/proposals] Failed to fetch proposals:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch proposals";
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}