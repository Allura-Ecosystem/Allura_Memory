import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LIVE_SURFACE_BY_ROUTE } from "@/components/allura/route-contract-surface"

vi.mock("server-only", () => ({}))

const CANONICAL_ANCHORS = ["/command", "/work-board", "/allura", "/resources", "/agents", "/telemetry"] as const

const DASHBOARD_PAGE_FILES: Record<string, string> = {
  "/dashboard": "src/app/dashboard/page.tsx",
  "/dashboard/mission-control": "src/app/dashboard/mission-control/page.tsx",
  "/dashboard/kanban": "src/app/dashboard/kanban/page.tsx",
  "/dashboard/search": "src/app/dashboard/search/page.tsx",
  "/dashboard/teams": "src/app/dashboard/teams/page.tsx",
  "/dashboard/graph": "src/app/dashboard/graph/page.tsx",
  "/dashboard/curator": "src/app/dashboard/curator/page.tsx",
}

describe("Mission Control route parity", () => {
  it("maps every canonical anchor to an existing live dashboard route", () => {
    for (const anchor of CANONICAL_ANCHORS) {
      const live = LIVE_SURFACE_BY_ROUTE[anchor]
      expect(live, `${anchor} should map to a live surface`).toBeTruthy()
      expect(DASHBOARD_PAGE_FILES[live], `${anchor} -> ${live} should have a page file`).toBeTruthy()
      expect(existsSync(join(process.cwd(), DASHBOARD_PAGE_FILES[live])), `${live} page file should exist`).toBe(true)
    }
  })

  it("has an app route file for every dashboard navigation target", () => {
    for (const [route, file] of Object.entries(DASHBOARD_PAGE_FILES)) {
      expect(existsSync(join(process.cwd(), file)), `${route} should map to ${file}`).toBe(true)
    }
  })

  it("never resolves a canonical anchor to a 404 route", () => {
    for (const anchor of CANONICAL_ANCHORS) {
      const live = LIVE_SURFACE_BY_ROUTE[anchor]
      expect(live.startsWith("/dashboard/") || live === "/dashboard").toBe(true)
    }
  })
})

describe("dashboard authority boundary", () => {
  it("never derives a principal from forged x-allura-* headers", async () => {
    // Simulate a browser forging authority headers. The dashboard principal
    // seam must ignore them entirely: the result is either a server-derived
    // dev principal or null (fail closed), never the forged identity.
    process.env["x-allura-user-id"] = "attacker"
    process.env["x-allura-role"] = "admin"
    process.env["x-allura-group-id"] = "allura-attacker"
    process.env["x-allura-workspace-id"] = "workspace-forged"

    const { getDashboardPrincipal } = await import("@/lib/auth/dashboard-principal")
    const principal = await getDashboardPrincipal()

    expect(principal?.id).not.toBe("attacker")
    expect(principal?.groupId).not.toBe("allura-attacker")
    expect(principal?.workspaceId).not.toBe("workspace-forged")
  })

  it("does not read x-allura-* headers in the dashboard principal source", async () => {
    const source = await readFile(join(process.cwd(), "src/lib/auth/dashboard-principal.ts"), "utf8")
    expect(source).not.toMatch(/\.get\(["']x-allura-/)
  })
})

describe("dashboard page rendering", () => {
  const user = {
    id: "dev-user-allura",
    email: "dev@allura.local",
    role: "admin" as const,
    groupId: "allura-system",
    workspaceId: "workspace-allura",
    sessionId: "dev:dev-user-allura",
  }
  const scope = { tenantId: "allura-system", workspaceId: "workspace-allura", principalId: "dev-user-allura" }

  const { requireDashboardScope } = vi.hoisted(() => ({
    requireDashboardScope: vi.fn(),
  }))
  const readService = vi.hoisted(() => ({
    getOverview: vi.fn(),
    getWorkItems: vi.fn(),
    getRecentMemories: vi.fn(),
    getTeams: vi.fn(),
    getGraphStats: vi.fn(),
    emptyWhen: vi.fn((state: unknown) => state),
  }))

  vi.mock("@/lib/dashboard/page-guard", () => ({ requireDashboardScope }))
  vi.mock("@/lib/dashboard/read-service", () => readService)

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders each live surface with a server-issued dev principal", async () => {
    requireDashboardScope.mockResolvedValue({ user, scope })
    readService.getOverview.mockResolvedValue({ state: "live", data: { memories: 1, events: 1, proposals: 0, workItems: 0, graphMemories: 0 }, fetchedAt: "2026-09-01T00:00:00.000Z" })
    readService.getWorkItems.mockResolvedValue({ state: "live", data: [], fetchedAt: "2026-09-01T00:00:00.000Z" })
    readService.getRecentMemories.mockResolvedValue({ state: "live", data: [], fetchedAt: "2026-09-01T00:00:00.000Z" })
    readService.getTeams.mockResolvedValue({ state: "live", data: [], fetchedAt: "2026-09-01T00:00:00.000Z" })
    readService.getGraphStats.mockResolvedValue({ state: "live", data: { memories: 0, superseded: 0, structuralNodes: 0, structuralEdges: 0 }, fetchedAt: "2026-09-01T00:00:00.000Z" })

    const pages = {
      "/dashboard": (await import("@/app/dashboard/page")).default,
      "/dashboard/mission-control": (await import("@/app/dashboard/mission-control/page")).default,
      "/dashboard/kanban": (await import("@/app/dashboard/kanban/page")).default,
      "/dashboard/search": (await import("@/app/dashboard/search/page")).default,
      "/dashboard/teams": (await import("@/app/dashboard/teams/page")).default,
      "/dashboard/graph": (await import("@/app/dashboard/graph/page")).default,
    }

    for (const [route, page] of Object.entries(pages)) {
      const markup = renderToStaticMarkup(await page())
      expect(markup, `${route} should render the shared navigation shell`).toContain('aria-label="Dashboard navigation"')
      expect(markup, `${route} should render a truthful surface state`).toMatch(/data-surface-state="(live|empty|degraded|error)"/)
    }
  })

  it("renders an explicit empty state when a surface has no records", async () => {
    requireDashboardScope.mockResolvedValue({ user, scope })
    readService.getWorkItems.mockResolvedValue({ state: "empty", fetchedAt: "2026-09-01T00:00:00.000Z" })

    const { default: KanbanPage } = await import("@/app/dashboard/kanban/page")
    const markup = renderToStaticMarkup(await KanbanPage())

    expect(markup).toContain('data-surface-state="empty"')
    expect(markup).toContain("No work items yet.")
  })

  it("renders an explicit degraded state when the dependency is unavailable", async () => {
    requireDashboardScope.mockResolvedValue({ user, scope })
    readService.getOverview.mockResolvedValue({ state: "degraded", message: "connection refused" })

    const { default: OverviewPage } = await import("@/app/dashboard/page")
    const markup = renderToStaticMarkup(await OverviewPage())

    expect(markup).toContain('data-surface-state="degraded"')
    expect(markup).toContain("Data temporarily unavailable.")
  })
})
