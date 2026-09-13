import { renderToStaticMarkup } from "react-dom/server"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

type ShellProps = {
  user: unknown
  title?: string
  children?: ReactNode
}

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  }),
  requireDashboardScope: vi.fn(),
  DashboardShell: vi.fn((props: ShellProps) => props.children),
  DashboardDevicePairingApproval: vi.fn(() => null),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("@/lib/dashboard/page-guard", () => ({
  requireDashboardScope: mocks.requireDashboardScope,
}))
vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: mocks.DashboardShell,
}))
vi.mock("@/components/device-pairing/dashboard-device-pairing-approval", () => ({
  DashboardDevicePairingApproval: mocks.DashboardDevicePairingApproval,
}))

const user = {
  id: "operator-123",
  email: "operator@example.test",
  role: "admin" as const,
  groupId: "tenant-123",
  workspaceId: "workspace-123",
  sessionId: "session-123",
}

const TXN = "enr_txn_123abc"
const STATE = "state_xyz_456"

async function loadPage() {
  return (await import("@/app/dashboard/device-pairing/page")).default
}

describe("Story 29.20-R /dashboard/device-pairing server page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireDashboardScope.mockResolvedValue({ user, scope: {} })
  })

  it("uses server scope and wires valid txn/state into the approval form", async () => {
    const DevicePairingPage = await loadPage()

    const markup = renderToStaticMarkup(
      await DevicePairingPage({ searchParams: { txn: TXN, state: STATE } }),
    )

    expect(mocks.requireDashboardScope).toHaveBeenCalledWith("/dashboard/device-pairing")
    expect(mocks.DashboardShell).toHaveBeenCalledTimes(1)
    const shellProps = (mocks.DashboardShell.mock.calls as unknown as Array<[ShellProps]>)[0]?.[0]
    expect(shellProps).toMatchObject({ user })
    expect(mocks.DashboardDevicePairingApproval).toHaveBeenCalledTimes(1)
    const approvalProps = (
      mocks.DashboardDevicePairingApproval.mock.calls as unknown as Array<[
        { enrollment_transaction_id: string; pkce_state: string },
      ]>
    )[0]?.[0]
    expect(approvalProps).toEqual({
      enrollment_transaction_id: TXN,
      pkce_state: STATE,
    })
    expect(markup).toBe("")
  })

  it.each([
    ["a missing txn", { state: STATE }],
    ["a blank txn", { txn: "", state: STATE }],
    ["a missing state", { txn: TXN }],
    ["a blank state", { txn: TXN, state: "" }],
  ])("redirects to /dashboard for %s without rendering approval", async (_case, searchParams) => {
    const DevicePairingPage = await loadPage()

    await expect(DevicePairingPage({ searchParams })).rejects.toThrow("REDIRECT:/dashboard")

    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard")
    expect(mocks.DashboardDevicePairingApproval).not.toHaveBeenCalled()
  })
})
