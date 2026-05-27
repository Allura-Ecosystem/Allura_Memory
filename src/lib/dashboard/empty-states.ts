export type DashboardRouteStateId = "dashboard" | "memory-space" | "agents" | "insights" | "builder"

export type DashboardRouteStateTone = "empty" | "degraded" | "failed"

export interface DashboardRouteState {
  title: string
  description: string
  actionLabel: string
  actionHref?: string
  retryLabel?: string
  tone: DashboardRouteStateTone
}

export const DASHBOARD_ROUTE_EMPTY_STATES: Record<DashboardRouteStateId, DashboardRouteState> = {
  dashboard: {
    title: "Workspace is blank",
    description: "Add a memory or submit a proposal to begin building governed evidence.",
    actionLabel: "Create memory",
    actionHref: "/dashboard/skills",
    tone: "empty",
  },
  "memory-space": {
    title: "No memories match this view",
    description: "Clear search or filters, or verify Neo4j has scoped graph data before treating the graph as complete.",
    actionLabel: "Check health",
    actionHref: "/dashboard/health",
    retryLabel: "Retry graph",
    tone: "empty",
  },
  agents: {
    title: "No agents indexed yet",
    description: "Create your first memory with agent attribution, run onboarding, or check graph health if agents should already exist.",
    actionLabel: "Create first agent",
    actionHref: "/dashboard/skills",
    retryLabel: "Retry agents",
    tone: "empty",
  },
  insights: {
    title: "No insights found",
    description: "No insights match this status. Try a different tab, submit a proposal, or wait for the curator pipeline.",
    actionLabel: "Submit proposal",
    actionHref: "/dashboard/skills",
    retryLabel: "Retry insights",
    tone: "empty",
  },
  builder: {
    title: "No pending proposals",
    description: "The curator queue is empty. Submit a new proposal to see it here, or refresh if a proposal should be waiting.",
    actionLabel: "Open proposal form",
    actionHref: "/dashboard/skills",
    retryLabel: "Retry queue",
    tone: "empty",
  },
}

const DASHBOARD_ROUTE_DEGRADED_TITLES: Record<DashboardRouteStateId, string> = {
  dashboard: "Dashboard data unavailable",
  "memory-space": "Memory graph unavailable",
  agents: "Agents unavailable",
  insights: "Insights unavailable",
  builder: "Curator queue unavailable",
}

export function buildDashboardRouteState(
  route: DashboardRouteStateId,
  options: { kind: "empty" | "degraded"; reason?: string } = { kind: "empty" }
): DashboardRouteState {
  const base = DASHBOARD_ROUTE_EMPTY_STATES[route]

  if (options.kind === "empty") return base

  const reason = options.reason?.trim()
  const description = reason
    ? `${reason}. Retry the request or check system health before trusting this route.`
    : "This route could not load its backing data. Retry the request or check system health before trusting this route."

  if (route === "memory-space") {
    return {
      ...base,
      title: DASHBOARD_ROUTE_DEGRADED_TITLES[route],
      description,
      actionLabel: "Check health",
      actionHref: "/dashboard/health",
      retryLabel: "Retry graph",
      tone: "failed",
    }
  }

  return {
    ...base,
    title: DASHBOARD_ROUTE_DEGRADED_TITLES[route],
    description,
    actionLabel: "Check health",
    actionHref: "/dashboard/health",
    retryLabel: base.retryLabel ?? "Retry",
    tone: "degraded",
  }
}
