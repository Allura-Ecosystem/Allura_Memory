import { NextRequest } from "next/server"

import { emptyEnvelope, jsonEnvelope, optionsResponse, resolveDashboardRequest } from "@/lib/dashboard/api-response"
import { getPool } from "@/lib/postgres/connection"

const POLICIES = [
  {
    id: "POL-001",
    name: "Tenant Isolation",
    status: "active",
    description: "Every Brain read and write is scoped by group_id.",
  },
  {
    id: "POL-002",
    name: "Budget Enforcement",
    status: "active",
    description: "Agent memory operations are budget-tracked and circuit-breaker guarded.",
  },
  {
    id: "POL-003",
    name: "Permission Tier",
    status: "active",
    description: "Routes require authenticated viewer, curator, or admin role checks.",
  },
  {
    id: "POL-004",
    name: "Actor Validation",
    status: "active",
    description: "Mutations carry an actor identity for audit provenance.",
  },
  {
    id: "POL-005",
    name: "Audit Trail",
    status: "active",
    description: "Kernel changes append events before completion is claimed.",
  },
  {
    id: "POL-006",
    name: "Debug Enforcement",
    status: "active",
    description: "Debug evidence stays sandboxed from canonical promotion.",
  },
]

type GovernanceEvent = {
  id: string
  eventType: string
  agentId: string
  status: string
  createdAt: string
}

type GovernanceData = {
  stats: {
    activePolicies: number
    violations24h: number
    overridesPending: number
    auditEvents24h: number
  }
  policies: typeof POLICIES
  events: GovernanceEvent[]
}

export async function OPTIONS() {
  return optionsResponse()
}

export async function GET(request: NextRequest) {
  const resolved = resolveDashboardRequest(request)
  if (!resolved.ok) return resolved.response

  const endpoint = "/api/governance"

  try {
    const pool = getPool()
    const [eventResult, violationResult, overrideResult] = await Promise.all([
      pool.query<{ id: number; event_type: string; agent_id: string; status: string; created_at: Date }>(
        `SELECT id, event_type, agent_id, status, created_at
         FROM events
         WHERE group_id = $1
         ORDER BY created_at DESC
         LIMIT 8`,
        [resolved.groupId]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM events
         WHERE group_id = $1
           AND created_at >= NOW() - INTERVAL '24 hours'
           AND (status = 'rejected' OR event_type ILIKE '%violation%' OR event_type ILIKE '%policy%fail%')`,
        [resolved.groupId]
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM canonical_proposals
         WHERE group_id = $1 AND status = 'pending'`,
        [resolved.groupId]
      ),
    ])

    const data: GovernanceData = {
      stats: {
        activePolicies: POLICIES.length,
        violations24h: Number(violationResult.rows[0]?.count ?? 0),
        overridesPending: Number(overrideResult.rows[0]?.count ?? 0),
        auditEvents24h: eventResult.rows.length,
      },
      policies: POLICIES,
      events: eventResult.rows.map((row) => ({
        id: String(row.id),
        eventType: row.event_type,
        agentId: row.agent_id,
        status: row.status,
        createdAt: row.created_at.toISOString(),
      })),
    }

    return jsonEnvelope({
      data,
      degraded: false,
      warnings: [],
      source: { label: "postgres-events", endpoint, trustLevel: "authoritative" },
      freshness: {
        observedAt: new Date().toISOString(),
        status: "fresh",
        message: "Read from Brain audit events and proposal queue.",
      },
      groupId: resolved.groupId,
    })
  } catch (error) {
    console.warn("[api/governance] degraded response:", error)
    const data: GovernanceData = {
      stats: { activePolicies: POLICIES.length, violations24h: 0, overridesPending: 0, auditEvents24h: 0 },
      policies: POLICIES,
      events: [],
    }
    return jsonEnvelope(
      emptyEnvelope(endpoint, resolved.groupId, data, "Brain audit store unavailable.", "ruvix-policy"),
      206
    )
  }
}
