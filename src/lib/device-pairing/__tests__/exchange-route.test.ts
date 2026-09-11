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

import { DevicePairingErrorCode } from "@/lib/device-pairing/error-codes";
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
    expect(response.status).toBe(403);
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
    mocks.exchangeToken.mockRejectedValue(new ExchangeError(DevicePairingErrorCode.AUTH_INVALID, "invalid proof"));
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
    expect(response.status).toBe(403);
    expect(mocks.emitDeviceAudit).toHaveBeenCalledWith(client, expect.objectContaining({
      event_type: "DEVICE_EXCHANGE_DENIED",
      metadata: { device_id: "dev-auth", challenge_id: "challenge-auth", reason_code: "AUTH_INVALID" },
    }));
  });

  it.each([
    [DevicePairingErrorCode.AUTH_EXPIRED, 401, "retry", 0],
    [DevicePairingErrorCode.KEY_EXPIRED, 403, "re_pair", 0],
    [DevicePairingErrorCode.MEMBERSHIP_INACTIVE, 403, "clerk_required", 0],
  ] as const)("maps %s to %i with recovery guidance", async (code, status, recoveryAction, retryAfterMs) => {
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
    await expect(response.json()).resolves.toEqual({
      error: code,
      message: "denied",
      recovery_action: recoveryAction,
      retry_after_ms: retryAfterMs,
    });
  });

  it("rejects malformed JSON with a 400 route response", async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    mocks.getAppPool.mockReturnValue({ connect: vi.fn(async () => client) });
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST", body: "{not-json",
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "INVALID_REQUEST",
      recovery_action: "re_pair",
      retry_after_ms: 0,
    });
  });

  it("returns the stable internal-error contract when denial auditing is unavailable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.getAppPool.mockReturnValue({ connect: vi.fn(async () => { throw new Error("audit unavailable"); }) });
    const { POST } = await import("@/app/api/device-pairing/exchange/route");

    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST", body: "{not-json",
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "INTERNAL_ERROR",
      message: "Exchange is unavailable",
      recovery_action: "retry",
      retry_after_ms: 1_000,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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
    const payload = await response.json();
    expect(payload).toEqual({
      error: "INTERNAL_ERROR",
      message: "Exchange is unavailable",
      recovery_action: "retry",
      retry_after_ms: 1_000,
    });
    expect(JSON.stringify(payload)).not.toContain("unexpected");
    expect(errorSpy).toHaveBeenCalledWith("Device exchange route failed", expect.any(Error));
    errorSpy.mockRestore();
  });

  it("maps full-lock denial to 403", async () => {
    mocks.getAppPool.mockReturnValue({});
    mocks.exchangeToken.mockRejectedValue(new ExchangeError(DevicePairingErrorCode.WORKSPACE_LOCKED, "Workspace is locked"));
    const { POST } = await import("@/app/api/device-pairing/exchange/route");
    const response = await POST(new NextRequest("https://device.example.test/api/device-pairing/exchange", {
      method: "POST", headers: { "content-type": "application/json", "content-digest": "sha-256=:ZmFrZQ==:", "x-allura-purpose": "exchange", "x-allura-audience": "https://device.example.test", "x-allura-nonce": "nonce-1", "x-allura-proof-id": "challenge-1", "signature-input": 'sig1=("@method");created=1;expires=2;keyid="kid";alg="ecdsa-p256"', signature: "sig1=:ZmFrZQ==:" },
      body: JSON.stringify({ device_id: "dev-1", challenge_id: "challenge-1" }),
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "WORKSPACE_LOCKED" });
  });
});
