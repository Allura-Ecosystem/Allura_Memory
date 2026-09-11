import { afterAll, beforeAll, expect, it } from "vitest";

import { closePool } from "@/lib/postgres/connection";
import { setLockMode } from "@/lib/workspace/repository";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "../migrations/postgres-test-harness";

describeMigrationLive("Story 29.19 workspace lockdown against real PostgreSQL", () => {
  let db: MigrationDatabase;
  let originalDatabase: string | undefined;
  const groupId = "allura-workspace-lockdown";
  const workspaceId = "ws-workspace-lockdown";
  const principalId = "principal-workspace-lockdown";
  const deviceId = "device-workspace-lockdown";
  const tokenId = "token-workspace-lockdown";
  const nonDeviceTokenId = "token-workspace-lockdown-non-device";

  beforeAll(async () => {
    db = await createMigrationDatabase("workspace-lockdown", "70-paired-device-principal-immutability.sql");
    originalDatabase = process.env.POSTGRES_DB;
    process.env.POSTGRES_DB = db.databaseName;
    await closePool();
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'Workspace lockdown')", [workspaceId, groupId]);
    await db.owner.query("INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'admin')", [groupId, principalId, "workspace-lockdown@integration.test"]);
    await db.owner.query(
      `INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo)
       VALUES ($1, $2, $3, $4, 'Workspace lockdown device', 'public-key', 'kid-workspace-lockdown', 'ecdsa-p256')`,
      [deviceId, principalId, groupId, workspaceId],
    );
    await db.owner.query(
      `INSERT INTO mcp_tokens (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id)
       VALUES ($1, $2, $3, $4, 'prefix-workspace-lockdown', 'hash-workspace-lockdown', ARRAY['memory:write'], $5),
              ($6, $2, $3, 'non-device-agent', 'prefix-workspace-lockdown-non-device', 'hash-workspace-lockdown-non-device', ARRAY['memory:write'], NULL)`,
      [tokenId, groupId, workspaceId, principalId, deviceId, nonDeviceTokenId],
    );
  }, 120_000);

  afterAll(async () => {
    await closePool();
    if (originalDatabase === undefined) delete process.env.POSTGRES_DB;
    else process.env.POSTGRES_DB = originalDatabase;
    await db?.close();
  });

  it("full_lockdown atomically revokes only linked active device tokens", async () => {
    await expect(setLockMode(groupId, workspaceId, "full_lockdown")).resolves.toMatchObject({ lock_mode: "full_lockdown" });
    const [workspace, tokens] = await Promise.all([
      db.owner.query<{ lock_mode: string }>("SELECT lock_mode FROM workspaces WHERE workspace_id = $1 AND group_id = $2", [workspaceId, groupId]),
      db.owner.query<{ id: string; revoked: boolean }>("SELECT id, revoked_at IS NOT NULL AS revoked FROM mcp_tokens WHERE id IN ($1, $2) ORDER BY id", [tokenId, nonDeviceTokenId]),
    ]);
    expect(workspace.rows).toEqual([{ lock_mode: "full_lockdown" }]);
    expect(tokens.rows).toEqual([
      { id: tokenId, revoked: true },
      { id: nonDeviceTokenId, revoked: false },
    ].sort((left, right) => left.id.localeCompare(right.id)));
  });

  it("restricted modes leave existing device tokens active and affect future minting only", async () => {
    await expect(setLockMode(groupId, workspaceId, "read_only")).resolves.toMatchObject({ lock_mode: "read_only" });
    const existing = await db.owner.query<{ revoked: boolean }>("SELECT revoked_at IS NOT NULL AS revoked FROM mcp_tokens WHERE id = $1", [nonDeviceTokenId]);
    expect(existing.rows).toEqual([{ revoked: false }]);
  });
});
