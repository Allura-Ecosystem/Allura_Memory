import { describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthAudience: vi.fn(() => "https://device-auth.example.test"),
}));
vi.mock("@/lib/device-pairing/audit", () => ({
  emitDeviceAudit: vi.fn(),
}));

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import { issueChallenge } from "@/lib/device-pairing/challenge-service";

describe("Story 29.7 — challenge service", () => {
  it("issues recovery_status at the server-authenticated old generation without exposing old key material", async () => {
    const originalSecret = process.env.ALLURA_MCP_TOKEN_SECRET;
    process.env.ALLURA_MCP_TOKEN_SECRET = "challenge-recovery-receipt-secret";
    const oldPublicKey = "old-public-key";
    const currentPublicKey = "current-public-key";
    const graceExpiresAt = new Date(Date.now() + 60_000).toISOString();
    const unsignedReceipt = {
      receipt_id: "rot-recovery", device_id: "dev-recovery", old_key_id: "key-old",
      old_public_key: oldPublicKey, old_public_key_digest: createHash("sha256").update(oldPublicKey).digest("base64url"), old_key_algo: "ecdsa-p256" as const,
      new_key_id: "key-current", new_public_key_digest: createHash("sha256").update(currentPublicKey).digest("base64url"), new_key_algo: "ecdsa-p256" as const,
      key_generation: 5, activated_at: "2026-09-10T00:00:00.000Z", grace_expires_at: graceExpiresAt,
    };
    const receiptKey = createHmac("sha256", process.env.ALLURA_MCP_TOKEN_SECRET)
      .update("allura/device-pairing/rotation-receipt/v1").digest();
    const receipt = {
      ...unsignedReceipt,
      signature: createHmac("sha256", receiptKey).update([
        "allura/device-pairing/rotation-activated/v1", unsignedReceipt.receipt_id, unsignedReceipt.device_id,
        unsignedReceipt.old_key_id, unsignedReceipt.old_public_key_digest, unsignedReceipt.old_key_algo,
        unsignedReceipt.new_key_id, unsignedReceipt.new_public_key_digest, unsignedReceipt.new_key_algo,
        String(unsignedReceipt.key_generation), unsignedReceipt.activated_at, unsignedReceipt.grace_expires_at,
      ].join("\n")).digest("base64url"),
    };
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-recovery", principal_id: "principal-recovery", workspace_id: "ws-recovery", lifecycle_state: "APPROVED",
          key_generation: 5, current_public_key: currentPublicKey, current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          rotation_grace_expires_at: graceExpiresAt, rotation_receipt: receipt, pending_next_public_key: null,
        }] };
        if (text.includes("INSERT INTO device_challenges")) return { rows: [{ id: "challenge-recovery", expires_at: graceExpiresAt }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    try {
      const result = await issueChallenge({ connect: vi.fn(async () => client) } as never, {
        device_id: "dev-recovery", purpose: "recovery_status",
      });
      expect(result.server_context).toMatchObject({ device_id: "dev-recovery", key_generation: 4 });
      expect(result.server_context).not.toHaveProperty("old_public_key");
      expect(result.server_context).not.toHaveProperty("old_key_algo");
      expect(JSON.parse(String(calls.find((call) => call.text.includes("INSERT INTO device_challenges"))?.params?.[6])))
        .toMatchObject({ key_generation: 4 });
    } finally {
      if (originalSecret === undefined) delete process.env.ALLURA_MCP_TOKEN_SECRET;
      else process.env.ALLURA_MCP_TOKEN_SECRET = originalSecret;
    }
  });

  it("fails closed for recovery_status when the activated receipt is invalid or the grace window has expired", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{
          id: "dev-no-recovery", principal_id: "principal-no-recovery", workspace_id: "ws-no-recovery", lifecycle_state: "APPROVED",
          key_generation: 5, current_public_key: "current-public-key", current_key_id: "key-current", current_key_algo: "ecdsa-p256",
          rotation_grace_expires_at: new Date(Date.now() - 1_000).toISOString(), rotation_receipt: { tampered: true }, pending_next_public_key: null,
        }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    await expect(issueChallenge({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-no-recovery", purpose: "recovery_status",
    })).rejects.toMatchObject({ code: "PURPOSE_NOT_AVAILABLE" });
    expect(calls.some((text) => text.includes("INSERT INTO device_challenges"))).toBe(false);
  });

  it("issues the first rotation_stage challenge before a pending key exists", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) {
          return { rows: [{ id: "dev-approved", principal_id: "principal-1", workspace_id: "ws-1", lifecycle_state: "APPROVED", key_generation: 4, pending_next_public_key: null }] };
        }
        if (text.includes("INSERT INTO device_challenges")) return { rows: [{ id: "challenge-first-rotation", expires_at: "2026-09-10T10:39:20.000Z" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    await expect(issueChallenge({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-approved",
      purpose: "rotation_stage",
    })).resolves.toMatchObject({ challenge_id: "challenge-first-rotation", purpose: "rotation_stage" });

    expect(calls.some((text) => text.includes("INSERT INTO device_challenges"))).toBe(true);
    expect(calls).toContain("COMMIT");
  });

  it("bootstraps RLS and issues a privacy-safe exchange challenge for an approved device", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const expiresAt = "2026-09-09T10:39:20.000Z";
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) {
          return { rows: [{ id: "dev-approved", principal_id: "principal-1", workspace_id: "ws-1", lifecycle_state: "APPROVED", key_generation: 4 }] };
        }
        if (text.includes("INSERT INTO device_challenges")) {
          return { rows: [{ id: "challenge-1", expires_at: expiresAt }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    const result = await issueChallenge(pool as never, {
      device_id: "dev-approved",
      purpose: "exchange",
    });

    expect(result).toMatchObject({
      challenge_id: "challenge-1",
      audience: "https://device-auth.example.test",
      purpose: "exchange",
      expires_at: expiresAt,
      server_context: { device_id: "dev-approved", key_generation: 4 },
    });
    expect(result.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.server_context).not.toHaveProperty("principal_id");
    expect(result.server_context).not.toHaveProperty("group_id");
    expect(result.server_context).not.toHaveProperty("workspace_id");
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("set_config('app.current_group_id'"),
      params: ["allura-faithmeats"],
    }));
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("set_config('app.current_workspace_id'"),
      params: ["ws-1"],
    }));
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("set_config('app.current_principal'"),
      params: ["principal-1"],
    }));
    expect(calls).toContainEqual(expect.objectContaining({
      text: expect.stringContaining("INSERT INTO device_challenges"),
      params: expect.arrayContaining(["allura-faithmeats", "dev-approved", "https://device-auth.example.test", "exchange"]),
    }));
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-faithmeats",
      workspace_id: "ws-1",
      agent_id: "principal-1",
      event_type: "DEVICE_CHALLENGE_ISSUED",
    }));
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
  });

  it("audits and rejects an unresolved device without inserting a challenge", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: null }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };

    await expect(issueChallenge(pool as never, {
      device_id: "dev-missing",
      purpose: "exchange",
    })).rejects.toMatchObject({
      code: "DEVICE_NOT_APPROVED",
    });

    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-system",
      agent_id: "device-enrollment",
      event_type: "DEVICE_EXCHANGE_DENIED",
      workspace_id: null,
      metadata: { device_id: "dev-missing", reason_code: "DEVICE_NOT_APPROVED" },
    }));
    expect(calls.some((call) => call.text.includes("INSERT INTO device_challenges"))).toBe(false);
    expect(calls.map((call) => call.text)).toEqual(expect.arrayContaining(["BEGIN", "COMMIT"]));
    expect(client.release).toHaveBeenCalledOnce();
  });
});
