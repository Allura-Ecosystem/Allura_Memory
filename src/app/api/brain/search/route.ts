/**
 * GET /api/brain/search — quarantined legacy content route.
 *
 * Tenant-only search and client-selected user filters cannot prove Epic 30
 * workspace, visibility, derivative, or required-receipt authority. Keep
 * authentication active but disclose no content until shared search exists.
 *
 * Declared in ROUTE_SCOPE_MANIFEST as brain:search:read (viewer).
 */

import { NextRequest, NextResponse } from "next/server"

import { withPermission } from "@/lib/auth/api-auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(
    { error: "Protected Brain search unavailable", results: [], count: 0, latency_ms: 0 },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
