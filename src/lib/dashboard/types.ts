export type DashboardSourceLabel =
  | "health-api"
  | "memory-api"
  | "curator-api"
  | "graph-api"
  | "audit-api"
  | "settings-api"
  | "resource-manifest"
  | "kanban-api"
  | "agents-api"
  | "contracts-api"
  | "events-api"
  | "lineage-api"
  | "promotions-api"
  | "policies-api"
  | "operations-api"

export type DashboardTrustLevel = "authoritative" | "adapter" | "derived" | "unknown"
export type DashboardFreshnessStatus = "fresh" | "stale" | "unknown"

export type DashboardSource = {
  label: DashboardSourceLabel
  endpoint: string
  trustLevel: DashboardTrustLevel
}

export type DashboardFreshness = {
  observedAt: string
  status: DashboardFreshnessStatus
  message: string
}

export type DashboardResult<T> = {
  data: T
  error?: string
  degraded: boolean
  warnings: string[]
  source: DashboardSource
  freshness: DashboardFreshness
  groupId: string
}

export type DashboardRouteCategory =
  | "Mission Control"
  | "Memory"
  | "Agents"
  | "Governance"
  | "Operations"
  | "Settings"
  | "Legacy"

export type DashboardRouteId = string

export type DashboardRouteContract = {
  id: DashboardRouteId
  title: string
  category: DashboardRouteCategory
  eyebrow: string
  path: string
  source: DashboardSource
  purpose: string
  deferred: string
  evidencePath: string
}

export type DashboardPlaceholderState = {
  status: "unknown"
  route: string
  contract: string
}
