import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn(() => "pool") }))
vi.mock("@/lib/device-pairing/revocation-service", () => ({
  revokeDevice: vi.fn(),
  markLostDevice: vi.fn(),
}))

import { POST as markLost } from "@/app/api/device-pairing/mark-lost/route"
import { POST as revoke } from "@/app/api/device-pairing/revoke/route"
import { markLostDevice, revokeDevice } from "@/lib/device-pairing/revocation-service"

const headers = {
  "content-type": "application/json",
  "x-allura-user-id": "owner-1",
  "x-allura-session-id": "sess-1",
  "x-allura-role": "viewer",
  "x-allura-group-id": "allura-route",
  "x-allura-workspace-id": "ws-route",
}

describe("Story 29.15 lifecycle routes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("derives revoke authority from authenticated headers and strips client tenant selectors", async () => {
    vi.mocked(revokeDevice).mockResolvedValueOnce({ status: "REVOKED", device_id: "dev-1" })

    const response = await revoke(new NextRequest("http://localhost/api/device-pairing/revoke", {
      method: "POST", headers, body: JSON.stringify({ device_id: "dev-1", group_id: "allura-evil" }),
    }))

    expect(response.status).toBe(200)
    expect(revokeDevice).toHaveBeenCalledWith("pool", expect.objectContaining({
      device_id: "dev-1",
      authUser: expect.objectContaining({ id: "owner-1", groupId: "allura-route", role: "viewer" }),
    }))
  })

  it("uses the same authenticated-principal path for mark-lost and rejects missing authentication", async () => {
    vi.mocked(markLostDevice).mockResolvedValueOnce({ status: "LOST", device_id: "dev-1" })
    const success = await markLost(new NextRequest("http://localhost/api/device-pairing/mark-lost", {
      method: "POST", headers, body: JSON.stringify({ device_id: "dev-1" }),
    }))
    const denied = await markLost(new NextRequest("http://localhost/api/device-pairing/mark-lost", {
      method: "POST", headers: { "content-type": "application/json", "x-allura-user-id": "" }, body: JSON.stringify({ device_id: "dev-1" }),
    }))

    expect(success.status).toBe(200)
    expect(denied.status).toBe(401)
  })
})
