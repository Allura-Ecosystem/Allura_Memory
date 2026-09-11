import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeToken: vi.fn(),
  getAppPool: vi.fn(),
  emitDeviceAudit: vi.fn(),
}));

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: mocks.getAppPool }));
vi.mock("@/lib/device-pairing/audit", () => ({ emitDeviceAudit: mocks.emitDeviceAudit }));
vi.mock("@/lib/device-pairing/exchange-service", () => ({
  ExchangeError: class ExchangeError extends Error {
    constructor(public readonly code: string, message: string) { super(message); }
  },
  exchangeToken: mocks.exchangeToken,
}));

import { ExchangeError } from "@/lib/device-pairing/exchange-service";

describe("Story 29.9 — exchange route", () => {
  beforeEach(() => {
    mocks.exchangeToken.mockReset();
    mocks.getAppPool.mockReset();
    mocks.emitDeviceAudit.mockReset();
  });

  it("rejects client tenant/workspace selectors and never forwards them to the exchange service", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.getAppPool.mockReturnValue({ connect: vi.fn(async () => client) });
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const request = new NextRequest("https://device.example.test/api/device-pairing/exchange?ignored=1", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "exchange", "x-allura-audience": "https://device.example.test",
        "x-allura-nonce": "nonce-1", "x-allura-proof-id": "challenge-1",
        "signature-input": 'sig1=("@method");created=1;expires=2;keyid="kid";alg="ecdsa-p256"', signature: "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-1", challenge_id: "challenge-1", group_id: "forged-group", workspace_id: "forged-workspace" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_REQUEST" });
    expect(mocks.exchangeToken).not.toHaveBeenCalled();
    expect(mocks.emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-system",
      agent_id: "device-enrollment",
      metadata: { device_id: "dev-1", challenge_id: "challenge-1", reason_code: "INVALID_REQUEST" },
    }));
  });

  it("audits a missing RFC 9421 proof before rejecting it", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.getAppPool.mockReturnValue({ connect: vi.fn(async () => client) });
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: "dev-audit", challenge_id: "challenge-audit" }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      group_id: "allura-system",
      workspace_id: null,
      event_type: "DEVICE_EXCHANGE_DENIED",
      agent_id: "device-enrollment",
      metadata: { device_id: "dev-audit", challenge_id: "challenge-audit", reason_code: "AUTH_INVALID" },
      status: "failed",
    }));
    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("audits a service-level auth denial before returning 401", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.getAppPool.mockReturnValue({ connect: vi.fn(async () => client) });
    mocks.exchangeToken.mockRejectedValue(new ExchangeError("AUTH_INVALID", "invalid proof"));
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "exchange", "x-allura-audience": "https://device.example.test",
        "x-allura-nonce": "nonce-1", "x-allura-proof-id": "challenge-1",
        "signature-input": 'sig1=("@method");created=1;expires=2;keyid="kid";alg="ecdsa-p256"',
        signature: "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-auth", challenge_id: "challenge-auth" }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      event_type: "DEVICE_EXCHANGE_DENIED",
      metadata: { device_id: "dev-auth", challenge_id: "challenge-auth", reason_code: "AUTH_INVALID" },
    }));
  });

  it.each([
    ["AUTH_EXPIRED", 401],
    ["MEMBERSHIP_INACTIVE", 403],
  ] as const)("maps %s to %i", async (code, status) => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.getAppPool.mockReturnValue({ connect: vi.fn(async () => client) });
    mocks.exchangeToken.mockRejectedValue(new ExchangeError(code, "denied"));
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "exchange", "x-allura-audience": "https://device.example.test",
        "x-allura-nonce": "nonce-1", "x-allura-proof-id": "challenge-1",
        "signature-input": 'sig1=("@method");created=1;expires=2;keyid="kid";alg="ecdsa-p256"',
        signature: "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-1", challenge_id: "challenge-1" }),
    }));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ error: code });
  });

  it("rejects malformed JSON with a 400 route response", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.getAppPool.mockReturnValue({ connect: vi.fn(async () => client) });
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST", body: "{not-json",
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_REQUEST" });
  });

  it("returns a bounded 500 for an unexpected service failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getAppPool.mockReturnValue({});
    mocks.exchangeToken.mockRejectedValue(new Error("unexpected"));
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:",
        "x-allura-purpose": "exchange", "x-allura-audience": "https://device.example.test",
        "x-allura-nonce": "nonce-1", "x-allura-proof-id": "challenge-1",
        "signature-input": 'sig1=("@method");created=1;expires=2;keyid="kid";alg="ecdsa-p256"',
        signature: "sig1=:ZmFrZQ==:",
      },
      body: JSON.stringify({ device_id: "dev-1", challenge_id: "challenge-1" }),
    }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "INTERNAL_ERROR" });
    expect(errorSpy).toHaveBeenCalledWith("Device exchange route failed", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("maps full-lock denial to 403", async () => {
    mocks.getAppPool.mockReturnValue({});
    mocks.exchangeToken.mockRejectedValue(new ExchangeError("WORKSPACE_LOCKED", "Workspace is locked"));
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST", headers: { "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:", "x-allura-purpose": "exchange", "x-allura-audience": "https://device.example.test", "x-allura-nonce": "nonce-1", "x-allura-proof-id": "challenge-1", "signature-input": 'sig1=("@method");created=1;expires=2;keyid="kid";alg="ecdsa-p256"', signature: "sig1=:ZmFrZQ==:" },
      body: JSON.stringify({ device_id: "dev-1", challenge_id: "challenge-1" }),
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "WORKSPACE_LOCKED" });
  });
});
