import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

/**
 * GET /api/memory/insights/[id]/history
 *
 * Get the version history (SUPERSEDES chain) for an insight.
 * Query params:
 * - group_id: Required tenant identifier (format: allura-*)
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const group_id = roleCheck.user.groupId
    const workspace_id = roleCheck.user.workspaceId
    if (!workspace_id) return unauthorizedResponse("Authenticated workspace scope is required")
    if (
      (searchParams.has("group_id") && searchParams.get("group_id") !== group_id) ||
      (searchParams.has("workspace_id") && searchParams.get("workspace_id") !== workspace_id)
    ) {
      return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 })
    }

    // Query version history from PostgreSQL (graph_memories + graph_supersedes)
    const result = await withWorkspaceTransaction(
      { tenantId: group_id, workspaceId: workspace_id, principalId: roleCheck.user.id },
      (db) =>
        db.query(
          `SELECT m.id, m.group_id, m.content, m.score, m.version, m.created_at,
              m.provenance, m.user_id, m.deprecated
       FROM graph_memories m
       WHERE m.id = $1
         AND m.group_id = $2
         AND m.workspace_id = $3
         AND m.workspace_scope_state = 'workspace_scoped'
       ORDER BY m.version DESC`,
          [id, group_id, workspace_id]
        )
    )

    const history = result.rows.map((row: Record<string, unknown>) => ({
      insight_id: row.id,
      content: row.content,
      confidence: row.score,
      version: row.version,
      created_at: row.created_at,
      status: row.deprecated ? "deprecated" : "active",
      provenance: row.provenance,
    }))

    return NextResponse.json({ history })
  } catch (error) {
    console.error("Failed to fetch insight history")
    return NextResponse.json({ error: "Failed to fetch insight history" }, { status: 500 })
  }
}
