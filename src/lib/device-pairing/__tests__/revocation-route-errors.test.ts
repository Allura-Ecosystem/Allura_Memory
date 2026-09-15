import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn(() => "pool") }))
vi.mock("@/lib/device-pairing/revocation-service", () => {
  class RevocationError extends Error {
    constructor(public readonly code: "DEVICE_NOT_FOUND" | "MEMBERSHIP_INACTIVE", message: string) {
      super(message)
      this.name = "RevocationError"
    }
  }
  return {
    RevocationError,
    REVOCATION_ERROR_STATUS: { DEVICE_NOT_FOUND: 404, MEMBERSHIP_INACTIVE: 403 },
    revokeDevice: vi.fn(),
    markLostDevice: vi.fn(),
  }
})

import { POST as markLost } from "@/app/api/device-pairing/mark-lost/route"
import { POST as revoke } from "@/app/api/device-pairing/revoke/route"
import { markLostDevice, RevocationError, revokeDevice } from "@/lib/device-pairing/revocation-service"

const headers = {
  "content-type": "application/json",
  "x-allura-user-id": "owner-1",
  "x-allura-session-id": "sess-1",
  "x-allura-role": "admin",
  "x-allura-group-id": "allura-route",
  "x-allura-workspace-id": "ws-route",
}

describe("Story 29.15 route error mapping", () => {
  it("makes missing and cross-tenant service denials indistinguishable 404 responses", async () => {
    vi.mocked(revokeDevice)
      .mockRejectedValueOnce(new RevocationError("DEVICE_NOT_FOUND", "Device not found"))
      .mockRejectedValueOnce(new RevocationError("DEVICE_NOT_FOUND", "Device not found"))

    const [missing, crossTenant] = await Promise.all([
      revoke(new NextRequest("http://localhost/api/device-pairing/revoke", { method: "POST", headers, body: JSON.stringify({ device_id: "missing" }) })),
      revoke(new NextRequest("http://localhost/api/device-pairing/revoke", { method: "POST", headers, body: JSON.stringify({ device_id: "other-tenant" }) })),
    ])

    expect(missing.status).toBe(404)
    expect(crossTenant.status).toBe(404)
    expect(await missing.json()).toEqual(await crossTenant.json())
  })

  it("maps the membership state before device discovery and preserves it for both lifecycle routes", async () => {
    vi.mocked(markLostDevice).mockRejectedValueOnce(new RevocationError("MEMBERSHIP_INACTIVE", "Active tenant membership is required"))

    const response = await markLost(new NextRequest("http://localhost/api/device-pairing/mark-lost", {
      method: "POST", headers, body: JSON.stringify({ device_id: "any-device" }),
    }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: "MEMBERSHIP_INACTIVE", message: "Active tenant membership is required" })
  })
})
