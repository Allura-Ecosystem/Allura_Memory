import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const user = {
  id: "dev-user-allura",
  email: "dev@allura.local",
  role: "admin" as const,
  groupId: "allura-system",
  workspaceId: "workspace-allura",
  sessionId: "dev:dev-user-allura",
}
const scope = { tenantId: "allura-system", workspaceId: "workspace-allura", principalId: "dev-user-allura" }

const { requireDashboardScope } = vi.hoisted(() => ({ requireDashboardScope: vi.fn() }))
const readService = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getWorkItems: vi.fn(),
  getTeams: vi.fn(),
  emptyWhen: vi.fn((state: { state: string; data?: unknown; fetchedAt?: string }, isEmpty: (data: unknown) => boolean) => (
    state.state === "live" && isEmpty(state.data)
      ? { state: "empty", fetchedAt: state.fetchedAt ?? "" }
      : state
  )),
}))

vi.mock("@/lib/dashboard/page-guard", () => ({ requireDashboardScope }))
vi.mock("@/lib/dashboard/read-service", () => readService)

afterEach(() => {
  vi.clearAllMocks()
})

describe("Mission Control page", () => {
  it("renders KPI cards for every real OverviewData field, not just three counters", async () => {
    requireDashboardScope.mockResolvedValue({ user, scope })
    readService.getOverview.mockResolvedValue({
      state: "live",
      data: { memories: 12, events: 34, proposals: 2, workItems: 7, graphMemories: 5 },
      fetchedAt: "2026-09-01T00:00:00.000Z",
    })
    readService.getWorkItems.mockResolvedValue({
      state: "live",
      data: [
        { id: "wi-1", title: "Ship founder demo", status: "blocked", priority: "high", projectId: "proj-1", updatedAt: "2026-09-28T00:00:00.000Z" },
        { id: "wi-2", title: "Review copy", status: "in_review", priority: "medium", projectId: "proj-1", updatedAt: "2026-09-27T00:00:00.000Z" },
        { id: "wi-3", title: "Done item", status: "done", priority: "low", projectId: "proj-1", updatedAt: "2026-09-26T00:00:00.000Z" },
      ],
      fetchedAt: "2026-09-01T00:00:00.000Z",
    })
    readService.getTeams.mockResolvedValue({ state: "live", data: [{ agentId: "woz", events: 5, lastSeen: "2026-09-28T00:00:00.000Z" }], fetchedAt: "2026-09-01T00:00:00.000Z" })

    const { default: MissionControlPage } = await import("@/app/dashboard/mission-control/page")
    const markup = renderToStaticMarkup(await MissionControlPage())

    // Real, server-derived numbers from OverviewData — every field, not a
    // fabricated runtime claim.
    expect(markup).toContain("12")
    expect(markup).toContain("34")
    expect(markup).toContain("2")
    expect(markup).toContain("7")
    expect(markup).toContain("5")

    // Attention/operational surface: the blocked work item should surface,
    // not just a flat counter.
    expect(markup.toLowerCase()).toContain("blocked")
    expect(markup).toContain("Ship founder demo")
  })

  it("labels demo/fixture workspaces explicitly instead of presenting them as production data", async () => {
    requireDashboardScope.mockResolvedValue({
      user: { ...user, workspaceId: "workspace-allura" },
      scope: { ...scope, workspaceId: "workspace-allura" },
    })
    readService.getOverview.mockResolvedValue({
      state: "live",
      data: { memories: 1, events: 1, proposals: 0, workItems: 1, graphMemories: 0 },
      fetchedAt: "2026-09-01T00:00:00.000Z",
    })
    readService.getWorkItems.mockResolvedValue({ state: "live", data: [], fetchedAt: "2026-09-01T00:00:00.000Z" })
    readService.getTeams.mockResolvedValue({ state: "live", data: [], fetchedAt: "2026-09-01T00:00:00.000Z" })

    const { default: MissionControlPage } = await import("@/app/dashboard/mission-control/page")
    const markup = renderToStaticMarkup(await MissionControlPage())

    expect(markup.toLowerCase()).toMatch(/fixture|demo/)
  })

  it("still renders a truthful empty state when there is no activity", async () => {
    requireDashboardScope.mockResolvedValue({ user, scope })
    readService.getOverview.mockResolvedValue({
      state: "live",
      data: { memories: 0, events: 0, proposals: 0, workItems: 0, graphMemories: 0 },
      fetchedAt: "2026-09-01T00:00:00.000Z",
    })
    readService.getWorkItems.mockResolvedValue({ state: "empty", fetchedAt: "2026-09-01T00:00:00.000Z" })
    readService.getTeams.mockResolvedValue({ state: "empty", fetchedAt: "2026-09-01T00:00:00.000Z" })

    const { default: MissionControlPage } = await import("@/app/dashboard/mission-control/page")
    const markup = renderToStaticMarkup(await MissionControlPage())

    expect(markup).toContain('data-surface-state="empty"')
  })

  it("renders a degraded state truthfully instead of fabricating data", async () => {
    requireDashboardScope.mockResolvedValue({ user, scope })
    readService.getOverview.mockResolvedValue({ state: "degraded", message: "connection refused" })
    readService.getWorkItems.mockResolvedValue({ state: "degraded", message: "connection refused" })
    readService.getTeams.mockResolvedValue({ state: "degraded", message: "connection refused" })

    const { default: MissionControlPage } = await import("@/app/dashboard/mission-control/page")
    const markup = renderToStaticMarkup(await MissionControlPage())

    expect(markup).toContain('data-surface-state="degraded"')
    expect(markup).toContain("connection refused")
  })
})
