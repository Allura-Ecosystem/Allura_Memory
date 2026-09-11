import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";


vi.mock("@/lib/device-pairing/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/device-pairing/audit")>();
  return { ...actual, emitDeviceAudit: vi.fn(actual.emitDeviceAudit) };
});

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import { stageRotation } from "@/lib/device-pairing/rotation-service";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./migrations/postgres-test-harness";

const ORIGIN = "https://app.allura.example.test";
const AUDIENCE = "https://api.allura.example.test/device-auth";
const REQUEST_TARGET = "/api/device-pairing/rotation/stage";

function buildStageInput(
  privateKey: KeyObject,
  deviceId: string,
  challengeId: string,
): Parameters<typeof stageRotation>[1] {
  const requestBody = Buffer.from(JSON.stringify({
    device_id: deviceId,
    new_public_key: "next-public-key",
    new_key_id: "key-next",
    new_key_algo: "ecdsa-p256",
    idempotency_key: "rotation-idempotency-live",
  }));
  const nonce = "rotation-live-nonce";
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id" "x-allura-device-id" "x-allura-key-generation");created=${created};expires=${created + 60};keyid="key-current";alg="ecdsa-p256"`;
  const signatureParams = extractSignatureParamsRaw(signatureInput);
  const base = buildSignatureBaseString(
    "POST",
    `${ORIGIN}${REQUEST_TARGET}`,
    computeContentDigest(requestBody),
    {
      "x-allura-purpose": "rotation_stage",
      "x-allura-audience": AUDIENCE,
      "x-allura-nonce": nonce,
      "x-allura-proof-id": challengeId,
      "x-allura-device-id": deviceId,
      "x-allura-key-generation": "4",
    },
    [
      "@method",
      "@target-uri",
      "content-digest",
      "x-allura-purpose",
      "x-allura-audience",
      "x-allura-nonce",
      "x-allura-proof-id",
      "x-allura-device-id",
      "x-allura-key-generation",
    ],
    signatureParams,
  );

  return {
    device_id: deviceId,
    new_public_key: "next-public-key",
    new_key_id: "key-next",
    new_key_algo: "ecdsa-p256",
    idempotency_key: "rotation-idempotency-live",
    request_target: REQUEST_TARGET,
    request_body: requestBody,
    headers: {
      content_digest: computeContentDigest(requestBody),
      purpose: "rotation_stage",
      audience: AUDIENCE,
      nonce,
      proof_id: challengeId,
      device_id: deviceId,
      key_generation: "4",
      signature_input: signatureInput,
      signature: sign("SHA256", Buffer.from(base, "utf8"), {
        key: privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64"),
    },
  };
}

describeMigrationLive("Story 29.12 rotation-stage audit rollback live PostgreSQL", () => {
  let db: MigrationDatabase;
  const groupId = "allura-live-rotation";
  const workspaceId = "ws-live-rotation";
  const deviceId = "dev-live-rotation";
  const challengeId = "challenge-live-rotation";
  let privateKey: KeyObject;

  beforeAll(async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = ORIGIN;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = AUDIENCE;
    process.env.ALLURA_MCP_TOKEN_SECRET = "test-rotation-receipt-secret";
    clearDevicePairingConfig();
    db = await createMigrationDatabase("rotationstage", "68-device-rotation-idempotency-scope.sql");

    const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
    privateKey = keys.privateKey;
    const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

    await db.owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name)
       VALUES ($1, $2, $3)`,
      [workspaceId, groupId, "Rotation workspace"],
    );
    await db.owner.query(
      `INSERT INTO paired_devices
         (id, principal_id, group_id, workspace_id, display_label,
          current_public_key, current_key_id, current_key_algo, lifecycle_state, key_generation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecdsa-p256', 'APPROVED', 4)`,
      [deviceId, "principal-live-rotation", groupId, workspaceId, "Rotation device", publicKey, "key-current"],
    );
    await db.owner.query(
      `INSERT INTO device_challenges
         (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'rotation_stage', NOW() + INTERVAL '60 seconds')`,
      [challengeId, groupId, deviceId, "rotation-live-nonce", AUDIENCE],
    );
  }, 120_000);

  afterAll(async () => {
    clearDevicePairingConfig();
    await db?.close();
  });

  it("rolls back both challenge consumption and pending-key persistence when the real audit INSERT fails", async () => {
    await db.owner.query(`
      CREATE FUNCTION fail_live_rotation_stage_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'DEVICE_ROTATION_STAGED' AND NEW.metadata->>'device_id' = 'dev-live-rotation' THEN
          RAISE EXCEPTION 'forced DEVICE_ROTATION_STAGED audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_live_rotation_stage_audit_trigger
      BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_live_rotation_stage_audit();
    `);
    try {
      await expect(stageRotation(db.app, buildStageInput(privateKey, deviceId, challengeId)))
        .rejects.toThrow("forced DEVICE_ROTATION_STAGED audit failure");
    } finally {
      await db.owner.query("DROP TRIGGER IF EXISTS fail_live_rotation_stage_audit_trigger ON events");
      await db.owner.query("DROP FUNCTION IF EXISTS fail_live_rotation_stage_audit()");
    }

    const [challenge, device, audit] = await Promise.all([
      db.owner.query<{ id: string; consumed_at: string | null }>("SELECT id, consumed_at FROM device_challenges WHERE id = $1", [challengeId]),
      db.owner.query<{
        pending_next_public_key: string | null;
        pending_next_key_id: string | null;
        pending_next_key_algo: string | null;
        rotation_idempotency_key: string | null;
      }>(`SELECT pending_next_public_key, pending_next_key_id, pending_next_key_algo, rotation_idempotency_key
          FROM paired_devices WHERE id = $1`, [deviceId]),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_STAGED' AND metadata->>'device_id' = $1",
        [deviceId],
      ),
    ]);

    expect(challenge.rows).toEqual([{ id: challengeId, consumed_at: null }]);
    expect(device.rows).toEqual([{
      pending_next_public_key: null,
      pending_next_key_id: null,
      pending_next_key_algo: null,
      rotation_idempotency_key: null,
    }]);
    expect(audit.rows).toEqual([{ count: "0" }]);
  });

  it("persists the staged key, receipt, and consumed challenge on a successful transaction", async () => {
    vi.clearAllMocks();

    const result = await stageRotation(db.app, buildStageInput(privateKey, deviceId, challengeId));

    const [challenge, device, audit] = await Promise.all([
      db.owner.query<{ id: string; consumed_at: string | null }>("SELECT id, consumed_at FROM device_challenges WHERE id = $1", [challengeId]),
      db.owner.query<{
        pending_next_public_key: string | null;
        pending_next_key_id: string | null;
        pending_next_key_algo: string | null;
        rotation_idempotency_key: string | null;
        rotation_receipt: unknown;
      }>(`SELECT pending_next_public_key, pending_next_key_id, pending_next_key_algo, rotation_idempotency_key, rotation_receipt
          FROM paired_devices WHERE id = $1`, [deviceId]),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_STAGED' AND metadata->>'device_id' = $1",
        [deviceId],
      ),
    ]);

    expect(challenge.rows).toEqual([{ id: challengeId, consumed_at: expect.any(Date) }]);
    expect(device.rows[0]).toMatchObject({
      pending_next_public_key: "next-public-key",
      pending_next_key_id: "key-next",
      pending_next_key_algo: "ecdsa-p256",
      rotation_idempotency_key: "rotation-idempotency-live",
      rotation_receipt: result,
    });
    expect(emitDeviceAudit).toHaveBeenCalledOnce();
    expect(audit.rows).toEqual([{ count: "1" }]);
  });

  it("returns the original receipt on a matching idempotent replay without a second audit or mutation", async () => {
    vi.clearAllMocks();
    const input = buildStageInput(privateKey, deviceId, challengeId);
    const before = await db.owner.query<{
      pending_next_public_key: string | null;
      pending_next_key_id: string | null;
      pending_next_key_algo: string | null;
      rotation_idempotency_key: string | null;
      rotation_receipt: unknown;
    }>(`SELECT pending_next_public_key, pending_next_key_id, pending_next_key_algo, rotation_idempotency_key, rotation_receipt
        FROM paired_devices WHERE id = $1`, [deviceId]);

    const replay = await stageRotation(db.app, input);

    const after = await db.owner.query<{
      pending_next_public_key: string | null;
      pending_next_key_id: string | null;
      pending_next_key_algo: string | null;
      rotation_idempotency_key: string | null;
      rotation_receipt: unknown;
    }>(`SELECT pending_next_public_key, pending_next_key_id, pending_next_key_algo, rotation_idempotency_key, rotation_receipt
        FROM paired_devices WHERE id = $1`, [deviceId]);
    expect(replay).toEqual(before.rows[0]?.rotation_receipt);
    expect(after.rows).toEqual(before.rows);
    expect(emitDeviceAudit).not.toHaveBeenCalled();

    await expect(stageRotation(db.app, { ...input, new_public_key: "different-next-key" }))
      .rejects.toMatchObject({ code: "AUTH_INVALID" });
  });
});
