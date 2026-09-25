import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ guard: vi.fn(), read: vi.fn(), overview: vi.fn(), map: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/components/dashboard/dashboard-shell", () => ({ DashboardShell: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }))
vi.mock("@/lib/dashboard/read-service", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/dashboard/read-service")>(), getOverview: mocks.overview }))
vi.mock("@/lib/dashboard/page-guard", () => ({ requireDashboardScope: mocks.guard }))
vi.mock("@/lib/digital-brain/read-service", () => ({
  readAuthorizedWorkspaceState: mocks.read,
  mapAuthorizedWorkspaceProviderState: mocks.map,
}))

import DashboardOverviewPage from "../page"

const scope = {
  tenantId: "allura-epic30-local",
  workspaceId: "epic30-local-workspace",
  principalId: "owner-user",
}
const user = {
  id: scope.principalId, groupId: scope.tenantId, workspaceId: scope.workspaceId,
  role: "viewer" as const, sessionId: "dev:owner-user", email: "owner@example.invalid",
}
const document = {
  id: "epic30-owner-private", groupId: scope.tenantId, workspaceId: scope.workspaceId,
  ownerId: scope.principalId, departmentId: null, visibility: "private" as const,
  title: "Synthetic owner note", content: "Synthetic private content",
  updatedAt: new Date("2026-09-17T00:00:00.000Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("ALLURA_EPIC30_LOCAL_DB", "enabled")
  mocks.guard.mockResolvedValue({ scope, user })
  mocks.read.mockResolvedValue({ state: "complete", documents: [document] })
  mocks.map.mockImplementation((_scope, result) => result)
  mocks.overview.mockResolvedValue({ state: "live", data: { memories: 12, events: 3, proposals: 2, workItems: 1, graphMemories: 4 }, fetchedAt: "test" })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Epic30 dashboard server page", () => {
  it("renders the ordinary empty overview using its real empty-state conversion", async () => {
    vi.stubEnv("ALLURA_EPIC30_LOCAL_DB", undefined)
    mocks.overview.mockResolvedValue({ state: "live", data: { memories: 0, events: 0, proposals: 0, workItems: 0, graphMemories: 0 }, fetchedAt: "test" })
    const html = renderToStaticMarkup(await DashboardOverviewPage())
    expect(html).toContain("No governed records yet.")
    expect(html).toContain('data-surface-state="empty"')
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it("preserves unavailable ordinary overview state", async () => {
    vi.stubEnv("ALLURA_EPIC30_LOCAL_DB", undefined)
    mocks.overview.mockResolvedValue({ state: "degraded", message: "Dependency unavailable", fetchedAt: "test" })
    const html = renderToStaticMarkup(await DashboardOverviewPage())
    expect(html).toContain("Data temporarily unavailable.")
    expect(html).toContain('data-surface-state="degraded"')
    expect(html).not.toContain("Synthetic local test data")
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it("binds local HTML to the issued process nonce", async () => {
    vi.stubEnv("ALLURA_EPIC30_PROCESS_ID", "test-process-nonce")
    expect(renderToStaticMarkup(await DashboardOverviewPage())).toContain('data-epic30-process="test-process-nonce"')
  })
  it("forwards only server-issued scope and serializes document dates", async () => {
    const page = await DashboardOverviewPage()
    expect(mocks.guard).toHaveBeenCalledWith("/dashboard")
    expect(mocks.read).toHaveBeenCalledTimes(1)
    expect(mocks.read).toHaveBeenCalledWith(scope)
    expect(mocks.map).toHaveBeenCalledWith(scope, { state: "complete", documents: [document] })
    expect(page.props).toEqual({
      dataState: "complete", documents: [{ ...document, updatedAt: document.updatedAt.toISOString() }],
    })
    const html = renderToStaticMarkup(page)
    expect(html).toContain(document.content)
    expect(html).not.toContain("Local data unavailable")
  })

  it.each([
    ["production", "enabled"], ["development", undefined], ["development", "disabled"],
  ])("does not read with NODE_ENV=%s and local flag=%s", async (environment, flag) => {
    vi.stubEnv("NODE_ENV", environment)
    vi.stubEnv("ALLURA_EPIC30_LOCAL_DB", flag)
    const html = renderToStaticMarkup(await DashboardOverviewPage())
    expect(html).toContain("Memories")
    expect(html).toContain("12")
    expect(html).not.toContain("Synthetic local test data")
    expect(mocks.overview).toHaveBeenCalledWith(scope)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("renders successful empty reads distinctly from failed reads", async () => {
    mocks.read.mockResolvedValue({ state: "empty", documents: [] })
    const html = renderToStaticMarkup(await DashboardOverviewPage())
    expect(html).toContain("No authorized documents")
    expect(html).not.toContain("Local data unavailable")
  })

  it.each(["forbidden", "conflict", "degraded", "unavailable"] as const)(
    "renders the content-free %s service state without protected material",
    async (state) => {
      mocks.read.mockResolvedValue({ state, documents: [] })
      const html = renderToStaticMarkup(await DashboardOverviewPage())
      expect(html).toContain(`data-surface-state="${state}"`)
      expect(html).not.toContain(document.title)
      expect(html).not.toContain(document.content)
      expect(html).not.toContain(document.id)
    },
  )

  it("fails closed without leaking read errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.read.mockRejectedValue(new Error("sensitive connection details"))
    const html = renderToStaticMarkup(await DashboardOverviewPage())
    expect(html).toContain("Workspace unavailable")
    expect(html).not.toContain("sensitive connection details")
    expect(mocks.overview).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith("[Epic30] synthetic local database read unavailable")
  })

  it("does not swallow the identity guard redirect or read without identity", async () => {
    mocks.guard.mockRejectedValue(new Error("NEXT_REDIRECT:/login"))
    await expect(DashboardOverviewPage()).rejects.toThrow("NEXT_REDIRECT:/login")
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
