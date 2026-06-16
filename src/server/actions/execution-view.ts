"use server"

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("execution-view action is server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"
import { listTenantAgents } from "@/lib/agents/tenant-roster"
import type {
  AgentState,
  AgentStatus,
  ExecutionOverview,
  RunSummary,
  TimelineBucket,
} from "./execution-view.types"

// Re-export types so existing server-side importers keep working.
// NOTE: "use server" modules may NOT export non-async values directly.
// Server-side callers that need TEAM_RAM_AGENTS should import from "./execution-view.types".
export type {
  AgentState,
  AgentStatus,
  ExecutionOverview,
  RunSummary,
  TeamRamAgent,
  TimelineBucket,
} from "./execution-view.types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}

// ── Main action ───────────────────────────────────────────────────────────────

/**
 * getExecutionOverview
 *
 * Fetches the live multi-agent execution state for the given group_id.
 * Agent roster is derived from mcp_tokens (DB-backed) — no hardcoded list.
 * Falls back to empty roster when DB is unreachable (honest empty, not fabricated).
 */
export async function getExecutionOverview(group_id: string): Promise<ExecutionOverview> {
  const fetchedAt = new Date().toISOString()

  const emptyOffline: ExecutionOverview = {
    agents: [],
    timeline: [],
    activeRuns: [],
    fetchedAt,
    online: false,
  }

  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return emptyOffline
  }

  try {
    const now = new Date()

    // ── 0. Load live agent roster from mcp_tokens ───────────────────────────
    let tenantAgents: Awaited<ReturnType<typeof listTenantAgents>> = []
    try {
      tenantAgents = await listTenantAgents(pool, group_id)
    } catch {
      // If mcp_tokens table doesn't exist yet, proceed with empty roster
    }

    const agentIds = tenantAgents.map((a) => a.name.toLowerCase())

    // ── 1. Active runs (running | paused | blocked status) ─────────────────
    const activeRunsResult = await pool.query<{
      id: string
      definition_id: string
      definition_name: string
      status: string
      actor_id: string | null
      started_at: Date
      state_json: Record<string, unknown>
    }>(
      `SELECT
         r.id,
         r.definition_id,
         COALESCE(d.name, r.definition_id) AS definition_name,
         r.status,
         r.actor_id,
         r.started_at,
         r.state_json
       FROM process_runs r
       LEFT JOIN process_definitions d
         ON d.id = r.definition_id
        AND d.revision = r.definition_revision
        AND d.group_id = r.group_id
       WHERE r.group_id = $1
         AND r.status IN ('running', 'paused', 'blocked')
       ORDER BY r.started_at DESC
       LIMIT 50`,
      [group_id],
    )

    const activeRuns: RunSummary[] = activeRunsResult.rows.map((row) => ({
      id: row.id,
      definitionName: row.definition_name,
      status: row.status,
      actorId: row.actor_id,
      startedAt: safeIso(row.started_at) ?? now.toISOString(),
    }))

    // Build a fast lookup: actor_id → run row
    const runByActor = new Map<
      string,
      (typeof activeRunsResult.rows)[number]
    >()
    for (const row of activeRunsResult.rows) {
      if (row.actor_id) {
        runByActor.set(row.actor_id.toLowerCase(), row)
      }
    }

    // ── 2. Recent agent events (last 30 min) ────────────────────────────────
    const windowStart = new Date(now.getTime() - 30 * 60 * 1000)

    const recentEventsResult = await pool.query<{
      agent_id: string
      event_type: string
      created_at: Date
    }>(
      `SELECT agent_id, event_type, created_at
       FROM events
       WHERE group_id = $1
         AND created_at >= $2
         AND agent_id IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5000`,
      [group_id, windowStart.toISOString()],
    )

    // Aggregate per agent: latest event type + timestamp
    const latestByAgent = new Map<string, { eventType: string; createdAt: string }>()
    for (const row of recentEventsResult.rows) {
      const key = row.agent_id.toLowerCase()
      if (!latestByAgent.has(key)) {
        latestByAgent.set(key, {
          eventType: row.event_type,
          createdAt: safeIso(row.created_at) ?? now.toISOString(),
        })
      }
    }

    // Build timeline buckets: 30 per agent (one per minute) — only for known agents
    const timelineMap = new Map<string, number[]>()
    for (const agentId of agentIds) {
      timelineMap.set(agentId, new Array<number>(30).fill(0))
    }
    // Also include any agent that had recent events (even if not in mcp_tokens yet)
    for (const row of recentEventsResult.rows) {
      const key = row.agent_id.toLowerCase()
      if (!timelineMap.has(key)) {
        timelineMap.set(key, new Array<number>(30).fill(0))
      }
    }

    for (const row of recentEventsResult.rows) {
      const key = row.agent_id.toLowerCase()
      const eventTime = new Date(row.created_at).getTime()
      const offsetMs = eventTime - windowStart.getTime()
      const minuteOffset = Math.min(29, Math.floor(offsetMs / 60000))
      if (minuteOffset >= 0) {
        const buckets = timelineMap.get(key)!
        buckets[minuteOffset]++
      }
    }

    const timeline: TimelineBucket[] = []
    for (const [agentId, buckets] of timelineMap) {
      for (let i = 0; i < 30; i++) {
        if (buckets[i] > 0) {
          timeline.push({ agentId, minuteOffset: i, eventCount: buckets[i] })
        }
      }
    }

    // ── 3. Build AgentStatus for each agent in roster ──────────────────────
    // Include agents from mcp_tokens + any that have recent events
    const allAgentIds = new Set([
      ...agentIds,
      ...Array.from(latestByAgent.keys()),
      ...Array.from(runByActor.keys()),
    ])

    const agents: AgentStatus[] = Array.from(allAgentIds).map((agentId) => {
      const run = runByActor.get(agentId) ?? null
      const latest = latestByAgent.get(agentId) ?? null

      let state: AgentState = "idle"
      if (run) {
        state = run.status === "blocked" ? "blocked" : "active"
      } else if (latest) {
        const lastEventMs = new Date(latest.createdAt).getTime()
        const fiveMinAgo = now.getTime() - 5 * 60 * 1000
        if (lastEventMs > fiveMinAgo) {
          state = "active"
        }
      }

      let currentStep: number | null = null
      let elapsedMs: number | null = null

      if (run) {
        const stateJson = run.state_json
        if (typeof stateJson?.currentStepIndex === "number") {
          currentStep = stateJson.currentStepIndex
        }
        elapsedMs = now.getTime() - new Date(run.started_at).getTime()
      }

      return {
        agentId: agentId as AgentStatus["agentId"],
        state,
        activeRunId: run?.id ?? null,
        activeRunName: run?.definition_name ?? null,
        currentStep,
        totalSteps: null,
        elapsedMs,
        lastEventType: latest?.eventType ?? null,
        lastEventAt: latest?.createdAt ?? null,
      }
    })

    return {
      agents,
      timeline,
      activeRuns,
      fetchedAt,
      online: true,
    }
  } catch (err: unknown) {
    if (isConnectionError(err)) {
      return { ...emptyOffline, fetchedAt }
    }
    // Schema not yet migrated — return empty live state
    return {
      agents: [],
      timeline: [],
      activeRuns: [],
      fetchedAt,
      online: true,
    }
  }
}
