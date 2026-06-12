/**
 * Teams Source: Phase 0 Story 8 (Teams surface goes live).
 *
 * Reads live team data from two sources:
 * 1. AGENT_MANIFEST — canonical TypeScript agent roster (Team RAM, etc.)
 * 2. Postgres `events` table — agent activity counts per group_id
 *
 * Returns a SourceOutcome that the operational-state contract maps to
 * ready / empty / stale / error / degraded. Connection/auth failures are
 * reported as `null` (degraded: source unreachable); genuine query failures
 * are reported as `{ ok: false }` (error). User-facing error text is
 * sanitized, never the raw driver message.
 *
 * IMPORTANT: This source reads from the AGENT_MANIFEST (static at build time
 * but canonical) plus live Postgres activity. The manifest is the single
 * source of truth for agent rosters per AD-15. The `allura-team-*` group_ids
 * referenced by some teams are LEGACY and must not leak into UI — only
 * `allura-system` is used for Postgres queries per the group_id invariant.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("teams-source is server-side only")
}

import { AGENT_MANIFEST, AGENTS_BY_CATEGORY, type AgentManifestEntry } from "@/lib/agents/agent-manifest"
import { getPool } from "@/lib/postgres/connection"
import type { SourceOutcome } from "../index"

export interface TeamEntry {
  id: string
  name: string
  description: string
  /** The group_id this team operates under. Only `allura-system` is queried for Postgres activity. */
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
  /** Total active agents across all teams */
  totalAgents: number
  /** Total events across all agents in the last 24h */
  totalEvents24h: number
}

/**
 * Build the canonical team roster from AGENT_MANIFEST.
 *
 * The manifest has categories: primary, core, code, support, utility.
 * We map these to teams:
 * - RAM = primary + code + support (the surgical team)
 * - Operations = core + utility (infrastructure, recon, helpers)
 */
function buildTeamRoster(): TeamEntry[] {
  const ramAgents: AgentManifestEntry[] = [
    ...(AGENTS_BY_CATEGORY.get("primary") ?? []),
    ...(AGENTS_BY_CATEGORY.get("code") ?? []),
    ...(AGENTS_BY_CATEGORY.get("support") ?? []),
  ]

  const opsAgents: AgentManifestEntry[] = [
    ...(AGENTS_BY_CATEGORY.get("core") ?? []),
    ...(AGENTS_BY_CATEGORY.get("utility") ?? []),
  ]

  return [
    {
      id: "ram",
      name: "RAM",
      description: "Surgical team — architecture, building, review, diagnostics",
      groupId: "allura-system",
      status: "active",
      agents: ramAgents.map((a) => ({
        id: a.id,
        persona: a.persona,
        role: a.role,
        category: a.category,
        events24h: 0, // filled in by Postgres query
      })),
    },
    {
      id: "ops",
      name: "Operations",
      description: "Infrastructure, recon, and utility agents",
      groupId: "allura-system",
      status: "active",
      agents: opsAgents.map((a) => ({
        id: a.id,
        persona: a.persona,
        role: a.role,
        category: a.category,
        events24h: 0,
      })),
    },
  ]
}

const UNREACHABLE = /ECONNREFUSED|password|authentication|getaddrinfo|ENOTFOUND|ETIMEDOUT|connection|terminated|pool/i

/**
 * Read live teams data — canonical manifest roster + Postgres activity.
 */
export async function readTeams(
  groupId: string,
): Promise<SourceOutcome<TeamsSnapshot>> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    // Cannot even construct a pool (missing config): degraded.
    return null
  }

  try {
    // Build the team roster from the canonical manifest
    const teams = buildTeamRoster()

    // Query Postgres for agent activity in the last 24h
    const result = await pool.query<{
      agent_id: string
      event_count: string
    }>(
      `SELECT agent_id, COUNT(*) AS event_count
       FROM events
       WHERE group_id = $1
         AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY agent_id`,
      [groupId],
    )

    // Build a lookup map from the query results
    const activityMap = new Map<string, number>()
    for (const row of result.rows) {
      activityMap.set(row.agent_id, Number(row.event_count))
    }

    // Merge activity counts into the team roster
    let totalEvents24h = 0
    for (const team of teams) {
      for (const agent of team.agents) {
        const count = activityMap.get(agent.id) ?? 0
        agent.events24h = count
        totalEvents24h += count
      }
    }

    const totalAgents = teams.reduce((sum, t) => sum + t.agents.length, 0)

    return {
      ok: true,
      data: {
        groupId,
        teams,
        totalAgents,
        totalEvents24h,
      },
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (UNREACHABLE.test(message)) {
      return null
    }
    return { ok: false, error: "Teams query failed" }
  }
}

/**
 * True when there are no teams with any activity.
 * A teams surface with no events at all is "empty" and should show onboarding.
 */
export function isTeamsEmpty(data: TeamsSnapshot): boolean {
  return data.totalEvents24h === 0
}