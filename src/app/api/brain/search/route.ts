/**
 * GET /api/brain/search — quarantined legacy content route.
 *
 * Tenant-only search and client-selected user filters cannot prove Epic 30
 * workspace, visibility, derivative, or required-receipt authority. Production
 * discloses no content; the exact disposable synthetic target exercises the
 * shared receipt-gated reader and search candidate only.
 *
 * Declared in ROUTE_SCOPE_MANIFEST as brain:search:read (viewer).
 */

import { NextRequest, NextResponse } from "next/server"

import { withPermission } from "@/lib/auth/api-auth"
import { getDashboardPrincipal } from "@/lib/auth/dashboard-principal"
import { assertSyntheticTarget, isSyntheticScope } from "@/lib/digital-brain/local-confinement"
import { searchAuthorizedDocuments, searchAuthorizedDocumentsPage } from "@/lib/digital-brain/read-service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth
  try {
    // This is a bounded synthetic candidate, not a production search switch.
    assertSyntheticTarget()
    const principal = await getDashboardPrincipal()
    if (!principal?.sessionId || !principal.workspaceId || !principal.groupId ||
        principal.id !== auth.user.id || principal.groupId !== auth.groupId) {
      throw new Error("Synthetic search authority refused")
    }
    const scope = { tenantId: principal.groupId, workspaceId: principal.workspaceId, principalId: principal.id }
    if (!isSyntheticScope(scope)) throw new Error("Synthetic search scope refused")
    const query = request.nextUrl.searchParams.get("q") ?? ""
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined
    const limit = request.nextUrl.searchParams.get("limit")
    if (cursor !== undefined || limit !== null) {
      const page = await searchAuthorizedDocumentsPage(scope, query, {
        cursor,
        pageSize: limit === null ? undefined : Number(limit),
      })
      return NextResponse.json({ results: page.hits, count: page.total,
        has_more: page.hasMore, next_cursor: page.nextCursor },
      { headers: { "Cache-Control": "no-store" } })
    }
    const result = await searchAuthorizedDocuments(scope, query)
    return NextResponse.json({ results: result.hits, count: result.total },
      { headers: { "Cache-Control": "no-store" } })
  } catch {
    // No query, scope, authority, or backend detail crosses the HTTP boundary.
  }
  return NextResponse.json(
    { error: "Protected Brain search unavailable", results: [], count: 0, latency_ms: 0 },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
