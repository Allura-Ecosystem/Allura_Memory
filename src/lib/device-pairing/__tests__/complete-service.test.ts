import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthAudience: vi.fn(() => "https://api.allura.example.com/device-auth"),
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.com"),
}));
vi.mock("@/lib/auth/config", () => ({
  getAuthConfig: vi.fn(() => ({ ALLURA_MCP_BASE_URL: "https://mcp.faithmeats.example:8443" })),
}));
vi.mock("@/lib/device-pairing/rfc9421", () => ({
  parseSignatureInput: vi.fn(() => ({
    label: "sig1",
    coveredComponents: ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"],
    created: Math.floor(Date.now() / 1000) - 1,
    expires: Math.floor(Date.now() / 1000) + 60,
    keyid: "key-1",
    alg: "ecdsa-p256",
  })),
  verifyDeviceSignature: vi.fn(() => ({ valid: false, reason: "signature_invalid" })),
}));
vi.mock("@/lib/device-pairing/device-limit", () => ({
  acquireDeviceCountLock: vi.fn(async () => {}),
  countApprovedDevices: vi.fn(async () => 5),
  getDeviceLimit: vi.fn(() => 5),
}));
vi.mock("@/lib/mcp-token/repository", () => ({
  createDeviceToken: vi.fn(),
}));
import { getAuthConfig } from "@/lib/auth/config";
import { hashAuthorizationCode } from "@/lib/device-pairing/authorization-code";
import { acquireDeviceCountLock, countApprovedDevices } from "@/lib/device-pairing/device-limit";
import { computePkceCodeChallengeS256 } from "@/lib/device-pairing/pkce";
import { parseSignatureInput, verifyDeviceSignature } from "@/lib/device-pairing/rfc9421";
import { createDeviceToken } from "@/lib/mcp-token/repository";

const validProof = { valid: true as const, purpose: "pairing_complete" as const };
const invalidProof = { valid: false as const, reason: "signature_invalid" };

describe("Story 29.6 — completion service", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthConfig).mockReset();
    vi.mocked(getAuthConfig).mockReturnValue({ ALLURA_MCP_BASE_URL: "https://mcp.faithmeats.example:8443" } as never);
    vi.mocked(verifyDeviceSignature).mockReturnValue(invalidProof);
    vi.mocked(parseSignatureInput).mockReturnValue({
      label: "sig1",
      coveredComponents: ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"],
      created: Math.floor(Date.now() / 1000) - 1,
      expires: Math.floor(Date.now() / 1000) + 60,
      keyid: "key-1",
      alg: "ecdsa-p256",
    });
    vi.mocked(countApprovedDevices).mockResolvedValue(5);
    vi.mocked(acquireDeviceCountLock).mockReset();
    vi.mocked(acquireDeviceCountLock).mockImplementation(async () => {});
    vi.mocked(createDeviceToken).mockReset();
  });

  it("rejects a non-HTTP MCP gateway before opening a completion transaction", async () => {
    vi.mocked(getAuthConfig).mockReturnValueOnce({ ALLURA_MCP_BASE_URL: "mailto:ops@example.test" } as never);
    const pool = { connect: vi.fn(async () => { throw new Error("database should not connect"); }) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {} as never)).rejects.toThrow(/HTTP\(S\)/i);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("rejects a consumed enrollment before device or token mutation", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) return { rows: [{ state: "CONSUMED" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_consumed", authorization_code: "replayed_code",
      completion_nonce: "replayed_nonce", pkce_verifier: "replayed_verifier",
      request_target: "/api/device-pairing/complete", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete", audience: "https://api.allura.example.com/device-auth", nonce: "replayed_nonce", proof_id: "enroll_consumed", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    })).rejects.toMatchObject({ code: "ENROLLMENT_CONSUMED" });

    expect(calls.some((text) => text.includes("INSERT INTO paired_devices"))).toBe(false);
    expect(calls.some((text) => text.includes("device_enrollment_consume"))).toBe(false);
    expect(calls).toContain("ROLLBACK");
  });

  it("rejects a proof that omits a mandatory signed request component", async () => {
    vi.mocked(verifyDeviceSignature).mockReturnValue(validProof);
    vi.mocked(parseSignatureInput).mockReturnValue({
      label: "sig1",
      coveredComponents: ["@method", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"],
      created: Math.floor(Date.now() / 1000) - 1,
      expires: Math.floor(Date.now() / 1000) + 60,
      keyid: "key-1",
      alg: "ecdsa-p256",
    });
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) return { rows: [{
          state: "APPROVED", public_key: "key", key_id: "key-1", key_algo: "ecdsa-p256",
          authorization_code_hash: hashAuthorizationCode("code"),
          authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
          completion_nonce: "nonce", completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
          pkce_code_challenge: computePkceCodeChallengeS256("verifier"),
          approved_principal_id: "user-proof", approved_group_id: "allura-proof", approved_workspace_id: "ws-proof",
        }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };

    const { completePairing } = await import("@/lib/device-pairing/complete-service");
    await expect(completePairing({ connect: vi.fn(async () => client) } as never, {
      enrollment_transaction_id: "enroll_incomplete_proof", authorization_code: "code",
      completion_nonce: "nonce", pkce_verifier: "verifier", request_target: "/api/device-pairing/complete",
      request_body: new Uint8Array(), headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete",
        audience: "https://api.allura.example.com/device-auth", nonce: "nonce",
        proof_id: "enroll_incomplete_proof", signature_input: "sig1=()", signature: "ZmFrZQ==",
      },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
    expect(calls.some((text) => text.includes("INSERT INTO paired_devices"))).toBe(false);
  });

  it("rejects a pairing proof whose signed validity window has expired", async () => {
    vi.mocked(verifyDeviceSignature).mockReturnValue(validProof);
    vi.mocked(parseSignatureInput).mockReturnValue({
      label: "sig1",
      coveredComponents: ["@method", "@target-uri", "content-digest", "x-allura-purpose", "x-allura-audience", "x-allura-nonce", "x-allura-proof-id"],
      created: Math.floor(Date.now() / 1000) - 120,
      expires: Math.floor(Date.now() / 1000) - 1,
      keyid: "key-1",
      alg: "ecdsa-p256",
    });
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) return { rows: [{
          state: "APPROVED", public_key: "key", key_id: "key-1", key_algo: "ecdsa-p256",
          authorization_code_hash: hashAuthorizationCode("code"),
          authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
          completion_nonce: "nonce", completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
          pkce_code_challenge: computePkceCodeChallengeS256("verifier"),
          approved_principal_id: "user-proof", approved_group_id: "allura-proof", approved_workspace_id: "ws-proof",
        }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing({ connect: vi.fn(async () => client) } as never, {
      enrollment_transaction_id: "enroll_expired_proof", authorization_code: "code",
      completion_nonce: "nonce", pkce_verifier: "verifier", request_target: "/api/device-pairing/complete",
      request_body: new Uint8Array(), headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete",
        audience: "https://api.allura.example.com/device-auth", nonce: "nonce",
        proof_id: "enroll_expired_proof", signature_input: "sig1=()", signature: "ZmFrZQ==",
      },
    })).rejects.toMatchObject({ code: "AUTH_INVALID" });
  });

  it("creates the paired device, device token, completion audit, and consumed enrollment in one client transaction", async () => {
    vi.mocked(verifyDeviceSignature).mockReturnValue(validProof);
    vi.mocked(countApprovedDevices).mockResolvedValue(4);
    vi.mocked(createDeviceToken).mockResolvedValue({
      raw: "allura_mcp_device_token",
      record: { expires_at: "2026-09-09T09:00:00.000Z" },
    } as never);
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    vi.mocked(acquireDeviceCountLock).mockImplementation(async () => {
      calls.push({ text: "DEVICE_COUNT_LOCK" });
    });
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED", display_label: "Sabir's desktop",
            public_key: "locked-public-key", key_id: "key-1", key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "stored_nonce", completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256("correct_verifier"),
            approved_principal_id: "user-1", approved_group_id: "allura-test", approved_workspace_id: "ws-1",
          }] };
        }
        if (text.includes("FROM memberships")) return { rows: [{ role: "curator" }] };
        if (text.includes("FROM workspaces")) return { rows: [{ lock_mode: "normal" }] };
        if (text.includes("INSERT INTO paired_devices")) return { rows: [{ id: "device-1" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_complete", authorization_code: "correct_code",
      completion_nonce: "stored_nonce", pkce_verifier: "correct_verifier",
      request_target: "/api/device-pairing/complete", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete", audience: "https://api.allura.example.com/device-auth", nonce: "stored_nonce", proof_id: "enroll_complete", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    })).resolves.toEqual({
      device_id: "device-1",
      access_token: "allura_mcp_device_token",
      expires_at: "2026-09-09T09:00:00.000Z",
      mcp_endpoint: "https://mcp.faithmeats.example:8443/mcp",
    });

    const membershipQueryIndex = calls.findIndex((call) => call.text.includes("FROM memberships"));
    const deviceCountLockIndex = calls.findIndex((call) => call.text === "DEVICE_COUNT_LOCK");
    expect(deviceCountLockIndex).toBeLessThan(membershipQueryIndex);
    expect(calls[membershipQueryIndex]?.text).toContain("FOR UPDATE");
    const pairedDeviceInsert = calls.find((call) => call.text.includes("INSERT INTO paired_devices"));
    expect(pairedDeviceInsert?.params).toEqual([
      expect.any(String), "user-1", "allura-test", "ws-1", "Sabir's desktop",
      "locked-public-key", "key-1", "ecdsa-p256", "enroll_complete",
    ]);
    expect(createDeviceToken).toHaveBeenCalledWith(client, expect.objectContaining({
      paired_device_id: "device-1",
      membership_role: "curator",
      lock_mode: "normal",
    }));
    const auditInsert = calls.find((call) => call.text.includes("INSERT INTO events"));
    expect(auditInsert?.params?.slice(0, 4)).toEqual([
      "allura-test", "ws-1", "DEVICE_PAIRING_COMPLETE", "user-1",
    ]);
    expect(calls.some((call) => call.text.includes("device_enrollment_consume"))).toBe(true);
    expect(calls.map((call) => call.text)).toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects completion at the rechecked device limit under the advisory lock", async () => {
    vi.mocked(verifyDeviceSignature).mockReturnValue(validProof);
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED", public_key: "public-key", key_id: "key-1", key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "stored_nonce", completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256("correct_verifier"),
            approved_principal_id: "user-1", approved_group_id: "allura-test", approved_workspace_id: "ws-1",
          }] };
        }
        if (text.includes("FROM memberships")) return { rows: [{ role: "curator" }] };
        if (text.includes("FROM workspaces")) return { rows: [{ lock_mode: "normal" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_at_limit", authorization_code: "correct_code",
      completion_nonce: "stored_nonce", pkce_verifier: "correct_verifier",
      request_target: "/api/device-pairing/complete", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete", audience: "https://api.allura.example.com/device-auth", nonce: "stored_nonce", proof_id: "enroll_at_limit", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    })).rejects.toMatchObject({ code: "DEVICE_LIMIT_EXCEEDED" });
  });

  it("rejects a missing approved workspace after membership revalidation", async () => {
    vi.mocked(verifyDeviceSignature).mockReturnValue(validProof);
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED", public_key: "public-key", key_id: "key-1", key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "stored_nonce", completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256("correct_verifier"),
            approved_principal_id: "user-1", approved_group_id: "allura-test", approved_workspace_id: "ws-1",
          }] };
        }
        if (text.includes("FROM memberships")) return { rows: [{ role: "curator" }] };
        if (text.includes("FROM workspaces")) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_missing_workspace", authorization_code: "correct_code",
      completion_nonce: "stored_nonce", pkce_verifier: "correct_verifier",
      request_target: "/api/device-pairing/complete", request_body: new Uint8Array(),
      headers: { content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete", audience: "https://api.allura.example.com/device-auth", nonce: "stored_nonce", proof_id: "enroll_missing_workspace", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:" },
    })).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
  });

  it("rejects inactive membership after all credential and proof checks", async () => {
    vi.mocked(verifyDeviceSignature).mockReturnValue(validProof);
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED", public_key: "public-key", key_id: "key-1", key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "stored_nonce",
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256("correct_verifier"),
            approved_principal_id: "user-1", approved_group_id: "allura-test", approved_workspace_id: "ws-1",
          }] };
        }
        if (text.includes("FROM memberships")) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_inactive_member", authorization_code: "correct_code",
      completion_nonce: "stored_nonce", pkce_verifier: "correct_verifier",
      request_target: "/api/device-pairing/complete", request_body: new Uint8Array(),
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete",
        audience: "https://api.allura.example.com/device-auth", nonce: "stored_nonce",
        proof_id: "enroll_inactive_member", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:",
      },
    })).rejects.toMatchObject({ code: "MEMBERSHIP_INACTIVE" });

    expect(calls.some((text) => text.includes("FROM memberships"))).toBe(true);
    expect(calls.some((text) => text.includes("INSERT INTO paired_devices"))).toBe(false);
  });

  it("rejects an invalid RFC 9421 pairing_complete proof after credential checks", async () => {
    const client = {
      query: vi.fn(async (text: string) => {
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED",
            public_key: "public-key",
            key_id: "key-1",
            key_algo: "ecdsa-p256",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "stored_nonce",
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256("correct_verifier"),
          }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_bad_proof",
      authorization_code: "correct_code",
      completion_nonce: "stored_nonce",
      pkce_verifier: "correct_verifier",
      request_target: "/api/device-pairing/complete",
      request_body: new Uint8Array(),
      headers: {
        content_digest: "sha-256=:ZmFrZQ==:", purpose: "pairing_complete",
        audience: "https://api.allura.example.com/device-auth", nonce: "stored_nonce",
        proof_id: "enroll_bad_proof", signature_input: "sig1=()", signature: "sig1=:ZmFrZQ==:",
      },
    } as never)).rejects.toMatchObject({ code: "AUTH_INVALID" });
  });

  it("rejects a PKCE verifier that does not match the locked S256 challenge", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "stored_nonce",
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
            pkce_code_challenge: computePkceCodeChallengeS256("correct_verifier"),
          }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_bad_pkce",
      authorization_code: "correct_code",
      completion_nonce: "stored_nonce",
      pkce_verifier: "wrong_verifier",
    } as never)).rejects.toMatchObject({ code: "PKCE_MISMATCH" });

    expect(calls.some((text) => text.includes("device_enrollment_consume"))).toBe(false);
    expect(calls.some((text) => text.includes("INSERT INTO paired_devices"))).toBe(false);
  });

  it("rejects a completion nonce mismatch before downstream transitions", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce: "stored_nonce",
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
          }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_bad_nonce",
      authorization_code: "correct_code",
      completion_nonce: "different_nonce",
    } as never)).rejects.toMatchObject({ code: "COMPLETION_NONCE_MISMATCH" });

    expect(calls.some((text) => text.includes("device_enrollment_consume"))).toBe(false);
    expect(calls.some((text) => text.includes("INSERT INTO paired_devices"))).toBe(false);
  });

  it("rejects a mismatched authorization code before downstream transitions", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{
            state: "APPROVED",
            authorization_code_hash: hashAuthorizationCode("correct_code"),
            authorization_code_expires_at: new Date(Date.now() + 60_000).toISOString(),
            completion_nonce_expires_at: new Date(Date.now() + 60_000).toISOString(),
          }] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_bad_code",
      authorization_code: "wrong_code",
    } as never)).rejects.toMatchObject({ code: "INVALID_CODE" });

    expect(calls.some((text) => text.includes("device_enrollment_consume"))).toBe(false);
    expect(calls.some((text) => text.includes("INSERT INTO paired_devices"))).toBe(false);
    const auditIndex = calls.findIndex((text) => text.includes("device_enrollment_pre_human_audit"));
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(auditIndex).toBeLessThan(calls.indexOf("COMMIT"));
    expect(calls).not.toContain("ROLLBACK");
  });

  it("expires an approved enrollment when its completion nonce is no longer usable", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
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
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_nonce_expired",
    } as never)).rejects.toMatchObject({ code: "COMPLETION_NONCE_EXPIRED" });

    expect(calls.some((text) => text.includes("device_enrollment_expire"))).toBe(true);
    expect(calls).toContain("COMMIT");
    expect(calls).not.toContain("ROLLBACK");
    expect(calls.some((text) => text.includes("device_enrollment_pre_human_audit"))).toBe(true);
  });

  it("expires an approved enrollment when its authorization code is no longer usable", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{ state: "APPROVED", authorization_code_expires_at: new Date(0).toISOString() }] };
        }
        if (text.includes("device_enrollment_expire")) return { rows: [{ expired: true }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_expired",
    } as never)).rejects.toMatchObject({ code: "CODE_EXPIRED" });

    expect(calls.some((text) => text.includes("device_enrollment_expire"))).toBe(true);
    expect(calls).toContain("COMMIT");
    expect(calls).not.toContain("ROLLBACK");
    expect(calls.some((text) => text.includes("device_enrollment_pre_human_audit"))).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back an expiry transition when its lifecycle audit fails", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{ state: "APPROVED", authorization_code_expires_at: new Date(0).toISOString() }] };
        }
        if (text.includes("device_enrollment_expire")) return { rows: [{ expired: true }] };
        if (text.includes("device_enrollment_pre_human_audit")) throw new Error("forced expiry audit failure");
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing({ connect: vi.fn(async () => client) } as never, {
      enrollment_transaction_id: "enroll_expiry_audit_failure",
    } as never)).rejects.toThrow("forced expiry audit failure");

    expect(calls.some((text) => text.includes("device_enrollment_expire"))).toBe(true);
    expect(calls).toContain("ROLLBACK");
    expect(calls).not.toContain("COMMIT");
  });

  it("rolls back without an expiry lifecycle audit when no expired row transition occurs", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        if (text.includes("device_enrollment_lock_for_complete")) {
          return { rows: [{ state: "APPROVED", authorization_code_expires_at: new Date(0).toISOString() }] };
        }
        if (text.includes("device_enrollment_expire")) return { rows: [{ expired: false }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing({ connect: vi.fn(async () => client) } as never, {
      enrollment_transaction_id: "enroll_expiry_transition_lost",
    } as never)).rejects.toMatchObject({ code: "ENROLLMENT_EXPIRED" });

    expect(calls.map((call) => call.text)).toContain("ROLLBACK");
    expect(calls.map((call) => call.text)).not.toContain("COMMIT");
    expect(calls.some((call) =>
      call.text.includes("device_enrollment_pre_human_audit") &&
      JSON.stringify(call.params).includes("DEVICE_ENROLL_EXPIRED"),
    )).toBe(false);
  });

  it("locks the enrollment and rejects an absent record without device work", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("device_enrollment_lock_for_complete")) return { rows: [] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const { completePairing } = await import("@/lib/device-pairing/complete-service");

    await expect(completePairing(pool as never, {
      enrollment_transaction_id: "enroll_missing",
    } as never)).rejects.toMatchObject({ code: "ENROLLMENT_NOT_FOUND" });

    expect(calls).toContain("BEGIN");
    expect(calls.some((text) => text.includes("device_enrollment_lock_for_complete"))).toBe(true);
    expect(calls).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
