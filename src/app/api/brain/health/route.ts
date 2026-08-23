/**
 * GET /api/brain/health — Brain subsystem liveness report.
 *
 * Story 24.11a AC-4. This route stays public. It is declared explicitly in
 * PUBLIC_ROUTE_MANIFEST (scope public:brain:health) with a recorded rationale:
 * audit_health_report returns subsystem status and queue depth only, never
 * memory content, so it is consistent with the other /api/health/* probes.
 *
 * If this handler is ever changed to return tenant rows, move its declaration
 * to ROUTE_SCOPE_MANIFEST.
 */

import { NextResponse } from "next/server"

import { brainClient } from "@/lib/brain-client"

export const dynamic = "force-dynamic"

/** Liveness probes have no principal; the report is not tenant-scoped data. */
const PROBE_GROUP_ID = "allura-system"

export async function GET(): Promise<NextResponse> {
  try {
    const report = await brainClient.healthReport(PROBE_GROUP_ID)
    return NextResponse.json(report)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brain health check failed"
    return NextResponse.json(
      { error: message, overall_status: "unhealthy" as const },
      { status: 503 }
    )
  }
}
