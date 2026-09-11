import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/config", () => ({
  getAuthConfig: () => ({ ALLURA_MCP_BASE_URL: "https://mcp.example.test" }),
}));
vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthAudience: () => "https://device-auth.example.test",
  getDeviceAuthOrigin: () => "https://device-auth.example.test",
}));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  hasExactCoveredComponents: (covered: readonly string[], expected: readonly string[]) =>
    covered.length === expected.length && new Set(covered.map((component) => component.toLowerCase())).size === expected.length &&
    expected.every((component) => covered.map((value) => value.toLowerCase()).includes(component)),
  parseSignatureInput: () => ({
    label: "sig1",
    coveredComponents: ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"],
    created: Math.floor(Date.now() / 1000) - 1,
    expires: Math.floor(Date.now() / 1000) + 60,
    keyid: "kid-1",
    alg: "ecdsa-p256",
  }),
  verifyDeviceSignature: () => ({ valid: true, purpose: "exchange" }),
}));
vi.mock("@/lib/mcp-token/repository", () => ({
  createDeviceToken: vi.fn(async () => ({ raw: "allura_mcp_exchange", record: { id: "tok-new", expires_at: futureExpiry() } })),
}));
vi.mock("@/lib/device-pairing/audit", () => ({ emitDeviceAudit: vi.fn() }));

import { emitDeviceAudit } from "@/lib/device-pairing/audit";
import { ExchangeError, exchangeToken } from "@/lib/device-pairing/exchange-service";
import { createDeviceToken } from "@/lib/mcp-token/repository";

beforeEach(() => {
  vi.mocked(createDeviceToken).mockClear();
  vi.mocked(emitDeviceAudit).mockClear();
});

const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();

describe("Story 29.9 — exchange service", () => {
  it("resolves authority only from the locked device and mints a read-only token", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{ id: "dev-1", group_id: "allura-faithmeats", workspace_id: "ws-1", principal_id: "human-1", current_public_key: "public-key", current_key_id: "kid-1", current_key_algo: "ecdsa-p256", lifecycle_state: "APPROVED" }] };
        if (text.includes("FROM device_challenges")) return { rows: [{ id: "challenge-1", nonce: "nonce-1", audience: "https://device-auth.example.test", purpose: "exchange", expires_at: futureExpiry() }] };
        if (text.includes("FROM memberships")) return { rows: [{ role: "admin" }] };
        if (text.includes("FROM workspaces")) return { rows: [{ lock_mode: "read_only" }] };
        if (text.includes("UPDATE device_challenges")) return { rows: [{ id: "challenge-1" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    await expect(exchangeToken({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-1",
      challenge_id: "challenge-1",
      request_target: "/api/device-pairing/exchange",
      request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "exchange", audience: "https://device-auth.example.test", nonce: "nonce-1", proof_id: "challenge-1", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    })).resolves.toMatchObject({ access_token: "allura_mcp_exchange", mcp_endpoint: "https://mcp.example.test/mcp" });

    expect(createDeviceToken).toHaveBeenCalledWith(client, expect.objectContaining({
      paired_device_id: "dev-1",
      membership_role: "admin",
      lock_mode: "read_only",
    }));
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-faithmeats",
      workspace_id: "ws-1",
      agent_id: "human-1",
      event_type: "DEVICE_EXCHANGE_ALLOWED",
      metadata: { device_id: "dev-1", challenge_id: "challenge-1" },
    }));
    expect(calls).toContainEqual(expect.objectContaining({ text: expect.stringContaining("set_config('app.current_group_id'"), params: ["allura-faithmeats"] }));
    expect(calls).toContainEqual(expect.objectContaining({ text: expect.stringContaining("set_config('app.current_tenant'"), params: ["allura-faithmeats"] }));
    expect(calls.map((call) => call.text)).toContain("COMMIT");
  });

  it("audits and denies a full-lockdown workspace without minting a token", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{ id: "dev-lock", group_id: "allura-faithmeats", workspace_id: "ws-lock", principal_id: "human-lock", current_public_key: "public-key", current_key_id: "kid-1", current_key_algo: "ecdsa-p256", lifecycle_state: "APPROVED" }] };
        if (text.includes("FROM device_challenges")) return { rows: [{ id: "challenge-lock", nonce: "nonce-lock", audience: "https://device-auth.example.test", purpose: "exchange", expires_at: futureExpiry() }] };
        if (text.includes("FROM memberships")) return { rows: [{ role: "admin" }] };
        if (text.includes("FROM workspaces")) return { rows: [{ lock_mode: "full_lockdown" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    await expect(exchangeToken({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-lock", challenge_id: "challenge-lock", request_target: "/api/device-pairing/exchange", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "exchange", audience: "https://device-auth.example.test", nonce: "nonce-lock", proof_id: "challenge-lock", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    })).rejects.toMatchObject({ code: "WORKSPACE_LOCKED" } satisfies Partial<ExchangeError>);

    expect(createDeviceToken).not.toHaveBeenCalled();
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-faithmeats", workspace_id: "ws-lock", agent_id: "human-lock",
      event_type: "DEVICE_EXCHANGE_DENIED", metadata: { device_id: "dev-lock", challenge_id: "challenge-lock", reason_code: "WORKSPACE_LOCKED" },
    }));
  });

  it("revokes linked tokens and audits when the current membership is inactive", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{ id: "dev-removed", group_id: "allura-faithmeats", workspace_id: "ws-removed", principal_id: "human-removed", current_public_key: "public-key", current_key_id: "kid-1", current_key_algo: "ecdsa-p256", lifecycle_state: "APPROVED" }] };
        if (text.includes("FROM device_challenges")) return { rows: [{ id: "challenge-removed", nonce: "nonce-removed", audience: "https://device-auth.example.test", purpose: "exchange", expires_at: futureExpiry() }] };
        if (text.includes("FROM memberships")) return { rows: [] };
        return { rows: [] };
      }), release: vi.fn(),
    };
    await expect(exchangeToken({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-removed", challenge_id: "challenge-removed", request_target: "/api/device-pairing/exchange", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "exchange", audience: "https://device-auth.example.test", nonce: "nonce-removed", proof_id: "challenge-removed", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    })).rejects.toMatchObject({ code: "MEMBERSHIP_INACTIVE" });
    expect(calls.some((text) => text.includes("UPDATE mcp_tokens") && text.includes("paired_device_id"))).toBe(true);
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-faithmeats",
      workspace_id: "ws-removed",
      event_type: "DEVICE_EXCHANGE_DENIED",
      agent_id: "human-removed",
      metadata: { device_id: "dev-removed", challenge_id: "challenge-removed", reason_code: "MEMBERSHIP_INACTIVE" },
      status: "failed",
    }));
  });

  it("persists a denial receipt when its resolved workspace disappears", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("resolve_device_route")) return { rows: [{ group_id: "allura-faithmeats" }] };
        if (text.includes("FROM paired_devices")) return { rows: [{ id: "dev-missing-workspace", group_id: "allura-faithmeats", workspace_id: "ws-missing", principal_id: "human-missing", current_public_key: "public-key", current_key_id: "kid-1", current_key_algo: "ecdsa-p256", lifecycle_state: "APPROVED" }] };
        if (text.includes("FROM device_challenges")) return { rows: [{ id: "challenge-missing-workspace", nonce: "nonce-missing-workspace", audience: "https://device-auth.example.test", purpose: "exchange", expires_at: futureExpiry() }] };
        if (text.includes("FROM memberships")) return { rows: [{ role: "admin" }] };
        if (text.includes("FROM workspaces")) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    await expect(exchangeToken({ connect: vi.fn(async () => client) } as never, {
      device_id: "dev-missing-workspace", challenge_id: "challenge-missing-workspace", request_target: "/api/device-pairing/exchange", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "exchange", audience: "https://device-auth.example.test", nonce: "nonce-missing-workspace", proof_id: "challenge-missing-workspace", signature_input: "sig1=()", signature: "ZmFrZQ==" },
    })).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    expect(emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-faithmeats",
      workspace_id: "ws-missing",
      agent_id: "human-missing",
      event_type: "DEVICE_EXCHANGE_DENIED",
      metadata: { device_id: "dev-missing-workspace", challenge_id: "challenge-missing-workspace", reason_code: "WORKSPACE_NOT_FOUND" },
      status: "failed",
    }));
  });
});
