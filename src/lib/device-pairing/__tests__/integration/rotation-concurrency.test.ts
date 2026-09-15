import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { generateKeyPairSync, type KeyObject, randomUUID, sign } from "node:crypto";

import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import {
  activateRotation,
  type ActivateRotationInput,
  stageRotation,
  type StageRotationInput,
} from "@/lib/device-pairing/rotation-service";
import {
  createMigrationDatabase,
  describeMigrationLive,
  type MigrationDatabase,
} from "../migrations/postgres-test-harness";

const ORIGIN = "https://rotation.concurrent.integration.test";
const AUDIENCE = "https://rotation.concurrent.integration.test/device-auth";
const STAGE_TARGET = "/api/device-pairing/rotation/stage";
const ACTIVATE_TARGET = "/api/device-pairing/rotation/activate";
const COMPONENTS = [
  "@method",
  "@target-uri",
  "content-digest",
  "x-allura-purpose",
  "x-allura-audience",
  "x-allura-nonce",
  "x-allura-proof-id",
  "x-allura-device-id",
  "x-allura-key-generation",
] as const;

type Fixture = {
  deviceId: string;
  activationChallengeId: string;
  input: ActivateRotationInput;
};

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
    COMPONENTS,
    extractSignatureParamsRaw(signatureInput),
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

function openAppConnection(database: string): Pool {
  return new Pool({
    host: process.env.POSTGRES_HOST ?? "127.0.0.1",
    port: Number(process.env.POSTGRES_PORT ?? "5432"),
    database,
    user: process.env.POSTGRES_USER ?? "ronin4life",
    password: process.env.POSTGRES_PASSWORD ?? "",
    options: "-c role=allura_app",
    max: 1,
  });
}

describeMigrationLive("Story 29.19 rotation concurrency against real PostgreSQL", () => {
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
    process.env.ALLURA_MCP_TOKEN_SECRET = "rotation-concurrency-receipt-secret";
    clearDevicePairingConfig();
    db = await createMigrationDatabase("rotation-concurrency", "68-device-rotation-idempotency-scope.sql");
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

  async function createStagedFixture(): Promise<Fixture> {
    const suffix = randomUUID().replaceAll("-", "");
    const groupId = `allura-rotation-concurrency-${suffix}`;
    const workspaceId = `ws-rotation-concurrency-${suffix}`;
    const deviceId = `dev-rotation-concurrency-${suffix}`;
    const stageChallengeId = `challenge-rotation-stage-${suffix}`;
    const activationChallengeId = `challenge-rotation-activate-${suffix}`;
    const idempotencyKey = `rotation-concurrency-${suffix}`;
    const current = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const next = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const currentPublicKey = current.publicKey.export({ type: "spki", format: "pem" }).toString();
    const nextPublicKey = next.publicKey.export({ type: "spki", format: "pem" }).toString();
    const currentKeyId = `key-current-${suffix}`;
    const nextKeyId = `key-next-${suffix}`;

    await db.owner.query(
      "INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)",
      [workspaceId, groupId, "Rotation concurrency"],
    );
    await db.owner.query(
      `INSERT INTO paired_devices
        (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo, lifecycle_state, key_generation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ecdsa-p256', 'APPROVED', 4)`,
      [deviceId, `principal-${suffix}`, groupId, workspaceId, "Rotation contender", currentPublicKey, currentKeyId],
    );
    await db.owner.query(
      `INSERT INTO device_challenges (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
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
    const staged = await stageRotation(db.app, {
      device_id: deviceId,
      new_public_key: nextPublicKey,
      new_key_id: nextKeyId,
      new_key_algo: "ecdsa-p256",
      idempotency_key: idempotencyKey,
      request_target: STAGE_TARGET,
      request_body: stageBody,
      headers: signedHeaders(current.privateKey, {
        requestTarget: STAGE_TARGET,
        requestBody: stageBody,
        purpose: "rotation_stage",
        nonce: `stage-nonce-${suffix}`,
        proofId: stageChallengeId,
        deviceId,
        keyGeneration: 4,
        keyId: currentKeyId,
      }),
    });
    await db.owner.query(
      `INSERT INTO device_challenges (id, group_id, paired_device_id, nonce, audience, purpose, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'rotation_activate', NOW() + INTERVAL '60 seconds')`,
      [activationChallengeId, groupId, deviceId, `activation-nonce-${suffix}`, AUDIENCE],
    );
    const activationBody = Buffer.from(JSON.stringify({
      device_id: deviceId,
      receipt_id: staged.receipt_id,
      idempotency_key: idempotencyKey,
    }));
    return {
      deviceId,
      activationChallengeId,
      input: {
        device_id: deviceId,
        receipt_id: staged.receipt_id,
        idempotency_key: idempotencyKey,
        request_target: ACTIVATE_TARGET,
        request_body: activationBody,
        headers: signedHeaders(next.privateKey, {
          requestTarget: ACTIVATE_TARGET,
          requestBody: activationBody,
          purpose: "rotation_activate",
          nonce: `activation-nonce-${suffix}`,
          proofId: activationChallengeId,
          deviceId,
          keyGeneration: 4,
          keyId: nextKeyId,
        }),
      },
    };
  }

  it("converges two simultaneous valid activations to one generation, audit, consumed challenge, and receipt", async () => {
    const fixture = await createStagedFixture();
    const contenderA = openAppConnection(db.databaseName);
    const contenderB = openAppConnection(db.databaseName);
    try {
      const outcomes = await Promise.allSettled([
        activateRotation(contenderA, fixture.input),
        activateRotation(contenderB, fixture.input),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(2);
      const statuses = outcomes
        .filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof activateRotation>>> => outcome.status === "fulfilled")
        .map((outcome) => outcome.value.status)
        .sort();
      expect(statuses).toEqual(["ACTIVATED", "ALREADY_ACTIVATED"]);
    } finally {
      await Promise.all([contenderA.end(), contenderB.end()]);
    }

    const [device, challenge, audits] = await Promise.all([
      db.owner.query<{ key_generation: number; rotation_receipt: unknown; pending_next_public_key: string | null }>(
        "SELECT key_generation, rotation_receipt, pending_next_public_key FROM paired_devices WHERE id = $1",
        [fixture.deviceId],
      ),
      db.owner.query<{ consumed_at: Date | null }>(
        "SELECT consumed_at FROM device_challenges WHERE id = $1",
        [fixture.activationChallengeId],
      ),
      db.owner.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_ACTIVATED' AND metadata->>'device_id' = $1",
        [fixture.deviceId],
      ),
    ]);
    expect(device.rows).toEqual([{
      key_generation: 5,
      rotation_receipt: expect.any(Object),
      pending_next_public_key: null,
    }]);
    expect(challenge.rows).toEqual([{ consumed_at: expect.any(Date) }]);
    expect(audits.rows).toEqual([{ count: "1" }]);
  });
});
