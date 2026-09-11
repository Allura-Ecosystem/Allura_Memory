import { afterAll, beforeAll, expect, it } from "vitest";

import { DEVICE_AUDIT_EVENT_TYPES } from "@/lib/device-pairing/audit";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./migrations/postgres-test-harness";
import { scanDeviceEventMetadata } from "../../../../scripts/credential-scan";

const GROUP_ID = "allura-live-credential-scan";
const WORKSPACE_ID = "ws-live-credential-scan";
const PRINCIPAL_ID = "principal-live-credential-scan";

describeMigrationLive("Story 29.17 credential leak scan live PostgreSQL", () => {
  let db: MigrationDatabase;

  beforeAll(async () => {
    db = await createMigrationDatabase("credentialscan", "69-device-revocation-lifecycle.sql");
    await db.owner.query(
      "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
      [WORKSPACE_ID, GROUP_ID, "Credential scan workspace"],
    );

    for (const eventType of DEVICE_AUDIT_EVENT_TYPES) {
      await db.owner.query(
        `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
         VALUES ($1, $2, $3, $4, 'completed', $5::jsonb)`,
        [GROUP_ID, WORKSPACE_ID, eventType, PRINCIPAL_ID, JSON.stringify({ device_id: `device-${eventType.toLowerCase()}` })],
      );
    }
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("scans every persisted device lifecycle event metadata document without finding credential material", async () => {
    const persisted = await db.owner.query<{ event_type: string; metadata: Record<string, unknown> }>(
      `SELECT event_type, metadata
         FROM events
        WHERE group_id = $1 AND event_type LIKE 'DEVICE_%'
        ORDER BY event_type`,
      [GROUP_ID],
    );

    expect(DEVICE_AUDIT_EVENT_TYPES).toHaveLength(13);
    expect(persisted.rows).toHaveLength(DEVICE_AUDIT_EVENT_TYPES.length);
    expect(scanDeviceEventMetadata(persisted.rows)).toEqual([]);
  });

  it("flags a credential key in disposable persisted DEVICE_* metadata", async () => {
    await db.owner.query(
      `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata)
       VALUES ($1, $2, 'DEVICE_CHALLENGE_ISSUED', $3, 'completed', $4::jsonb)`,
      [GROUP_ID, WORKSPACE_ID, PRINCIPAL_ID, JSON.stringify({ code_verifier: "synthetic-live-leak" })],
    );
    const persisted = await db.owner.query<{ event_type: string; metadata: Record<string, unknown> }>(
      `SELECT event_type, metadata
         FROM events
        WHERE group_id = $1 AND metadata ? 'code_verifier'`,
      [GROUP_ID],
    );

    expect(scanDeviceEventMetadata(persisted.rows)).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: "pkce-verifier-key" }),
    ]));
  });
});
