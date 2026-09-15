import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/device-pairing/audit", () => ({ emitDeviceAudit: vi.fn() }))

import { emitDeviceAudit } from "@/lib/device-pairing/audit"
import { markLostDevice, revokeDevice } from "@/lib/device-pairing/revocation-service"

const AUTH_USER = {
  id: "human-owner",
  email: "owner@example.com",
  role: "viewer" as const,
  groupId: "allura-owner",
  workspaceId: "ws-owner",
  sessionId: "sess-owner",
}

function createPool(options: { lifecycle?: "APPROVED" | "REVOKED" | "LOST" } = {}) {
  const lifecycle = options.lifecycle ?? "APPROVED"
  const calls: Array<{ text: string; params: unknown[] }> = []
  const client = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params })
      if (text.includes("resolve_device_lifecycle_context")) {
        return { rows: [{ group_id: "allura-owner", workspace_id: "ws-owner", principal_id: "human-owner", lifecycle_state: lifecycle }], rowCount: 1 }
      }
      if (text.includes("FROM paired_devices") && text.includes("FOR UPDATE")) {
        return { rows: [{ id: "dev-owner", group_id: "allura-owner", workspace_id: "ws-owner", principal_id: "human-owner", lifecycle_state: lifecycle }], rowCount: 1 }
      }
      if (text.includes("FROM memberships")) {
        return { rows: [{ role: "viewer" }], rowCount: 1 }
      }
      if (text.includes("UPDATE paired_devices")) return { rows: [{ id: "dev-owner" }], rowCount: 1 }
      if (text.includes("UPDATE mcp_tokens")) return { rows: [], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(),
  }
  return { pool: { connect: vi.fn(async () => client) }, client, calls }
}

describe("Story 29.15 revokeDevice", () => {
  beforeEach(() => vi.clearAllMocks())

  it("revokes an owner's approved device with tokens, notification, and audit in one transaction", async () => {
    const { pool, client, calls } = createPool()

    const result = await revokeDevice(pool as never, {
      device_id: "dev-owner",
      authUser: AUTH_USER,
    })

    expect(result).toEqual({ status: "REVOKED", device_id: "dev-owner" })
    expect(calls[0]?.text).toBe("BEGIN")
    expect(calls.find((call) => call.text.includes("resolve_device_lifecycle_context"))?.params).toEqual([
      "dev-owner", "allura-owner",
    ])
    expect(calls.filter((call) => call.text.includes("set_config('app.current_")).map((call) => call.params)).toEqual([
      ["allura-owner"], ["allura-owner"], ["human-owner"], ["ws-owner"], ["ws-owner"],
    ])
    expect(calls.find((call) => call.text.includes("FROM paired_devices") && call.text.includes("FOR UPDATE"))?.text).toContain("WHERE id = $1 AND group_id = $2")
    expect(calls.find((call) => call.text.includes("FROM memberships"))?.text).toContain("FOR UPDATE")
    expect(calls.find((call) => call.text.includes("UPDATE paired_devices"))?.params).toEqual(["REVOKED", "dev-owner", "allura-owner"])
    expect(calls.find((call) => call.text.includes("UPDATE mcp_tokens"))?.params).toEqual(["dev-owner", "allura-owner"])
    expect(calls.find((call) => call.text.includes("pg_notify"))?.params).toEqual([
      "device_cache_invalidation",
      JSON.stringify({ event: "device_revoked", device_id: "dev-owner", group_id: "allura-owner" }),
    ])
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      event_type: "DEVICE_REVOKED",
      group_id: "allura-owner",
      workspace_id: "ws-owner",
      agent_id: "human-owner",
      metadata: { device_id: "dev-owner", action: "revoke" },
    }))
    expect(calls.at(-1)?.text).toBe("COMMIT")
  })

  it("marks an owner's approved device LOST with the loss-specific timestamp, notification, and audit", async () => {
    const { pool, client, calls } = createPool()

    const result = await markLostDevice(pool as never, {
      device_id: "dev-owner",
      authUser: AUTH_USER,
    })

    expect(result).toEqual({ status: "LOST", device_id: "dev-owner" })
    expect(calls.find((call) => call.text.includes("UPDATE paired_devices"))?.params).toEqual(["LOST", "dev-owner", "allura-owner"])
    expect(calls.find((call) => call.text.includes("UPDATE paired_devices"))?.text).toContain("lost_at = NOW()")
    expect(calls.find((call) => call.text.includes("pg_notify"))?.params).toEqual([
      "device_cache_invalidation",
      JSON.stringify({ event: "device_marked_lost", device_id: "dev-owner", group_id: "allura-owner" }),
    ])
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      event_type: "DEVICE_MARKED_LOST",
      metadata: { device_id: "dev-owner", action: "mark_lost" },
    }))
  })

  it("returns ALREADY_REVOKED for either terminal state without a second mutation, notification, or audit", async () => {
    const { pool, calls } = createPool({ lifecycle: "LOST" })
    const { pool: markLostPool, calls: markLostCalls } = createPool({ lifecycle: "REVOKED" })

    const result = await revokeDevice(pool as never, { device_id: "dev-owner", authUser: AUTH_USER })
    const markLostResult = await markLostDevice(markLostPool as never, { device_id: "dev-owner", authUser: AUTH_USER })

    expect(result).toEqual({ status: "ALREADY_REVOKED", device_id: "dev-owner" })
    expect(markLostResult).toEqual({ status: "ALREADY_REVOKED", device_id: "dev-owner" })
    expect(calls.some((call) => /UPDATE paired_devices|UPDATE mcp_tokens|pg_notify/.test(call.text))).toBe(false)
    expect(markLostCalls.some((call) => /UPDATE paired_devices|UPDATE mcp_tokens|pg_notify/.test(call.text))).toBe(false)
    expect(emitDeviceAudit).not.toHaveBeenCalled()
    expect(calls.at(-1)?.text).toBe("COMMIT")
  })
})
