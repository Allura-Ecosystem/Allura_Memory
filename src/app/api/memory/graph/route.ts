import { NextRequest, NextResponse } from "next/server"

import { forbiddenResponse, getAuthUser, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { getPool } from "@/lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

/**
 * Graph API Contract (Story 2.8 — Pike Interface Gate)
 *
 * Method:    GET only (POST/PUT/DELETE return 405 Method Not Allowed)
 * Headers:
 *   - x-allura-group-id (primary tenant scoping)
 *   - Accept: application/json (optional)
 * Query params:
 *   - group_id (fallback for legacy/manual calls)
 *   - stats=true (optional, returns only counts, no nodes/edges)
 * Response (200 OK):
 *   { nodes: [], edges: [], total_edges: number }
 * Response (400 Bad Request):
 *   Missing or invalid group_id
 * Response (405 Method Not Allowed):
 *   Non-GET method
 * Response (401 Unauthorized / 403 Forbidden):
 *   Auth failures
 */

const EDGE_LABELS = new Set(["performed", "resulted_in", "generated", "applies_to", "connected_to", "caused_by"])

type FallbackEventRow = {
  id: string | number
  event_type: string
  agent_id: string
  status: string
  created_at: Date | string
  project: string | null
}

async function loadPostgresEventGraph(groupId: string, statsOnly: boolean) {
  const pool = getPool()
  const result = await pool.query<FallbackEventRow>(
    `SELECT id,
            event_type,
            agent_id,
            status,
            created_at,
            COALESCE(NULLIF(btrim(metadata->>'project'), ''), NULLIF(btrim(metadata->>'project_id'), '')) AS project
     FROM events
     WHERE group_id = $1
     ORDER BY created_at DESC
     LIMIT 60`,
    [groupId]
  )

  const agentIds = Array.from(new Set(result.rows.map((row) => row.agent_id).filter(Boolean)))
  const projectIds = Array.from(new Set(result.rows.map((row) => row.project).filter((project): project is string => Boolean(project))))

  const nodes = statsOnly ? [] : [
    ...agentIds.map((agentId) => ({
      id: `agent:${agentId}`,
      label: agentId,
      type: "agent",
      metadata: { group_id: groupId },
    })),
    ...projectIds.map((project) => ({
      id: `project:${project}`,
      label: project,
      type: "project",
      metadata: { group_id: groupId },
    })),
    ...result.rows.map((row) => ({
      id: `event:${row.id}`,
      label: row.event_type,
      type: "event",
      metadata: {
        group_id: groupId,
        status: row.status,
        agent_id: row.agent_id,
        project: row.project,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      },
    })),
  ]

  const eventEdges = result.rows.flatMap((row) => {
    const edges: Array<{ id: string; source: string; target: string; label: ReturnType<typeof edgeLabel>; metadata: Record<string, unknown> }> = [{
      id: `agent:${row.agent_id}->event:${row.id}`,
      source: `agent:${row.agent_id}`,
      target: `event:${row.id}`,
      label: "performed" as const,
      metadata: { source: "postgres_events" },
    }]

    if (row.project) {
      edges.push({
        id: `event:${row.id}->project:${row.project}`,
        source: `event:${row.id}`,
        target: `project:${row.project}`,
        label: "applies_to" as const,
        metadata: { source: "postgres_events" },
      })
    }

    return edges
  })

  return {
    nodes,
    edges: statsOnly ? [] : eventEdges,
    node_count: agentIds.length + projectIds.length + result.rows.length,
    total_edges: eventEdges.length,
  }
}

function edgeLabel(type: string): "performed" | "resulted_in" | "generated" | "applies_to" | "connected_to" | "caused_by" {
  const normalized = type.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return EDGE_LABELS.has(normalized) ? normalized as ReturnType<typeof edgeLabel> : "connected_to"
}

export async function GET(request: NextRequest) {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) return unauthorizedResponse()
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck)

  // Resolve group_id from x-allura-group-id header (primary) or query param (fallback)
  const authUser = getAuthUser(request)
  const { searchParams } = new URL(request.url)

  // Primary: header-based scoping
  const headerGroupId = request.headers.get("x-allura-group-id")
  // Fallback: query parameter
  const queryGroupId = searchParams.get("group_id")
  // Use header first, then query param, then fall back to auth user's group
  const rawGroupId = headerGroupId || queryGroupId || authUser?.groupId

  if (!rawGroupId) {
    return NextResponse.json(
      { error: "group_id is required. Provide x-allura-group-id header or ?group_id= query parameter" },
      { status: 400 }
    )
  }

  let groupId: string
  try {
    groupId = validateGroupId(rawGroupId)
  } catch (error) {
    if (error instanceof GroupIdValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }

  const statsOnly = searchParams.get("stats") === "true"

  try {
    const pool = getPool()

    if (statsOnly) {
      // Return counts only
      const [nodeCountResult, edgeCountResult] = await Promise.all([
        pool.query<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM graph_structural_nodes
           WHERE group_id = $1`,
          [groupId]
        ),
        pool.query<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM graph_structural_edges
           WHERE group_id = $1`,
          [groupId]
        ),
      ])

      const totalNodes = parseInt(nodeCountResult.rows[0]?.total ?? "0", 10)
      const totalEdges = parseInt(edgeCountResult.rows[0]?.total ?? "0", 10)

      return NextResponse.json({
        nodes: [],
        edges: [],
        node_count: totalNodes,
        total_edges: totalEdges,
      })
    }

    // Fetch edges with source and target nodes
    const edgeResult = await pool.query<{
      edge_id: string;
      source_id: string;
      source_label: string;
      source_props: Record<string, unknown>;
      target_id: string;
      target_label: string;
      target_props: Record<string, unknown>;
      edge_type: string;
      edge_props: Record<string, unknown>;
    }>(
      `SELECT
         e.edge_id, e.edge_type, e.props AS edge_props,
         sn.node_id AS source_id, sn.label AS source_label, sn.props AS source_props,
         tn.node_id AS target_id, tn.label AS target_label, tn.props AS target_props
       FROM graph_structural_edges e
       JOIN graph_structural_nodes sn ON e.source_id = sn.node_id
       JOIN graph_structural_nodes tn ON e.target_id = tn.node_id
       WHERE e.group_id = $1
       LIMIT 150`,
      [groupId]
    )

    // Count total edges
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM graph_structural_edges WHERE group_id = $1`,
      [groupId]
    )
    const totalEdges = parseInt(countResult.rows[0]?.total ?? "0", 10)

    const nodeMap = new Map<string, { id: string; label: string; type: string; metadata: Record<string, unknown> }>()
    const edges: Array<{ id: string; source: string; target: string; label: ReturnType<typeof edgeLabel>; metadata: Record<string, unknown> }> = []

    for (const row of edgeResult.rows) {
      const sourceId = row.source_id
      const targetId = row.target_id

      const sourceProps = row.source_props || {}
      const targetProps = row.target_props || {}

      if (!nodeMap.has(sourceId)) {
        nodeMap.set(sourceId, {
          id: sourceId,
          label: String(sourceProps.name ?? sourceProps.title ?? sourceProps.content ?? sourceId).slice(0, 80),
          type: (row.source_label || "memory").toLowerCase(),
          metadata: {},
        })
      }
      if (!nodeMap.has(targetId)) {
        nodeMap.set(targetId, {
          id: targetId,
          label: String(targetProps.name ?? targetProps.title ?? targetProps.content ?? targetId).slice(0, 80),
          type: (row.target_label || "memory").toLowerCase(),
          metadata: {},
        })
      }

      edges.push({
        id: row.edge_id,
        source: sourceId,
        target: targetId,
        label: edgeLabel(row.edge_type),
        metadata: { relationship_type: row.edge_type },
      })
    }

    return NextResponse.json({
      nodes: Array.from(nodeMap.values()),
      edges,
      total_edges: totalEdges,
    })
  } catch (error) {
    // Log the error for debugging
    console.error("Failed to fetch memory graph:", error)

    try {
      const fallback = await loadPostgresEventGraph(groupId, statsOnly)
      return NextResponse.json({
        ...fallback,
        degraded: true,
        source: "postgres_events",
      })
    } catch (fallbackError) {
      console.error("Failed to fetch PostgreSQL event graph fallback:", fallbackError)
    }

    // Return 200 with degraded=true and empty data
    return NextResponse.json(
      {
        nodes: [],
        edges: [],
        total_edges: 0,
        degraded: true,
        error: error instanceof Error ? error.message : "Failed to fetch memory graph"
      },
      { status: 200 }
    )
  }
}

/**
 * Reject non-GET methods with 405 Method Not Allowed
 */
export async function POST() {
  return NextResponse.json({ error: "Method not allowed. Use GET." }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json({ error: "Method not allowed. Use GET." }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({ error: "Method not allowed. Use GET." }, { status: 405 })
}