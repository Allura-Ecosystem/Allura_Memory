import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"

import type {
  DashboardPlaceholderState,
  DashboardResult,
  DashboardRouteCategory,
  DashboardRouteContract,
  DashboardRouteId,
  DashboardSource,
} from "./types"

const source = {
  health: { label: "health-api", endpoint: "/api/health", trustLevel: "authoritative" },
  memory: { label: "memory-api", endpoint: "/api/memory", trustLevel: "authoritative" },
  graph: { label: "graph-api", endpoint: "/api/memory/graph", trustLevel: "authoritative" },
  curator: { label: "curator-api", endpoint: "/api/curator/proposals", trustLevel: "authoritative" },
  audit: { label: "audit-api", endpoint: "/api/audit/events", trustLevel: "authoritative" },
  events: { label: "events-api", endpoint: "/api/events", trustLevel: "adapter" },
  agents: { label: "agents-api", endpoint: "/api/agents", trustLevel: "authoritative" },
  contracts: { label: "contracts-api", endpoint: "/api/contracts", trustLevel: "adapter" },
  lineage: { label: "lineage-api", endpoint: "/api/memory/lineage", trustLevel: "adapter" },
  promotions: { label: "promotions-api", endpoint: "/api/promotions", trustLevel: "adapter" },
  policies: { label: "policies-api", endpoint: "/api/policies", trustLevel: "adapter" },
  kanban: { label: "kanban-api", endpoint: "/api/kanban", trustLevel: "authoritative" },
  settings: { label: "settings-api", endpoint: "settings-adapter-pending", trustLevel: "adapter" },
  operations: { label: "operations-api", endpoint: "operations-adapter-pending", trustLevel: "adapter" },
  manifest: { label: "resource-manifest", endpoint: ".opencode/runtime-contract.json", trustLevel: "adapter" },
} satisfies Record<string, DashboardSource>

function route(
  id: string,
  category: DashboardRouteCategory,
  title: string,
  path: string,
  routeSource: DashboardSource,
  purpose: string,
  deferred = "This route is reachable, but its full data workflow is not wired yet."
): DashboardRouteContract {
  return {
    id,
    title,
    category,
    eyebrow: category,
    path,
    source: routeSource,
    purpose,
    deferred,
    evidencePath: "docs/superpowers/plans/2026-05-31-memory-command-center-visual-api-integration-BRIEF.md",
  }
}

export const DASHBOARD_ROUTE_CONTRACTS: DashboardRouteContract[] = [
  route("overview", "Mission Control", "Overview", "/dashboard", source.health, "Show service status, queue freshness, and degraded state."),
  route("agent-status", "Mission Control", "Agent Status", "/dashboard/agent-status", source.agents, "Show managed agent activity, role state, and freshness."),
  route("sessions", "Mission Control", "Sessions", "/dashboard/sessions", source.events, "Review active and recent Allura operator sessions."),
  route("scheduled-tasks", "Mission Control", "Scheduled Tasks", "/dashboard/scheduled-tasks", source.kanban, "Track scheduled operational work and hand off governed background jobs."),
  route("memory-inbox", "Memory", "Memory Inbox", "/dashboard/memory-inbox", source.memory, "Review incoming episodic memory before curation."),
  route("episodic-memory", "Memory", "Episodic Memory", "/dashboard/episodic-memory", source.memory, "Browse append-only traces and raw memory evidence."),
  route("semantic-memory", "Memory", "Semantic Memory", "/dashboard/semantic-memory", source.graph, "Inspect promoted knowledge and semantic memory state."),
  route("knowledge-graph", "Memory", "Knowledge Graph", "/dashboard/knowledge-graph", source.graph, "Explore promoted memory relationships with provenance fallbacks."),
  route("dreams", "Memory", "Dreams", "/dashboard/dreams", source.events, "Surface background intelligence with evidence, lineage, confidence, and recommended actions."),
  route("promotions", "Memory", "Promotions", "/dashboard/promotions", source.promotions, "Review promotion history and governed approval state.", "Captain endpoint `/api/promotions` is not implemented yet; route must remain degraded until the adapter exists."),
  route("memory-search", "Memory", "Memory Search", "/dashboard/memory-search", source.memory, "Search memories with source, confidence, and relationship context."),
  route("memory-analytics", "Memory", "Memory Analytics", "/dashboard/memory-analytics", source.memory, "Show memory quality signals without fabricated vanity metrics."),
  route("team-ram", "Agents", "Team RAM", "/dashboard/team-ram", source.agents, "Show Team RAM implementation lanes and traceable activity."),
  route("managed-agents", "Agents", "Managed Agents", "/dashboard/managed-agents", source.agents, "Browse managed agents, state, skills, and recent activity."),
  route("agent-registry", "Agents", "Agent Registry", "/dashboard/agent-registry", source.agents, "Inspect registered agent definitions and runtime source."),
  route("agent-contracts", "Agents", "Agent Contracts", "/dashboard/agent-contracts", source.contracts, "Review agent permissions, boundaries, and contract drift.", "Captain endpoint `/api/contracts` is not implemented yet; route must remain degraded until the adapter exists."),
  route("agent-skills", "Agents", "Agent Skills", "/dashboard/agent-skills", source.manifest, "Inspect skill ownership, approval state, and runtime availability."),
  route("audit-log", "Governance", "Audit Log", "/dashboard/audit-log", source.audit, "Filter audit events, inspect receipts, and prepare evidence exports."),
  route("memory-lineage", "Governance", "Memory Lineage", "/dashboard/memory-lineage", source.lineage, "Trace memory from evidence through approval into promoted knowledge.", "Captain endpoint `/api/memory/lineage` is not implemented yet; route must remain degraded until the adapter exists."),
  route("gate-violations", "Governance", "Gate Violations", "/dashboard/gate-violations", source.events, "Review policy and validation failures from filtered event evidence."),
  route("evidence-chains", "Governance", "Evidence Chains", "/dashboard/evidence-chains", source.lineage, "Follow deep trace evidence across memories, proposals, and approvals.", "Captain endpoint `/api/memory/lineage` is not implemented yet; route must remain degraded until the adapter exists."),
  route("policy-center", "Governance", "Policy Center", "/dashboard/policy-center", source.policies, "Expose policy mode, thresholds, role gates, and governed controls.", "Captain endpoint `/api/policies` is not implemented yet; route must remain degraded until the adapter exists."),
  route("mcp-services", "Operations", "MCP Services", "/dashboard/mcp-services", source.operations, "Show MCP service availability and degraded capability state."),
  route("model-routing", "Operations", "Model Routing", "/dashboard/model-routing", source.settings, "Review model routing sources, endpoints, and fallback state."),
  route("api-health", "Operations", "API Health", "/dashboard/api-health", source.health, "Probe backend health without converting reachability into fake system health."),
  route("background-jobs", "Operations", "Background Jobs", "/dashboard/background-jobs", source.events, "Track background workers, scheduled jobs, and evidence-producing tasks."),
  route("logs", "Operations", "Logs", "/dashboard/logs", source.audit, "Review operational logs through governed audit/event evidence."),
  route("tenant-configuration", "Settings", "Tenant Configuration", "/dashboard/tenant-configuration", source.settings, "Show active tenant scope and isolation configuration."),
  route("promotion-mode", "Settings", "PROMOTION_MODE", "/dashboard/promotion-mode", source.policies, "Expose promotion mode from system state, not inference.", "Captain endpoint `/api/policies` is not implemented yet; route must remain degraded until the adapter exists."),
  route("model-endpoints", "Settings", "Model Endpoints", "/dashboard/model-endpoints", source.settings, "Show model and embedding endpoint configuration with freshness."),
  route("embedding-settings", "Settings", "Embedding Settings", "/dashboard/embedding-settings", source.settings, "Review embedding model, dimensions, and index state."),
  route("users-and-roles", "Settings", "Users and Roles", "/dashboard/users-and-roles", source.settings, "Inspect roles and access boundaries without bypassing auth."),
  route("notifications", "Settings", "Notifications", "/dashboard/notifications", source.settings, "Show notification routes and delivery health."),
  route("memories", "Legacy", "Memories", "/dashboard/memories", source.memory, "Legacy alias for Memory Search."),
  route("curator", "Legacy", "Curator", "/dashboard/curator", source.curator, "Legacy alias for Promotions."),
  route("governance", "Legacy", "Governance", "/dashboard/governance", source.audit, "Legacy alias for Policy Center."),
  route("graph", "Legacy", "Graph", "/dashboard/graph", source.graph, "Legacy alias for Knowledge Graph."),
  route("audit", "Legacy", "Audit", "/dashboard/audit", source.audit, "Legacy alias for Audit Log."),
  route("settings", "Legacy", "Settings", "/dashboard/settings", source.settings, "Legacy alias for Tenant Configuration."),
  route("memory-space", "Legacy", "Memory Space", "/dashboard/memory-space", source.memory, "Reset-era dashboard alias."),
  route("allura", "Legacy", "allura", "/allura", source.manifest, "Historical review route."),
]

export const DASHBOARD_ROUTE_GROUPS = ["Mission Control", "Memory", "Agents", "Governance", "Operations", "Settings"] as const

export function getDashboardRouteContract(id: DashboardRouteId): DashboardRouteContract {
  const contract = DASHBOARD_ROUTE_CONTRACTS.find((item) => item.id === id)
  if (!contract) {
    throw new Error(`Unknown dashboard route contract: ${id}`)
  }

  return contract
}

export function getDashboardRouteContractByPath(path: string): DashboardRouteContract {
  const normalizedPath = path.replace(/\/$/, "") || "/dashboard"
  const contract = DASHBOARD_ROUTE_CONTRACTS.find((item) => item.path === normalizedPath)
  if (!contract) {
    throw new Error(`Unknown dashboard route path: ${path}`)
  }

  return contract
}

export function createPlaceholderDashboardResult(
  contract: DashboardRouteContract,
  observedAt = new Date().toISOString()
): DashboardResult<DashboardPlaceholderState> {
  return {
    data: {
      status: "unknown",
      route: contract.path,
      contract: contract.purpose,
    },
    degraded: true,
    warnings: ["Honest placeholder: route is reachable, but live dashboard data is not wired yet."],
    source: contract.source,
    freshness: {
      observedAt,
      status: "unknown",
      message: "Route shell rendered from local contract; live data was not fetched.",
    },
    groupId: DEFAULT_GROUP_ID,
  }
}
