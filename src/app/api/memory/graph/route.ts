import { NextRequest, NextResponse } from "next/server"

import { forbiddenResponse, getAuthUser, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { readTransaction } from "@/lib/neo4j/connection"
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
 * Response (206 Partial Content + Warning header):
 *   Degraded mode — Neo4j unavailable, returns empty arrays but valid shape
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

function nodeType(labels: string[]): string {
  const joined = labels.join(" ").toLowerCase()
  if (joined.includes("agent")) return "agent"
  if (joined.includes("project")) return "project"
  if (joined.includes("insight")) return "insight"
  if (joined.includes("outcome")) return "outcome"
  if (joined.includes("event") || joined.includes("trace")) return "event"
  if (joined.includes("system")) return "system"
  return "memory"
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
    // Execute Neo4j query
    if (statsOnly) {
      const [nodeCountResult, edgeCountResult] = await Promise.all([
        readTransaction(async (tx) => {
          return await tx.run(
            `MATCH (node)
             WHERE node.group_id = $groupId
             RETURN count(node) AS total`,
            { groupId }
          )
        }),
        readTransaction(async (tx) => {
          return await tx.run(
            `MATCH (source)-[relationship]-(target)
             WHERE source.group_id = $groupId AND target.group_id = $groupId
             RETURN count(relationship) AS total`,
            { groupId }
          )
        }),
      ])

      const totalNodes = nodeCountResult.records[0]?.get("total")?.toNumber?.() ?? 0
      const totalEdges = edgeCountResult.records[0]?.get("total")?.toNumber?.() ?? 0

        // Return stats-only response (nodes: [], edges: [])
      return NextResponse.json({
        nodes: [],
        edges: [],
        node_count: totalNodes,
        total_edges: totalEdges,
      })
    }

    const [countResult, result] = await Promise.all([
      readTransaction(async (tx) => {
        return await tx.run(
          `MATCH (source)-[relationship]-(target)
           WHERE source.group_id = $groupId AND target.group_id = $groupId
           RETURN count(relationship) AS total`,
          { groupId }
        )
      }),
      readTransaction(async (tx) => {
        return await tx.run(
          `MATCH (source)-[relationship]-(target)
           WHERE source.group_id = $groupId AND target.group_id = $groupId
           RETURN source, relationship, target
           LIMIT 150`,
          { groupId }
        )
      }),
    ])

    const totalEdges = countResult.records[0]?.get("total")?.toNumber?.() ?? 0

    const nodeMap = new Map<string, { id: string; label: string; type: string; metadata: Record<string, unknown> }>()
    const edges: Array<{ id: string; source: string; target: string; label: ReturnType<typeof edgeLabel>; metadata: Record<string, unknown> }> = []

    for (const record of result.records) {
      const source = record.get("source")
      const target = record.get("target")
      const relationship = record.get("relationship")
      const sourceProps = source.properties as Record<string, unknown>
      const targetProps = target.properties as Record<string, unknown>
      const sourceId = String(sourceProps.id ?? source.elementId)
      const targetId = String(targetProps.id ?? target.elementId)
      nodeMap.set(sourceId, {
        id: sourceId,
        label: String(sourceProps.title ?? sourceProps.name ?? sourceProps.content ?? sourceId).slice(0, 80),
        type: nodeType(source.labels as string[]),
        metadata: {},
      })
      nodeMap.set(targetId, {
        id: targetId,
        label: String(targetProps.title ?? targetProps.name ?? targetProps.content ?? targetId).slice(0, 80),
        type: nodeType(target.labels as string[]),
        metadata: {},
      })
      edges.push({
        id: String(relationship.properties?.id ?? relationship.elementId),
        source: sourceId,
        target: targetId,
        label: edgeLabel(relationship.type),
        metadata: { relationship_type: relationship.type },
      })
    }

    const response = NextResponse.json({ nodes: Array.from(nodeMap.values()), edges, total_edges: totalEdges })
    // Mark degraded when Neo4j is unavailable (handled by Neo4j error handler)
    return response
  } catch (error) {
    // Log the error for debugging
    console.error("Failed to fetch memory graph:", error)

    try {
      const fallback = await loadPostgresEventGraph(groupId, statsOnly)
      const response = NextResponse.json({
        ...fallback,
        degraded: true,
        source: "postgres_events",
        warning: "Neo4j graph is unavailable; returning scoped PostgreSQL event graph fallback.",
      })
      const warningMsg = error instanceof Error
        ? `299 Allura "${error.message.replace(/"/g, "'")}; postgres_event_graph_fallback"`
        : '299 Allura "neo4j_unavailable; postgres_event_graph_fallback"'
      response.headers.set("Warning", warningMsg)
      return response
    } catch (fallbackError) {
      console.error("Failed to fetch PostgreSQL event graph fallback:", fallbackError)
    }

    // Return 200 with degraded=true and empty data instead of 500
    // This is the key change: degraded response instead of server error
    const response = NextResponse.json(
      { 
        nodes: [], 
        edges: [], 
        total_edges: 0,
        degraded: true,
        error: error instanceof Error ? error.message : "Failed to fetch memory graph"
      },
      { status: 200 }
    )
    // Add Warning header to indicate degraded state
    const warningMsg = error instanceof Error 
      ? `299 Allura "${error.message.replace(/"/g, "'")}"` 
      : '299 Allura "neo4j_unavailable"'
    response.headers.set("Warning", warningMsg)
    return response
  }
}

/**
 * Reject non-GET methods with 405 Method Not Allowed
 * (Story 2.8 — Pike Interface Gate: read-only GET only)
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
