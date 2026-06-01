import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"

import type { DashboardResult, DashboardSource } from "./types"

export type DashboardApiAdapterId = "events" | "contracts" | "memory-lineage" | "promotions" | "policies"

export type DashboardApiAdapterStatus = "missing" | "partial"

export type DashboardApiAdapterMethod = "GET" | "POST"

export type DashboardApiAdapterAlternative = {
  endpoint: string
  method: DashboardApiAdapterMethod
  scope: "query" | "body" | "internal"
  notes: string
}

export type DashboardApiAdapterContract = {
  id: DashboardApiAdapterId
  title: string
  requiredEndpoint: string
  requiredMethod: DashboardApiAdapterMethod
  source: DashboardSource
  status: DashboardApiAdapterStatus
  purpose: string
  degradedReason: string
  alternatives: DashboardApiAdapterAlternative[]
  decisionNeeded: string
}

export type DashboardApiAdapterState = {
  adapterId: DashboardApiAdapterId
  status: DashboardApiAdapterStatus
  requiredRequest: string
  alternatives: Array<DashboardApiAdapterAlternative & { request: string }>
  decisionNeeded: string
}

function source(label: DashboardSource["label"], endpoint: string, trustLevel: DashboardSource["trustLevel"]): DashboardSource {
  return { label, endpoint, trustLevel }
}

export function withDashboardGroupId(endpoint: string, groupId = DEFAULT_GROUP_ID): string {
  if (!endpoint.startsWith("/api/")) {
    return endpoint
  }

  const [path, query = ""] = endpoint.split("?")
  const params = new URLSearchParams(query)
  params.set("group_id", groupId)

  return `${path}?${params.toString()}`
}

export const DASHBOARD_API_ADAPTER_CONTRACTS: DashboardApiAdapterContract[] = [
  {
    id: "events",
    title: "Events Adapter",
    requiredEndpoint: "/api/events",
    requiredMethod: "GET",
    source: source("events-api", "/api/events", "adapter"),
    status: "missing",
    purpose: "Back Audit Log, Gate Violations, Dreams, Sessions, Background Jobs, and event-filtered governance screens.",
    degradedReason: "Captain-required `/api/events` is not implemented.",
    alternatives: [
      {
        endpoint: "/api/audit/events",
        method: "GET",
        scope: "query",
        notes: "Authoritative audit event export route; supports filters and CSV but is not a general events contract.",
      },
    ],
    decisionNeeded: "Decide whether `/api/events` should alias `/api/audit/events` or become a normalized event feed with audit export as a sub-view.",
  },
  {
    id: "contracts",
    title: "Agent Contracts Adapter",
    requiredEndpoint: "/api/contracts",
    requiredMethod: "GET",
    source: source("contracts-api", "/api/contracts", "adapter"),
    status: "missing",
    purpose: "Back Agent Contracts with permissions, boundaries, model policy, skills, and contract drift state.",
    degradedReason: "Captain-required `/api/contracts` is not implemented; `/api/agents` is roster/activity only.",
    alternatives: [
      {
        endpoint: "/api/agents",
        method: "GET",
        scope: "query",
        notes: "Partial roster source. Current route hardcodes allura-system activity lookup and does not expose contract policy.",
      },
      {
        endpoint: ".opencode/agent/**",
        method: "GET",
        scope: "internal",
        notes: "File source for agent definitions; needs a governed API surface before the dashboard can treat it as live contracts.",
      },
    ],
    decisionNeeded: "Define the contracts schema before exposing permissions, allowed tools, routing policy, and drift findings.",
  },
  {
    id: "memory-lineage",
    title: "Memory Lineage Adapter",
    requiredEndpoint: "/api/memory/lineage",
    requiredMethod: "GET",
    source: source("lineage-api", "/api/memory/lineage", "adapter"),
    status: "missing",
    purpose: "Back Memory Lineage and Evidence Chains from trace to proposal to approval to promoted graph node.",
    degradedReason: "Captain-required `/api/memory/lineage` is not implemented.",
    alternatives: [
      {
        endpoint: "/api/memory/graph",
        method: "GET",
        scope: "query",
        notes: "Graph relationship source; not sufficient for trace/proposal/approval lifecycle lineage.",
      },
      {
        endpoint: "/api/memory/traces",
        method: "GET",
        scope: "query",
        notes: "Append-only trace source; does not include proposal approval or graph promotion joins.",
      },
      {
        endpoint: "/api/memory/insights",
        method: "GET",
        scope: "query",
        notes: "Insight source; use only after lineage schema defines evidence joins.",
      },
    ],
    decisionNeeded: "Define the lineage read model and join keys across traces, canonical_proposals, approval audit, and Neo4j nodes.",
  },
  {
    id: "promotions",
    title: "Promotions Adapter",
    requiredEndpoint: "/api/promotions",
    requiredMethod: "GET",
    source: source("promotions-api", "/api/promotions", "adapter"),
    status: "missing",
    purpose: "Back promotion history, approval queue status, and revocation/approval controls.",
    degradedReason: "Captain-required `/api/promotions` is not implemented; current curator routes are proposal-operation surfaces.",
    alternatives: [
      {
        endpoint: "/api/curator/proposals?status=all",
        method: "GET",
        scope: "query",
        notes: "Authoritative proposal listing when group_id is supplied; not a full promotion history contract.",
      },
      {
        endpoint: "/api/curator/approve",
        method: "POST",
        scope: "body",
        notes: "Mutation endpoint. Do not wire from dashboard until receipt requirements are defined.",
      },
      {
        endpoint: "/api/curator/reject",
        method: "POST",
        scope: "body",
        notes: "Mutation endpoint. Do not wire from dashboard until receipt requirements are defined.",
      },
    ],
    decisionNeeded: "Define promotion history and mutation receipt schemas before wiring dashboard approval/rejection controls.",
  },
  {
    id: "policies",
    title: "Policies Adapter",
    requiredEndpoint: "/api/policies",
    requiredMethod: "GET",
    source: source("policies-api", "/api/policies", "adapter"),
    status: "missing",
    purpose: "Back Policy Center, PROMOTION_MODE, thresholds, isolation, role gates, and governed policy controls.",
    degradedReason: "Captain-required `/api/policies` is not implemented; policy state is split across config, auth, isolation, and promotion-lock code.",
    alternatives: [
      {
        endpoint: "/api/health/isolation",
        method: "GET",
        scope: "query",
        notes: "Partial isolation health source only.",
      },
      {
        endpoint: "process.env.PROMOTION_MODE",
        method: "GET",
        scope: "internal",
        notes: "Configuration source, not an authenticated API contract.",
      },
      {
        endpoint: "src/lib/auth/roles.ts",
        method: "GET",
        scope: "internal",
        notes: "Role policy source, not a runtime dashboard API.",
      },
    ],
    decisionNeeded: "Define read-only policy status separately from any policy mutation semantics and required audit receipts.",
  },
]

export function getDashboardApiAdapterContract(id: DashboardApiAdapterId): DashboardApiAdapterContract {
  const contract = DASHBOARD_API_ADAPTER_CONTRACTS.find((item) => item.id === id)
  if (!contract) {
    throw new Error(`Unknown dashboard API adapter contract: ${id}`)
  }

  return contract
}

export function createDashboardApiAdapterResult(
  contract: DashboardApiAdapterContract,
  observedAt = new Date().toISOString(),
  groupId = DEFAULT_GROUP_ID
): DashboardResult<DashboardApiAdapterState> {
  return {
    data: {
      adapterId: contract.id,
      status: contract.status,
      requiredRequest: withDashboardGroupId(contract.requiredEndpoint, groupId),
      alternatives: contract.alternatives.map((alternative) => ({
        ...alternative,
        request: alternative.scope === "internal" ? alternative.endpoint : withDashboardGroupId(alternative.endpoint, groupId),
      })),
      decisionNeeded: contract.decisionNeeded,
    },
    degraded: true,
    warnings: [contract.degradedReason, "Adapter contract exists, but the dashboard must not render this as a live green state."],
    source: contract.source,
    freshness: {
      observedAt,
      status: "unknown",
      message: "Adapter contract is typed; live backend contract is missing or partial.",
    },
    groupId,
  }
}
