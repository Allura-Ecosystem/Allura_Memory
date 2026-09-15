import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { setMemberRole } from "@/lib/membership/repository";
import { closePool } from "@/lib/postgres/connection";
import { createMigrationDatabase, describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("Story 29.19 demotion atomic revoke against real PostgreSQL", () => {
  let db: MigrationDatabase;
  let originalDatabase: string | undefined;
  const groupId = "allura-demotion-atomic";
  const workspaceId = "ws-demotion-atomic";
  const principalId = "principal-demotion-atomic";
  const deviceId = "device-demotion-atomic";
  const tokenId = "token-demotion-atomic";

  beforeAll(async () => {
    db = await createMigrationDatabase("demotion-atomic", "70-paired-device-principal-immutability.sql");
    originalDatabase = process.env.POSTGRES_DB;
    process.env.POSTGRES_DB = db.databaseName;
    await closePool();
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'Demotion atomic workspace')", [workspaceId, groupId]);
    await db.owner.query("INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'admin')", [groupId, principalId, "demotion-atomic@integration.test"]);
    await db.owner.query(`INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo) VALUES ($1, $2, $3, $4, 'Demotion atomic device', 'public-key', 'kid-demotion-atomic', 'ecdsa-p256')`, [deviceId, principalId, groupId, workspaceId]);
    await db.owner.query(`INSERT INTO mcp_tokens (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id) VALUES ($1, $2, $3, $4, 'prefix-demotion-atomic', 'hash-demotion-atomic', ARRAY['admin:roles'], $5)`, [tokenId, groupId, workspaceId, principalId, deviceId]);
    await db.owner.query(`CREATE FUNCTION fail_demotion_device_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN RAISE EXCEPTION 'simulated device revocation failure'; END IF; RETURN NEW; END; $$`);
    await db.owner.query("CREATE TRIGGER fail_demotion_device_revocation BEFORE UPDATE OF revoked_at ON mcp_tokens FOR EACH ROW EXECUTE FUNCTION fail_demotion_device_revocation()");
  }, 120_000);

  afterAll(async () => {
    await closePool();
    if (originalDatabase === undefined) delete process.env.POSTGRES_DB;
    else process.env.POSTGRES_DB = originalDatabase;
    await db?.close();
  });

  it("leaves neither a demoted membership nor a revoked token visible when linked-token revocation fails", async () => {
    const observer = new Pool({ host: process.env.POSTGRES_HOST ?? "127.0.0.1", port: Number(process.env.POSTGRES_PORT ?? "5432"), database: db.databaseName, user: process.env.POSTGRES_USER ?? "ronin4life", password: process.env.POSTGRES_PASSWORD, max: 1 });
    try {
      await expect(setMemberRole(groupId, principalId, "viewer", "membership-admin")).rejects.toThrow("simulated device revocation failure");
      const result = await observer.query<{ role: string; revoked: boolean }>(`SELECT membership.role, token.revoked_at IS NOT NULL AS revoked FROM memberships AS membership JOIN paired_devices AS device ON device.group_id = membership.group_id AND device.principal_id = membership.user_id JOIN mcp_tokens AS token ON token.paired_device_id = device.id WHERE membership.group_id = $1 AND membership.user_id = $2 AND token.id = $3`, [groupId, principalId, tokenId]);
      expect(result.rows).toEqual([{ role: "admin", revoked: false }]);
    } finally {
      await observer.end();
    }
  });
});
