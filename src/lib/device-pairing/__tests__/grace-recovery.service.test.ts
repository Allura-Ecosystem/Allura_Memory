import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthAudience: vi.fn(() => "https://device-auth.example.test"),
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.test"),
  getDeviceGraceMaxExchanges: vi.fn(() => 5),
}));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  hasExactCoveredComponents: vi.fn((covered: readonly string[], canonical: readonly string[]) =>
    covered.length === canonical.length && new Set(covered).size === canonical.length && canonical.every((component) => covered.includes(component)),
  ),
  parseSignatureInput: vi.fn(() => ({
    label: "sig1",
    coveredComponents: [
      "@method", "@target-uri", "content-digest", "x-allura-purpose",
      "x-allura-audience", "x-allura-nonce", "x-allura-proof-id",
      "x-allura-device-id", "x-allura-key-generation",
    ],
    created: Math.floor(Date.now() / 1000) - 1,
    expires: Math.floor(Date.now() / 1000) + 60,
    keyid: "key-old",
    alg: "ecdsa-p256",
  })),
  verifyDeviceSignature: vi.fn(() => ({ valid: true, purpose: "recovery_status" })),
}));
vi.mock("@/lib/device-pairing/audit", () => ({ emitDeviceAudit: vi.fn() }));

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import { parseSignatureInput } from "@/lib/device-pairing/rfc9421";

const receiptSecret = "test-grace-recovery-receipt-secret";

function signedActivatedReceipt() {
  const unsigned = {
    receipt_id: "rot-activated",
    device_id: "dev-recovery",
    old_key_id: "key-old",
    old_public_key: "old-public-key",
    old_public_key_digest: createHash("sha256").update("old-public-key").digest("base64url"),
    old_key_algo: "ecdsa-p256" as const,
    new_key_id: "key-current",
    new_public_key_digest: createHash("sha256").update("current-public-key").digest("base64url"),
    new_key_algo: "ecdsa-p256" as const,
    key_generation: 5,
    activated_at: "2026-09-10T00:00:00.000Z",
    grace_expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  const key = createHmac("sha256", receiptSecret)
    .update("allura/device-pairing/rotation-receipt/v1").digest();
  const signature = createHmac("sha256", key).update([
    "allura/device-pairing/rotation-activated/v1", unsigned.receipt_id, unsigned.device_id,
    unsigned.old_key_id, unsigned.old_public_key_digest, unsigned.old_key_algo,
    unsigned.new_key_id, unsigned.new_public_key_digest, unsigned.new_key_algo,
    String(unsigned.key_generation), unsigned.activated_at, unsigned.grace_expires_at,
  ].join("\n")).digest("base64url");
  return { ...unsigned, signature };
}

describe("Story 29.14 — grace recovery service", () => {
  const originalReceiptSecret = process.env.ALLURA_MCP_TOKEN_SECRET;

  beforeEach(() => { process.env.ALLURA_MCP_TOKEN_SECRET = receiptSecret; });
  afterEach(() => {
    vi.clearAllMocks();
    if (originalReceiptSecret === undefined) delete process.env.ALLURA_MCP_TOKEN_SECRET;
    else process.env.ALLURA_MCP_TOKEN_SECRET = originalReceiptSecret;
  });

  it("returns only the persisted HMAC-authenticated activated receipt after valid old-key recovery", async () => {
    const receipt = signedActivatedReceipt();
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-recovery", group_id: "allura-faithmeats", workspace_id: "ws-recovery", principal_id: "principal-recovery",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current",
          current_key_algo: "ecdsa-p256", key_generation: 5, rotation_grace_expires_at: receipt.grace_expires_at,
          grace_exchange_count: 0, rotation_receipt: receipt,
        }] };
        if (text.includes("device_challenges")) return { rows: [{
          id: "challenge-recovery", nonce: "recovery-nonce", audience: "https://device-auth.example.test",
          purpose: "recovery_status", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
        }] };
        if (text.includes("UPDATE device_challenges SET consumed_at")) return { rows: [{ id: "challenge-recovery" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { isStoredActivatedReceipt, recoverViaGrace } = await import("@/lib/device-pairing/rotation-service");
    const body = new TextEncoder().encode('{"device_id":"dev-recovery","receipt_id":"rot-activated"}');

    const result = await recoverViaGrace({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-recovery", receipt_id: "rot-activated", request_target: "/api/device-pairing/recovery", request_body: body,
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "recovery_status", audience: "https://device-auth.example.test",
        nonce: "recovery-nonce", proof_id: "challenge-recovery", device_id: "dev-recovery", key_generation: "4",
        signature_input: "sig1=()", signature: "ZmFrZQ==",
      },
    });

    expect(result).toMatchObject({ status: "RECOVERED", rotation_receipt: { receipt_id: receipt.receipt_id } });
    expect(result.rotation_receipt).not.toHaveProperty("old_public_key");
    expect(result.rotation_receipt).not.toHaveProperty("old_key_algo");
    expect(isStoredActivatedReceipt(receipt, {
      id: "dev-recovery", current_public_key: "current-public-key", current_key_id: "key-current",
      current_key_algo: "ecdsa-p256", key_generation: 5,
    })).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["rotation_receipt", "status"]);
    expect(calls.find((call) => call.text.includes("UPDATE paired_devices SET grace_exchange_count"))?.params)
      .toEqual(["dev-recovery"]);
    expect(calls.find((call) => call.text.includes("UPDATE device_challenges SET consumed_at"))?.params)
      .toEqual(["challenge-recovery"]);
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      event_type: "DEVICE_ROTATION_RECOVERED",
      metadata: expect.objectContaining({ device_id: "dev-recovery", receipt_id: "rot-activated", recovery: true, via: "grace" }),
    }));
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
  });

  it("rejects a recovery proof that duplicates or extends the canonical components", async () => {
    const receipt = signedActivatedReceipt();
    vi.mocked(parseSignatureInput).mockReturnValueOnce({
      label: "sig1",
      coveredComponents: [
        "@method", "@target-uri", "content-digest", "x-allura-purpose",
        "x-allura-audience", "x-allura-nonce", "x-allura-proof-id",
        "x-allura-device-id", "x-allura-key-generation", "x-allura-purpose",
      ],
      created: Math.floor(Date.now() / 1000) - 1,
      expires: Math.floor(Date.now() / 1000) + 60,
      keyid: "key-old",
      alg: "ecdsa-p256",
    });
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-recovery", group_id: "allura-faithmeats", workspace_id: "ws-recovery", principal_id: "principal-recovery",
          lifecycle_state: "APPROVED", current_public_key: "current-public-key", current_key_id: "key-current",
          current_key_algo: "ecdsa-p256", key_generation: 5, rotation_grace_expires_at: receipt.grace_expires_at,
          grace_exchange_count: 0, rotation_receipt: receipt,
        }] };
        if (text.includes("device_challenges")) return { rows: [{
          id: "challenge-recovery", nonce: "recovery-nonce", audience: "https://device-auth.example.test",
          purpose: "recovery_status", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null,
        }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { recoverViaGrace } = await import("@/lib/device-pairing/rotation-service");

    await expect(recoverViaGrace({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-recovery", receipt_id: "rot-activated", request_target: "/api/device-pairing/recovery",
      request_body: new TextEncoder().encode('{"device_id":"dev-recovery"}'),
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "recovery_status", audience: "https://device-auth.example.test",
        nonce: "recovery-nonce", proof_id: "challenge-recovery", device_id: "dev-recovery", key_generation: "4",
        signature_input: "sig1=()", signature: "ZmFrZQ==",
      },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
  });
});
