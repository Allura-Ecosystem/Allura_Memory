import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createHash, createHmac, generateKeyPairSync, type KeyObject, randomUUID, sign } from "node:crypto";

vi.mock("@/lib/device-pairing/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/device-pairing/audit")>();
  return { ...actual, emitDeviceAudit: vi.fn(actual.emitDeviceAudit) };
});

import { issueChallenge } from "@/lib/device-pairing/challenge-service";
import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import { buildSignatureBaseString, computeContentDigest, extractSignatureParamsRaw } from "@/lib/device-pairing/rfc9421";
import { type ActivatedRotationReceipt, activateRotation, type GraceRecoveryInput, isStoredActivatedReceipt, recoverViaGrace, stageRotation, type StageRotationInput } from "@/lib/device-pairing/rotation-service";
import { createMigrationDatabase, describeMigrationLive, type MigrationDatabase } from "./migrations/postgres-test-harness";

const ORIGIN = "https://app.allura.example.test";
const AUDIENCE = "https://api.allura.example.test/device-auth";
const TARGET = "/api/device-pairing/recovery";
const SECRET = "test-grace-recovery-receipt-secret";
const COVERED = ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id", "x-allura-device-id", "x-allura-key-generation"];

type Snapshot = { grace_exchange_count: number; rotation_receipt: unknown; rotation_grace_expires_at: Date | null };
type Fixture = { deviceId: string; receipt: ActivatedRotationReceipt; oldPrivateKey: KeyObject; currentPublicKey: string; challengeId: string; nonce: string };

function receiptSignature(receipt: Omit<ActivatedRotationReceipt, "signature">): string {
  const key = createHmac("sha256", SECRET).update("allura/device-pairing/rotation-receipt/v1").digest();
  return createHmac("sha256", key).update([
    "allura/device-pairing/rotation-activated/v1", receipt.receipt_id, receipt.device_id, receipt.old_key_id,
    receipt.old_public_key_digest, receipt.old_key_algo, receipt.new_key_id, receipt.new_public_key_digest,
    receipt.new_key_algo, String(receipt.key_generation), receipt.activated_at, receipt.grace_expires_at,
  ].join("\n")).digest("base64url");
}

function recoveryInput(fixture: Fixture, privateKey = fixture.oldPrivateKey): GraceRecoveryInput {
  const body = Buffer.from(JSON.stringify({ device_id: fixture.deviceId, receipt_id: fixture.receipt.receipt_id }));
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id" "x-allura-device-id" "x-allura-key-generation");created=${created};expires=${created + 60};keyid="${fixture.receipt.old_key_id}";alg="ecdsa-p256"`;
  const digest = computeContentDigest(body);
  const base = buildSignatureBaseString("POST", `${ORIGIN}${TARGET}`, digest, {
    "x-allura-purpose": "recovery_status", "x-allura-audience": AUDIENCE, "x-allura-nonce": fixture.nonce,
    "x-allura-proof-id": fixture.challengeId, "x-allura-device-id": fixture.deviceId, "x-allura-key-generation": "4",
  }, COVERED, extractSignatureParamsRaw(signatureInput));
  return {
    device_id: fixture.deviceId, receipt_id: fixture.receipt.receipt_id, request_target: TARGET, request_body: body,
    headers: {
      content_digest: digest, purpose: "recovery_status", audience: AUDIENCE, nonce: fixture.nonce,
      proof_id: fixture.challengeId, device_id: fixture.deviceId, key_generation: "4", signature_input: signatureInput,
      signature: sign("SHA256", Buffer.from(base), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64"),
    },
  };
}

function signedRotationHeaders(
  privateKey: KeyObject,
  input: { target: string; body: Uint8Array; purpose: "rotation_stage" | "rotation_activate"; nonce: string; proofId: string; deviceId: string; generation: number; keyId: string },
): StageRotationInput["headers"] {
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id" "x-allura-device-id" "x-allura-key-generation");created=${created};expires=${created + 60};keyid="${input.keyId}";alg="ecdsa-p256"`;
  const contentDigest = computeContentDigest(input.body);
  const base = buildSignatureBaseString("POST", `${ORIGIN}${input.target}`, contentDigest, {
    "x-allura-purpose": input.purpose, "x-allura-audience": AUDIENCE, "x-allura-nonce": input.nonce,
    "x-allura-proof-id": input.proofId, "x-allura-device-id": input.deviceId, "x-allura-key-generation": String(input.generation),
  }, COVERED, extractSignatureParamsRaw(signatureInput));
  return {
    content_digest: contentDigest, purpose: input.purpose, audience: AUDIENCE, nonce: input.nonce, proof_id: input.proofId,
    device_id: input.deviceId, key_generation: String(input.generation), signature_input: signatureInput,
    signature: sign("SHA256", Buffer.from(base), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64"),
  };
}

describeMigrationLive("Story 29.14 grace recovery live PostgreSQL", () => {
  let db: MigrationDatabase;
  const original = {
    origin: process.env.ALLURA_DEVICE_AUTH_ORIGIN, audience: process.env.ALLURA_DEVICE_AUTH_AUDIENCE,
    secret: process.env.ALLURA_MCP_TOKEN_SECRET, maximum: process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES,
  };

  beforeAll(async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = ORIGIN;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = AUDIENCE;
    process.env.ALLURA_MCP_TOKEN_SECRET = SECRET;
    process.env.ALLURA_DEVICE_GRACE_MAX_EXCHANGES = "5";
    clearDevicePairingConfig();
    db = await createMigrationDatabase("gracerecovery", "68-device-rotation-idempotency-scope.sql");
  }, 120_000);
  afterAll(async () => {
    for (const [name, value] of Object.entries({ ALLURA_DEVICE_AUTH_ORIGIN: original.origin, ALLURA_DEVICE_AUTH_AUDIENCE: original.audience, ALLURA_MCP_TOKEN_SECRET: original.secret, ALLURA_DEVICE_GRACE_MAX_EXCHANGES: original.maximum })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    clearDevicePairingConfig();
    await db?.close();
  });

  async function fixture(label: string, options: { expiresAt?: string; count?: number } = {}): Promise<Fixture> {
    const suffix = `${label}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const groupId = `allura-live-recovery-${suffix}`;
    const workspaceId = `ws-live-recovery-${suffix}`;
    const deviceId = `dev-live-recovery-${suffix}`;
    const challengeId = `challenge-live-recovery-${suffix}`;
    const old = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const current = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const oldPublic = old.publicKey.export({ type: "spki", format: "pem" }).toString();
    const currentPublic = current.publicKey.export({ type: "spki", format: "pem" }).toString();
    const graceExpiresAt = options.expiresAt ?? new Date(Date.now() + 60_000).toISOString();
    const unsigned: Omit<ActivatedRotationReceipt, "signature"> = {
      receipt_id: `rot-live-recovery-${suffix}`, device_id: deviceId, old_key_id: `key-old-${suffix}`,
      old_public_key: oldPublic, old_public_key_digest: createHash("sha256").update(oldPublic).digest("base64url"), old_key_algo: "ecdsa-p256",
      new_key_id: `key-current-${suffix}`, new_public_key_digest: createHash("sha256").update(currentPublic).digest("base64url"), new_key_algo: "ecdsa-p256",
      key_generation: 5, activated_at: new Date(Date.now() - 1_000).toISOString(), grace_expires_at: graceExpiresAt,
    };
    const receipt = { ...unsigned, signature: receiptSignature(unsigned) };
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)", [workspaceId, groupId, `Grace recovery ${label}`]);
    await db.owner.query(`INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo, lifecycle_state, key_generation, rotation_grace_expires_at, grace_exchange_count, rotation_receipt)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'ecdsa-p256','APPROVED',5,$8,$9,$10::jsonb)`,
      [deviceId, `principal-${suffix}`, groupId, workspaceId, `Device ${label}`, currentPublic, unsigned.new_key_id, graceExpiresAt, options.count ?? 0, JSON.stringify(receipt)]);
    await db.owner.query("INSERT INTO device_challenges (id, group_id, paired_device_id, nonce, audience, purpose, expires_at) VALUES ($1,$2,$3,$4,$5,'recovery_status',NOW() + INTERVAL '60 seconds')", [challengeId, groupId, deviceId, `nonce-${suffix}`, AUDIENCE]);
    return { deviceId, receipt, oldPrivateKey: old.privateKey, currentPublicKey: currentPublic, challengeId, nonce: `nonce-${suffix}` };
  }

  async function snapshot(deviceId: string): Promise<Snapshot> {
    const result = await db.owner.query<Snapshot>("SELECT grace_exchange_count, rotation_receipt, rotation_grace_expires_at FROM paired_devices WHERE id = $1", [deviceId]);
    if (!result.rows[0]) throw new Error("device fixture missing");
    return result.rows[0];
  }

  async function activatedIssuerFixture(label: string): Promise<Fixture> {
    const suffix = `${label}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const groupId = `allura-live-issuer-${suffix}`;
    const workspaceId = `ws-live-issuer-${suffix}`;
    const deviceId = `dev-live-issuer-${suffix}`;
    const old = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const current = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const oldPublicKey = old.publicKey.export({ type: "spki", format: "pem" }).toString();
    const currentPublicKey = current.publicKey.export({ type: "spki", format: "pem" }).toString();
    const oldKeyId = `key-old-${suffix}`;
    const currentKeyId = `key-current-${suffix}`;
    const idempotencyKey = `stage-${suffix}`;
    const stageChallengeId = `challenge-stage-${suffix}`;
    const activateChallengeId = `challenge-activate-${suffix}`;
    await db.owner.query("INSERT INTO workspaces (workspace_id, group_id, name) VALUES ($1, $2, $3)", [workspaceId, groupId, `Issuer recovery ${label}`]);
    await db.owner.query(`INSERT INTO paired_devices (id, principal_id, group_id, workspace_id, display_label, current_public_key, current_key_id, current_key_algo, lifecycle_state, key_generation)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'ecdsa-p256','APPROVED',4)`, [deviceId, `principal-${suffix}`, groupId, workspaceId, `Issuer ${label}`, oldPublicKey, oldKeyId]);
    await db.owner.query("INSERT INTO device_challenges (id, group_id, paired_device_id, nonce, audience, purpose, expires_at) VALUES ($1,$2,$3,$4,$5,'rotation_stage',NOW() + INTERVAL '60 seconds')", [stageChallengeId, groupId, deviceId, `stage-nonce-${suffix}`, AUDIENCE]);
    const stageBody = Buffer.from(JSON.stringify({ device_id: deviceId, new_public_key: currentPublicKey, new_key_id: currentKeyId, new_key_algo: "ecdsa-p256", idempotency_key: idempotencyKey }));
    const staged = await stageRotation(db.app, {
      device_id: deviceId, new_public_key: currentPublicKey, new_key_id: currentKeyId, new_key_algo: "ecdsa-p256", idempotency_key: idempotencyKey,
      request_target: "/api/device-pairing/rotation/stage", request_body: stageBody,
      headers: signedRotationHeaders(old.privateKey, { target: "/api/device-pairing/rotation/stage", body: stageBody, purpose: "rotation_stage", nonce: `stage-nonce-${suffix}`, proofId: stageChallengeId, deviceId, generation: 4, keyId: oldKeyId }),
    });
    await db.owner.query("INSERT INTO device_challenges (id, group_id, paired_device_id, nonce, audience, purpose, expires_at) VALUES ($1,$2,$3,$4,$5,'rotation_activate',NOW() + INTERVAL '60 seconds')", [activateChallengeId, groupId, deviceId, `activate-nonce-${suffix}`, AUDIENCE]);
    const activateBody = Buffer.from(JSON.stringify({ device_id: deviceId, receipt_id: staged.receipt_id, idempotency_key: idempotencyKey }));
    const activation = await activateRotation(db.app, {
      device_id: deviceId, receipt_id: staged.receipt_id, idempotency_key: idempotencyKey,
      request_target: "/api/device-pairing/rotation/activate", request_body: activateBody,
      headers: signedRotationHeaders(current.privateKey, { target: "/api/device-pairing/rotation/activate", body: activateBody, purpose: "rotation_activate", nonce: `activate-nonce-${suffix}`, proofId: activateChallengeId, deviceId, generation: 4, keyId: currentKeyId }),
    });
    expect(activation.rotation_receipt).not.toHaveProperty("old_public_key");
    expect(activation.rotation_receipt).not.toHaveProperty("old_key_algo");
    const stored = await db.owner.query<{ rotation_receipt: ActivatedRotationReceipt }>("SELECT rotation_receipt FROM paired_devices WHERE id = $1", [deviceId]);
    const receipt = stored.rows[0]?.rotation_receipt;
    if (!receipt) throw new Error("activated receipt was not persisted");
    const challenge = await issueChallenge(db.app, { device_id: deviceId, purpose: "recovery_status" });
    expect(challenge.server_context.key_generation).toBe(4);
    return { deviceId, receipt, oldPrivateKey: old.privateKey, currentPublicKey, challengeId: challenge.challenge_id, nonce: challenge.nonce };
  }

  it("issues recovery_status after real stage and activation, then accepts proof at the returned old generation", async () => {
    const value = await activatedIssuerFixture("issuer-to-recovery");
    const result = await recoverViaGrace(db.app, recoveryInput(value));
    expect(result).toMatchObject({ status: "RECOVERED", rotation_receipt: { receipt_id: value.receipt.receipt_id } });
    expect(result.rotation_receipt).not.toHaveProperty("old_public_key");
    expect(result.rotation_receipt).not.toHaveProperty("old_key_algo");
  });

  it("runs six distinct valid recovery proofs in parallel at max five with exactly five recoveries", async () => {
    const root = await activatedIssuerFixture("parallel-limit");
    const challenges = await Promise.all(Array.from({ length: 6 }, () => issueChallenge(db.app, {
      device_id: root.deviceId,
      purpose: "recovery_status",
    })));
    expect(new Set(challenges.map((challenge) => challenge.challenge_id)).size).toBe(6);
    expect(challenges.every((challenge) => challenge.server_context.key_generation === 4)).toBe(true);

    const outcomes = await Promise.allSettled(challenges.map((challenge) => recoverViaGrace(db.app, recoveryInput({
      ...root,
      challengeId: challenge.challenge_id,
      nonce: challenge.nonce,
    }))));
    const recovered = outcomes.filter((outcome) => outcome.status === "fulfilled" && outcome.value.status === "RECOVERED");
    const exceeded = outcomes.filter((outcome) => outcome.status === "rejected" && (outcome.reason as { code?: string }).code === "GRACE_LIMIT_EXCEEDED");
    const [after, audits, tokens] = await Promise.all([
      snapshot(root.deviceId),
      db.owner.query("SELECT count(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_RECOVERED' AND metadata->>'device_id' = $1", [root.deviceId]),
      db.owner.query("SELECT count(*)::text AS count FROM mcp_tokens"),
    ]);
    expect(recovered).toHaveLength(5);
    expect(exceeded).toHaveLength(1);
    expect(after.grace_exchange_count).toBe(5);
    expect(audits.rows).toEqual([{ count: "5" }]);
    expect(tokens.rows).toEqual([{ count: "0" }]);
  });

  it("returns only the persisted receipt, consumes one challenge, increments once, audits, and mints no normal token", async () => {
    const value = await fixture("valid");
    const result = await recoverViaGrace(db.app, recoveryInput(value));
    const [after, challenge, audit, tokens] = await Promise.all([
      snapshot(value.deviceId), db.owner.query("SELECT consumed_at FROM device_challenges WHERE id = $1", [value.challengeId]),
      db.owner.query("SELECT count(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_RECOVERED' AND metadata->>'device_id' = $1", [value.deviceId]),
      db.owner.query("SELECT count(*)::text AS count FROM mcp_tokens"),
    ]);
    expect(result).toMatchObject({ status: "RECOVERED", rotation_receipt: { receipt_id: value.receipt.receipt_id } });
    expect(result.rotation_receipt).not.toHaveProperty("old_public_key");
    expect(result.rotation_receipt).not.toHaveProperty("old_key_algo");
    expect(Object.keys(result).sort()).toEqual(["rotation_receipt", "status"]);
    expect(after.rotation_receipt).toEqual(value.receipt);
    expect(isStoredActivatedReceipt(after.rotation_receipt, {
      id: value.deviceId, current_public_key: value.currentPublicKey,
      current_key_id: value.receipt.new_key_id, current_key_algo: value.receipt.new_key_algo, key_generation: value.receipt.key_generation,
    })).toBe(true);
    expect(after.grace_exchange_count).toBe(1);
    expect(challenge.rows[0]?.consumed_at).toBeInstanceOf(Date);
    expect(audit.rows).toEqual([{ count: "1" }]);
    expect(tokens.rows).toEqual([{ count: "0" }]);
  });

  it("rejects an invalid old-key proof without consuming its challenge or incrementing the counter", async () => {
    const value = await fixture("invalid-proof");
    const wrong = generateKeyPairSync("ec", { namedCurve: "P-256" });
    await expect(recoverViaGrace(db.app, recoveryInput(value, wrong.privateKey))).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect((await snapshot(value.deviceId)).grace_exchange_count).toBe(0);
    expect((await db.owner.query<{ consumed_at: Date | null }>("SELECT consumed_at FROM device_challenges WHERE id = $1", [value.challengeId])).rows).toEqual([{ consumed_at: null }]);
  });

  it("rejects expired grace and a reached limit without consuming or incrementing", async () => {
    const expired = await fixture("expired", { expiresAt: new Date(Date.now() - 1_000).toISOString() });
    await expect(recoverViaGrace(db.app, recoveryInput(expired))).rejects.toMatchObject({ code: "KEY_EXPIRED" });
    expect((await snapshot(expired.deviceId)).grace_exchange_count).toBe(0);

    const limited = await fixture("limited", { count: 5 });
    await expect(recoverViaGrace(db.app, recoveryInput(limited))).rejects.toMatchObject({ code: "GRACE_LIMIT_EXCEEDED" });
    expect((await snapshot(limited.deviceId)).grace_exchange_count).toBe(5);
    expect((await db.owner.query<{ consumed_at: Date | null }>("SELECT consumed_at FROM device_challenges WHERE id = $1", [limited.challengeId])).rows).toEqual([{ consumed_at: null }]);
  });

  it("rolls back challenge consumption and counter increment when the real recovery audit INSERT fails", async () => {
    const value = await fixture("audit-rollback");
    await db.owner.query(`
      CREATE FUNCTION fail_live_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'DEVICE_ROTATION_RECOVERED' AND NEW.metadata->>'device_id' = '${value.deviceId}' THEN
          RAISE EXCEPTION 'forced recovery audit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_live_recovery_audit_trigger
      BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION fail_live_recovery_audit();
    `);
    try {
      await expect(recoverViaGrace(db.app, recoveryInput(value))).rejects.toThrow("forced recovery audit failure");
    } finally {
      await db.owner.query("DROP TRIGGER IF EXISTS fail_live_recovery_audit_trigger ON events");
      await db.owner.query("DROP FUNCTION IF EXISTS fail_live_recovery_audit()");
    }
    expect((await snapshot(value.deviceId)).grace_exchange_count).toBe(0);
    expect((await db.owner.query<{ consumed_at: Date | null }>("SELECT consumed_at FROM device_challenges WHERE id = $1", [value.challengeId])).rows).toEqual([{ consumed_at: null }]);
  });

  it("rejects replay after one successful recovery without a second audit or increment", async () => {
    const value = await fixture("replay");
    await recoverViaGrace(db.app, recoveryInput(value));
    await expect(recoverViaGrace(db.app, recoveryInput(value))).rejects.toMatchObject({ code: "AUTH_EXPIRED" });
    expect((await snapshot(value.deviceId)).grace_exchange_count).toBe(1);
    expect((await db.owner.query("SELECT count(*)::text AS count FROM events WHERE event_type = 'DEVICE_ROTATION_RECOVERED' AND metadata->>'device_id' = $1", [value.deviceId])).rows).toEqual([{ count: "1" }]);
  });
});
