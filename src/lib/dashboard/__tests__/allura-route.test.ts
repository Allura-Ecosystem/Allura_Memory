import { describe, expect, it } from "vitest"

import {
  ALLURA_ROUTE_SECTIONS,
  DASHBOARD_PANEL_CONTRACTS,
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
      "Dashboard",
      "Memories",
      "Insights",
      "Trace logs",
      "Provenance",
      "Extracted",
      "Agents",
      "Approvals",
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
})
