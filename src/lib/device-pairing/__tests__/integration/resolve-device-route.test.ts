import { afterAll, beforeAll, expect, it } from "vitest";

import { createLiveDatabase, createSigningKey, seedApprovedDevice } from "./live-fixtures";
import { describeMigrationLive, type MigrationDatabase } from "../migrations/postgres-test-harness";

describeMigrationLive("29.19 integration resolve-device-route", () => {
  let db: MigrationDatabase;
  beforeAll(async () => {
    db = await createLiveDatabase("resolve-device-route");
    await seedApprovedDevice(db, {
      groupId: "allura-live-route-a", workspaceId: "ws-live-route-a", principalId: "principal-live-route-a",
      deviceId: "dev-live-route-approved", signingKey: createSigningKey("kid-route-approved"),
    });
    await seedApprovedDevice(db, {
      groupId: "allura-live-route-b", workspaceId: "ws-live-route-b", principalId: "principal-live-route-b",
      deviceId: "dev-live-route-revoked", signingKey: createSigningKey("kid-route-revoked"), lifecycleState: "REVOKED",
    });
  }, 120_000);
  afterAll(async () => db?.close());

  it("bootstraps only approved-device tenant routing and does not expose cross-tenant rows through RLS", async () => {
    const [approved, revoked] = await Promise.all([
      db.app.query("SELECT resolve_device_route($1) AS group_id", ["dev-live-route-approved"]),
      db.app.query("SELECT resolve_device_route($1) AS group_id", ["dev-live-route-revoked"]),
    ]);
    expect(approved.rows).toEqual([{ group_id: "allura-live-route-a" }]);
    expect(revoked.rows).toEqual([{ group_id: null }]);

    const client = await db.app.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_group_id', $1, true)", ["allura-live-route-a"]);
      const visible = await client.query("SELECT id FROM paired_devices ORDER BY id");
      await client.query("COMMIT");
      expect(visible.rows).toEqual([{ id: "dev-live-route-approved" }]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});
