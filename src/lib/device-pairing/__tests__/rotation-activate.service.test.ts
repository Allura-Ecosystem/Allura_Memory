import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthAudience: vi.fn(() => "https://device-auth.example.test"),
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.test"),
  getDeviceKeyGraceHours: vi.fn(() => 24),
}));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  parseSignatureInput: vi.fn(() => ({
    label: "sig1",
    coveredComponents: [
      "@method", "@target-uri", "content-digest", "x-allura-purpose",
      "x-allura-audience", "x-allura-nonce", "x-allura-proof-id",
      "x-allura-device-id", "x-allura-key-generation",
    ],
    created: Math.floor(Date.now() / 1000) - 1,
    expires: Math.floor(Date.now() / 1000) + 60,
    keyid: "key-next",
    alg: "ecdsa-p256",
  })),
  verifyDeviceSignature: vi.fn(() => ({
    valid: true,
    purpose: "rotation_activate",
    deviceId: "dev-rotation",
    keyGeneration: 4,
  })),
}));
vi.mock("@/lib/device-pairing/audit", () => ({ emitDeviceAudit: vi.fn() }));

import { emitDeviceAudit } from "@/lib/device-pairing/audit";

function signStagedReceipt(receiptId: string, deviceId: string, newKeyId: string, issuedAt: string, newPublicKey: string, newKeyAlgo: string): string {
  const secret = process.env.ALLURA_MCP_TOKEN_SECRET;
  if (!secret) throw new Error("test requires ALLURA_MCP_TOKEN_SECRET");
  const key = createHmac("sha256", secret).update("allura/device-pairing/rotation-receipt/v1").digest();
  const publicKeyDigest = createHash("sha256").update(newPublicKey).digest("base64url");
  return createHmac("sha256", key).update([receiptId, deviceId, newKeyId, issuedAt, "", publicKeyDigest, newKeyAlgo].join("\n")).digest("base64url");
}

function signActivatedReceipt(receipt: {
  receipt_id: string; device_id: string; old_key_id: string; old_public_key: string; old_public_key_digest: string; old_key_algo: string;
  new_key_id: string; new_public_key_digest: string; new_key_algo: string;
  key_generation: number; activated_at: string; grace_expires_at: string;
}): string {
  const secret = process.env.ALLURA_MCP_TOKEN_SECRET;
  if (!secret) throw new Error("test requires ALLURA_MCP_TOKEN_SECRET");
  const key = createHmac("sha256", secret).update("allura/device-pairing/rotation-receipt/v1").digest();
  return createHmac("sha256", key).update([
    "allura/device-pairing/rotation-activated/v1", receipt.receipt_id, receipt.device_id,
    receipt.old_key_id, receipt.old_public_key_digest, receipt.old_key_algo, receipt.new_key_id,
    receipt.new_public_key_digest, receipt.new_key_algo, String(receipt.key_generation),
    receipt.activated_at, receipt.grace_expires_at,
  ].join("\n")).digest("base64url");
}

describe("Story 29.13 — rotation activate service", () => {
  const originalReceiptSecret = process.env.ALLURA_MCP_TOKEN_SECRET;

  beforeEach(() => {
    process.env.ALLURA_MCP_TOKEN_SECRET = "test-rotation-activate-secret";
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalReceiptSecret === undefined) delete process.env.ALLURA_MCP_TOKEN_SECRET;
    else process.env.ALLURA_MCP_TOKEN_SECRET = originalReceiptSecret;
  });

  it("atomically swaps the proven pending key and returns a receipt binding both key generations", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const stagedAt = "2026-09-10T00:00:00.000Z";
    const stagedSignature = signStagedReceipt("rot-staged", "dev-rotation", "key-next", stagedAt, "next-public-key", "ecdsa-p256");
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          pending_next_public_key: "next-public-key", pending_next_key_id: "key-next", pending_next_key_algo: "ecdsa-p256", key_generation: 4,
          rotation_idempotency_key: "stage-idempotency", rotation_receipt: {
            receipt_id: "rot-staged",
            rotation_receipt: { device_id: "dev-rotation", new_key_id: "key-next", issued_at: stagedAt, grace_expires_at: null, signature: stagedSignature },
          },
        }] };
        if (text.includes("FROM device_challenges")) return { rows: [{
          id: "challenge-activate", nonce: "activate-nonce", audience: "https://device-auth.example.test",
          purpose: "rotation_activate", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
        }] };
        if (text.includes("UPDATE device_challenges SET consumed_at")) return { rows: [{ id: "challenge-activate" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { activateRotation } = await import("@/lib/device-pairing/rotation-service");

    const result = await activateRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", receipt_id: "rot-staged", idempotency_key: "stage-idempotency", request_target: "/api/device-pairing/rotation/activate",
      request_body: new TextEncoder().encode('{"device_id":"dev-rotation","receipt_id":"rot-staged"}'),
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_activate", audience: "https://device-auth.example.test",
        nonce: "activate-nonce", proof_id: "challenge-activate", device_id: "dev-rotation", key_generation: "4",
        signature_input: "sig1=()", signature: "ZmFrZQ==",
      },
    });

    expect(result).toMatchObject({
      status: "ACTIVATED", key_generation: 5,
      rotation_receipt: {
        receipt_id: "rot-staged", device_id: "dev-rotation", old_key_id: "key-current", old_public_key: "current-public-key",
        old_key_algo: "ecdsa-p256", new_key_id: "key-next",
        old_public_key_digest: expect.any(String), new_public_key_digest: expect.any(String), new_key_algo: "ecdsa-p256",
        grace_expires_at: expect.any(String), signature: expect.any(String),
      },
    });
    const swap = calls.find((call) => call.text.includes("UPDATE paired_devices SET current_public_key"));
    expect(swap?.text).toContain("pending_next_public_key = NULL");
    expect(swap?.params).toEqual(expect.arrayContaining(["next-public-key", "key-next", "ecdsa-p256", "dev-rotation"]));
    expect(calls.find((call) => call.text.includes("UPDATE device_challenges SET consumed_at"))?.params).toEqual(["challenge-activate"]);
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({ event_type: "DEVICE_ROTATION_ACTIVATED", group_id: "allura-faithmeats" }));
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));

    await expect(activateRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", receipt_id: "rot-staged", idempotency_key: "different-key", request_target: "/api/device-pairing/rotation/activate",
      request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_activate", audience: "https://device-auth.example.test",
        nonce: "activate-nonce", proof_id: "challenge-activate", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
  });

  it("replays a receipt-bound activation using the pre-swap signed generation without consuming a challenge", async () => {
    const activated = {
      receipt_id: "rot-staged", device_id: "dev-rotation", old_key_id: "key-current",
      old_public_key: "current-public-key", old_key_algo: "ecdsa-p256",
      old_public_key_digest: createHash("sha256").update("current-public-key").digest("base64url"),
      new_key_id: "key-next", new_public_key_digest: createHash("sha256").update("next-public-key").digest("base64url"),
      new_key_algo: "ecdsa-p256", key_generation: 5, activated_at: "2026-09-10T00:00:00.000Z",
      grace_expires_at: "2026-09-11T00:00:00.000Z",
    };
    const receipt = { ...activated, signature: signActivatedReceipt(activated) };
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "next-public-key", current_key_id: "key-next", current_key_algo: "ecdsa-p256",
          key_generation: 5, pending_next_public_key: null, pending_next_key_id: null, pending_next_key_algo: null,
          rotation_idempotency_key: "stage-idempotency", rotation_receipt: receipt,
        }] };
        if (text.includes("FROM device_challenges")) throw new Error("replay must not read a challenge");
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { activateRotation } = await import("@/lib/device-pairing/rotation-service");

    await expect(activateRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", receipt_id: "rot-staged", idempotency_key: "stage-idempotency", request_target: "/api/device-pairing/rotation/activate",
      request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_activate", audience: "https://device-auth.example.test",
        nonce: "unused", proof_id: "expired-challenge", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).resolves.toMatchObject({ status: "ALREADY_ACTIVATED", key_generation: 5, rotation_receipt: receipt });
    expect(calls.some((text) => text.includes("FROM device_challenges"))).toBe(false);
    expect(emitDeviceAudit).not.toHaveBeenCalled();
  });
});
