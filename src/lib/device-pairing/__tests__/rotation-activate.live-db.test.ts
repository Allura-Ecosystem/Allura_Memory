import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createHmac, generateKeyPairSync, type KeyObject, randomUUID, sign } from "node:crypto";

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
import {
  type ActivatedRotationReceipt,
  activateRotation,
  type ActivateRotationInput,
  isStoredActivatedReceipt,
  stageRotation,
  type StageRotationInput,
} from "@/lib/device-pairing/rotation-service";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "./migrations/postgres-test-harness";

const ORIGIN = "https://app.allura.example.test";
const AUDIENCE = "https://api.allura.example.test/device-auth";
const STAGE_TARGET = "/api/device-pairing/rotation/stage";
const ACTIVATE_TARGET = "/api/device-pairing/rotation/activate";
const RECEIPT_SECRET = "test-rotation-activate-receipt-secret";
const COVERED_COMPONENTS = [
  "@method",
  "@target-uri",
  "content-digest",
  "x-allura-purpose",
  "x-allura-audience",
  "x-allura-nonce",
  "x-allura-proof-id",
  "x-allura-device-id",
  "x-allura-key-generation",
];

function signedHeaders(
  privateKey: KeyObject,
  input: {
    requestTarget: string;
    requestBody: Uint8Array;
    purpose: "rotation_stage" | "rotation_activate";
    nonce: string;
    proofId: string;
    deviceId: string;
    keyGeneration: number;
    keyId: string;
  },
): StageRotationInput["headers"] {
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id" "x-allura-device-id" "x-allura-key-generation");created=${created};expires=${created + 60};keyid="${input.keyId}";alg="ecdsa-p256"`;
  const signatureParams = extractSignatureParamsRaw(signatureInput);
  const contentDigest = computeContentDigest(input.requestBody);
  const base = buildSignatureBaseString(
    "POST",
    `${ORIGIN}${input.requestTarget}`,
    contentDigest,
    {
      "x-allura-purpose": input.purpose,
      "x-allura-audience": AUDIENCE,
      "x-allura-nonce": input.nonce,
      "x-allura-proof-id": input.proofId,
      "x-allura-device-id": input.deviceId,
      "x-allura-key-generation": String(input.keyGeneration),
    },
    COVERED_COMPONENTS,
    signatureParams,
  );

  return {
    content_digest: contentDigest,
    purpose: input.purpose,
    audience: AUDIENCE,
    nonce: input.nonce,
    proof_id: input.proofId,
    device_id: input.deviceId,
    key_generation: String(input.keyGeneration),
    signature_input: signatureInput,
    signature: sign("SHA256", Buffer.from(base, "utf8"), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64"),
  };
}

function activatedReceiptSignature(receipt: Omit<ActivatedRotationReceipt, "signature">): string {
  const key = createHmac("sha256", RECEIPT_SECRET)
    .update("allura/device-pairing/rotation-receipt/v1")
    .digest();
  const canonical = [
    "allura/device-pairing/rotation-activated/v1",
    receipt.receipt_id,
    receipt.device_id,
    receipt.old_key_id,
    receipt.old_public_key_digest,
    receipt.old_key_algo,
    receipt.new_key_id,
    receipt.new_public_key_digest,
    receipt.new_key_algo,
    String(receipt.key_generation),
    receipt.activated_at,
    receipt.grace_expires_at,
  ].join("\n");
  return createHmac("sha256", key).update(canonical).digest("base64url");
}

type DeviceSnapshot = {
  current_public_key: string;
  current_key_id: string;
  current_key_algo: string;
  pending_next_public_key: string | null;
  pending_next_key_id: string | null;
  pending_next_key_algo: string | null;
  key_generation: number;
  rotation_grace_expires_at: Date | null;
  grace_exchange_count: number;
  rotation_receipt: unknown;
};

type Fixture = {
  deviceId: string;
  activationChallengeId: string;
  currentPublicKey: string;
  nextPublicKey: string;
  nextKeyId: string;
  activationInput: ActivateRotationInput;
};

async function snapshot(db: MigrationDatabase, deviceId: string): Promise<DeviceSnapshot> {
  const result = await db.owner.query<DeviceSnapshot>(
    `SELECT current_public_key, current_key_id, current_key_algo,
            pending_next_public_key, pending_next_key_id, pending_next_key_algo,
            key_generation, rotation_grace_expires_at, grace_exchange_count, rotation_receipt
       FROM paired_devices WHERE id = $1`,
    [deviceId],
  );
  if (!result.rows[0]) throw new Error(`Missing device fixture ${deviceId}`);
  return result.rows[0];
}

describeMigrationLive("Story 29.13 rotation-activate live PostgreSQL", () => {
  let db: MigrationDatabase;
  const originalEnv = {
    origin: process.env.ALLURA_DEVICE_AUTH_ORIGIN,
    audience: process.env.ALLURA_DEVICE_AUTH_AUDIENCE,
    graceHours: process.env.ALLURA_DEVICE_KEY_GRACE_HOURS,
    receiptSecret: process.env.ALLURA_MCP_TOKEN_SECRET,
  };

  beforeAll(async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = ORIGIN;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = AUDIENCE;
    process.env.ALLURA_DEVICE_KEY_GRACE_HOURS = "24";
    process.env.ALLURA_MCP_TOKEN_SECRET = RECEIPT_SECRET;
    clearDevicePairingConfig();
    db = await createMigrationDatabase("rotationactivate", "68-device-rotation-idempotency-scope.sql");
  }, 120_000);

  afterAll(async () => {
    for (const [name, value] of Object.entries({
      ALLURA_DEVICE_AUTH_ORIGIN: originalEnv.origin,
      ALLURA_DEVICE_AUTH_AUDIENCE: originalEnv.audience,
      ALLURA_DEVICE_KEY_GRACE_HOURS: originalEnv.graceHours,
      ALLURA_MCP_TOKEN_SECRET: originalEnv.receiptSecret,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    clearDevicePairingConfig();
    await db?.close();
  });

  async function createStagedFixture(label: string): Promise<Fixture> {
    const suffix = `${label}-${randomUUID()}`;
    const groupId = `allura-live-activate-${suffix}`;
    const workspaceId = `ws-live-activate-${suffix}`;
    const deviceId = `dev-live-activate-${suffix}`;
    const stageChallengeId = `challenge-live-stage-${suffix}`;
    const activationChallengeId = `challenge-live-activate-${suffix}`;
    const idempotencyKey = `activate-idempotency-${suffix}`;
    const currentKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const nextKeys = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const currentPublicKey = currentKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const nextPublicKey = nextKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const nextKeyId = `key-next-${suffix}`;

    await db.owner.query(
      `INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)`,
      [workspaceId, groupId, `Rotation activate ${label}`],
    );
    await db.owner.query(
      `INSERT INTO paired_devices
        (id, principal_id, group_id, workspace_id, display_label,
         current_public_key, current_key_id, current_key_algo, lifecycle_state,
         key_generation, grace_exchange_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecdsa-p256', 'APPROVED', 4, 7)`,
      [deviceId, `principal-${suffix}`, groupId, workspaceId, `Device ${label}`, currentPublicKey, `key-current-${suffix}`],
    );
    await db.owner.query(
      `INSERT INTO device_challenges
        (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'rotation_stage', NOW() + INTERVAL '60 seconds')`,
      [stageChallengeId, groupId, deviceId, `stage-nonce-${suffix}`, AUDIENCE],
    );

    const stageBody = Buffer.from(JSON.stringify({
      device_id: deviceId,
      new_public_key: nextPublicKey,
      new_key_id: nextKeyId,
      new_key_algo: "ecdsa-p256",
      idempotency_key: idempotencyKey,
    }));
    const stageInput: StageRotationInput = {
      device_id: deviceId,
      new_public_key: nextPublicKey,
      new_key_id: nextKeyId,
      new_key_algo: "ecdsa-p256",
      idempotency_key: idempotencyKey,
      request_target: STAGE_TARGET,
      request_body: stageBody,
      headers: signedHeaders(currentKeys.privateKey, {
        requestTarget: STAGE_TARGET,
        requestBody: stageBody,
        purpose: "rotation_stage",
        nonce: `stage-nonce-${suffix}`,
        proofId: stageChallengeId,
        deviceId,
        keyGeneration: 4,
        keyId: `key-current-${suffix}`,
      }),
    };
    const staged = await stageRotation(db.app, stageInput);

    await db.owner.query(
      `INSERT INTO device_challenges
        (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'rotation_activate', NOW() + INTERVAL '60 seconds')`,
      [activationChallengeId, groupId, deviceId, `activate-nonce-${suffix}`, AUDIENCE],
    );
    const activationBody = Buffer.from(JSON.stringify({
      device_id: deviceId,
      receipt_id: staged.receipt_id,
      idempotency_key: idempotencyKey,
    }));

    return {
      deviceId,
      activationChallengeId,
      currentPublicKey,
      nextPublicKey,
      nextKeyId,
      activationInput: {
        device_id: deviceId,
        receipt_id: staged.receipt_id,
        idempotency_key: idempotencyKey,
        request_target: ACTIVATE_TARGET,
        request_body: activationBody,
        headers: signedHeaders(nextKeys.privateKey, {
          requestTarget: ACTIVATE_TARGET,
          requestBody: activationBody,
          purpose: "rotation_activate",
          nonce: `activate-nonce-${suffix}`,
          proofId: activationChallengeId,
          deviceId,
          keyGeneration: 4,
          keyId: nextKeyId,
        }),
      },
    };
  }

  it("atomically swaps fresh activation state, resets grace count, emits one audit, and persists a valid signed receipt", async () => {
    vi.clearAllMocks();
    const fixture = await createStagedFixture("success");
    vi.clearAllMocks();

    const result = await activateRotation(db.app, fixture.activationInput);
    const [device, challenge, activationAudits] = await Promise.all([
      snapshot(db, fixture.deviceId),
      db.owner.query<{ consumed_at: Date | null }>(
        "SELECT consumed_at FROM device_challenges WHERE id = $1", [fixture.activationChallengeId],
      ),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_ACTIVATED' AND metadata->>'device_id' = $1",
        [fixture.deviceId],
      ),
    ]);

    expect(result.status).toBe("ACTIVATED");
    expect(result.key_generation).toBe(5);
    expect(challenge.rows).toEqual([{ consumed_at: expect.any(Date) }]);
    expect(device).toMatchObject({
      current_public_key: fixture.nextPublicKey,
      current_key_id: fixture.nextKeyId,
      current_key_algo: "ecdsa-p256",
      pending_next_public_key: null,
      pending_next_key_id: null,
      pending_next_key_algo: null,
      key_generation: 5,
      grace_exchange_count: 0,
    });
    expect(result.rotation_receipt).not.toHaveProperty("old_public_key");
    expect(result.rotation_receipt).not.toHaveProperty("old_key_algo");
    const storedReceipt = device.rotation_receipt as ActivatedRotationReceipt;
    expect(storedReceipt).toMatchObject({ old_public_key: fixture.currentPublicKey, old_key_algo: "ecdsa-p256" });
    expect(isStoredActivatedReceipt(storedReceipt, {
      id: fixture.deviceId, current_public_key: fixture.nextPublicKey, current_key_id: fixture.nextKeyId,
      current_key_algo: "ecdsa-p256", key_generation: 5,
    })).toBe(true);
    expect(device.rotation_grace_expires_at).toBeInstanceOf(Date);
    expect(Date.parse(result.rotation_receipt.grace_expires_at) - Date.parse(result.rotation_receipt.activated_at))
      .toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(storedReceipt.signature).toBe(activatedReceiptSignature({
      receipt_id: storedReceipt.receipt_id,
      device_id: storedReceipt.device_id,
      old_key_id: storedReceipt.old_key_id,
      old_public_key: storedReceipt.old_public_key,
      old_public_key_digest: storedReceipt.old_public_key_digest,
      old_key_algo: storedReceipt.old_key_algo,
      new_key_id: storedReceipt.new_key_id,
      new_public_key_digest: storedReceipt.new_public_key_digest,
      new_key_algo: storedReceipt.new_key_algo,
      key_generation: storedReceipt.key_generation,
      activated_at: storedReceipt.activated_at,
      grace_expires_at: storedReceipt.grace_expires_at,
    }));
    expect(emitDeviceAudit).toHaveBeenCalledOnce();
    expect(activationAudits.rows).toEqual([{ count: "1" }]);
  });

  it("rolls every activation mutation back when transactional audit emission fails", async () => {
    vi.clearAllMocks();
    const fixture = await createStagedFixture("rollback");
    const before = await snapshot(db, fixture.deviceId);
    vi.clearAllMocks();
    vi.mocked(emitDeviceAudit).mockRejectedValueOnce(new Error("forced DEVICE_ROTATION_ACTIVATED audit failure"));

    await expect(activateRotation(db.app, fixture.activationInput))
      .rejects.toThrow("forced DEVICE_ROTATION_ACTIVATED audit failure");

    const [after, challenge, activationAudits] = await Promise.all([
      snapshot(db, fixture.deviceId),
      db.owner.query<{ consumed_at: Date | null }>(
        "SELECT consumed_at FROM device_challenges WHERE id = $1", [fixture.activationChallengeId],
      ),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_ACTIVATED' AND metadata->>'device_id' = $1",
        [fixture.deviceId],
      ),
    ]);

    expect(challenge.rows).toEqual([{ consumed_at: null }]);
    expect(after).toEqual(before);
    expect(activationAudits.rows).toEqual([{ count: "0" }]);
  });

  it("returns the same receipt for an exact pre-swap-generation replay after its challenge is consumed and expired", async () => {
    vi.clearAllMocks();
    const fixture = await createStagedFixture("replay");
    vi.clearAllMocks();
    const activated = await activateRotation(db.app, fixture.activationInput);
    const beforeReplay = await snapshot(db, fixture.deviceId);
    await db.owner.query(
      "UPDATE device_challenges SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1",
      [fixture.activationChallengeId],
    );
    vi.clearAllMocks();

    const replay = await activateRotation(db.app, fixture.activationInput);
    const afterReplay = await snapshot(db, fixture.deviceId);
    const activationAudits = await db.owner.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_ACTIVATED' AND metadata->>'device_id' = $1",
      [fixture.deviceId],
    );

    expect(replay).toEqual({ ...activated, status: "ALREADY_ACTIVATED" });
    expect(afterReplay).toEqual(beforeReplay);
    expect(emitDeviceAudit).not.toHaveBeenCalled();
    expect(activationAudits.rows).toEqual([{ count: "1" }]);
  });
});
