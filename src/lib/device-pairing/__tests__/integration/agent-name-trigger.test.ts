import { afterAll, beforeAll, expect, it } from "vitest";

import { createLiveDatabase, createSigningKey, seedApprovedDevice } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration agent-name trigger", () => {
  let db: MigrationDatabase;
  beforeAll(async () => {
    db = await createLiveDatabase("agent-name-trigger");
    await seedApprovedDevice(db, {
      groupId: "allura-live-agent-trigger", workspaceId: "ws-live-agent-trigger",
      principalId: "principal-live-agent-trigger", deviceId: "dev-live-agent-trigger",
      signingKey: createSigningKey("kid-agent-trigger"),
    });
  }, 120_000);
  afterAll(async () => db?.close());

  it("defers then rejects a mismatched device-token principal at real PostgreSQL commit", async () => {
    const client = await db.owner.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO mcp_tokens
           (id, group_id, workspace_id, agent_name, token_prefix, token_hash, paired_device_id)
         VALUES ('tok-live-agent-trigger', 'allura-live-agent-trigger', 'ws-live-agent-trigger',
                 'wrong-principal', 'prefix-live-agent-trigger', 'hash-live-agent-trigger', 'dev-live-agent-trigger')`,
      );
      await expect(client.query("COMMIT")).rejects.toThrow(/does not match paired_devices\.principal_id/i);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    const persisted = await db.owner.query("SELECT id FROM mcp_tokens WHERE id = 'tok-live-agent-trigger'");
    expect(persisted.rows).toHaveLength(0);
  });
});
