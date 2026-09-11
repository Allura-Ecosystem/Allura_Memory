import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/postgres/connection", () => ({ getAppPool: vi.fn() }));
vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.com"),
  getDeviceAuthAudience: vi.fn(() => "https://api.allura.example.com/device-auth"),
}));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  parseSignatureInput: vi.fn(() => ({
    label: "sig1",
    coveredComponents: ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"],
    created: Math.floor(Date.now() / 1000) - 1,
    expires: Math.floor(Date.now() / 1000) + 60,
    keyid: "kid",
    alg: "ecdsa-p256",
  })),
  extractStructuredSignatureValue: vi.fn(() => "ZmFrZQ=="),
  verifyDeviceSignature: vi.fn(() => ({ valid: true, purpose: "pairing_complete" })),
}));
vi.mock("@/lib/auth/config", () => ({
  getAuthConfig: vi.fn(() => ({ ALLURA_MCP_BASE_URL: "https://mcp.route.example:8443" })),
}));
vi.mock("@/lib/mcp-token/repository", () => ({
  createDeviceToken: vi.fn(),
}));

import { hashAuthorizationCode } from "@/lib/device-pairing/authorization-code";
import { computePkceCodeChallengeS256 } from "@/lib/device-pairing/pkce";
import { extractStructuredSignatureValue } from "@/lib/device-pairing/rfc9421";
import { createDeviceToken } from "@/lib/mcp-token/repository";
import { getAppPool } from "@/lib/postgres/connection";

const proofHeaders = {
  "content-digest": "sha-256=:ZmFrZQ==:",
  "x-allura-purpose": "pairing_complete",
  "x-allura-audience": "https://api.allura.example.com/device-auth",
  "x-allura-nonce": "nonce_123",
  "x-allura-proof-id": "enroll_123",
  "signature-input": "sig1=();created=1;expires=2;keyid=\"kid\";alg=\"ecdsa-p256\"",
  signature: "sig1=:ZmFrZQ==:",
};

describe("Story 29.6 — POST /api/device-pairing/complete", () => {
  const validBody = {
    enrollment_transaction_id: "enroll_123",
    authorization_code: "code_123",
    pkce_verifier: "verifier_123",
    completion_nonce: "nonce_123",
  };

  beforeEach(() => vi.clearAllMocks());

  it("maps a replayed consumed enrollment to ENROLLMENT_CONSUMED", async () => {
    const client = {
      query: vi.fn(async (text: string) => (
        text.includes("device_enrollment_lock_for_complete")
          ? { rows: [{ state: "CONSUMED" }] }
          : { rows: [] }
      )),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "ENROLLMENT_CONSUMED" });
  });

  it("returns the completed device credential result", async () => {
    vi.mocked(createDeviceToken).mockResolvedValue({
      raw: "allura_mcp_device_token",
      record: { expires_at: "2026-09-09T09:00:00.000Z" },
    } as never);
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED", public_key: "public-key", key_id: "kid", key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode(validBody.authorization_code),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: validBody.completion_nonce,
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256(validBody.pkce_verifier),
            approved_principal_id: "user-1", approved_group_id: "allura-test", approved_workspace_id: "ws-1",
          }] };
        }
        if (text.includes("FROM memberships")) return { rows: [{ role: "curator" }] };
        if (text.includes("FROM workspaces")) return { rows: [{ lock_mode: "normal" }] };
        if (text.includes("COUNT(*)::int")) return { rows: [{ count: 4 }] };
        if (text.includes("INSERT INTO paired_devices")) return { rows: [{ id: "device-1" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(200);
    expect(extractStructuredSignatureValue).toHaveBeenCalledWith(
      proofHeaders.signature,
      "sig1",
    );
    await expect(response.json()).resolves.toEqual({
      device_id: "device-1",
      access_token: "allura_mcp_device_token",
      expires_at: "2026-09-09T09:00:00.000Z",
      mcp_endpoint: "https://mcp.route.example:8443/mcp",
    });
  });

  it("maps an inactive revalidated membership to MEMBERSHIP_INACTIVE", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED", public_key: "public-key", key_id: "kid", key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode(validBody.authorization_code),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: validBody.completion_nonce,
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256(validBody.pkce_verifier),
            approved_principal_id: "user-1", approved_group_id: "allura-test", approved_workspace_id: "ws-1",
          }] };
        }
        if (text.includes("FROM memberships")) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: "MEMBERSHIP_INACTIVE" });
  });

  it("maps a rejected RFC 9421 proof to AUTH_INVALID", async () => {
    const client = {
      query: vi.fn(async (text: string) => (
        text.includes("device_enrollment_lock_for_complete")
          ? { rows: [{
            state: "APPROVED",
            public_key: "public-key", key_id: "kid", key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode(validBody.authorization_code),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: validBody.completion_nonce,
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256(validBody.pkce_verifier),
          }] }
          : { rows: [] }
      )),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "AUTH_INVALID" });
  });

  it("maps a PKCE verifier mismatch to PKCE_MISMATCH", async () => {
    const client = {
      query: vi.fn(async (text: string) => (
        text.includes("device_enrollment_lock_for_complete")
          ? { rows: [{
            state: "APPROVED",
            authorization_code_hash: hashAuthorizationCode(validBody.authorization_code),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: validBody.completion_nonce,
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: "wrong-challenge",
          }] }
          : { rows: [] }
      )),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "PKCE_MISMATCH" });
  });

  it("maps a completion nonce mismatch to COMPLETION_NONCE_MISMATCH", async () => {
    const client = {
      query: vi.fn(async (text: string) => (
        text.includes("device_enrollment_lock_for_complete")
          ? { rows: [{
            state: "APPROVED",
            authorization_code_hash: hashAuthorizationCode(validBody.authorization_code),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "different_stored_nonce",
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
          }] }
          : { rows: [] }
      )),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "COMPLETION_NONCE_MISMATCH" });
  });

  it("maps an invalid authorization code to INVALID_CODE", async () => {
    const client = {
      query: vi.fn(async (text: string) => (
        text.includes("device_enrollment_lock_for_complete")
          ? { rows: [{
            state: "APPROVED",
            authorization_code_hash: "not-the-presented-code-hash",
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
          }] }
          : { rows: [] }
      )),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_CODE" });
  });

  it("maps an expired completion nonce to COMPLETION_NONCE_EXPIRED", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED",
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce_expires_at: new Date(0).toISOString(),
          }] };
        }
        if (text.includes("device_enrollment_expire")) return { rows: [{ expired: true }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "COMPLETION_NONCE_EXPIRED" });
  });

  it("maps an expired authorization code to CODE_EXPIRED", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{ state: "APPROVED", authorization_code_expires_at: new Date(0).toISOString() }] };
        }
        if (text.includes("device_enrollment_expire")) return { rows: [{ expired: true }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "CODE_EXPIRED" });
  });

  it("returns ENROLLMENT_NOT_FOUND after the lock service finds no enrollment", async () => {
    const client = {
      query: vi.fn(async (text: string) => (
        text.includes("device_enrollment_lock_for_complete") ? { rows: [] } : { rows: [] }
      )),
      release: vi.fn(),
    };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");

    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: "ENROLLMENT_NOT_FOUND" });
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("audits a valid completion body that lacks RFC 9421 proof headers", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    const { POST } = await import("@/app/api/device-pairing/complete/route");
    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "AUTH_INVALID" });
    const calls = (client.query.mock.calls as unknown as Array<[string, ...unknown[]]>).map(([statement]) => String(statement));
    const auditIndex = calls.findIndex((statement) => statement.includes("device_enrollment_pre_human_audit"));
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("BEGIN")).toBeLessThan(auditIndex);
    expect(auditIndex).toBeLessThan(calls.indexOf("COMMIT"));
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("audits a malformed structured Signature header", async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
    vi.mocked(getAppPool).mockReturnValue({ connect: vi.fn(async () => client) } as never);
    vi.mocked(extractStructuredSignatureValue).mockImplementationOnce(() => { throw new Error("malformed"); });
    const { POST } = await import("@/app/api/device-pairing/complete/route");
    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...proofHeaders },
      body: JSON.stringify(validBody),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "AUTH_INVALID" });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("device_enrollment_pre_human_audit"),
      expect.arrayContaining(["DEVICE_ENROLL_DENIED"]),
    );
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects a malformed completion request before any pairing work", async () => {
    const { POST } = await import("@/app/api/device-pairing/complete/route");
    const response = await POST(new NextRequest("http://localhost/api/device-pairing/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollment_transaction_id: "enroll_123" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_REQUEST" });
  });
});
