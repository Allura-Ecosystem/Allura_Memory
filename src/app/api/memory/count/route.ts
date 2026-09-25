import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

/**
 * GET /api/memory/count
 *
 * Returns the total count of unique active memories for a tenant.
 * Queries PostgreSQL (episodic events + graph_memories), deduplicates,
 * and returns the merged count.
 *
 * Query params:
 *   group_id  — required
 *   user_id   — optional; omit for all users
 */
export async function GET(request: NextRequest) {
  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) return unauthorizedResponse()
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck)

  const { searchParams } = new URL(request.url)
  const groupId = roleCheck.user.groupId
  const workspaceId = roleCheck.user.workspaceId
  if (!workspaceId) return unauthorizedResponse("Authenticated workspace scope is required")
  if (
    (searchParams.has("group_id") && searchParams.get("group_id") !== groupId) ||
    (searchParams.has("workspace_id") && searchParams.get("workspace_id") !== workspaceId)
  ) {
    return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 })
  }
  const userId = searchParams.get("user_id") || null
  if (userId && userId !== roleCheck.user.id && roleCheck.user.role !== "admin") {
    return NextResponse.json({ error: "Selecting another user's memory count requires administrator authority" }, { status: 403 })
  }

  try {
    const [pgResult, graphResult] = await withWorkspaceTransaction(
      { tenantId: groupId, workspaceId, principalId: roleCheck.user.id },
      (db) =>
        Promise.all([
          // PostgreSQL: Get all memory IDs (episodic layer)
          db.query<{ id: string }>(
            `SELECT e.metadata->>'memory_id' AS id
         FROM events e
         WHERE e.group_id = $1 AND e.workspace_id = $2
           AND e.event_type = 'memory_add'
           AND ($3::text IS NULL OR e.metadata->>'user_id' = $3)
           AND COALESCE((SELECT lifecycle.event_type FROM events lifecycle
             WHERE lifecycle.group_id = e.group_id AND lifecycle.workspace_id = e.workspace_id
               AND lifecycle.metadata->>'memory_id' = e.metadata->>'memory_id'
               AND lifecycle.event_type IN ('memory_delete', 'memory_restore')
             ORDER BY lifecycle.created_at DESC, lifecycle.id DESC LIMIT 1), 'memory_restore') <> 'memory_delete'`,
            [groupId, workspaceId, userId]
          ),

          // graph_memories: Get all memory IDs (semantic layer, non-deprecated)
          db.query<{ id: string }>(
            `SELECT id FROM graph_memories
         WHERE group_id = $1 AND workspace_id = $2
           AND ($3::text IS NULL OR user_id = $3)
           AND deprecated = false
           AND NOT EXISTS (
             SELECT 1 FROM graph_supersedes s
             WHERE s.group_id = graph_memories.group_id
               AND s.workspace_id = graph_memories.workspace_id
               AND s.workspace_scope_state = 'workspace_scoped'
               AND s.superseded_id = graph_memories.id
           )`,
            [groupId, workspaceId, userId]
          ),
        ])
    )

    // Deduplicate: Create a Set of all unique memory IDs
    const uniqueIds = new Set<string>()
    pgResult.rows.forEach((row: { id: string | null }) => {
      if (row.id) uniqueIds.add(row.id)
    })
    graphResult.rows.forEach((row: { id: string | null }) => {
      if (row.id) uniqueIds.add(row.id)
    })

    return NextResponse.json({ count: uniqueIds.size })
  } catch (error) {
    console.error("memory_count error:", error)
    return NextResponse.json({ error: "Failed to count memories" }, { status: 500 })
  }
}
