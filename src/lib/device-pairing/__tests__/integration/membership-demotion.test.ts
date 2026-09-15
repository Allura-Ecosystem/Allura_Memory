import { afterAll, beforeAll, expect, it } from "vitest";

import { setMemberRole } from "@/lib/membership/repository";
import { closePool } from "@/lib/postgres/connection";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "../migrations/postgres-test-harness";

describeMigrationLive("Story 29.19 membership demotion against real PostgreSQL", () => {
  let db: MigrationDatabase;
  let originalDatabase: string | undefined;
  const groupId = "allura-membership-demotion";
  const workspaceId = "ws-membership-demotion";
  const principalId = "principal-membership-demotion";
  const deviceId = "device-membership-demotion";
  const tokenId = "token-membership-demotion";

  beforeAll(async () => {
    db = await createMigrationDatabase("membership-demotion", "70-paired-device-principal-immutability.sql");
    originalDatabase = process.env.POSTGRES_DB;
    process.env.POSTGRES_DB = db.databaseName;
    await closePool();
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, 'Membership demotion workspace')", [workspaceId, groupId]);
    await db.owner.query("INSERT INTO memberships (group_id, user_id, email, role) VALUES ($1, $2, $3, 'admin')", [groupId, principalId, "membership-demotion@integration.test"]);
    await db.owner.query(
      `INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo)
       VALUES ($1, $2, $3, $4, 'Membership demotion device', 'public-key', 'kid-membership-demotion', 'ecdsa-p256')`,
      [deviceId, principalId, groupId, workspaceId],
    );
    await db.owner.query(
      `INSERT INTO mcp_tokens (id, group_id, workspace_id, agent_name, token_prefix, token_hash, scopes, paired_device_id)
       VALUES ($1, $2, $3, $4, 'prefix-membership-demotion', 'hash-membership-demotion', ARRAY['admin:roles'], $5)`,
      [tokenId, groupId, workspaceId, principalId, deviceId],
    );
  }, 120_000);

  afterAll(async () => {
    await closePool();
    if (originalDatabase === undefined) delete process.env.POSTGRES_DB;
    else process.env.POSTGRES_DB = originalDatabase;
    await db?.close();
  });

  it("revokes the old elevated device token in the same membership demotion transaction", async () => {
    await expect(setMemberRole(groupId, principalId, "viewer", "membership-admin")).resolves.toMatchObject({ role: "viewer" });
    const [membership, token] = await Promise.all([
      db.owner.query<{ role: string }>("SELECT role FROM memberships WHERE group_id = $1 AND user_id = $2", [groupId, principalId]),
      db.owner.query<{ revoked: boolean }>("SELECT revoked_at IS NOT NULL AS revoked FROM mcp_tokens WHERE id = $1 AND group_id = $2 AND paired_device_id = $3", [tokenId, groupId, deviceId]),
    ]);
    expect(membership.rows).toEqual([{ role: "viewer" }]);
    expect(token.rows).toEqual([{ revoked: true }]);
  });
});
