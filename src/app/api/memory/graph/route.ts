import { NextRequest, NextResponse } from "next/server"
import type { PoolClient } from "pg"

import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

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

async function loadPostgresEventGraph(db: PoolClient, groupId: string, workspaceId: string, statsOnly: boolean) {
  const result = await db.query<FallbackEventRow>(
    `SELECT id,
            event_type,
            agent_id,
            status,
            created_at,
            COALESCE(NULLIF(btrim(metadata->>'project'), ''), NULLIF(btrim(metadata->>'project_id'), '')) AS project
     FROM events
     WHERE group_id = $1 AND workspace_id = $2
     ORDER BY created_at DESC
     LIMIT 60`,
    [groupId, workspaceId]
  )

  const agentIds = Array.from(new Set(result.rows.map((row) => row.agent_id).filter(Boolean)))
  const projectIds = Array.from(
    new Set(result.rows.map((row) => row.project).filter((project): project is string => Boolean(project)))
  )

  const nodes = statsOnly
    ? []
    : [
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
    const edges: Array<{
      id: string
      source: string
      target: string
      label: ReturnType<typeof edgeLabel>
      metadata: Record<string, unknown>
    }> = [
      {
        id: `agent:${row.agent_id}->event:${row.id}`,
        source: `agent:${row.agent_id}`,
        target: `event:${row.id}`,
        label: "performed" as const,
        metadata: { source: "postgres_events" },
      },
    ]

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

function edgeLabel(
  type: string
): "performed" | "resulted_in" | "generated" | "applies_to" | "connected_to" | "caused_by" {
  const normalized = type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return EDGE_LABELS.has(normalized) ? (normalized as ReturnType<typeof edgeLabel>) : "connected_to"
}

export async function GET(request: NextRequest) {
  // Auth: require viewer or above role
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

  const statsOnly = searchParams.get("stats") === "true"

  try {
    return await withWorkspaceTransaction(
      { tenantId: groupId, workspaceId, principalId: roleCheck.user.id },
      async (db) => {
        if (statsOnly) {
          // Return counts only
          const [nodeCountResult, edgeCountResult] = await Promise.all([
            db.query<{ total: string }>(
              `SELECT COUNT(*) AS total
           FROM graph_structural_nodes
           WHERE group_id = $1 AND workspace_id = $2`,
              [groupId, workspaceId]
            ),
            db.query<{ total: string }>(
              `SELECT COUNT(*) AS total
           FROM graph_structural_edges
           WHERE group_id = $1 AND workspace_id = $2`,
              [groupId, workspaceId]
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
        const edgeResult = await db.query<{
          edge_id: string
          source_id: string
          source_label: string
          source_props: Record<string, unknown>
          target_id: string
          target_label: string
          target_props: Record<string, unknown>
          edge_type: string
          edge_props: Record<string, unknown>
        }>(
          `SELECT
         concat_ws(':', e.from_id, e.to_id, e.rel_type) AS edge_id,
         e.rel_type AS edge_type, e.props AS edge_props,
         sn.node_id AS source_id, sn.label AS source_label, sn.props AS source_props,
         tn.node_id AS target_id, tn.label AS target_label, tn.props AS target_props
       FROM graph_structural_edges e
       JOIN graph_structural_nodes sn ON e.from_id = sn.node_id
         AND sn.group_id = e.group_id AND sn.workspace_id = e.workspace_id
       JOIN graph_structural_nodes tn ON e.to_id = tn.node_id
         AND tn.group_id = e.group_id AND tn.workspace_id = e.workspace_id
       WHERE e.group_id = $1 AND e.workspace_id = $2
       LIMIT 150`,
          [groupId, workspaceId]
        )

        // Count total edges
        const countResult = await db.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM graph_structural_edges WHERE group_id = $1 AND workspace_id = $2`,
          [groupId, workspaceId]
        )
        const totalEdges = parseInt(countResult.rows[0]?.total ?? "0", 10)

        const nodeMap = new Map<
          string,
          { id: string; label: string; type: string; metadata: Record<string, unknown> }
        >()
        const edges: Array<{
          id: string
          source: string
          target: string
          label: ReturnType<typeof edgeLabel>
          metadata: Record<string, unknown>
        }> = []

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
      }
    )
  } catch (error) {
    console.error("Failed to fetch memory graph")

    try {
      const fallback = await withWorkspaceTransaction(
        { tenantId: groupId, workspaceId, principalId: roleCheck.user.id },
        (db) => loadPostgresEventGraph(db, groupId, workspaceId, statsOnly)
      )
      return NextResponse.json({
        ...fallback,
        degraded: true,
        source: "postgres_events",
      })
    } catch {
      console.error("Failed to fetch PostgreSQL event graph fallback")
    }

    // Return 200 with degraded=true and empty data
    return NextResponse.json(
      {
        nodes: [],
        edges: [],
        total_edges: 0,
        degraded: true,
        error: "Graph data is temporarily unavailable",
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
