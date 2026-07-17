/**
 * GET /api/trajectories/stats
 *
 * Per-agent success rate and action count aggregation (SONA — Story 1.3).
 *
 * Query Parameters:
 * - group_id: Required tenant namespace (format: allura-*)
 * - from: Optional ISO 8601 start date
 * - to: Optional ISO 8601 end date
 *
 * Returns one row per (agent_id, action) with:
 *   total, successful, failed, success_rate,
 *   avg_duration_ms, p50_duration_ms, p95_duration_ms
 *
 * Auth: requires viewer role or above.
 */

import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { trajectoryStats } from "@/lib/sona/trajectory-engine";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

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

    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    if (from && isNaN(Date.parse(from))) {
      return NextResponse.json(
        { error: `Invalid 'from' date: '${from}'` },
        { status: 400 }
      );
    }
    if (to && isNaN(Date.parse(to))) {
      return NextResponse.json(
        { error: `Invalid 'to' date: '${to}'` },
        { status: 400 }
      );
    }

    const stats = await trajectoryStats({ group_id, from, to });

    return NextResponse.json({
      group_id,
      from: from ?? null,
      to: to ?? null,
      stats,
    });
  } catch (error) {
    console.error("[/api/trajectories/stats] Failed to aggregate trajectory stats:", error);
    const message =
      error instanceof Error ? error.message : "Failed to aggregate trajectory stats";
    return NextResponse.json(
      { error: "Internal server error", details: message },
      { status: 500 }
    );
  }
}