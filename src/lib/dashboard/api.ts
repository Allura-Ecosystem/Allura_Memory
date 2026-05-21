import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"

export const DASHBOARD_GROUP_ID = DEFAULT_GROUP_ID || "allura-system"

type QueryValue = string | number | boolean | null | undefined

export class DashboardApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string
  ) {
    super(message)
    this.name = "DashboardApiError"
  }
}

function resolveGroupId(groupId?: string): string {
  return groupId ?? getCurrentGroupId()
}

/**
 * Get current tenant group from auth context or defaults
 * This ensures all dashboard API calls respect tenant isolation
 */
function getCurrentGroupId(): string {
  // Try to read from cookies first (production Clerk auth)
  if (typeof document !== "undefined") {
    const cookie = document.cookie.match(/x-allura-group-id=([^;]+)/)
    if (cookie?.[1]) return cookie[1]
  }
  return DASHBOARD_GROUP_ID
}

function withGroupId(params?: Record<string, QueryValue>, groupId?: string): URLSearchParams {
  const search = new URLSearchParams()
  search.set("group_id", resolveGroupId(groupId))
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value))
    }
  }
  return search
}

async function readJson<T>(path: string, init?: RequestInit): Promise<{ data: T; degraded: boolean; warning: string | null }> {
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const warning = response.headers.get("Warning")
  const degraded = response.status === 206 || Boolean(warning)
  const payload = await response.json().catch(() => null)

  if (!response.ok && response.status !== 206) {
    const message =
      payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `Request failed: ${response.status}`
    throw new DashboardApiError(message, response.status, path)
  }

  return { data: payload as T, degraded, warning }
}

export function getMemoryList(params?: Record<string, QueryValue>, groupId?: string) {
  return readJson<unknown>(`/api/memory?${withGroupId(params, groupId).toString()}`)
}

export function getMemoryById(id: string, groupId?: string) {
  return readJson<unknown>(`/api/memory/${encodeURIComponent(id)}?${withGroupId(undefined, groupId).toString()}`)
}

export function getMemoryCount(groupId?: string) {
  return readJson<{ count?: number }>(`/api/memory/count?${withGroupId(undefined, groupId).toString()}`)
}

export function getMemoryStats(groupId?: string) {
  return readJson<import("@/app/api/memory/stats/route").MemoryStats>(
    `/api/memory/stats?${withGroupId(undefined, groupId).toString()}`
  )
}

export function getTraces(params?: Record<string, QueryValue>, groupId?: string) {
  return readJson<{ traces?: unknown[] }>(`/api/memory/traces?${withGroupId(params, groupId).toString()}`)
}

export function getInsights(params?: Record<string, QueryValue>, groupId?: string) {
  return readJson<{ insights?: unknown[]; total?: number; has_more?: boolean }>(
    `/api/memory/insights?${withGroupId(params, groupId).toString()}`
  )
}

export function getInsightHistory(id: string, groupId?: string) {
  return readJson<{ history?: unknown[] }>(
    `/api/memory/insights/${encodeURIComponent(id)}/history?${withGroupId(undefined, groupId).toString()}`
  )
}

export function getCuratorProposals(params?: Record<string, QueryValue>, groupId?: string) {
  return readJson<{ proposals?: unknown[] }>(`/api/curator/proposals?${withGroupId(params, groupId).toString()}`)
}

export function getAuditEvents(params?: Record<string, QueryValue>, groupId?: string) {
  return readJson<{ events?: unknown[]; pagination?: { total?: number; has_more?: boolean } }>(
    `/api/audit/events?${withGroupId(params, groupId).toString()}`
  )
}

export function getDecisionEvents(params?: Record<string, QueryValue>, groupId?: string) {
  return readJson<{ events?: unknown[]; pagination?: { total?: number; has_more?: boolean } }>(
    `/api/audit/events?${withGroupId({ event_type: "ARCHITECTURE_DECISION", limit: 50, ...params }, groupId).toString()}`
  )
}

export function getHealth() {
  return readJson<unknown>("/api/health?detailed=true")
}

export function getHealthMetrics(groupId?: string) {
  const query = groupId?.trim() ? `?group_id=${encodeURIComponent(groupId.trim())}` : ""
  return readJson<{
    timestamp: string
    queue: { pending_count: number; oldest_age_hours: number; approved_24h: number; rejected_24h: number }
    recall: { search_available: boolean; last_latency_ms: number | null }
    storage: {
      postgres: { status: string; latency_ms: number; total_memories: number }
      neo4j: { status: string; latency_ms: number | null; total_nodes: number | null }
    }
    degraded: {
      neo4j_unavailable: number
      scope_error: number
      embedding_failures: number
      promotion_failures_24h: number
    }
    skills?: Array<{
      tool_name: string
      category: string
      calls_24h: number
      success_rate: number
      avg_latency_ms: number
      last_used: string | null
      trend: "up" | "down" | "flat"
    }>
  }>(`/api/health/metrics${query}`)
}

export function getGraph(params?: Record<string, QueryValue>, groupId?: string) {
  // Build headers with x-allura-group-id from auth context
  const headers: Record<string, string> = {}
  const currentGroupId = resolveGroupId(groupId)
  if (currentGroupId) {
    headers["x-allura-group-id"] = currentGroupId
  }

  // Use readJson with custom headers
  const url = `/api/memory/graph?${withGroupId(params, groupId).toString()}`

  // Direct fetch with headers instead of readJson to control header injection
  return fetchWithHeaders(url, {
    headers,
    cache: "no-store",
  })
}

/**
 * Custom fetch wrapper that sets headers properly
 * This avoids the API helper's header merging behavior
 */
async function fetchWithHeaders<T>(
  url: string,
  init?: RequestInit
): Promise<{ data: T; degraded: boolean; warning: string | null }> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const warning = response.headers.get("Warning")
  const degraded = response.status === 206 || Boolean(warning)
  const payload = await response.json().catch(() => null)

  if (!response.ok && response.status !== 206) {
    const message =
      payload && typeof payload === "object" && "error" in payload ? String(payload.error) : `Request failed: ${response.status}`
    throw new DashboardApiError(message, response.status, url)
  }

  return { data: payload as T, degraded, warning }
}

export async function approveProposal(
  proposalId: string,
  options?: { groupId?: string },
): Promise<void> {
  await readJson<unknown>("/api/curator/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proposal_id: proposalId,
      group_id: resolveGroupId(options?.groupId),
      decision: "approve",
    }),
  })
}

export async function rejectProposal(
  proposalId: string,
  rationaleOrOptions?: string | { groupId?: string; rationale?: string },
): Promise<void> {
  const rationale = (typeof rationaleOrOptions === "string" ? rationaleOrOptions : rationaleOrOptions?.rationale)?.trim()
  const groupId = typeof rationaleOrOptions === "string" ? undefined : rationaleOrOptions?.groupId

  if (!rationale) {
    throw new DashboardApiError("Rationale is required for rejection", 400, "/api/curator/reject")
  }

  await readJson<unknown>("/api/curator/reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proposal_id: proposalId,
      group_id: resolveGroupId(groupId),
      rationale,
    }),
  })
}
