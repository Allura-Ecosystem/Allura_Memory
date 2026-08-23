/**
 * GET /api/brain/search — hybrid search over governed memories.
 *
 * Story 24.11a AC-4. This route returns real memory content and previously ran
 * with no authentication and a hardcoded tenant. It now requires an
 * authenticated principal and derives group_id from that principal only.
 *
 * Declared in ROUTE_SCOPE_MANIFEST as brain:search:read (viewer).
 */

import { NextRequest, NextResponse } from "next/server"

import { withPermission } from "@/lib/auth/api-auth"
import { brainClient } from "@/lib/brain-client"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth
  const { groupId } = auth

  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? searchParams.get("query") ?? ""
  const limit = Number(searchParams.get("limit")) || 10
  // Filter within the authenticated tenant; never a tenant selector.
  const userId = searchParams.get("user_id") ?? undefined

  if (!query.trim()) {
    return NextResponse.json({ results: [], count: 0, latency_ms: 0 })
  }

  try {
    const result = await brainClient.searchMemories(query, groupId, {
      limit,
      userId,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brain search failed"
    return NextResponse.json({ error: message, results: [], count: 0 }, { status: 502 })
  }
}
