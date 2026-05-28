import { describe, expect, it } from "vitest"

import {
  ALLURA_ROUTE_SECTIONS,
  assertDashboardNavigationPreservesAlluraSeparation,
  DASHBOARD_PANEL_CONTRACTS,
  DASHBOARD_ROUTE_CUTOVER_BOUNDARY,
  DASHBOARD_WORKFLOW_NAV_ITEMS,
  getAlluraRoutePolicy,
} from "@/lib/dashboard/allura-route"

describe("/allura route contract", () => {
  it("binds to the allura-brain adapter policy", () => {
    const policy = getAlluraRoutePolicy()

    expect(policy.adapter_id).toBe("allura-brain")
    expect(policy.route).toBe("/allura")
    expect(policy.system_of_record).toBe("allura-brain")
    expect(policy.read_policy.type).toBe("authenticated")
    expect(policy.write_policy.min_role).toBe("admin")
    expect(policy.degradation_behavior).toBe("warn")
    expect(policy.evidence_policy).toBe("full")
  })

  it("declares the first parity slice sections without sample data", () => {
    expect(ALLURA_ROUTE_SECTIONS.map((section) => section.id)).toEqual([
      "memories",
      "insights",
      "trace-logs",
      "provenance",
      "extracted-facts",
      "approval-queue",
    ])

    for (const section of ALLURA_ROUTE_SECTIONS) {
      expect(section.sourceOfTruth).toBe("allura-brain")
      expect(section.usesSampleData).toBe(false)
    }
  })
})

describe("/dashboard shell route contract", () => {
  it("declares the approved thin workflow navigation in visual-spec order", () => {
    expect(DASHBOARD_WORKFLOW_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Overview",
      "Memory Feed",
      "Graph",
      "Insights",
      "Evidence",
      "Agents",
      "Projects",
      "Skills",
      "Settings",
    ])

    for (const item of DASHBOARD_WORKFLOW_NAV_ITEMS) {
      expect(item.sourceOfTruth).toBe("dashboard-visual-spec-v2")
      expect(item.shellRole).toBe("thin-workflow-navigation")
    }
  })

  it("declares source and degraded behavior for every dashboard shell panel", () => {
    expect(DASHBOARD_PANEL_CONTRACTS.map((panel) => panel.id)).toEqual([
      "memory-search",
      "recent-memories",
      "approvals-provenance",
      "mission-board",
    ])

    for (const panel of DASHBOARD_PANEL_CONTRACTS) {
      expect(panel.backingSource).toBeTruthy()
      expect(panel.degradedBehavior).toMatch(/unknown|empty|unavailable|failed|pending/i)
      expect(panel.usesSampleData).toBe(false)
    }
  })

  it("keeps /dashboard workflow navigation from taking ownership of /allura", () => {
    expect(DASHBOARD_ROUTE_CUTOVER_BOUNDARY.dashboardRoute).toBe("/dashboard")
    expect(DASHBOARD_ROUTE_CUTOVER_BOUNDARY.alluraRoute).toBe("/allura")
    expect(DASHBOARD_ROUTE_CUTOVER_BOUNDARY.dashboardMayTargetAllura).toBe(false)

    expect(() => assertDashboardNavigationPreservesAlluraSeparation(DASHBOARD_WORKFLOW_NAV_ITEMS)).not.toThrow()
    expect(() =>
      assertDashboardNavigationPreservesAlluraSeparation([
        ...DASHBOARD_WORKFLOW_NAV_ITEMS,
        { id: "bad-allura", label: "Evidence", href: "/allura", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
      ])
    ).toThrow("/dashboard navigation cannot target /allura")
    expect(() =>
      assertDashboardNavigationPreservesAlluraSeparation([
        { id: "bad-allura-subpath", label: "Evidence", href: "/allura/mission", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
      ])
    ).toThrow("/dashboard navigation cannot target /allura")
    expect(() =>
      assertDashboardNavigationPreservesAlluraSeparation([
        { id: "bad-allura-fragment", label: "Evidence", href: "/allura#top", sourceOfTruth: "dashboard-visual-spec-v2", shellRole: "thin-workflow-navigation" },
      ])
    ).toThrow("/dashboard navigation cannot target /allura")
  })

  it("keeps the 3100 replacement blocked until Epic 5 cutover evidence exists", () => {
    expect(DASHBOARD_ROUTE_CUTOVER_BOUNDARY.protectedPort).toBe("3100")
    expect(DASHBOARD_ROUTE_CUTOVER_BOUNDARY.replacementStatus).toBe("blocked")
    expect(DASHBOARD_ROUTE_CUTOVER_BOUNDARY.unblockRequirement).toContain("Epic 5")
    expect(DASHBOARD_ROUTE_CUTOVER_BOUNDARY.requiredEvidence).toEqual([
      "route parity",
      "visual parity",
      "adapter/source-of-truth declarations",
      "auth validation",
      "smoke tests",
      "no-fabricated-data checks",
      "rollback documentation",
    ])
  })
})
