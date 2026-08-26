import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

/**
 * GET /api/memory/insights
 *
 * Query insights with group_id enforcement.
 * Query params:
 * - group_id: Required tenant identifier (format: allura-*)
 * - limit: Max number of insights (default: 50)
 * - offset: Pagination offset (default: 0)
 * - status: Insight status filter (active | superseded | deprecated | reverted)
 * - source_type: Source type filter (trace | manual | promotion | import)
 * - min_confidence: Minimum confidence (0.0-1.0)
 * - max_confidence: Maximum confidence (0.0-1.0)
 * - since: Created after this date (ISO 8601)
 * - until: Created before this date (ISO 8601)
 */
export async function GET(request: NextRequest) {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { searchParams } = new URL(request.url)
    const group_id = roleCheck.user.groupId
    const workspace_id = roleCheck.user.workspaceId
    if (!workspace_id) return unauthorizedResponse("Authenticated workspace scope is required")
    if ((searchParams.has("group_id") && searchParams.get("group_id") !== group_id)
      || (searchParams.has("workspace_id") && searchParams.get("workspace_id") !== workspace_id)) {
      return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 })
    }

    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")
    const status = searchParams.get("status") as "active" | "superseded" | "deprecated" | "reverted" | undefined
    const min_confidence = searchParams.get("min_confidence")
      ? parseFloat(searchParams.get("min_confidence")!)
      : undefined
    const max_confidence = searchParams.get("max_confidence")
      ? parseFloat(searchParams.get("max_confidence")!)
      : undefined
    const since = searchParams.get("since") ? new Date(searchParams.get("since")!) : undefined
    const until = searchParams.get("until") ? new Date(searchParams.get("until")!) : undefined

    // Validate confidence ranges
    if (min_confidence !== undefined && (min_confidence < 0 || min_confidence > 1)) {
      return NextResponse.json({ error: "min_confidence must be between 0.0 and 1.0" }, { status: 400 })
    }
    if (max_confidence !== undefined && (max_confidence < 0 || max_confidence > 1)) {
      return NextResponse.json({ error: "max_confidence must be between 0.0 and 1.0" }, { status: 400 })
    }

    // Validate date params
    if (since && isNaN(since.getTime())) {
      return NextResponse.json({ error: "Invalid since date. Use ISO 8601 format." }, { status: 400 })
    }
    if (until && isNaN(until.getTime())) {
      return NextResponse.json({ error: "Invalid until date. Use ISO 8601 format." }, { status: 400 })
    }

    // Build query for graph_memories
    const params: unknown[] = [group_id, workspace_id]
    const conditions = ["group_id = $1", "workspace_id = $2", "workspace_scope_state = 'workspace_scoped'"]
    let paramIdx = 3

    if (status === "active") {
      conditions.push("deprecated = false")
    } else if (status === "deprecated") {
      conditions.push("deprecated = true")
    }

    if (min_confidence !== undefined) {
      params.push(min_confidence)
      conditions.push(`score >= $${paramIdx}`)
      paramIdx++
    }
    if (max_confidence !== undefined) {
      params.push(max_confidence)
      conditions.push(`score <= $${paramIdx}`)
      paramIdx++
    }
    if (since) {
      params.push(since)
      conditions.push(`created_at >= $${paramIdx}::timestamptz`)
      paramIdx++
    }
    if (until) {
      params.push(until)
      conditions.push(`created_at <= $${paramIdx}::timestamptz`)
      paramIdx++
    }

    params.push(limit)
    const limitIdx = paramIdx
    paramIdx++
    params.push(offset)
    const offsetIdx = paramIdx

    const query = `
      SELECT id, group_id, content, score, version, created_at, provenance, user_id, deprecated
      FROM graph_memories
      WHERE ${conditions.join(" AND ")}
      ORDER BY score DESC, created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `

    const { result, countResult } = await withWorkspaceTransaction({
      tenantId: group_id, workspaceId: workspace_id, principalId: roleCheck.user.id,
    }, async (db) => ({
      result: await db.query(query, params),
      countResult: await db.query(`SELECT COUNT(*) as total FROM graph_memories WHERE ${conditions.join(" AND ")}`, params.slice(0, paramIdx - 2)),
    }))

    const items = result.rows.map((row: Record<string, unknown>) => ({
      insight_id: row.id,
      content: row.content,
      confidence: row.score,
      version: row.version,
      created_at: row.created_at,
      status: row.deprecated ? "deprecated" : "active",
      provenance: row.provenance,
    }))

    const total = parseInt(countResult.rows[0].total as string, 10)

    return NextResponse.json({
      insights: items,
      total,
      has_more: offset + items.length < total,
    })
  } catch (error) {
    console.error("Failed to fetch insights:", error)
    return NextResponse.json({ error: "Failed to fetch insights" }, { status: 500 })
  }
}