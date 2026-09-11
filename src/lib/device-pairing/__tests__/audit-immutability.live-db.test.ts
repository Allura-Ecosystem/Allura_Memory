import { afterAll, beforeAll, expect, it } from "vitest";

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./migrations/postgres-test-harness";

const GROUP_ID = "allura-live-device-audit";
const WORKSPACE_ID = "ws-live-device-audit";
const PRINCIPAL_ID = "principal-live-device-audit";
const DEVICE_ID = "dev-live-device-audit";

async function setAppContext(client: { query: (sql: string, values?: string[]) => Promise<unknown> }): Promise<void> {
  await client.query("SELECT set_config('app.current_group_id', $1, true)", [GROUP_ID]);
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [GROUP_ID]);
  await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [WORKSPACE_ID]);
  await client.query("SELECT set_config('app.current_principal', $1, true)", [PRINCIPAL_ID]);
}

describeMigrationLive("Story 29.16 device audit immutability live PostgreSQL", () => {
  let db: MigrationDatabase;

  beforeAll(async () => {
    db = await createMigrationDatabase("deviceauditimmutability", "69-device-revocation-lifecycle.sql");
    await db.owner.query(
      "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
      [WORKSPACE_ID, GROUP_ID, "Device audit workspace"],
    );
    await db.owner.query(
      `INSERT INTO paired_devices
        (id, principal_id, group_id, workspace_id, display_label,
         current_public_key, current_key_id, lifecycle_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'APPROVED')`,
      [DEVICE_ID, PRINCIPAL_ID, GROUP_ID, WORKSPACE_ID, "Device audit fixture", "audit-public-key", "audit-key-id"],
    );
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("persists a safe DEVICE_REVOKED audit through the caller client, then rejects app-role update and delete", async () => {
    // The audit writer receives this app client inside this transaction; it must
    // not acquire a second pool/client or create a separate transaction.
    const insertClient = await db.app.connect();
    try {
      await insertClient.query("BEGIN");
      await setAppContext(insertClient);
      await emitDeviceAudit(insertClient, {
        group_id: GROUP_ID,
        workspace_id: WORKSPACE_ID,
        event_type: "DEVICE_REVOKED",
        agent_id: PRINCIPAL_ID,
        metadata: { device_id: DEVICE_ID, action: "revoke" },
      });
      await insertClient.query("COMMIT");
    } catch (error) {
      await insertClient.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      insertClient.release();
    }

    const stored = await db.owner.query<{
      id: string;
      group_id: string;
      workspace_id: string;
      event_type: string;
      agent_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, group_id, workspace_id, event_type, agent_id, metadata
         FROM events
        WHERE event_type = 'DEVICE_REVOKED' AND metadata->>'device_id' = $1`,
      [DEVICE_ID],
    );
    expect(stored.rows).toEqual([{
      id: expect.any(String),
      group_id: GROUP_ID,
      workspace_id: WORKSPACE_ID,
      event_type: "DEVICE_REVOKED",
      agent_id: PRINCIPAL_ID,
      metadata: { device_id: DEVICE_ID, action: "revoke" },
    }]);
    const eventId = stored.rows[0]!.id;

    for (const sql of [
      "UPDATE events SET status = 'failed' WHERE id = $1",
      "DELETE FROM events WHERE id = $1",
    ]) {
      const mutationClient = await db.app.connect();
      try {
        await mutationClient.query("BEGIN");
        await setAppContext(mutationClient);
        await expect(mutationClient.query(sql, [eventId])).rejects.toThrow();
      } finally {
        await mutationClient.query("ROLLBACK").catch(() => undefined);
        mutationClient.release();
      }
    }

    await expect(
      db.owner.query("SELECT id FROM events WHERE id = $1", [eventId]),
    ).resolves.toMatchObject({ rows: [{ id: eventId }] });
  });
});
