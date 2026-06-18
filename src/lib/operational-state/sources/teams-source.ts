/**
 * Teams Source — hosted-tenant view (live).
 *
 * Reads REAL tenant data, not a static manifest:
 * 1. `workspaces` table       — one team per workspace in the org (group_id)
 * 2. `mcp_tokens` table        — the agents registered in each workspace
 * 3. Postgres `events` table   — per-agent activity in the last 24h
 *
 * Returns a SourceOutcome the operational-state contract maps to
 * ready / empty / stale / error / degraded. Connection failures → null (degraded);
 * query failures → { ok: false } (error). group_id scopes every read (ADR-001).
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("teams-source is server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import { validateGroupId } from "@/lib/validation/group-id"
import { isConnectionError } from "../utils/error-classifier"
import type { SourceOutcome } from "../index"

export interface TeamEntry {
  id: string
  name: string
  description: string
  /** The group_id (org tenant boundary) this workspace belongs to. */
  groupId: string
  status: "active" | "provisioned" | "spec"
  agents: Array<{
    id: string
    persona: string
    role: string
    category: string
    events24h: number
  }>
}

export interface TeamsSnapshot {
  groupId: string
  teams: TeamEntry[]
  totalAgents: number
  totalEvents24h: number
}

interface WorkspaceRow {
  workspace_id: string
  name: string
  lock_mode: string
}
interface TokenRow {
  id: string
  workspace_id: string
  agent_name: string
  scopes: string[]
  revoked_at: string | null
}

/**
 * Read live teams = workspaces + their MCP-token agents + 24h activity.
 */
export async function readTeams(
  groupId: string,
): Promise<SourceOutcome<TeamsSnapshot>> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
    validateGroupId(groupId)
  } catch {
    return null
  }

  try {
    const [workspaces, tokens, activity] = await Promise.all([
      pool.query<WorkspaceRow>(
        `SELECT workspace_id, name, lock_mode FROM workspaces WHERE group_id = $1 ORDER BY created_at ASC`,
        [groupId],
      ),
      pool.query<TokenRow>(
        `SELECT id, workspace_id, agent_name, scopes, revoked_at FROM mcp_tokens WHERE group_id = $1`,
        [groupId],
      ),
      pool.query<{ agent_id: string; event_count: string }>(
        `SELECT agent_id, COUNT(*) AS event_count
         FROM events
         WHERE group_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
         GROUP BY agent_id`,
        [groupId],
      ),
    ])

    const events24hByAgent = new Map<string, number>()
    for (const r of activity.rows) events24hByAgent.set(r.agent_id, Number(r.event_count))

    const tokensByWorkspace = new Map<string, TokenRow[]>()
    for (const t of tokens.rows) {
      const list = tokensByWorkspace.get(t.workspace_id) ?? []
      list.push(t)
      tokensByWorkspace.set(t.workspace_id, list)
    }

    let totalAgents = 0
    let totalEvents24h = 0
    const teams: TeamEntry[] = workspaces.rows.map((w) => {
      const wsTokens = tokensByWorkspace.get(w.workspace_id) ?? []
      const agents = wsTokens.map((t) => {
        const events24h = events24hByAgent.get(t.agent_name) ?? 0
        totalEvents24h += events24h
        return {
          id: t.id,
          persona: t.agent_name,
          role: t.revoked_at ? "revoked" : t.scopes.join(", ") || "no scopes",
          category: "mcp",
          events24h,
        }
      })
      totalAgents += agents.length
      return {
        id: w.workspace_id,
        name: w.name,
        description: `Workspace · lock: ${w.lock_mode} · ${agents.length} agent${agents.length === 1 ? "" : "s"}`,
        groupId,
        status: "active",
        agents,
      }
    })

    return {
      ok: true,
      data: { groupId, teams, totalAgents, totalEvents24h },
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    if (isConnectionError(err)) return null
    return { ok: false, error: "Teams query failed" }
  }
}

/**
 * Empty when the org has no workspaces yet — show onboarding (create a workspace).
 */
export function isTeamsEmpty(data: TeamsSnapshot): boolean {
  return data.teams.length === 0
}
