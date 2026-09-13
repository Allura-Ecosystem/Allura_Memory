/**
 * Story 29.20-R — DashboardDevicePairingApproval server-handoff contract (RED)
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DashboardDevicePairingApproval } from "@/components/device-pairing/dashboard-device-pairing-approval"

const TRANSACTION_ID = "enr_txn_123abc"
const STATE = "state_xyz_456"

describe("DashboardDevicePairingApproval", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("renders the approval server-handoff form without sensitive completion fields", () => {
    const { container } = render(
      <DashboardDevicePairingApproval
        enrollment_transaction_id={TRANSACTION_ID}
        pkce_state={STATE}
      />,
    )

    const form = container.querySelector("form")
    expect(form).not.toBeNull()
    expect(form?.getAttribute("method")).toBe("post")
    expect(form?.getAttribute("action")).toBe("/dashboard/device-pairing/approve")

    expect(
      (container.querySelector('input[type="hidden"][name="txn"]') as HTMLInputElement | null)?.value,
    ).toBe(TRANSACTION_ID)
    expect(
      (container.querySelector('input[type="hidden"][name="state"]') as HTMLInputElement | null)?.value,
    ).toBe(STATE)

    const approveButton = screen.getByRole("button", { name: "Approve" })
    expect(approveButton.getAttribute("type")).toBe("submit")

    expect(container.innerHTML).not.toContain("authorization_code")
    expect(container.innerHTML).not.toContain("completion_nonce")
  })

  it("does not use browser fetch when the approval form is submitted", () => {
    const { container } = render(
      <DashboardDevicePairingApproval
        enrollment_transaction_id={TRANSACTION_ID}
        pkce_state={STATE}
      />,
    )

    const form = container.querySelector("form")
    expect(form).not.toBeNull()

    fireEvent.submit(form!)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
