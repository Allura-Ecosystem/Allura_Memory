import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireDashboardScope: vi.fn(),
  getAppPool: vi.fn(),
  approveEnrollment: vi.fn(),
}))

vi.mock("@/lib/dashboard/page-guard", () => ({
  requireDashboardScope: mocks.requireDashboardScope,
}))

vi.mock("@/lib/postgres/connection", () => ({
  getAppPool: mocks.getAppPool,
}))

vi.mock("@/lib/device-pairing/approval-service", () => ({
  approveEnrollment: mocks.approveEnrollment,
}))

import { POST } from "../route"

describe("POST /dashboard/device-pairing/approve", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it("hands approved dashboard pairing form data to the server and redirects without exposing credentials", async () => {
    const principal = {
      id: "user_123",
      groupId: "group_123",
      workspaceId: "workspace_123",
      sessionId: "session_123",
      role: "admin",
      email: "operator@example.test",
    }
    const pool = { connect: vi.fn() }
    const callback = "allura-pairing://complete?code=authorization-code-must-not-reach-dashboard&state=state_123&txn=txn_123&completion_nonce=completion-nonce-must-not-reach-dashboard"
    const authorizationCode = "authorization-code-must-not-reach-dashboard"
    const completionNonce = "completion-nonce-must-not-reach-dashboard"

    mocks.requireDashboardScope.mockResolvedValue({ user: principal, scope: {} })
    mocks.getAppPool.mockReturnValue(pool)
    mocks.approveEnrollment.mockResolvedValue({
      enrollment_transaction_id: "txn_123",
      status: "APPROVED",
      authorization_code: authorizationCode,
      completion_nonce: completionNonce,
      callback: { type: "deep_link", url: callback },
    })

    const form = new FormData()
    form.set("txn", "txn_123")
    form.set("state", "state_123")

    const response = await POST(
      new Request("http://localhost/dashboard/device-pairing/approve", {
        method: "POST",
        body: form,
      }),
    )

    expect(mocks.requireDashboardScope).toHaveBeenCalledWith("/dashboard/device-pairing/approve")
    expect(mocks.approveEnrollment).toHaveBeenCalledWith(pool, {
      enrollment_transaction_id: "txn_123",
      pkce_state: "state_123",
      authUser: principal,
    })
    expect(response.status).toBe(303)
    expect(response.headers.get("location")).toBe(callback)

    const body = await response.text()
    expect(body).not.toContain(authorizationCode)
    expect(body).not.toContain(completionNonce)
  })

  it.each([
    ["missing txn", (form: FormData) => form.set("state", "state_123")],
    ["blank txn", (form: FormData) => {
      form.set("txn", "   ")
      form.set("state", "state_123")
    }],
    ["missing state", (form: FormData) => form.set("txn", "txn_123")],
    ["blank state", (form: FormData) => {
      form.set("txn", "txn_123")
      form.set("state", "   ")
    }],
    ["non-string txn", (form: FormData) => {
      form.set("txn", new Blob(["not-a-string"]), "txn.txt")
      form.set("state", "state_123")
    }],
    ["non-string state", (form: FormData) => {
      form.set("txn", "txn_123")
      form.set("state", new Blob(["not-a-string"]), "state.txt")
    }],
  ])("rejects %s before approval without issuing a callback", async (_case, populate) => {
    mocks.requireDashboardScope.mockResolvedValue({
      user: { id: "user_123", groupId: "group_123", workspaceId: "workspace_123", sessionId: "session_123", role: "admin" },
      scope: {},
    })
    const form = new FormData()
    populate(form)

    const response = await POST(
      new Request("http://localhost/dashboard/device-pairing/approve", { method: "POST", body: form }),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
    expect(mocks.getAppPool).not.toHaveBeenCalled()
    expect(mocks.approveEnrollment).not.toHaveBeenCalled()
    const invalidBody = await response.text()
    expect(invalidBody).not.toContain("authorization_code")
    expect(invalidBody).not.toContain("completion_nonce")
  })
})
