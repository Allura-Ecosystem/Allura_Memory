/**
 * GET /api/brain/memories — quarantined legacy content route.
 *
 * Tenant-only and client-selected user filters cannot prove Epic 30 workspace,
 * visibility, derivative, or required-receipt authority. Production discloses
 * no content; the exact disposable synthetic target can exercise the shared
 * receipt-gated reader without enabling the production route.
 *
 * Declared in ROUTE_SCOPE_MANIFEST as brain:memories:read (viewer).
 */

import { NextRequest, NextResponse } from "next/server"

import { withPermission } from "@/lib/auth/api-auth"
import { getDashboardPrincipal } from "@/lib/auth/dashboard-principal"
import { assertSyntheticTarget, isSyntheticScope } from "@/lib/digital-brain/local-confinement"
import { readAuthorizedDocuments } from "@/lib/digital-brain/read-service"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth
  try {
    // Keep the production content route quarantined pending approved policy.
    assertSyntheticTarget()
    const principal = await getDashboardPrincipal()
    if (!principal?.sessionId || !principal.workspaceId || !principal.groupId ||
        principal.id !== auth.user.id || principal.groupId !== auth.groupId) {
      throw new Error("Synthetic list authority refused")
    }
    const scope = { tenantId: principal.groupId, workspaceId: principal.workspaceId, principalId: principal.id }
    if (!isSyntheticScope(scope)) throw new Error("Synthetic list scope refused")
    const documents = await readAuthorizedDocuments(scope)
    return NextResponse.json({ memories: documents.map((document) => ({
      id: document.id, title: document.title, content: document.content,
      updated_at: document.updatedAt.toISOString(),
    })), total: documents.length, has_more: false },
    { headers: { "Cache-Control": "no-store" } })
  } catch {
    // No scope, content, session, or backend error detail crosses the boundary.
  }
  return NextResponse.json(
    { error: "Protected Brain read unavailable", memories: [], total: 0, has_more: false },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}
