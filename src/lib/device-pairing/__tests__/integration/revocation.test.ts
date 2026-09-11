import { afterAll, beforeAll, expect, it } from "vitest";

import { createDeviceToken, revokeToken } from "@/lib/mcp-token/repository";
import { closePool } from "@/lib/postgres/connection";
import { createLiveDatabase, createSigningKey, seedApprovedDevice } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration revocation", () => {
  let db: MigrationDatabase;
  let originalDatabase: string | undefined;

  beforeAll(async () => {
    db = await createLiveDatabase("token-revocation");
    originalDatabase = process.env.POSTGRES_DB;
    process.env.POSTGRES_DB = db.databaseName;
    await closePool();
    await seedApprovedDevice(db, {
      groupId: "allura-live-revoke", workspaceId: "ws-live-revoke", principalId: "principal-live-revoke",
      deviceId: "dev-live-revoke", signingKey: createSigningKey("kid-revoke"),
    });
  }, 120_000);
  afterAll(async () => {
    await closePool();
    if (originalDatabase === undefined) delete process.env.POSTGRES_DB;
    else process.env.POSTGRES_DB = originalDatabase;
    await db?.close();
  });

  it("revokes an active device credential through the real tenant-bound repository update", async () => {
    const client = await db.owner.connect();
    try {
      const minted = await createDeviceToken(client, {
        paired_device_id: "dev-live-revoke", membership_role: "admin", lock_mode: "normal",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
      await expect(revokeToken(minted.record.id, "allura-live-revoke")).resolves.toBe(true);
      const row = await client.query("SELECT revoked_at FROM mcp_tokens WHERE id = $1", [minted.record.id]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0]?.revoked_at).toBeTruthy();
      await expect(revokeToken(minted.record.id, "allura-live-revoke")).resolves.toBe(false);
    } finally {
      client.release();
    }
  });
});
