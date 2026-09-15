import { expect, it, vi } from "vitest"

import { listApprovedDevices } from "@/lib/device-pairing/revocation-service"

it("lists only safe approved device fields for the authenticated tenant principal", async () => {
  const client = {
    query: vi.fn(async (text: string) => {
      if (text.includes("FROM paired_devices")) {
        return { rows: [{ id: "dev-1", display_label: "Mac", workspace_id: "ws-owner", created_at: "2026-09-10T00:00:00.000Z", last_exchange_at: null }] }
      }
      return { rows: [] }
    }),
    release: vi.fn(),
  }
  const pool = { connect: vi.fn(async () => client) }

  const devices = await listApprovedDevices(pool as never, { id: "owner-1", groupId: "allura-owner", workspaceId: "ws-owner" } as never)

  expect(devices).toEqual([{ id: "dev-1", display_label: "Mac", workspace_id: "ws-owner", created_at: "2026-09-10T00:00:00.000Z", last_exchange_at: null }])
  const listQuery = client.query.mock.calls.find(([text]) => String(text).includes("FROM paired_devices"))
  expect(listQuery).toEqual([expect.stringContaining("group_id = $1 AND principal_id = $2 AND lifecycle_state = 'APPROVED'"), ["allura-owner", "owner-1"]])
  expect(String(listQuery?.[0])).not.toMatch(/current_key_id|current_public_key|pending_next|rotation_receipt/)
})
