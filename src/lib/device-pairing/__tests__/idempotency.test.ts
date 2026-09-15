import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { clearDevicePairingConfig } from "@/lib/device-pairing/config";
import {
  buildSignatureBaseString,
  computeContentDigest,
  extractSignatureParamsRaw,
} from "@/lib/device-pairing/rfc9421";
import { RotationError, stageRotation } from "@/lib/device-pairing/rotation-service";

type QueryCall = { text: string; params?: readonly unknown[] };

const origin = "https://app.allura.example.test";
const audience = "https://device-auth.example.test";
const deviceId = "device-idempotency";
const challengeId = "challenge-idempotency";
const requestTarget = "/api/device-pairing/rotation/stage";

class RecordingClient {
  readonly calls: QueryCall[] = [];
  released = false;
  private challengeConsumed = false;

  constructor(private readonly device: Record<string, unknown>) {}

  get persistedRotationReceipt(): unknown {
    return this.device.rotation_receipt;
  }

  async query<T = unknown>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ text, params });
    if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-test" }] as T[] };
    if (text.includes("FROM paired_devices")) return { rows: [this.device] as T[] };
    if (text.includes("FROM device_challenges")) {
      return {
        rows: [{
          id: challengeId, nonce: "nonce-idempotency", audience, purpose: "rotation_stage",
          expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: this.challengeConsumed ? new Date().toISOString() : null,
        }] as T[],
      };
    }
    if (text.includes("UPDATE device_challenges SET consumed_at")) {
      this.challengeConsumed = true;
      return { rows: [{ id: challengeId }] as T[] };
    }
    if (text.includes("UPDATE paired_devices SET pending_next_public_key")) {
      const [newPublicKey, newKeyId, newKeyAlgo, idempotencyKey, receipt] = params ?? [];
      Object.assign(this.device, {
        pending_next_public_key: newPublicKey,
        pending_next_key_id: newKeyId,
        pending_next_key_algo: newKeyAlgo,
        rotation_idempotency_key: idempotencyKey,
        rotation_receipt: typeof receipt === "string" ? JSON.parse(receipt) : receipt,
      });
    }
    return { rows: [{}] as T[] };
  }

  release(): void {
    this.released = true;
  }
}

function poolFor(client: RecordingClient) {
  return { connect: async () => client };
}

function approvedDevice(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: deviceId,
    group_id: "allura-test",
    workspace_id: "workspace-idempotency",
    principal_id: "principal-idempotency",
    lifecycle_state: "APPROVED",
    current_public_key: publicKey,
    current_key_id: "key-current",
    current_key_algo: "ecdsa-p256",
    key_generation: 4,
    pending_next_public_key: null,
    pending_next_key_id: null,
    pending_next_key_algo: null,
    rotation_idempotency_key: null,
    rotation_receipt: null,
    ...overrides,
  };
}

const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

function signedStageInput() {
  const requestBody = Buffer.from(JSON.stringify({
    device_id: deviceId,
    new_public_key: "next-public-key",
    new_key_id: "key-next",
    new_key_algo: "ecdsa-p256",
    idempotency_key: "idem-current",
  }));
  const created = Math.floor(Date.now() / 1000);
  const signatureInput = `sig1=("@method" "@target-uri" "content-digest" "x-allura-purpose" "x-allura-audience" "x-allura-nonce" "x-allura-proof-id" "x-allura-device-id" "x-allura-key-generation");created=${created};expires=${created + 60};keyid="key-current";alg="ecdsa-p256"`;
  const signatureParams = extractSignatureParamsRaw(signatureInput);
  const contentDigest = computeContentDigest(requestBody);
  const base = buildSignatureBaseString(
    "POST",
    `${origin}${requestTarget}`,
    contentDigest,
    {
      "x-allura-purpose": "rotation_stage",
      "x-allura-audience": audience,
      "x-allura-nonce": "nonce-idempotency",
      "x-allura-proof-id": challengeId,
      "x-allura-device-id": deviceId,
      "x-allura-key-generation": "4",
    },
    [
      "@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience",
      "x-allura-nonce", "x-allura-proof-id", "x-allura-device-id", "x-allura-key-generation",
    ],
    signatureParams,
  );

  return {
    device_id: deviceId,
    new_public_key: "next-public-key",
    new_key_id: "key-next",
    new_key_algo: "ecdsa-p256" as const,
    idempotency_key: "idem-current",
    request_target: requestTarget,
    request_body: requestBody,
    headers: {
      content_digest: contentDigest,
      purpose: "rotation_stage",
      audience,
      nonce: "nonce-idempotency",
      proof_id: challengeId,
      device_id: deviceId,
      key_generation: "4",
      signature_input: signatureInput,
      signature: sign("SHA256", Buffer.from(base, "utf8"), {
        key: keys.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64"),
    },
  };
}

afterEach(() => {
  clearDevicePairingConfig();
  delete process.env.ALLURA_DEVICE_AUTH_ORIGIN;
  delete process.env.ALLURA_DEVICE_AUTH_AUDIENCE;
});

describe("device rotation replay and consumption contracts", () => {
  it("executes stageRotation and atomically consumes the verified challenge before storing the staged replay key", async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = origin;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = audience;
    const client = new RecordingClient(approvedDevice());

    const result = await stageRotation(poolFor(client) as never, signedStageInput());

    expect(result.receipt_id).toMatch(/^rot_/);
    const consume = client.calls.find(({ text }) => text.includes("UPDATE device_challenges SET consumed_at"));
    expect(consume).toEqual(expect.objectContaining({
      text: expect.stringContaining("WHERE id = $1 AND consumed_at IS NULL RETURNING id"),
      params: [challengeId],
    }));
    const stage = client.calls.find(({ text }) => text.includes("UPDATE paired_devices SET pending_next_public_key"));
    expect(stage?.params).toEqual(expect.arrayContaining([
      "next-public-key", "key-next", "ecdsa-p256", "idem-current", deviceId,
    ]));
    expect(client.calls.map(({ text }) => text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(client.released).toBe(true);
  });

  it("replays the persisted signed receipt through stageRotation for a valid same-key, same-material, signed request", async () => {
    process.env.ALLURA_DEVICE_AUTH_ORIGIN = origin;
    process.env.ALLURA_DEVICE_AUTH_AUDIENCE = audience;
    process.env.ALLURA_MCP_TOKEN_SECRET = "unit-rotation-receipt-secret";
    const client = new RecordingClient(approvedDevice());
    const input = signedStageInput();

    const staged = await stageRotation(poolFor(client) as never, input);
    expect(client.persistedRotationReceipt).toEqual(staged);
    const callsBeforeReplay = client.calls.length;

    const replay = await stageRotation(poolFor(client) as never, input);

    expect(replay).toEqual(staged);
    expect(replay.rotation_receipt.signature).toBe(staged.rotation_receipt.signature);
    expect(client.calls.slice(callsBeforeReplay).some(({ text }) => text.includes("FROM device_challenges"))).toBe(true);
    expect(client.calls.slice(callsBeforeReplay).some(({ text }) => text.includes("UPDATE device_challenges SET consumed_at"))).toBe(false);
    expect(client.calls.slice(callsBeforeReplay).some(({ text }) => text.includes("UPDATE paired_devices SET pending_next_public_key"))).toBe(false);
  });

  it("executes the service replay guard and rejects a different key before it can consume another challenge", async () => {
    const client = new RecordingClient(approvedDevice({
      pending_next_public_key: "already-staged-key",
      pending_next_key_id: "already-staged-id",
      pending_next_key_algo: "ecdsa-p256",
      rotation_idempotency_key: "idem-original",
    }));

    await expect(stageRotation(poolFor(client) as never, {
      ...signedStageInput(),
      idempotency_key: "idem-attacker",
      new_public_key: "attacker-key",
      new_key_id: "attacker-id",
    })).rejects.toEqual(expect.any(RotationError));

    expect(client.calls.some(({ text }) => text.includes("FROM device_challenges"))).toBe(false);
    expect(client.calls.some(({ text }) => text.includes("UPDATE device_challenges SET consumed_at"))).toBe(false);
    expect(client.calls.map(({ text }) => text)).toContain("ROLLBACK");
  });

  it("keeps the device-scoped database uniqueness index as supplemental migration coverage", () => {
    const migration = readFileSync("docker/postgres-init/68-device-rotation-idempotency-scope.sql", "utf8");

    expect(migration).toContain("idx_paired_devices_rotation_idem");
    expect(migration).toContain("ON paired_devices (id, rotation_idempotency_key)");
  });
});
