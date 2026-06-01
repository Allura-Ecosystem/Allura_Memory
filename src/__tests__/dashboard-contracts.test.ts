import { describe, expect, it } from "vitest"

import {
  createDashboardApiAdapterResult,
  createPlaceholderDashboardResult,
  DASHBOARD_API_ADAPTER_CONTRACTS,
  DASHBOARD_ROUTE_CONTRACTS,
  DASHBOARD_ROUTE_GROUPS,
  getDashboardApiAdapterContract,
  getDashboardRouteContract,
  getDashboardRouteContractByPath,
  withDashboardGroupId,
} from "@/lib/dashboard"

describe("dashboard shell contracts", () => {
  it("exposes the Captain sidebar plan as contract-first placeholders", () => {
    expect(DASHBOARD_ROUTE_GROUPS).toEqual([
      "Mission Control",
      "Memory",
      "Agents",
      "Governance",
      "Operations",
      "Settings",
    ])

    expect(DASHBOARD_ROUTE_CONTRACTS.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/dashboard",
        "/dashboard/agent-status",
        "/dashboard/sessions",
        "/dashboard/scheduled-tasks",
        "/dashboard/memory-inbox",
        "/dashboard/episodic-memory",
        "/dashboard/semantic-memory",
        "/dashboard/knowledge-graph",
        "/dashboard/dreams",
        "/dashboard/promotions",
        "/dashboard/memory-search",
        "/dashboard/memory-analytics",
        "/dashboard/team-ram",
        "/dashboard/managed-agents",
        "/dashboard/agent-registry",
        "/dashboard/agent-contracts",
        "/dashboard/agent-skills",
        "/dashboard/audit-log",
        "/dashboard/memory-lineage",
        "/dashboard/gate-violations",
        "/dashboard/evidence-chains",
        "/dashboard/policy-center",
        "/dashboard/mcp-services",
        "/dashboard/model-routing",
        "/dashboard/api-health",
        "/dashboard/background-jobs",
        "/dashboard/logs",
        "/dashboard/tenant-configuration",
        "/dashboard/promotion-mode",
        "/dashboard/model-endpoints",
        "/dashboard/embedding-settings",
        "/dashboard/users-and-roles",
        "/dashboard/notifications",
      ])
    )
  })

  it("resolves planned route paths to their governance contracts", () => {
    expect(getDashboardRouteContractByPath("/dashboard/policy-center").source.endpoint).toBe("/api/policies")
    expect(getDashboardRouteContractByPath("/dashboard/memory-lineage").source.endpoint).toBe("/api/memory/lineage")
    expect(getDashboardRouteContractByPath("/dashboard/promotions").source.endpoint).toBe("/api/promotions")
  })

  it("marks shell routes degraded until live data is wired", () => {
    const result = createPlaceholderDashboardResult(getDashboardRouteContract("memory-search"), "2026-05-29T20:00:00.000Z")

    expect(result.groupId).toBe("allura-system")
    expect(result.degraded).toBe(true)
    expect(result.freshness.status).toBe("unknown")
    expect(result.source.endpoint).toBe("/api/memory")
    expect(result.warnings[0]).toContain("Honest placeholder")
  })

  it("keeps reset-era routes honest instead of reviving historical dashboard claims", () => {
    const allura = createPlaceholderDashboardResult(getDashboardRouteContract("allura"))
    const memorySpace = createPlaceholderDashboardResult(getDashboardRouteContract("memory-space"))

    expect(allura.data.status).toBe("unknown")
    expect(memorySpace.data.status).toBe("unknown")
    expect(allura.degraded).toBe(true)
    expect(memorySpace.degraded).toBe(true)
  })

  it("tracks missing Captain APIs as typed degraded adapter contracts", () => {
    expect(DASHBOARD_API_ADAPTER_CONTRACTS.map((contract) => contract.requiredEndpoint)).toEqual([
      "/api/events",
      "/api/contracts",
      "/api/memory/lineage",
      "/api/promotions",
      "/api/policies",
    ])

    const promotions = createDashboardApiAdapterResult(
      getDashboardApiAdapterContract("promotions"),
      "2026-05-31T23:10:00.000Z"
    )

    expect(promotions.groupId).toBe("allura-system")
    expect(promotions.degraded).toBe(true)
    expect(promotions.freshness.status).toBe("unknown")
    expect(promotions.data.requiredRequest).toBe("/api/promotions?group_id=allura-system")
    expect(promotions.data.alternatives.map((alternative) => alternative.request)).toContain(
      "/api/curator/proposals?status=all&group_id=allura-system"
    )
    expect(promotions.warnings.join(" ")).toContain("not implemented")
  })

  it("preserves group_id on dashboard API request templates without dropping existing filters", () => {
    expect(withDashboardGroupId("/api/audit/events?event_type=policy_violation")).toBe(
      "/api/audit/events?event_type=policy_violation&group_id=allura-system"
    )
    expect(withDashboardGroupId("/api/memory/graph?stats=true", "allura-system")).toBe(
      "/api/memory/graph?stats=true&group_id=allura-system"
    )
    expect(withDashboardGroupId("process.env.PROMOTION_MODE")).toBe("process.env.PROMOTION_MODE")
  })
})
