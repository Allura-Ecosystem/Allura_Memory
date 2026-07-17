/**
 * GET /api/health/recovery-log
 *
 * Returns recent auto-recovery attempt records from the recovery_events table.
 * Supports an optional `component` query param to filter by component name
 * (e.g. /api/health/recovery-log?component=mcp-container) and a `limit` param
 * (default 50, max 200).
 *
 * Story 2.3: Self-Healing (Auto-Recovery)
 */

import { NextRequest, NextResponse } from "next/server";
import { captureException } from "@/lib/observability/sentry";
import {
  getRecoveryLog,
  RECOVERY_LOG_DEFAULT_LIMIT,
  type RecoveryEventRecord,
} from "@/lib/healing/auto-recovery";

export const dynamic = "force-dynamic";

export interface RecoveryLogResponse {
  timestamp: string;
  count: number;
  events: RecoveryEventRecord[];
}

export interface RecoveryLogErrorResponse {
  error: string;
  timestamp: string;
}

const MAX_LIMIT = 200;

function parseLimit(value: string | null): number {
  const n = parseInt(value ?? "", 10);
  if (Number.isNaN(n) || n < 1) return RECOVERY_LOG_DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * GET /api/health/recovery-log
 */
export async function GET(
  request: NextRequest,
): Promise<NextResponse<RecoveryLogResponse | RecoveryLogErrorResponse>> {
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const component = searchParams.get("component") || undefined;

  try {
    const events = await getRecoveryLog(limit, component);

    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        count: events.length,
        events,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (error) {
    captureException(error, {
      tags: { route: "/api/health/recovery-log", method: "GET" },
    });
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: `Failed to fetch recovery log: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}