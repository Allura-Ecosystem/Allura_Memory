/**
 * GET /api/agents
 *
 * Returns the agent roster derived from the mcp_tokens table (group_id-scoped),
 * merged with PostgreSQL activity data from the events table.
 *
 * Replaces the old filesystem walk of .opencode/agent/ — live DB data only.
 *
 * Graceful degradation: if PG is unavailable, returns [].
 */

import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"
import { getPool } from "@/lib/postgres/connection"
import { getGroupIdFromAuth } from "@/lib/auth/api-auth"
import { listTenantAgents } from "@/lib/agents/tenant-roster"

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("agents route can only be used server-side")
}

export interface Agent {
  id: string
  name: string
  model: string
  description: string
  skills: string[]
  eventCount: number
  lastActive: string | null
  status: "active" | "idle" | "offline"
  workspaceId: string
  active: boolean
}

/**
 * Determine status from lastActive ISO timestamp.
 * active  = event within last 5 minutes
 * idle    = event within last 24 hours
 * offline = older or no events
 */
function deriveStatus(lastActive: string | null): "active" | "idle" | "offline" {
  if (!lastActive) return "offline"
  const ms = Date.now() - new Date(lastActive).getTime()
  if (ms < 5 * 60 * 1000) return "active"
  if (ms < 24 * 60 * 60 * 1000) return "idle"
  return "offline"
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth

  // Resolve group_id from auth context or header
  const headerGroupId = request.headers.get("x-allura-group-id")
  const authGroupId = getGroupIdFromAuth(request)
  const groupId = headerGroupId ?? authGroupId ?? "allura-system"

  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return NextResponse.json([])
  }

  // Step 1: load agents from mcp_tokens
  let tenantAgents: Awaited<ReturnType<typeof listTenantAgents>> = []
  try {
    tenantAgents = await listTenantAgents(pool, groupId)
  } catch {
    return NextResponse.json([])
  }

  if (tenantAgents.length === 0) {
    return NextResponse.json([])
  }

  const agentNames = tenantAgents.map((a) => a.name)

  // Step 2: query PG for event activity — graceful degradation on error
  type PgRow = { agent_id: string; event_count: string; last_active: string | null }
  let pgRows: PgRow[] = []

  try {
    const result = await pool.query<PgRow>(
      `SELECT agent_id, COUNT(*)::text AS event_count, MAX(created_at)::text AS last_active
       FROM events
       WHERE group_id = $1 AND agent_id = ANY($2)
       GROUP BY agent_id`,
      [groupId, agentNames],
    )
    pgRows = result.rows
  } catch {
    // DB unavailable for activity — proceed with token-only data
  }

  // Build activity map keyed by agent_name
  const activity = new Map<string, { eventCount: number; lastActive: string | null }>()
  for (const row of pgRows) {
    activity.set(row.agent_id, {
      eventCount: parseInt(row.event_count, 10),
      lastActive: row.last_active ?? null,
    })
  }

  // Step 3: merge token data with activity
  const agents: Agent[] = tenantAgents.map((ta) => {
    const act = activity.get(ta.name)
    // Use token's last_used_at as a secondary activity signal
    const lastActive = act?.lastActive ?? ta.lastUsed
    return {
      id: ta.id,
      name: ta.name,
      model: "mcp",
      description: `Scopes: ${ta.scopes} · Workspace: ${ta.workspaceId}`,
      skills: [],
      eventCount: act?.eventCount ?? 0,
      lastActive,
      status: deriveStatus(lastActive),
      workspaceId: ta.workspaceId,
      active: ta.active,
    }
  })

  return NextResponse.json(agents)
}
