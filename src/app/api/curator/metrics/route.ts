/**
 * GET /api/curator/metrics
 *
 * Returns a single JSON object summarizing curation health for a tenant:
 *   - pending_proposals: count of proposals with status='pending'
 *   - oldest_proposal_age_hours: age of the oldest pending proposal
 *   - auto_promotion_rate_24h: percentage of proposals auto-promoted in last 24h
 *   - rejection_rate_24h: percentage of proposals rejected in last 24h
 *   - drift_audit_status: pass/fail/unknown based on last DRIFT_AUDIT event
 *   - watchdog_health: running/stopped based on last watchdog heartbeat
 *
 * Query params:
 *   - group_id: Required tenant identifier (validated against allura-* pattern)
 *
 * Story 21.5: Curation Metrics Endpoint
 */

import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/observability/sentry";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

export const dynamic = "force-dynamic";

export interface CurationMetricsResponse {
  group_id: string;
  timestamp: string;
  pending_proposals: number;
  oldest_proposal_age_hours: number | null;
  auto_promotion_rate_24h: number;
  rejection_rate_24h: number;
  drift_audit_status: "pass" | "fail" | "unknown";
  watchdog_health: "running" | "stopped";
}

export interface CurationMetricsErrorResponse {
  error: string;
  timestamp: string;
}

/**
 * GET /api/curator/metrics
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<CurationMetricsResponse | CurationMetricsErrorResponse>> {
  const { searchParams } = new URL(request.url);
  const groupIdParam = searchParams.get("group_id");

  if (!groupIdParam) {
    return NextResponse.json(
      { error: "group_id is required", timestamp: new Date().toISOString() },
      { status: 400 },
    );
  }

  // Validate group_id format (ARCH-001: enforces allura-* pattern)
  let validatedGroupId: string;
  try {
    validatedGroupId = validateGroupId(groupIdParam);
  } catch (error) {
    if (error instanceof GroupIdValidationError) {
      return NextResponse.json(
        { error: `Invalid group_id: ${error.message}`, timestamp: new Date().toISOString() },
        { status: 400 },
      );
    }
    throw error;
  }

  try {
    const pool = getPool();

    // ── Query 1: Pending proposals count + oldest age ────────────────────────
    const pendingResult = await pool.query(
      `SELECT
         COUNT(*) AS pending_count,
         COALESCE(
           EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600,
           0
         ) AS oldest_age_hours
       FROM canonical_proposals
       WHERE group_id = $1 AND status = 'pending'`,
      [validatedGroupId],
    );
    const pendingProposals = parseInt(pendingResult.rows[0]?.pending_count ?? "0", 10);
    const oldestAgeHours = pendingProposals > 0
      ? Math.round(parseFloat(pendingResult.rows[0]?.oldest_age_hours ?? "0") * 100) / 100
      : null;

    // ── Query 2: Auto-promotion and rejection rates in last 24h ──────────────
    const rateResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'proposal_approved') AS approved,
         COUNT(*) FILTER (WHERE event_type = 'proposal_rejected') AS rejected,
         COUNT(*) AS total_decisions
       FROM events
       WHERE group_id = $1
         AND event_type IN ('proposal_approved', 'proposal_rejected')
         AND created_at >= NOW() - INTERVAL '24 hours'`,
      [validatedGroupId],
    );
    const approved = parseInt(rateResult.rows[0]?.approved ?? "0", 10);
    const rejected = parseInt(rateResult.rows[0]?.rejected ?? "0", 10);
    const totalDecisions = parseInt(rateResult.rows[0]?.total_decisions ?? "0", 10);
    const autoPromotionRate = totalDecisions > 0 ? Math.round((approved / totalDecisions) * 10000) / 100 : 0;
    const rejectionRate = totalDecisions > 0 ? Math.round((rejected / totalDecisions) * 10000) / 100 : 0;

    // ── Query 3: Drift audit status (last DRIFT_AUDIT event) ──────────────────
    const driftResult = await pool.query(
      `SELECT metadata
       FROM events
       WHERE group_id = $1
         AND event_type = 'DRIFT_AUDIT'
       ORDER BY created_at DESC
       LIMIT 1`,
      [validatedGroupId],
    );
    let driftAuditStatus: "pass" | "fail" | "unknown" = "unknown";
    if (driftResult.rows.length > 0) {
      const metadata = driftResult.rows[0]?.metadata;
      if (metadata && typeof metadata === "object") {
        const checksFailed = (metadata as Record<string, unknown>).checks_failed;
        if (typeof checksFailed === "number") {
          driftAuditStatus = checksFailed === 0 ? "pass" : "fail";
        }
      }
    }

    // ── Query 4: Watchdog health (last watchdog heartbeat event) ──────────────
    const watchdogResult = await pool.query(
      `SELECT created_at
       FROM events
       WHERE group_id = $1
         AND event_type = 'watchdog_heartbeat'
       ORDER BY created_at DESC
       LIMIT 1`,
      [validatedGroupId],
    );
    let watchdogHealth: "running" | "stopped" = "stopped";
    if (watchdogResult.rows.length > 0) {
      const lastHeartbeat = new Date(watchdogResult.rows[0]?.created_at).getTime();
      // If heartbeat within last 10 minutes, watchdog is running
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      watchdogHealth = lastHeartbeat > tenMinutesAgo ? "running" : "stopped";
    }

    const response: CurationMetricsResponse = {
      group_id: validatedGroupId,
      timestamp: new Date().toISOString(),
      pending_proposals: pendingProposals,
      oldest_proposal_age_hours: oldestAgeHours,
      auto_promotion_rate_24h: autoPromotionRate,
      rejection_rate_24h: rejectionRate,
      drift_audit_status: driftAuditStatus,
      watchdog_health: watchdogHealth,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    captureException(error, { tags: { route: "/api/curator/metrics", method: "GET" } });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to fetch curation metrics: ${errorMessage}`, timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}