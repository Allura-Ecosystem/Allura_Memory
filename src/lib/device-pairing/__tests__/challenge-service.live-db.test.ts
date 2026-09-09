import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueChallenge } from "@/lib/device-pairing/challenge-service";
import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./migrations/postgres-test-harness";

describeMigrationLive("Story 29.7 challenge RLS bootstrap live PostgreSQL", () => {
  let db: MigrationDatabase;
  const groupId = "allura-live-challenge";
  const otherGroupId = "allura-live-other";
  const workspaceId = "ws-live-challenge";
  const deviceId = "dev-live-challenge";

  beforeAll(async () => {
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = "https://api.allura.example.test/device-auth";
    clearDevicePairingConfig();
    db = await createMigrationDatabase("challenge", "67-device-exchange-denial-audit.sql");
    await db.owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        workspaceId,
        groupId,
        "Challenge workspace",
        "ws-live-other",
        otherGroupId,
        "Other workspace",
      ],
    );
    await db.owner.query(
      `INSERT INTO paired_devices
         (id, principal_id, group_id, workspace_id, display_label,
          current_public_key, current_key_id, lifecycle_state, key_generation)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 'APPROVED', $8),
         ('dev-live-other', 'principal-live-other', $9, 'ws-live-other', 'Other device', 'pub-other', 'kid-other', 'APPROVED', 1)`,
      [
        deviceId,
        "principal-live-challenge",
        groupId,
        workspaceId,
        "Challenge device",
        "pub-live-challenge",
        "kid-live-challenge",
        7,
        otherGroupId,
      ],
    );
  }, 120_000);

  afterAll(async () => {
    clearDevicePairingConfig();
    await db?.close();
  });

  it("derives tenant authority under RLS and persists only a privacy-safe 60-second challenge", async () => {
    const result = await issueChallenge(db.app, {
      device_id: deviceId,
      purpose: "exchange",
    });

    expect(result).toMatchObject({
      audience: "https://api.allura.example.test/device-auth",
      purpose: "exchange",
      server_context: { device_id: deviceId, key_generation: 7 },
    });
    expect(result.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.server_context).not.toHaveProperty("principal_id");
    expect(result.server_context).not.toHaveProperty("group_id");
    expect(result.server_context).not.toHaveProperty("workspace_id");

    const [challenge, audit] = await Promise.all([
      db.owner.query<{
        group_id: string;
        paired_device_id: string;
        server_context: Record<string, unknown>;
        ttl_seconds: number;
      }>(
        `SELECT group_id, paired_device_id, server_context,
                EXTRACT(EPOCH FROM (expires_at - created_at))::int AS ttl_seconds
           FROM device_challenges
          WHERE id = $1`,
        [result.challenge_id],
      ),
      db.owner.query<{
        group_id: string;
        workspace_id: string;
        event_type: string;
        agent_id: string;
        status: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT group_id, workspace_id, event_type, agent_id, status, metadata
           FROM events
          WHERE event_type = 'DEVICE_CHALLENGE_ISSUED'
            AND metadata->>'challenge_id' = $1`,
        [result.challenge_id],
      ),
    ]);

    expect(challenge.rows).toEqual([{
      group_id: groupId,
      paired_device_id: deviceId,
      server_context: {
        device_id: deviceId,
        key_generation: 7,
        server_time: expect.any(String),
      },
      ttl_seconds: 60,
    }]);
    expect(audit.rows).toEqual([{
      group_id: groupId,
      workspace_id: workspaceId,
      event_type: "DEVICE_CHALLENGE_ISSUED",
      agent_id: "principal-live-challenge",
      status: "completed",
      metadata: {
        challenge_id: result.challenge_id,
        device_id: deviceId,
        purpose: "exchange",
      },
    }]);
  });

  it("audits and rejects an unresolved device without persisting a challenge", async () => {
    await expect(issueChallenge(db.app, {
      device_id: "dev-live-missing",
      purpose: "exchange",
    })).rejects.toMatchObject({ code: "DEVICE_NOT_APPROVED" });

    const [denial, challenge, privilege] = await Promise.all([
      db.owner.query<{
        group_id: string;
        workspace_id: string | null;
        event_type: string;
        agent_id: string;
        status: string;
        metadata: Record<string, unknown>;
      }>(
        `SELECT group_id, workspace_id, event_type, agent_id, status, metadata
           FROM events
          WHERE event_type = 'DEVICE_EXCHANGE_DENIED'
            AND metadata->>'device_id' = 'dev-live-missing'`,
      ),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM device_challenges WHERE paired_device_id = $1",
        ["dev-live-missing"],
      ),
      db.owner.query<{ public_execute: boolean }>(
        "SELECT has_function_privilege('public', 'public.device_exchange_denial_audit(jsonb)', 'EXECUTE') AS public_execute",
      ),
    ]);

    expect(denial.rows).toEqual([{
      group_id: "allura-system",
      workspace_id: null,
      event_type: "DEVICE_EXCHANGE_DENIED",
      agent_id: "device-enrollment",
      status: "failed",
      metadata: { device_id: "dev-live-missing", reason_code: "DEVICE_NOT_APPROVED" },
    }]);
    expect(challenge.rows).toEqual([{ count: "0" }]);
    expect(privilege.rows).toEqual([{ public_execute: false }]);
  });
});
