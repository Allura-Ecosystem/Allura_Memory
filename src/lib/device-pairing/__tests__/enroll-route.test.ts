/**
 * Story 29.4 — Enrollment API POST /api/device-pairing/enroll
 *
 * Integration-lane route test (mocked PG pool). Verifies:
 *  - 201 on valid input returning {enrollment_transaction_id, pairing_url, expires_at}
 *  - 400 INVALID_PKCE / INVALID_PUBLIC_KEY / INVALID_KEY_ALGORITHM / CALLBACK_TYPE_DISABLED
 *  - expires_at is 10 minutes from now
 *  - audit DEVICE_ENROLL_REQUESTED inserted with group_id='allura-system',
 *    agent_id='device-enrollment' (fail-closed)
 *  - no group_id/workspace_id/principal_id on the PENDING enrollment row
 *  - pairing_url contains only txn + state (never the PKCE verifier)
 *
 * Architecture: §4.1 (enrollment contract), §3.1 (device_enrollment_create),
 *               §11.1 (pre-human audit), AD-65 (verifier never in URL),
 *               AD-63 (callback allowlist).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(),
}));

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.com"),
  getDeviceAuthAudience: vi.fn(() => "https://api.allura.example.com/device-auth"),
  getPairingCallbackAllowlist: vi.fn(() => ["deep_link", "loopback"]),
  getEnrollmentTtlMs: vi.fn(() => 10 * 60 * 1000),
}));

import { getPool } from "@/lib/postgres/connection";
import { POST } from "@/app/api/device-pairing/enroll/route";

const mockGetPool = getPool as unknown as MockInstance<() => {
  connect: () => {
    query: ReturnType<typeof vi.fn>;
  };
  query: ReturnType<typeof vi.fn>;
}>;

/** A valid P-256 public key in PEM for tests (generated once). */
const VALID_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEv4Z+GyZ7n7vZ7R2Qqzq7Z6n7Z6n7
Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7
-----END PUBLIC KEY-----`;

const VALID_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const VALID_STATE = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

function makeValidBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    device_label: "Workstation-1",
    callback_type: "deep_link",
    callback_uri: "allura-pairing://complete",
    pkce_code_challenge: VALID_CHALLENGE,
    pkce_code_challenge_method: "S256",
    pkce_state: VALID_STATE,
    public_key: VALID_PUBLIC_KEY_PEM,
    key_id: "kid-test-1",
    key_algorithm: "ecdsa-p256",
    ...overrides,
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/device-pairing/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Minimal mock client capturing query calls within a transaction. */
interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function createMockPool(): {
  pool: { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
  client: MockClient;
  queryCalls: Array<{ text: string; params: unknown[] }>;
} {
  const queryCalls: Array<{ text: string; params: unknown[] }> = [];
  const clientQuery = vi.fn(async (text: string, params?: unknown[]) => {
    queryCalls.push({ text, params: params ?? [] });
    return { rows: [], rowCount: 0 };
  });
  const client: MockClient = {
    query: clientQuery,
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
    query: vi.fn(async (text: string, params?: unknown[]) => {
      queryCalls.push({ text, params: params ?? [] });
      return { rows: [], rowCount: 0 };
    }),
  };
  return { pool, client, queryCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Story 29.4 — POST /api/device-pairing/enroll", () => {
  describe("201 success path", () => {
    it("returns 201 with enrollment_transaction_id, pairing_url, expires_at on valid input", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody());
      const res = await POST(req);

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.enrollment_transaction_id).toMatch(/^enroll_[0-9a-f-]+$/);
      expect(data.pairing_url).toContain("txn=");
      expect(data.pairing_url).toContain("state=");
      expect(data.expires_at).toBeDefined();
      // ISO 8601 timestamp
      expect(typeof data.expires_at).toBe("string");
      expect(new Date(data.expires_at).toString()).not.toBe("Invalid Date");
    });

    it("persists the validated deep-link callback URI for the approval redirect", async () => {
      const { pool, queryCalls } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody()));
      expect(res.status).toBe(201);

      const createCall = queryCalls.find((call) =>
        call.text.includes("device_enrollment_create"),
      );
      expect(createCall).toBeDefined();
      expect(createCall!.params[9]).toBe("allura-pairing://complete");
    });
  });

  describe("400 INVALID_PKCE", () => {
    it("rejects missing pkce_code_challenge with 400 INVALID_PKCE", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ pkce_code_challenge: undefined }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PKCE");
    });

    it("rejects empty pkce_code_challenge with 400 INVALID_PKCE", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ pkce_code_challenge: "" }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PKCE");
    });

    it("rejects a non-S256 PKCE challenge that is not 43-char base64url", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ pkce_code_challenge: "not-a-valid-s256-challenge" }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PKCE");
    });

    it("rejects missing pkce_state with 400 INVALID_PKCE", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ pkce_state: undefined }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PKCE");
    });

    it("rejects a PKCE state shorter than 16 characters", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ pkce_state: "too-short" }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PKCE");
    });
  });

  describe("400 INVALID_PUBLIC_KEY", () => {
    it("rejects missing public_key with 400 INVALID_PUBLIC_KEY", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ public_key: undefined }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PUBLIC_KEY");
    });

    it("rejects empty public_key with 400 INVALID_PUBLIC_KEY", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ public_key: "" }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PUBLIC_KEY");
    });

    it("rejects a public_key that is neither PEM nor JWK-shaped", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ public_key: "not-a-public-key" }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_PUBLIC_KEY");
    });
  });

  describe("400 INVALID_KEY_ALGORITHM", () => {
    it("rejects unsupported key_algorithm with 400 INVALID_KEY_ALGORITHM", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ key_algorithm: "rsa-2048" }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_KEY_ALGORITHM");
    });

    it("rejects missing key_algorithm with 400 INVALID_KEY_ALGORITHM", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ key_algorithm: undefined }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_KEY_ALGORITHM");
    });
  });

  describe("400 CALLBACK_TYPE_DISABLED", () => {
    it("rejects callback_type not in deployment allowlist with 400 CALLBACK_TYPE_DISABLED", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);
      const { getPairingCallbackAllowlist } = await import("@/lib/device-pairing/config");
      vi.mocked(getPairingCallbackAllowlist).mockReturnValueOnce(["deep_link"]);

      const req = makeRequest(makeValidBody({ callback_type: "loopback" }));
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("CALLBACK_TYPE_DISABLED");
    });

    it("rejects loopback enrollment without the bridge's exact callback URI", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody({
        callback_type: "loopback",
        callback_uri: undefined,
      })));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_CALLBACK_URI");
    });

    it("accepts callback_type in allowlist", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody({ callback_type: "deep_link" }));
      const res = await POST(req);
      expect(res.status).toBe(201);
    });
  });

  describe("expires_at is 10 minutes from now", () => {
    it("returns expires_at approximately 10 minutes (600000ms) from now", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const before = Date.now();
      const req = makeRequest(makeValidBody());
      const res = await POST(req);
      const after = Date.now();
      const data = await res.json();
      const expiresAt = new Date(data.expires_at).getTime();

      // 10 min from before-call, ±2s slack for test execution
      expect(expiresAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000 - 2000);
      expect(expiresAt).toBeLessThanOrEqual(after + 10 * 60 * 1000 + 2000);
    });
  });

  describe("audit DEVICE_ENROLL_REQUESTED", () => {
    it("uses the constrained pre-human audit function for DEVICE_ENROLL_REQUESTED", async () => {
      const { pool, queryCalls } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody());
      await POST(req);

      // Function fixes group_id and agent_id server-side; caller may provide
      // only an allowed event type and structured metadata.
      const auditInsert = queryCalls.find(
        (c) => c.text.includes("device_enrollment_pre_human_audit"),
      );
      expect(auditInsert).toBeDefined();
      expect(auditInsert!.params[0]).toBe("DEVICE_ENROLL_REQUESTED");
    });

    it("audit metadata includes enrollment_transaction_id, device_label, callback_type, key_algorithm, key_fingerprint", async () => {
      const { pool, queryCalls } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody());
      await POST(req);

      const auditInsert = queryCalls.find(
        (c) => c.text.includes("device_enrollment_pre_human_audit"),
      );
      expect(auditInsert).toBeDefined();
      const metadata = JSON.parse(auditInsert!.params[1] as string) as Record<string, unknown>;
      expect(metadata.enrollment_transaction_id).toMatch(/^enroll_/);
      expect(metadata.device_label).toBe("Workstation-1");
      expect(metadata.callback_type).toBe("deep_link");
      expect(metadata.key_algorithm).toBe("ecdsa-p256");
      expect(metadata.key_fingerprint).toBeDefined();
      expect(typeof metadata.key_fingerprint).toBe("string");
    });
  });

  describe("no tenant authority on PENDING row", () => {
    it("device_enrollment_create call does not pass group_id/workspace_id/principal_id", async () => {
      const { pool, queryCalls } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody());
      await POST(req);

      const createCall = queryCalls.find((c) =>
        c.text.includes("device_enrollment_create"),
      );
      expect(createCall).toBeDefined();
      // The SECURITY DEFINER function signature takes 11 params; none of them
      // are group_id/workspace_id/principal_id.
      const params = createCall!.params;
      // Params: id, label, public_key, key_id, key_algo,
      //         pkce_code_challenge, pkce_code_challenge_method, pkce_state,
      //         callback_type, callback_uri, expires_at. callback_uri is the
      //         bridge-selected redirect target, never tenant authority.
      expect(params).toHaveLength(11);
      // The callback URI may legitimately use the allura-pairing scheme. The
      // function still has no positional group/workspace/principal authority.
      expect(params.slice(0, 9)).not.toContain("allura-acme");
      expect(params.slice(0, 9)).not.toContain("workspace-alpha");
      expect(params.slice(0, 9)).not.toContain("principal-user-1");
    });
  });

  describe("fail-closed audit", () => {
    it("rolls back (no commit) and returns 500 when audit insert fails", async () => {
      const { pool, client, queryCalls } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      // Make the constrained transactional audit invocation fail (but still record calls)
      client.query.mockImplementation(async (text: string, params?: unknown[]) => {
        queryCalls.push({ text, params: params ?? [] });
        if (text.includes("device_enrollment_pre_human_audit")) {
          throw new Error("audit insert failed (simulated)");
        }
        return { rows: [], rowCount: 0 };
      });

      const req = makeRequest(makeValidBody());
      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Internal server error");

      // Verify ROLLBACK was called and COMMIT was not
      const rollbackCall = queryCalls.find((c) => c.text === "ROLLBACK");
      const commitCall = queryCalls.find((c) => c.text === "COMMIT");
      expect(rollbackCall).toBeDefined();
      expect(commitCall).toBeUndefined();
    });
  });

  describe("pairing_url never contains verifier", () => {
    it("pairing_url contains only txn and state query params (no verifier)", async () => {
      const { pool } = createMockPool();
      mockGetPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody());
      const res = await POST(req);
      const data = await res.json();
      const url = new URL(data.pairing_url);
      const params = url.searchParams;
      expect(params.has("txn")).toBe(true);
      expect(params.has("state")).toBe(true);
      // No verifier param should exist
      expect(params.has("verifier")).toBe(false);
      expect(params.has("pkce_code_verifier")).toBe(false);
      expect(params.has("code_verifier")).toBe(false);
      // Should only have txn + state
      expect([...params.keys()].sort()).toEqual(["state", "txn"]);
    });
  });
});