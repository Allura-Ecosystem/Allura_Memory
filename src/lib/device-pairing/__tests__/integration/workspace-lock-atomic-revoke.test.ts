import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";

import { closePool } from "@/lib/postgres/connection";
import { setLockMode } from "@/lib/workspace/repository";
import { createMigrationDatabase, describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("Story 29.19 workspace-lock atomic revoke against real PostgreSQL", () => {
  let db: MigrationDatabase;
  let originalDatabase: string | undefined;
  const groupId = "allura-workspace-lock-atomic";
  const workspaceId = "ws-workspace-lock-atomic";
  const principalId = "principal-workspace-lock-atomic";
  const deviceId = "device-workspace-lock-atomic";
  const tokenId = "token-workspace-lock-atomic";

  beforeAll(async () => {
    db = await createMigrationDatabase("workspace-lock-atomic", "70-paired-device-principal-immutability.sql");
    originalDatabase = process.env.POSTGRES_DB;
    process.env.POSTGRES_DB = db.databaseName;
    await closePool();
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'Workspace lock atomic')", [workspaceId, groupId]);
    await db.owner.query("INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'admin')", [groupId, principalId, "workspace-lock-atomic@integration.test"]);
    await db.owner.query(`INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo) VALUES ($1, $2, $3, $4, 'Workspace lock atomic device', 'public-key', 'kid-workspace-lock-atomic', 'ecdsa-p256')`, [deviceId, principalId, groupId, workspaceId]);
    await db.owner.query(`INSERT INTO mcp_tokens (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id) VALUES ($1, $2, $3, $4, 'prefix-workspace-lock-atomic', 'hash-workspace-lock-atomic', ARRAY['memory:write'], $5)`, [tokenId, groupId, workspaceId, principalId, deviceId]);
    await db.owner.query(`CREATE FUNCTION fail_workspace_lock_device_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN RAISE EXCEPTION 'simulated workspace device revocation failure'; END IF; RETURN NEW; END; $$`);
    await db.owner.query("CREATE TRIGGER fail_workspace_lock_device_revocation BEFORE UPDATE OF revoked_at ON mcp_tokens FOR EACH ROW EXECUTE FUNCTION fail_workspace_lock_device_revocation()");
  }, 120_000);

  afterAll(async () => {
    await closePool();
    if (originalDatabase === undefined) delete process.env.POSTGRES_DB;
    else process.env.POSTGRES_DB = originalDatabase;
    await db?.close();
  });

  it("leaves neither full_lockdown nor a revoked token visible when linked-token revocation fails", async () => {
    const observer = new Pool({ host: process.env.POSTGRES_HOST ?? "127.0.0.1", port: Number(process.env.POSTGRES_PORT ?? "5432"), database: db.databaseName, user: process.env.POSTGRES_USER ?? "ronin4life", password: process.env.POSTGRES_PASSWORD, max: 1 });
    try {
      await expect(setLockMode(groupId, workspaceId, "full_lockdown")).rejects.toThrow("simulated workspace device revocation failure");
      const result = await observer.query<{ lock_mode: string; revoked: boolean }>(`SELECT workspace.lock_mode, token.revoked_at IS NOT NULL AS revoked FROM workspaces AS workspace JOIN mcp_tokens AS token ON token.workspace_id = workspace.workspace_id WHERE workspace.workspace_id = $1 AND workspace.group_id = $2 AND token.id = $3`, [workspaceId, groupId, tokenId]);
      expect(result.rows).toEqual([{ lock_mode: "normal", revoked: false }]);
    } finally {
      await observer.end();
    }
  });
});
