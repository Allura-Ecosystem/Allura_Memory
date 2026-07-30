import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { getPool } from "@/lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

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
    const group_id_param = searchParams.get("group_id")

    if (!group_id_param) {
      return NextResponse.json(
        { error: "group_id is required. Provide a valid tenant identifier (format: allura-*)" },
        { status: 400 }
      )
    }

    let group_id: string
    try {
      group_id = validateGroupId(group_id_param)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    // Query version history from PostgreSQL (graph_memories + graph_supersedes)
    const pool = getPool()
    const result = await pool.query(
      `SELECT m.id, m.group_id, m.content, m.score, m.version, m.created_at,
              m.provenance, m.user_id, m.deprecated
       FROM graph_memories m
       WHERE m.id = $1
         AND (m.group_id = $2 OR m.group_id = 'global')
       ORDER BY m.version DESC`,
      [id, group_id]
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
    console.error("Failed to fetch insight history:", error)
    return NextResponse.json({ error: "Failed to fetch insight history" }, { status: 500 })
  }
}