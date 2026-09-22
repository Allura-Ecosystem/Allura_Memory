/**
 * GET /api/brain/memories — quarantined legacy content route.
 *
 * Tenant-only and client-selected user filters cannot prove Epic 30 workspace,
 * visibility, derivative, or required-receipt authority. Keep authentication
 * active but disclose no content until this route uses the shared read path.
 *
 * Declared in ROUTE_SCOPE_MANIFEST as brain:memories:read (viewer).
 */

import { NextRequest, NextResponse } from "next/server"

import { withPermission } from "@/lib/auth/api-auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth
  return NextResponse.json(
    { error: "Protected Brain read unavailable", memories: [], total: 0, has_more: false },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
