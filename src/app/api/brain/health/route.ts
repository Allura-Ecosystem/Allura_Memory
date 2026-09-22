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
const CANONICAL_BRAIN_ENDPOINT = "https://mcp.faithmeats.org/mcp"

function unavailable(): NextResponse {
  return NextResponse.json(
    { error: "Brain health check unavailable", overall_status: "unhealthy" as const },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

export async function GET(): Promise<NextResponse> {
  if (process.env.ALLURA_BRAIN_URL !== CANONICAL_BRAIN_ENDPOINT) return unavailable()
  try {
    const report = await brainClient.healthReport(PROBE_GROUP_ID)
    return NextResponse.json(report)
  } catch {
    return unavailable()
  }
}
