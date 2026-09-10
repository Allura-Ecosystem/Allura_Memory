import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/device-pairing/audit", () => ({ emitDeviceAudit: vi.fn() }))

import { revokeDevice } from "@/lib/device-pairing/revocation-service"

const ADMIN = {
  id: "tenant-admin",
  email: "admin@example.com",
  role: "viewer" as const,
  groupId: "allura-tenant",
  workspaceId: "ws-tenant",
  sessionId: "session-admin",
}

type Fixture = {
  route?: "same" | "missing"
  membership?: { role: string } | null
  device?: { principal_id: string; lifecycle_state?: "APPROVED" | "REVOKED" | "LOST" } | null
}

function createPool(fixture: Fixture = {}) {
  const calls: string[] = []
  const client = {
    query: vi.fn(async (text: string) => {
      calls.push(text)
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") return { rows: [], rowCount: 0 }
      if (text.includes("FROM memberships")) return { rows: fixture.membership === undefined ? [{ role: "admin" }] : fixture.membership ? [fixture.membership] : [], rowCount: fixture.membership ? 1 : 0 }
      if (text.includes("resolve_device_lifecycle_context")) {
        return fixture.route === "missing"
          ? { rows: [], rowCount: 0 }
          : { rows: [{ group_id: "allura-tenant", workspace_id: "ws-tenant", principal_id: "device-owner" }], rowCount: 1 }
      }
      if (text.includes("FROM paired_devices") && text.includes("FOR UPDATE")) {
        const device = fixture.device === undefined
          ? { principal_id: "device-owner", lifecycle_state: "APPROVED" }
          : fixture.device
        return device
          ? { rows: [{ id: "dev-tenant", group_id: "allura-tenant", workspace_id: "ws-tenant", ...device }], rowCount: 1 }
          : { rows: [], rowCount: 0 }
      }
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(),
  }
  return { pool: { connect: vi.fn(async () => client) }, calls }
}

describe("Story 29.15 revocation authority boundary", () => {
  it("allows only an active same-tenant database admin to revoke another principal's device", async () => {
    const { pool, calls } = createPool({ membership: { role: "admin" } })

    await expect(revokeDevice(pool as never, { device_id: "dev-tenant", authUser: ADMIN })).resolves.toEqual({
      status: "REVOKED",
      device_id: "dev-tenant",
    })
    expect(calls.some((text) => text.includes("UPDATE paired_devices"))).toBe(true)
  })

  it("returns the same DEVICE_NOT_FOUND error for missing and cross-tenant route resolution without mutation", async () => {
    const missing = createPool({ route: "missing" })
    const crossTenant = createPool({ route: "missing" })

    for (const fixture of [missing, crossTenant]) {
      await expect(revokeDevice(fixture.pool as never, { device_id: "unavailable-device", authUser: ADMIN }))
        .rejects.toMatchObject({ name: "RevocationError", code: "DEVICE_NOT_FOUND" })
      expect(fixture.calls.some((text) => /UPDATE paired_devices|UPDATE mcp_tokens|pg_notify/.test(text))).toBe(false)
    }
  })

  it("rejects an inactive membership before device resolution, so every target gets the same safe response", async () => {
    const { pool, calls } = createPool({ membership: null })

    await expect(revokeDevice(pool as never, { device_id: "any-device-id", authUser: ADMIN }))
      .rejects.toMatchObject({ name: "RevocationError", code: "MEMBERSHIP_INACTIVE" })
    expect(calls.some((text) => text.includes("resolve_device_lifecycle_context"))).toBe(false)
    expect(calls.some((text) => /UPDATE paired_devices|UPDATE mcp_tokens|pg_notify/.test(text))).toBe(false)
  })
})
