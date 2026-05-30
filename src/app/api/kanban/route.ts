import { NextRequest } from "next/server"

import { emptyEnvelope, jsonEnvelope, optionsResponse, resolveDashboardRequest } from "@/lib/dashboard/api-response"
import { getPool } from "@/lib/postgres/connection"

const KANBAN_LANES = [
  "intake",
  "ready",
  "claimed",
  "running",
  "evidence",
  "review",
  "rework",
  "approved",
  "blocked",
  "done",
] as const
type KanbanLane = (typeof KANBAN_LANES)[number]

type KanbanCard = {
  id: string
  identifier: string
  title: string
  description?: string
  lane: KanbanLane
  priority?: number
  ownerAgent?: string
  acceptanceCriteria: string[]
  blockedBy: Array<{ cardId: string; identifier?: string; reason?: string; status: "unresolved" | "resolved" }>
  evidence: Array<{
    id: string
    kind: "typecheck" | "test" | "i18n" | "review" | "pr" | "walkthrough"
    summary: string
    createdAt: string
    createdBy: string
    artifactUri?: string
  }>
  runAttempts: Array<never>
}

type KanbanData = {
  cards: KanbanCard[]
  summary: {
    totalCards: number
    byLane: Record<KanbanLane, number>
    overdueCount: number
  }
}

function normalizeLane(value: unknown): KanbanLane {
  return typeof value === "string" && KANBAN_LANES.includes(value as KanbanLane) ? (value as KanbanLane) : "ready"
}

function buildSummary(cards: KanbanCard[]): KanbanData["summary"] {
  const byLane = Object.fromEntries(KANBAN_LANES.map((lane) => [lane, 0])) as Record<KanbanLane, number>
  for (const card of cards) {
    byLane[card.lane] += 1
  }
  return { totalCards: cards.length, byLane, overdueCount: 0 }
}

export async function OPTIONS() {
  return optionsResponse()
}

export async function GET(request: NextRequest) {
  const resolved = resolveDashboardRequest(request)
  if (!resolved.ok) return resolved.response

  const endpoint = "/api/kanban"

  try {
    const result = await getPool().query<{
      id: number
      event_type: string
      agent_id: string
      status: string
      created_at: Date
      metadata: Record<string, unknown>
    }>(
      `SELECT id, event_type, agent_id, status, created_at, metadata
       FROM events
       WHERE group_id = $1
         AND (
           event_type ILIKE '%kanban%'
           OR event_type ILIKE '%story%'
           OR event_type ILIKE '%task%'
           OR event_type ILIKE '%governance%'
         )
       ORDER BY created_at DESC
       LIMIT 30`,
      [resolved.groupId]
    )

    const cards = result.rows.map((row, index) => {
      const metadata = row.metadata ?? {}
      const title =
        typeof metadata.title === "string"
          ? metadata.title
          : typeof metadata.summary === "string"
            ? metadata.summary
            : row.event_type
      const lane = normalizeLane(
        metadata.lane ?? (row.status === "completed" ? "done" : row.status === "failed" ? "blocked" : "review")
      )
      return {
        id: `brain-${row.id}`,
        identifier:
          typeof metadata.identifier === "string" ? metadata.identifier : `BRAIN-${String(index + 1).padStart(2, "0")}`,
        title,
        description: typeof metadata.content === "string" ? metadata.content : undefined,
        lane,
        priority: typeof metadata.priority === "number" ? metadata.priority : 2,
        ownerAgent: row.agent_id,
        acceptanceCriteria: ["Brain event is scoped by group_id.", "Evidence remains append-only."],
        blockedBy: [],
        evidence: [
          {
            id: `event-${row.id}`,
            kind: "walkthrough" as const,
            summary: `${row.event_type} ${row.status}`,
            createdAt: row.created_at.toISOString(),
            createdBy: row.agent_id,
          },
        ],
        runAttempts: [],
      }
    })

    const data: KanbanData = { cards, summary: buildSummary(cards) }

    return jsonEnvelope({
      data,
      degraded: false,
      warnings: cards.length === 0 ? ["No governed Kanban event traces found for this group_id."] : [],
      source: { label: "postgres-events", endpoint, trustLevel: "authoritative" },
      freshness: {
        observedAt: new Date().toISOString(),
        status: "fresh",
        message: "Read from Brain event traces shaped into the Kanban service contract.",
      },
      groupId: resolved.groupId,
    })
  } catch (error) {
    console.warn("[api/kanban] degraded response:", error)
    const data: KanbanData = { cards: [], summary: buildSummary([]) }
    return jsonEnvelope(emptyEnvelope(endpoint, resolved.groupId, data, "Brain Kanban event store unavailable."), 206)
  }
}
