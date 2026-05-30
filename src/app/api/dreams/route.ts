import { NextRequest } from "next/server"

import { emptyEnvelope, jsonEnvelope, optionsResponse, resolveDashboardRequest } from "@/lib/dashboard/api-response"
import { getPool } from "@/lib/postgres/connection"

type DreamRun = {
  id: string
  title: string
  status: "queued" | "running" | "review" | "done"
  agentId: string
  createdAt: string
  evidenceCount: number
}

type DreamsData = {
  stats: {
    activeRuns: number
    queuedTasks: number
    outputStores: number
    reviewGates: number
  }
  runs: DreamRun[]
  activity: Array<{ id: string; summary: string; createdAt: string }>
}

function statusFromRow(status: string, eventType: string): DreamRun["status"] {
  if (status === "completed") return "done"
  if (eventType.includes("review") || status === "pending") return "review"
  if (eventType.includes("queue")) return "queued"
  return "running"
}

export async function OPTIONS() {
  return optionsResponse()
}

export async function GET(request: NextRequest) {
  const resolved = resolveDashboardRequest(request)
  if (!resolved.ok) return resolved.response

  const endpoint = "/api/dreams"

  try {
    const result = await getPool().query<{
      id: number
      event_type: string
      agent_id: string
      status: string
      created_at: Date
      content: string | null
      evidence_count: string
    }>(
      `SELECT id,
              event_type,
              agent_id,
              status,
              created_at,
              COALESCE(metadata->>'content', metadata->>'summary', metadata->>'title') AS content,
              COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(metadata->'evidence') = 'array' THEN metadata->'evidence' ELSE '[]'::jsonb END), 0)::text AS evidence_count
       FROM events
       WHERE group_id = $1
         AND (event_type ILIKE '%dream%' OR event_type ILIKE '%synth%' OR event_type ILIKE '%reflection%')
       ORDER BY created_at DESC
       LIMIT 12`,
      [resolved.groupId]
    )

    const runs = result.rows.map((row) => ({
      id: String(row.id),
      title: row.content || row.event_type,
      status: statusFromRow(row.status, row.event_type),
      agentId: row.agent_id,
      createdAt: row.created_at.toISOString(),
      evidenceCount: Number(row.evidence_count),
    }))

    const data: DreamsData = {
      stats: {
        activeRuns: runs.filter((run) => run.status === "running").length,
        queuedTasks: runs.filter((run) => run.status === "queued").length,
        outputStores: runs.length,
        reviewGates: runs.filter((run) => run.status === "review").length,
      },
      runs,
      activity: runs.slice(0, 6).map((run) => ({
        id: run.id,
        summary: `${run.agentId}: ${run.title}`,
        createdAt: run.createdAt,
      })),
    }

    return jsonEnvelope({
      data,
      degraded: false,
      warnings: runs.length === 0 ? ["No dream synthesis traces found for this group_id."] : [],
      source: { label: "postgres-events", endpoint, trustLevel: "authoritative" },
      freshness: {
        observedAt: new Date().toISOString(),
        status: "fresh",
        message: "Read from Brain event traces filtered for synthesis and dream work.",
      },
      groupId: resolved.groupId,
    })
  } catch (error) {
    console.warn("[api/dreams] degraded response:", error)
    const data: DreamsData = {
      stats: { activeRuns: 0, queuedTasks: 0, outputStores: 0, reviewGates: 0 },
      runs: [],
      activity: [],
    }
    return jsonEnvelope(emptyEnvelope(endpoint, resolved.groupId, data, "Brain dream trace store unavailable."), 206)
  }
}
