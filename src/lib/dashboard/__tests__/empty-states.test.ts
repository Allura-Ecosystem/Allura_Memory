import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

import { buildDashboardRouteState, DASHBOARD_ROUTE_EMPTY_STATES } from "@/lib/dashboard/empty-states"

const repoRoot = resolve(__dirname, "../../../..")
const readRoute = (routeFile: string) => readFileSync(resolve(repoRoot, routeFile), "utf8")

describe("dashboard empty and degraded route states", () => {
  it("defines friendly empty-state guidance for every Story 2.3 route", () => {
    expect(Object.keys(DASHBOARD_ROUTE_EMPTY_STATES).sort()).toEqual([
      "agents",
      "builder",
      "dashboard",
      "insights",
      "memory-space",
    ])

    for (const state of Object.values(DASHBOARD_ROUTE_EMPTY_STATES)) {
      expect(state.title).not.toMatch(/success|healthy|clear/i)
      expect(state.description).toMatch(/empty|no |not yet|waiting|unavailable|verify|create|submit|check/i)
      expect(state.actionLabel).toMatch(/retry|check|create|submit|open|clear/i)
      expect(state.actionHref || state.retryLabel).toBeTruthy()
    }
  })

  it("returns retry guidance for degraded graph states without treating them as success", () => {
    const state = buildDashboardRouteState("memory-space", {
      kind: "degraded",
      reason: "Neo4j connection refused",
    })

    expect(state.title).toBe("Memory graph unavailable")
    expect(state.description).toContain("Neo4j connection refused")
    expect(state.retryLabel).toBe("Retry graph")
    expect(state.actionLabel).toBe("Check health")
    expect(state.actionHref).toBe("/dashboard/health")
    expect(state.tone).toBe("failed")
  })

  it("uses friendly degraded titles for every non-graph route", () => {
    expect(buildDashboardRouteState("agents", { kind: "degraded", reason: "Graph API failed" }).title).toBe(
      "Agents unavailable"
    )
    expect(buildDashboardRouteState("insights", { kind: "degraded", reason: "Curator API failed" }).title).toBe(
      "Insights unavailable"
    )
    expect(buildDashboardRouteState("builder", { kind: "degraded", reason: "Queue API failed" }).title).toBe(
      "Curator queue unavailable"
    )
    expect(buildDashboardRouteState("dashboard", { kind: "degraded", reason: "Dashboard API failed" }).title).toBe(
      "Dashboard data unavailable"
    )
  })

  it("keeps dashboard empty state action-oriented rather than celebratory", () => {
    const state = buildDashboardRouteState("dashboard", { kind: "empty" })

    expect(state.title).toBe("Workspace is blank")
    expect(state.description).toContain("Add a memory")
    expect(state.actionHref).toBe("/dashboard/builder")
    expect(state.tone).toBe("empty")
  })

  it("keeps the memory graph shell aligned to the warm v2 surface", () => {
    const source = readRoute("src/app/(main)/dashboard/memory-space/page.tsx")

    expect(source).not.toContain("border border-[var(--dashboard-border)] bg-slate-950")
    expect(source).not.toContain("bg-slate-900")
    expect(source).toContain("bg-[var(--dashboard-surface)]")
    expect(source).toContain("tokens.color.surface.subtle")
  })

  it("uses shared degraded state copy and retry guidance on the dashboard route", () => {
    const source = readRoute("src/app/(main)/dashboard/page.tsx")

    expect(source).toContain('buildDashboardRouteState("dashboard", { kind: "degraded"')
    expect(source).toContain("dashboardDegradedState.retryLabel")
    expect(source).toContain("dashboardDegradedState.actionLabel")
    expect(source).toContain("memoriesState?.degraded")
    expect(source).toContain("queueState?.degraded")
    expect(source).toContain("insightsState?.degraded")
  })

  it("treats degraded graph responses as degraded, not trustworthy empty data", () => {
    const source = readRoute("src/app/(main)/dashboard/memory-space/page.tsx")
    const agentsSource = readRoute("src/app/(main)/dashboard/agents/page.tsx")

    expect(source).toContain("if (data.degraded) {")
    expect(source).toContain("setGraphError(data.warning ?? \"Memory graph degraded\")")
    expect(agentsSource).toContain("if (state.error || state.degraded)")
    expect(agentsSource.indexOf("if (state.error || state.degraded)")).toBeLessThan(
      agentsSource.indexOf("nodes.length === 0")
    )

    expect(readRoute("src/app/(main)/dashboard/insights/page.tsx")).toContain("state.error || state.degraded")
    expect(readRoute("src/app/(main)/dashboard/builder/page.tsx")).toContain("queue.error || queue.degraded")
  })

  it("keeps insights grid aligned to the Figma v3 spec", () => {
    const source = readRoute("src/app/(main)/dashboard/insights/page.tsx")
    const querySource = readRoute("src/lib/dashboard/queries.ts")

    // Figma v3: grid of cards with seed fallback — no tabs
    expect(source).toContain("SEED")
    expect(source).toContain("InsightCard")
    expect(source).toContain("grid-cols")

    // Query layer still supports status filtering
    expect(querySource).toContain('if (status === "all")')
    expect(querySource).toContain('status === "pending" || status === "rejected"')
  })
})
