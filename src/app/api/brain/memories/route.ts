/**
 * GET /api/brain/memories — list governed memories for the caller's tenant.
 *
 * Story 24.11a AC-4. This route returns real memory content and previously ran
 * with no authentication and a hardcoded tenant. It now requires an
 * authenticated principal and derives group_id from that principal only.
 *
 * Declared in ROUTE_SCOPE_MANIFEST as brain:memories:read (viewer).
 */

import { NextRequest, NextResponse } from "next/server"

import { withPermission } from "@/lib/auth/api-auth"
import { brainClient } from "@/lib/brain-client"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth
  const { user, groupId } = auth

  const { searchParams } = new URL(request.url)
  // Tenant authority is server-derived (groupId above). user_id is a filter
  // *within* that tenant, and defaults to the calling principal rather than to
  // a hardcoded account.
  const userId = searchParams.get("user_id") ?? user.id
  const limit = Number(searchParams.get("limit")) || 50
  const offset = Number(searchParams.get("offset")) || 0
  const sort = searchParams.get("sort") ?? "created_at_desc"

  try {
    const result = await brainClient.listMemories(groupId, userId, {
      limit,
      offset,
      sort,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brain list failed"
    return NextResponse.json({ error: message, memories: [], total: 0 }, { status: 502 })
  }
}
