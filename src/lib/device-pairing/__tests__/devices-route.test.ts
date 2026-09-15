import { NextRequest } from "next/server"
import { expect, it, vi } from "vitest"

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn(() => "pool") }))
vi.mock("@/lib/device-pairing/revocation-service", () => ({ listApprovedDevices: vi.fn() }))

import { GET } from "@/app/api/device-pairing/devices/route"
import { listApprovedDevices } from "@/lib/device-pairing/revocation-service"

it("lists only safe authenticated-principal devices and ignores client selectors", async () => {
  vi.mocked(listApprovedDevices).mockResolvedValueOnce([{ id: "dev-1", display_label: "Mac", workspace_id: "ws-route", created_at: "2026-09-10T00:00:00.000Z", last_exchange_at: null }])
  const response = await GET(new NextRequest("http://localhost/api/device-pairing/devices?principal_id=evil&group_id=evil", {
    headers: { "x-allura-user-id": "owner-1", "x-allura-session-id": "sess-1", "x-allura-role": "viewer", "x-allura-group-id": "allura-route", "x-allura-workspace-id": "ws-route" },
  }))
  expect(response.status).toBe(200)
  expect(listApprovedDevices).toHaveBeenCalledWith("pool", expect.objectContaining({ id: "owner-1", groupId: "allura-route" }))
  expect(await response.json()).toEqual({ devices: [{ id: "dev-1", display_label: "Mac", workspace_id: "ws-route", created_at: "2026-09-10T00:00:00.000Z", last_exchange_at: null }] })
})
