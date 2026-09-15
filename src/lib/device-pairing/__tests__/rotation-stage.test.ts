import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";


vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthAudience: vi.fn(() => "https://device-auth.example.test"),
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.test"),
}));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  parseSignatureInput: vi.fn(() => ({
    label: "sig1",
    coveredComponents: [
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
    created: Math.floor(Date.now() / 1000) - 1,
    expires: Math.floor(Date.now() / 1000) + 60,
    keyid: "key-current",
    alg: "ecdsa-p256",
  })),
  verifyDeviceSignature: vi.fn(() => ({
    valid: true,
    purpose: "rotation_stage",
    deviceId: "dev-rotation",
    keyGeneration: 4,
  })),
}));
vi.mock("@/lib/device-pairing/audit", () => ({
  emitDeviceAudit: vi.fn(),
}));

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import { verifyDeviceSignature } from "@/lib/device-pairing/rfc9421";

function signPersistedReceipt(receiptId: string, deviceId: string, newKeyId: string, issuedAt: string, pendingPublicKey: string, pendingKeyAlgo: string): string {
  const root = process.env.ALLURA_MCP_TOKEN_SECRET;
  if (!root) throw new Error("test requires ALLURA_MCP_TOKEN_SECRET");
  const key = createHmac("sha256", root).update("allura/device-pairing/rotation-receipt/v1").digest();
  const publicKeyDigest = createHash("sha256").update(pendingPublicKey).digest("base64url");
  return createHmac("sha256", key).update([receiptId, deviceId, newKeyId, issuedAt, "", publicKeyDigest, pendingKeyAlgo].join("\n")).digest("base64url");
}

describe("Story 29.12 — rotation stage service", () => {
  afterEach(() => vi.clearAllMocks());

  it("stages a signed new key, emits one transactional audit, and leaves the current key active", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) {
          return { rows: [{ group_id: "allura-faithmeats" }] };
        }
        if (text.includes("FROM paired_devices")) {
          return {
            rows: [{
              id: "dev-rotation",
              group_id: "allura-faithmeats",
              workspace_id: "ws-rotation",
              principal_id: "principal-rotation",
              lifecycle_state: "APPROVED",
              current_public_key: "current-public-key",
              current_key_id: "key-current",
              current_key_algo: "ecdsa-p256",
              key_generation: 4,
              pending_next_public_key: null,
              rotation_idempotency_key: null,
            }],
          };
        }
        if (text.includes("FROM device_challenges")) {
          return {
            rows: [{
              id: "challenge-rotation",
              nonce: "nonce-rotation",
              audience: "https://device-auth.example.test",
              purpose: "rotation_stage",
              expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
            }],
          };
        }
        if (text.includes("UPDATE device_challenges SET consumed_at")) return { rows: [{ id: "challenge-rotation" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");

    const result = await stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation",
      new_public_key: "next-public-key",
      new_key_id: "key-next",
      new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-rotation-1",
      request_target: "/api/device-pairing/rotation/stage",
      request_body: new TextEncoder().encode('{"device_id":"dev-rotation"}'),
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:",
        purpose: "rotation_stage",
        audience: "https://device-auth.example.test",
        nonce: "nonce-rotation",
        proof_id: "challenge-rotation",
        device_id: "dev-rotation",
        key_generation: "4",
        signature_input: "sig1=()",
        signature: "ZmFrZQ==",
      },
    });

    expect(result).toMatchObject({
      receipt_id: expect.stringMatching(/^rot_/),
      rotation_receipt: {
        device_id: "dev-rotation",
        new_key_id: "key-next",
        grace_expires_at: null,
        issued_at: expect.any(String),
        signature: expect.any(String),
      },
    });
    const stageUpdate = calls.find((call) => call.text.includes("UPDATE paired_devices"));
    const challengeConsumption = calls.find((call) => call.text.includes("UPDATE device_challenges SET consumed_at"));
    expect(challengeConsumption?.params).toEqual(["challenge-rotation"]);
    expect(stageUpdate?.params).toEqual(expect.arrayContaining([
      "next-public-key",
      "key-next",
      "ecdsa-p256",
      "idem-rotation-1",
      "dev-rotation",
    ]));
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-faithmeats",
      workspace_id: "ws-rotation",
      agent_id: "principal-rotation",
      event_type: "DEVICE_ROTATION_STAGED",
    }));
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("replays the persisted staged receipt without re-auditing when the signed request key fields match", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const receiptId = "rot_persisted";
    const issuedAt = "2026-09-10T00:00:00.000Z";
    const stored = {
      receipt_id: receiptId,
      rotation_receipt: {
        device_id: "dev-rotation",
        new_key_id: "stored-key-id",
        issued_at: issuedAt,
        grace_expires_at: null,
        signature: signPersistedReceipt(receiptId, "dev-rotation", "stored-key-id", issuedAt, "stored-next-key", "ecdsa-p256"),
      },
    };
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current",
          current_key_algo: "ecdsa-p256", key_generation: 4, pending_next_public_key: "stored-next-key",
          pending_next_key_id: "stored-key-id", pending_next_key_algo: "ecdsa-p256",
          rotation_idempotency_key: "idem-rotation-1", rotation_receipt: stored,
        }] };
        if (text.includes("FROM device_challenges")) return { rows: [{
          id: "challenge-replay", nonce: "replay-nonce", audience: "https://device-auth.example.test",
          purpose: "rotation_stage", expires_at: new Date(Date.now() + 60_000).toISOString(),
        }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");

    const result = await stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "stored-next-key", new_key_id: "stored-key-id", new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-rotation-1", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "replay-nonce", proof_id: "challenge-replay", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    });

    expect(result).toEqual(stored);
    expect(verifyDeviceSignature).toHaveBeenCalledOnce();
    expect(emitDeviceAudit).not.toHaveBeenCalled();
    expect(calls.some((call) => /UPDATE paired_devices|DELETE FROM device_challenges/.test(call.text))).toBe(false);
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));

    await expect(stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "different-next-key", new_key_id: "stored-key-id", new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-rotation-1", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "replay-nonce", proof_id: "challenge-replay", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
  });

  it("rejects a receipt whose HMAC was made for different staged key material", async () => {
    const receiptId = "rot-key-swap";
    const issuedAt = "2026-09-10T00:00:00.000Z";
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          key_generation: 4, pending_next_public_key: "altered-next-key", pending_next_key_id: "stored-key-id", pending_next_key_algo: "ecdsa-p256",
          rotation_idempotency_key: "idem-key-swap", rotation_receipt: {
            receipt_id: receiptId, rotation_receipt: { device_id: "dev-rotation", new_key_id: "stored-key-id", issued_at: issuedAt, grace_expires_at: null, signature: signPersistedReceipt(receiptId, "dev-rotation", "stored-key-id", issuedAt, "stored-next-key", "ecdsa-p256") },
          },
        }] };
        if (text.includes("FROM device_challenges")) return { rows: [{ id: "challenge-replay", nonce: "replay-nonce", audience: "https://device-auth.example.test", purpose: "rotation_stage", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: new Date().toISOString() }] };
        return { rows: [] };
      }), release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");

    await expect(stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "altered-next-key", new_key_id: "stored-key-id", new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-key-swap", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "replay-nonce", proof_id: "challenge-replay", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
  });

  it("rejects an expired rotation challenge before consuming it", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          key_generation: 4, pending_next_public_key: null, rotation_idempotency_key: null,
        }] };
        if (text.includes("FROM device_challenges")) return { rows: [{
          id: "challenge-rotation", nonce: "nonce-rotation", audience: "https://device-auth.example.test", purpose: "rotation_stage",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");

    await expect(stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "next-public-key", new_key_id: "key-next", new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-expired", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "nonce-rotation", proof_id: "challenge-rotation", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "AUTH_EXPIRED" });

    expect(verifyDeviceSignature).not.toHaveBeenCalled();
    expect(calls.some((text) => text.includes("DELETE FROM device_challenges") || text.includes("UPDATE paired_devices"))).toBe(false);
  });

  it("rejects an already-consumed challenge when no rotation has been staged", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          key_generation: 4, pending_next_public_key: null, rotation_idempotency_key: null,
        }] };
        if (text.includes("FROM device_challenges")) return { rows: [{
          id: "challenge-consumed", nonce: "nonce-consumed", audience: "https://device-auth.example.test", purpose: "rotation_stage",
          expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: new Date().toISOString(),
        }] };
        return { rows: [] };
      }), release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");

    await expect(stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "next-public-key", new_key_id: "key-next", new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-consumed", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "nonce-consumed", proof_id: "challenge-consumed", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "AUTH_EXPIRED" });

    expect(verifyDeviceSignature).not.toHaveBeenCalled();
    expect(calls.some((text) => text.includes("UPDATE paired_devices") || text.includes("UPDATE device_challenges SET consumed_at"))).toBe(false);
  });

  it("rejects a different idempotency key after a key is already staged without consuming a challenge", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          key_generation: 4, pending_next_public_key: "already-staged-key", pending_next_key_id: "already-staged-key-id",
          rotation_idempotency_key: "idem-original", rotation_receipt: { receipt_id: "rot_original", rotation_receipt: { device_id: "dev-rotation", new_key_id: "already-staged-key-id", issued_at: "2026-09-10T00:00:00.000Z", grace_expires_at: null, signature: "signature" } },
        }] };
        return { rows: [] };
      }), release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");
    await expect(stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "attacker-key", new_key_id: "attacker-key-id", new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-different", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "ignored", proof_id: "ignored", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect(calls.some((text) => text.includes("FROM device_challenges") || text.includes("DELETE FROM device_challenges") || text.includes("UPDATE paired_devices"))).toBe(false);
  });

  it("rejects a shape-valid persisted receipt with a tampered signature", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          key_generation: 4, pending_next_public_key: "stored-next-key", pending_next_key_id: "stored-key-id", rotation_idempotency_key: "idem-replay", rotation_receipt: {
            receipt_id: "rot_tampered", rotation_receipt: { device_id: "dev-rotation", new_key_id: "stored-key-id", issued_at: "2026-09-10T00:00:00.000Z", grace_expires_at: null, signature: "tampered" },
          },
        }] };
        if (text.includes("FROM device_challenges")) return { rows: [{ id: "challenge-replay", nonce: "replay-nonce", audience: "https://device-auth.example.test", purpose: "rotation_stage", expires_at: new Date(Date.now() + 60_000).toISOString() }] };
        return { rows: [] };
      }), release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");
    await expect(stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "ignored", new_key_id: "ignored", new_key_algo: "ecdsa-p256", idempotency_key: "idem-replay", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "replay-nonce", proof_id: "challenge-replay", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
  });

  it("rejects a non-approved device before inspecting its rotation challenge", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-rotation", group_id: "allura-faithmeats", workspace_id: "ws-rotation", principal_id: "principal-rotation",
          lifecycle_state: "REVOKED", current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          key_generation: 4, pending_next_public_key: null, rotation_idempotency_key: null,
        }] };
        return { rows: [] };
      }), release: vi.fn(),
    };
    const { stageRotation } = await import("@/lib/device-pairing/rotation-service");

    await expect(stageRotation({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-rotation", new_public_key: "next-public-key", new_key_id: "key-next", new_key_algo: "ecdsa-p256",
      idempotency_key: "idem-revoked", request_target: "/api/device-pairing/rotation/stage", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "rotation_stage", audience: "https://device-auth.example.test", nonce: "unused", proof_id: "unused", device_id: "dev-rotation", key_generation: "4", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "DEVICE_NOT_APPROVED" });

    expect(calls.some((text) => text.includes("FROM device_challenges"))).toBe(false);
  });
});
