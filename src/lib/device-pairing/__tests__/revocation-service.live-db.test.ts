import { afterAll, beforeAll, expect, it, vi } from "vitest"

import { issueChallenge } from "@/lib/device-pairing/challenge-service"
import { listApprovedDevices, markLostDevice, revokeDevice } from "@/lib/device-pairing/revocation-service"
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./migrations/postgres-test-harness"

const groupA = "allura-revoke-a"
const groupB = "allura-revoke-b"
const owner = { id: "owner-a", email: "owner@example.test", role: "viewer" as const, groupId: groupA, workspaceId: "ws-revoke-a", sessionId: "session-owner" }
const admin = { id: "admin-a", email: "admin@example.test", role: "viewer" as const, groupId: groupA, workspaceId: "ws-revoke-a", sessionId: "session-admin" }

async function deviceState(db: MigrationDatabase, id: string) {
  return db.owner.query<{ lifecycle_state: string; revoked_at: Date | null; lost_at: Date | null }>(
    "SELECT lifecycle_state, revoked_at, lost_at FROM paired_devices WHERE id = $1", [id],
  )
}

describeMigrationLive("Story 29.15 revocation service live PostgreSQL", () => {
  let db: MigrationDatabase

  beforeAll(async () => {
    db = await createMigrationDatabase("revocationsvc", "69-device-revocation-lifecycle.sql")
    await db.owner.query(`INSERT INTO workspaces (workspace_id, group_id, name) VALUES
      ('ws-revoke-a', $1, 'Revocation A'), ('ws-revoke-b', $2, 'Revocation B')`, [groupA, groupB])
    await db.owner.query(`INSERT INTO memberships (id, group_id, user_id, email, role) VALUES
      ('mem-owner', $1, 'owner-a', 'owner@example.test', 'viewer'),
      ('mem-admin', $1, 'admin-a', 'admin@example.test', 'admin')`, [groupA])
    await db.owner.query(`INSERT INTO paired_devices
      (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, lifecycle_state) VALUES
      ('dev-own', 'owner-a', $1, 'ws-revoke-a', 'Owner device', 'pub-own', 'kid-own', 'APPROVED'),
      ('dev-admin', 'other-a', $1, 'ws-revoke-a', 'Admin device', 'pub-admin', 'kid-admin', 'APPROVED'),
      ('dev-list', 'owner-a', $1, 'ws-revoke-a', 'List device', 'pub-list', 'kid-list', 'APPROVED'),
      ('dev-cross', 'other-b', $2, 'ws-revoke-b', 'Cross tenant', 'pub-cross', 'kid-cross', 'APPROVED'),
      ('dev-audit-fail', 'owner-a', $1, 'ws-revoke-a', 'Audit rollback', 'pub-audit', 'kid-audit', 'APPROVED'),
      ('dev-notify-fail', 'owner-a', $1, 'ws-revoke-a', 'Notify rollback', 'pub-notify', 'kid-notify', 'APPROVED')`, [groupA, groupB])
    await db.owner.query(`INSERT INTO mcp_tokens
      (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id) VALUES
      ('tok-own', $1, 'ws-revoke-a', 'owner-a', 'prefix-own', 'hash-own', ARRAY['memory:read'], 'dev-own'),
      ('tok-admin', $1, 'ws-revoke-a', 'other-a', 'prefix-admin', 'hash-admin', ARRAY['memory:read'], 'dev-admin'),
      ('tok-audit', $1, 'ws-revoke-a', 'owner-a', 'prefix-audit', 'hash-audit', ARRAY['memory:read'], 'dev-audit-fail'),
      ('tok-notify', $1, 'ws-revoke-a', 'owner-a', 'prefix-notify', 'hash-notify', ARRAY['memory:read'], 'dev-notify-fail')`, [groupA])
  }, 120_000)

  afterAll(async () => { await db?.close() })

  it("atomically revokes an owner's device and linked token, writes one audit, and makes all terminal replays inert", async () => {
    const notify = vi.fn(async () => undefined)
    await expect(revokeDevice(db.app, { device_id: "dev-own", authUser: owner }, { notify })).resolves.toEqual({ status: "REVOKED", device_id: "dev-own" })
    expect((await deviceState(db, "dev-own")).rows[0]).toMatchObject({ lifecycle_state: "REVOKED", revoked_at: expect.any(Date) })
    expect((await db.owner.query("SELECT revoked_at FROM mcp_tokens WHERE id = 'tok-own'")).rows[0]?.revoked_at).toEqual(expect.any(Date))
    expect((await db.owner.query("SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_REVOKED' AND metadata->>'device_id' = 'dev-own'")).rows).toEqual([{ count: "1" }])
    expect(notify).toHaveBeenCalledWith(expect.anything(), { event: "device_revoked", device_id: "dev-own", group_id: groupA })

    await expect(markLostDevice(db.app, { device_id: "dev-own", authUser: owner }, { notify })).resolves.toEqual({ status: "ALREADY_REVOKED", device_id: "dev-own" })
    await expect(issueChallenge(db.app, { device_id: "dev-own", purpose: "exchange" })).rejects.toMatchObject({ code: "DEVICE_NOT_APPROVED" })
    expect((await db.owner.query("SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_REVOKED' AND metadata->>'device_id' = 'dev-own'")).rows).toEqual([{ count: "1" }])
  })

  it("allows only an active same-tenant database admin and returns identical no-mutation 404 errors for missing/cross-tenant ids", async () => {
    await expect(markLostDevice(db.app, { device_id: "dev-admin", authUser: admin })).resolves.toEqual({ status: "LOST", device_id: "dev-admin" })
    expect((await deviceState(db, "dev-admin")).rows[0]).toMatchObject({ lifecycle_state: "LOST", lost_at: expect.any(Date) })

    for (const id of ["dev-cross", "dev-missing"]) {
      await expect(revokeDevice(db.app, { device_id: id, authUser: admin })).rejects.toMatchObject({ code: "DEVICE_NOT_FOUND" })
    }
    expect((await deviceState(db, "dev-cross")).rows[0]).toMatchObject({ lifecycle_state: "APPROVED" })
  })

  it("rolls back lifecycle state and token revocation when audit or notification fails", async () => {
    await expect(revokeDevice(db.app, { device_id: "dev-audit-fail", authUser: owner }, {
      emitAudit: async () => { throw new Error("forced audit failure") },
    })).rejects.toThrow("forced audit failure")
    await expect(revokeDevice(db.app, { device_id: "dev-notify-fail", authUser: owner }, {
      notify: async () => { throw new Error("forced notify failure") },
    })).rejects.toThrow("forced notify failure")

    expect((await deviceState(db, "dev-audit-fail")).rows[0]).toMatchObject({ lifecycle_state: "APPROVED", revoked_at: null })
    expect((await deviceState(db, "dev-notify-fail")).rows[0]).toMatchObject({ lifecycle_state: "APPROVED", revoked_at: null })
    expect((await db.owner.query("SELECT revoked_at FROM mcp_tokens WHERE id IN ('tok-audit', 'tok-notify') ORDER BY id")).rows).toEqual([{ revoked_at: null }, { revoked_at: null }])
  })

  it("lists only safe fields for the caller's still-approved devices", async () => {
    const devices = await listApprovedDevices(db.app, owner)
    expect(devices.map((device) => device.id)).toContain("dev-list")
    expect(devices.map((device) => device.id)).not.toEqual(expect.arrayContaining(["dev-own", "dev-admin"]))
    for (const device of devices) {
      expect(Object.keys(device).sort()).toEqual(["created_at", "display_label", "id", "last_exchange_at", "workspace_id"])
    }
  })
})
