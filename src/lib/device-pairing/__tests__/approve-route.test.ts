/**
 * Story 29.5 — Approval API POST /api/device-pairing/approve
 *
 * Integration-lane route test (mocked PG pool). Verifies:
 *  - 200 on valid approval returning authorization_code, completion_nonce,
 *    callback
 *  - 404 ENROLLMENT_NOT_FOUND
 *  - 410 ENROLLMENT_EXPIRED (flips state to EXPIRED + audits
 *    DEVICE_ENROLL_EXPIRED)
 *  - 400 STATE_MISMATCH + audit DEVICE_ENROLL_DENIED
 *  - 403 MEMBERSHIP_INACTIVE + audit
 *  - 409 DEVICE_LIMIT_EXCEEDED + audit
 *  - authorization_code is 256-bit base64url (43 chars)
 *  - completion_nonce is 32-byte base64url (43 chars)
 *  - both have 60s expiry
 *  - audit DEVICE_ENROLL_APPROVED has agent_id=principal_id,
 *    group_id=approved_group_id
 *
 * Architecture: §4.2 (approval contract), §4.2c (device limit),
 *               §3.1 (device_enrollment_approve SECURITY DEFINER),
 *               §11.1 (post-approval audit with approved tenant/principal),
 *               AD-65 (code stored as SHA-256), AD-63 (callback allowlist),
 *               HIGH-F4 (pg_advisory_xact_lock).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getAppPool: vi.fn(),
}));

vi.mock("@/lib/device-pairing/config", () => ({
  getDeviceAuthOrigin: vi.fn(() => "https://app.allura.example.com"),
  getDeviceAuthAudience: vi.fn(() => "https://api.allura.example.com/device-auth"),
  getPairingCallbackAllowlist: vi.fn(() => ["deep_link", "loopback"]),
  getEnrollmentTtlMs: vi.fn(() => 10 * 60 * 1000),
}));

vi.mock("@/lib/device-pairing/device-limit", () => ({
  getDeviceLimit: vi.fn(() => 5),
  acquireDeviceCountLock: vi.fn(async () => {}),
  countApprovedDevices: vi.fn(async () => 0),
  deviceLimitLockKey: vi.fn(() => 0n),
}));

import { POST } from "@/app/api/device-pairing/approve/route";
import { getPairingCallbackAllowlist } from "@/lib/device-pairing/config";
import {
  countApprovedDevices,
  getDeviceLimit,
} from "@/lib/device-pairing/device-limit";
import { getAppPool } from "@/lib/postgres/connection";

const mockGetAppPool = getAppPool as unknown as MockInstance;
const mockCountApproved = countApprovedDevices as unknown as MockInstance;
const mockGetDeviceLimit = getDeviceLimit as unknown as MockInstance;

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PRINCIPAL_ID = "user_clerk_001";
const GROUP_ID = "allura-acme";
const WORKSPACE_ID = "ws-alpha";
const ENROLLMENT_ID = "enroll_abc123";
const PKCE_STATE = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

/** A valid P-256 public key in PEM for tests. */
const VALID_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEv4Z+GyZ7n7vZ7R2Qqzq7Z6n7Z6n7
Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7Z6n7
-----END PUBLIC KEY-----`;

function makeAuthHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "x-allura-user-id": PRINCIPAL_ID,
    "x-allura-session-id": "sess_test_001",
    "x-allura-role": "curator",
    "x-allura-group-id": GROUP_ID,
    "x-allura-workspace-id": WORKSPACE_ID,
    "x-allura-email": "user@acme.example.com",
    ...overrides,
  };
}

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost/api/device-pairing/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function makeValidBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enrollment_transaction_id: ENROLLMENT_ID,
    pkce_state: PKCE_STATE,
    ...overrides,
  };
}

/** Mock PG client that captures query calls within a transaction. */
interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock pool + client with configurable behavior.
 *
 * The `device_enrollment_approve` call returns `{ rows: [{ device_enrollment_approve: status }] }`.
 * The membership query returns `{ rows: [membershipRow] }`.
 * The workspace query returns `{ rows: [workspaceRow] }`.
 */
function createMockPool(options: {
  approveStatus?: string;
  membershipRow?: Record<string, unknown> | null;
  workspaceRow?: Record<string, unknown> | null;
  enrollmentRow?: Record<string, unknown> | null;
  auditFail?: boolean;
  deviceCount?: number;
  deviceLimit?: number;
}): {
  pool: { connect: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
  client: MockClient;
  queryCalls: Array<{ text: string; params: unknown[] }>;
} {
  const queryCalls: Array<{ text: string; params: unknown[] }> = [];
  const approveStatus = options.approveStatus ?? "APPROVED";
  const membershipRow =
    options.membershipRow === undefined
      ? {
          id: "mem_1",
          group_id: GROUP_ID,
          user_id: PRINCIPAL_ID,
          role: "curator",
          removed_at: null,
        }
      : options.membershipRow;
  const workspaceRow =
    options.workspaceRow === undefined
      ? {
          workspace_id: WORKSPACE_ID,
          group_id: GROUP_ID,
          name: "Alpha",
          lock_mode: "full",
        }
      : options.workspaceRow;
  const enrollmentRow =
    options.enrollmentRow === undefined
      ? {
          id: ENROLLMENT_ID,
          state: "PENDING",
          pkce_state: PKCE_STATE,
          callback_type: "deep_link",
          callback_uri: "allura-pairing://complete",
          public_key: VALID_PUBLIC_KEY_PEM,
          display_label: "Workstation-1",
          key_id: "kid-test-1",
          key_algo: "ecdsa-p256",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }
      : options.enrollmentRow;

  const clientQuery = vi.fn(async (text: string, params?: unknown[]) => {
    queryCalls.push({ text, params: params ?? [] });

    if (options.auditFail && text.includes("INSERT INTO events")) {
      throw new Error("audit insert failed (simulated)");
    }

    if (text.includes("device_enrollment_approve")) {
      return { rows: [{ device_enrollment_approve: approveStatus }], rowCount: 1 };
    }
    if (text.includes("device_enrollment_approval_context")) {
      return { rows: enrollmentRow ? [enrollmentRow] : [], rowCount: enrollmentRow ? 1 : 0 };
    }
    if (text.includes("FROM memberships")) {
      return { rows: membershipRow ? [membershipRow] : [], rowCount: membershipRow ? 1 : 0 };
    }
    if (text.includes("FROM workspaces")) {
      return { rows: workspaceRow ? [workspaceRow] : [], rowCount: workspaceRow ? 1 : 0 };
    }
    if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
      return { rows: [], rowCount: 0 };
    }
    // device_enrollment_expire or others
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

  if (options.deviceCount !== undefined) {
    mockCountApproved.mockResolvedValue(options.deviceCount);
  }
  if (options.deviceLimit !== undefined) {
    mockGetDeviceLimit.mockReturnValue(options.deviceLimit);
  }

  return { pool, client, queryCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCountApproved.mockResolvedValue(0);
  mockGetDeviceLimit.mockReturnValue(5);
  vi.mocked(getPairingCallbackAllowlist).mockReturnValue(["deep_link", "loopback"]);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Story 29.5 — POST /api/device-pairing/approve", () => {
  describe("200 success path", () => {
    it("returns 200 with authorization_code, completion_nonce, callback on valid input", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authorization_code).toBeDefined();
      expect(data.completion_nonce).toBeDefined();
      expect(data.callback).toBeDefined();
      expect(data.callback.type).toBe("deep_link");
      expect(data.callback.url).toContain("code=");
      expect(data.callback.url).toContain("state=");
      expect(data.callback.url).toContain("txn=");
      expect(data.callback.url).toContain("completion_nonce=");
    });

    it("returns the persisted deep-link URI rather than the HTTPS approval origin", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody(), makeAuthHeaders()));
      const data = await res.json();

      expect(data.callback.url).toMatch(/^allura-pairing:\/\/complete\?/);
      expect(data.callback.url).toContain("code=");
      expect(data.callback.url).toContain("state=");
      expect(data.callback.url).toContain("txn=");
      expect(data.callback.url).toContain("completion_nonce=");
    });

    it("returns the persisted loopback URI with the bridge-selected ephemeral port", async () => {
      const { pool } = createMockPool({
        enrollmentRow: {
          callback_type: "loopback",
          callback_uri: "http://127.0.0.1:54321/callback",
          public_key: VALID_PUBLIC_KEY_PEM,
        },
      });
      mockGetAppPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody(), makeAuthHeaders()));
      const data = await res.json();

      expect(data.callback.url).toMatch(/^http:\/\/127\.0\.0\.1:54321\/callback\?/);
      expect(data.callback.url).toContain("code=");
      expect(data.callback.url).toContain("completion_nonce=");
    });

    it("reads callback context only through the scoped SECURITY DEFINER function", async () => {
      const { pool, queryCalls } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody(), makeAuthHeaders()));

      expect(res.status).toBe(200);
      expect(
        queryCalls.some((call) => call.text.includes("device_enrollment_approval_context")),
      ).toBe(true);
      expect(
        queryCalls.some((call) =>
          call.text.includes("FROM device_enrollments") &&
          !call.text.includes("device_enrollment_approval_context"),
        ),
      ).toBe(false);
    });

    it("authorization_code is 256-bit base64url (43 chars, no padding)", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      const data = await res.json();

      // 32 bytes → base64url = 43 chars, no padding
      expect(data.authorization_code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("completion_nonce is 32-byte base64url (43 chars, no padding)", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      const data = await res.json();

      expect(data.completion_nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it("both authorization_code and completion_nonce have ~60s expiry", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const before = Date.now();
      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      const after = Date.now();
      const data = await res.json();

      expect(data.code_expires_at).toBeDefined();
      expect(data.completion_nonce_expires_at).toBeDefined();

      const codeExpiry = new Date(data.code_expires_at).getTime();
      const nonceExpiry = new Date(data.completion_nonce_expires_at).getTime();

      // ~60 seconds (60000ms), ±2s slack
      expect(codeExpiry).toBeGreaterThanOrEqual(before + 60_000 - 2000);
      expect(codeExpiry).toBeLessThanOrEqual(after + 60_000 + 2000);
      expect(nonceExpiry).toBeGreaterThanOrEqual(before + 60_000 - 2000);
      expect(nonceExpiry).toBeLessThanOrEqual(after + 60_000 + 2000);
    });
  });

  describe("401 unauthenticated", () => {
    it("returns 401 when middleware authority headers are incomplete", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      // No authority headers intentionally invoke local dev auth. An incomplete
      // middleware authority header is the production-shaped unauthenticated
      // request and makes getAuthUser() return null.
      const req = makeRequest(makeValidBody(), { "x-allura-user-id": "" });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe("PrincipalContext route guard", () => {
    it("returns 403 for a verified viewer before opening a database connection", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody(), makeAuthHeaders({ "x-allura-role": "viewer" })));

      expect(res.status).toBe(403);
      expect(mockGetAppPool).not.toHaveBeenCalled();
    });
  });

  describe("404 ENROLLMENT_NOT_FOUND", () => {
    it("returns 404 when device_enrollment_approve returns NOT_FOUND", async () => {
      const { pool, queryCalls } = createMockPool({ approveStatus: "NOT_FOUND" });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("ENROLLMENT_NOT_FOUND");

      // The denied outcome is audited transactionally and committed.
      const auditInsert = queryCalls.find(
        (c) => c.text.includes("device_enrollment_pre_human_audit") && c.params[0] === "DEVICE_ENROLL_DENIED",
      );
      expect(auditInsert).toBeDefined();
      expect(queryCalls.find((c) => c.text === "COMMIT")).toBeDefined();
      expect(queryCalls.find((c) => c.text === "ROLLBACK")).toBeUndefined();
    });
  });

  describe("410 ENROLLMENT_EXPIRED", () => {
    it("returns 410 when device_enrollment_approve returns EXPIRED", async () => {
      const { pool, queryCalls } = createMockPool({ approveStatus: "EXPIRED" });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.error).toBe("ENROLLMENT_EXPIRED");

      // Audit DEVICE_ENROLL_EXPIRED with group_id=allura-system, agent_id=device-enrollment
      const auditInsert = queryCalls.find(
        (c) => c.text.includes("device_enrollment_pre_human_audit") && c.params[0] === "DEVICE_ENROLL_EXPIRED",
      );
      expect(auditInsert).toBeDefined();
      expect(auditInsert!.params[0]).toBe("DEVICE_ENROLL_EXPIRED");
      // EXPIRED state transition and its audit must persist together.
      expect(queryCalls.find((c) => c.text === "COMMIT")).toBeDefined();
      expect(queryCalls.find((c) => c.text === "ROLLBACK")).toBeUndefined();
    });
  });

  describe("400 STATE_MISMATCH", () => {
    it("returns 400 when device_enrollment_approve returns STATE_MISMATCH", async () => {
      const { pool, queryCalls } = createMockPool({ approveStatus: "STATE_MISMATCH" });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("STATE_MISMATCH");

      // Audit DEVICE_ENROLL_DENIED
      const auditInsert = queryCalls.find(
        (c) => c.text.includes("device_enrollment_pre_human_audit") && c.params[0] === "DEVICE_ENROLL_DENIED",
      );
      expect(auditInsert).toBeDefined();
    });
  });

  describe("400 STATE_MISMATCH via wrong state in request", () => {
    it("returns 400 when the request pkce_state does not match stored state", async () => {
      const { pool } = createMockPool({
        approveStatus: "STATE_MISMATCH",
      });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(
        makeValidBody({ pkce_state: "wrong_state_value_here_xx" }),
        makeAuthHeaders(),
      );
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("400 STATE_MISMATCH for a non-PENDING enrollment", () => {
    it("does not issue a fresh code when the SECURITY DEFINER function returns CONSUMED", async () => {
      const { pool, queryCalls } = createMockPool({ approveStatus: "CONSUMED" });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("STATE_MISMATCH");
      expect(data.authorization_code).toBeUndefined();
      expect(data.completion_nonce).toBeUndefined();
      expect(
        queryCalls.some(
          (c) => c.text.includes("INSERT INTO events") && c.params[2] === "DEVICE_ENROLL_DENIED",
        ),
      ).toBe(true);
    });
  });

  describe("400 CALLBACK_URI_INVALID", () => {
    it("rejects loopback URI userinfo instead of accepting URL-normalized targets", async () => {
      const { pool, queryCalls } = createMockPool({
        enrollmentRow: {
          callback_type: "loopback",
          callback_uri: "http://user:pass@127.0.0.1:54321/callback",
          public_key: VALID_PUBLIC_KEY_PEM,
        },
      });
      mockGetAppPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody(), makeAuthHeaders()));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "CALLBACK_URI_INVALID" });
      expect(queryCalls.some((call) => call.text.includes("device_enrollment_approve"))).toBe(false);
      expect(queryCalls.find((call) => call.text === "COMMIT")).toBeUndefined();
      expect(queryCalls.find((call) => call.text === "ROLLBACK")).toBeDefined();
    });

    it("rolls back before approval when persisted callback URI is malformed or external", async () => {
      const { pool, queryCalls } = createMockPool({
        enrollmentRow: {
          callback_type: "deep_link",
          callback_uri: "https://evil.example/callback",
          public_key: VALID_PUBLIC_KEY_PEM,
        },
      });
      mockGetAppPool.mockReturnValue(pool);

      const res = await POST(makeRequest(makeValidBody(), makeAuthHeaders()));

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "CALLBACK_URI_INVALID" });
      expect(queryCalls.some((call) => call.text.includes("device_enrollment_approve"))).toBe(false);
      expect(queryCalls.find((call) => call.text === "COMMIT")).toBeUndefined();
      expect(queryCalls.find((call) => call.text === "ROLLBACK")).toBeDefined();
    });
  });

  describe("403 MEMBERSHIP_INACTIVE", () => {
    it("returns 403 when no active membership is found", async () => {
      const { pool, queryCalls } = createMockPool({
        approveStatus: "APPROVED",
        membershipRow: null,
      });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("MEMBERSHIP_INACTIVE");

      // Audit DEVICE_ENROLL_DENIED
      const auditInsert = queryCalls.find(
        (c) => c.text.includes("device_enrollment_pre_human_audit") && c.params[0] === "DEVICE_ENROLL_DENIED",
      );
      expect(auditInsert).toBeDefined();
    });
  });

  describe("409 DEVICE_LIMIT_EXCEEDED", () => {
    it("returns 409 when device count >= limit", async () => {
      const { pool, queryCalls } = createMockPool({
        approveStatus: "APPROVED",
        deviceCount: 5,
        deviceLimit: 5,
      });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("DEVICE_LIMIT_EXCEEDED");

      // Audit DEVICE_ENROLL_DENIED under resolved workspace authority.
      const auditInsert = queryCalls.find(
        (c) => c.text.includes("INSERT INTO events") && c.params[2] === "DEVICE_ENROLL_DENIED",
      );
      expect(auditInsert).toBeDefined();
    });

    it("returns 409 when device count exceeds configurable limit of 3", async () => {
      const { pool } = createMockPool({
        approveStatus: "APPROVED",
        deviceCount: 3,
        deviceLimit: 3,
      });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(409);
    });
  });

  describe("400 CALLBACK_TYPE_DISABLED", () => {
    it("returns 400 when callback_type is not in allowlist", async () => {
      const { pool } = createMockPool({
        enrollmentRow: {
          id: ENROLLMENT_ID,
          state: "PENDING",
          pkce_state: PKCE_STATE,
          callback_type: "loopback",
          public_key: VALID_PUBLIC_KEY_PEM,
          display_label: "Workstation-1",
          key_id: "kid-test-1",
          key_algo: "ecdsa-p256",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      });
      mockGetAppPool.mockReturnValue(pool);
      vi.mocked(getPairingCallbackAllowlist).mockReturnValue(["deep_link"]);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("CALLBACK_TYPE_DISABLED");
    });
  });

  describe("audit DEVICE_ENROLL_APPROVED", () => {
    it("inserts audit event with agent_id=principal_id, group_id=approved_group_id", async () => {
      const { pool, queryCalls } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      await POST(req);

      const auditInsert = queryCalls.find(
        (c) => c.text.includes("INSERT INTO events") && c.params[2] === "DEVICE_ENROLL_APPROVED",
      );
      expect(auditInsert).toBeDefined();
      // agent_id = principal_id (post-approval: AR11)
      expect(auditInsert!.params[3]).toBe(PRINCIPAL_ID);
      // group_id = approved_group_id (not allura-system)
      expect(auditInsert!.params[0]).toBe(GROUP_ID);
      // RLS reads a real workspace column; metadata cannot satisfy the policy.
      expect(auditInsert!.text).toContain("workspace_id");
      expect(auditInsert!.params[1]).toBe(WORKSPACE_ID);
      expect(auditInsert!.params[3]).toBe(PRINCIPAL_ID);
 
      // Metadata includes enrollment_transaction_id, principal_id, group_id, workspace_id, key_fingerprint, auth_method
      const metadata = JSON.parse(auditInsert!.params[7] as string) as Record<string, unknown>;
      expect(metadata.enrollment_transaction_id).toBe(ENROLLMENT_ID);
      expect(metadata.principal_id).toBe(PRINCIPAL_ID);
      expect(metadata.group_id).toBe(GROUP_ID);
      expect(metadata.workspace_id).toBe(WORKSPACE_ID);
      expect(metadata.auth_method).toBe("clerk");
      expect(metadata.key_fingerprint).toBeDefined();
    });
  });

  describe("device_enrollment_approve called with correct params", () => {
    it("passes enrollment id, pkce_state, principal_id, group_id, workspace_id, code hash, nonce, and expiry timestamps", async () => {
      const { pool, queryCalls } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      await POST(req);

      const approveCall = queryCalls.find((c) =>
        c.text.includes("device_enrollment_approve"),
      );
      expect(approveCall).toBeDefined();
      const params = approveCall!.params;
      // p_id, p_pkce_state, p_principal_id, p_group_id, p_workspace_id,
      // p_authorization_code_hash, p_authorization_code_expires_at,
      // p_completion_nonce, p_completion_nonce_expires_at
      expect(params[0]).toBe(ENROLLMENT_ID);
      expect(params[1]).toBe(PKCE_STATE);
      expect(params[2]).toBe(PRINCIPAL_ID);
      expect(params[3]).toBe(GROUP_ID);
      expect(params[4]).toBe(WORKSPACE_ID);
      // authorization_code_hash is a hex string (SHA-256)
      expect(typeof params[5]).toBe("string");
      expect((params[5] as string)).toMatch(/^[0-9a-f]{64}$/);
      // expires_at timestamps
      expect(params[6]).toBeInstanceOf(Date);
      expect(typeof params[7]).toBe("string"); // completion_nonce
      expect(params[8]).toBeInstanceOf(Date);
    });
  });

  describe("raw authorization code never stored", () => {
    it("device_enrollment_approve receives SHA-256 hash, not the raw code", async () => {
      const { pool, queryCalls } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      const data = await res.json();
      const rawCode = data.authorization_code as string;

      const approveCall = queryCalls.find((c) =>
        c.text.includes("device_enrollment_approve"),
      );
      const storedHash = approveCall!.params[5] as string;

      // The stored value must NOT be the raw code
      expect(storedHash).not.toBe(rawCode);
      // It must be a 64-char hex SHA-256 digest
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("advisory lock acquired before count", () => {
    it("calls acquireDeviceCountLock and countApprovedDevices", async () => {
      const { pool } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);
      const { acquireDeviceCountLock } = await import("@/lib/device-pairing/device-limit");

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      await POST(req);

      expect(acquireDeviceCountLock).toHaveBeenCalled();
      expect(countApprovedDevices).toHaveBeenCalled();
    });
  });

  describe("fail-closed audit", () => {
    it("rolls back and returns 500 when audit insert fails", async () => {
      const { pool, queryCalls } = createMockPool({ auditFail: true });
      mockGetAppPool.mockReturnValue(pool);

      const req = makeRequest(makeValidBody(), makeAuthHeaders());
      const res = await POST(req);
      expect(res.status).toBe(500);

      const rollback = queryCalls.find((c) => c.text === "ROLLBACK");
      const commit = queryCalls.find((c) => c.text === "COMMIT");
      expect(rollback).toBeDefined();
      expect(commit).toBeUndefined();
    });
  });

  describe("restricted app-role transaction context", () => {
    it("sets tenant, workspace, and principal transaction locals before approval queries", async () => {
      const { pool, queryCalls } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      await POST(makeRequest(makeValidBody(), makeAuthHeaders()));

      const contextCalls = queryCalls.filter((call) => call.text.includes("set_config('app.current_"));
      expect(contextCalls.map((call) => call.params)).toEqual([
        [GROUP_ID],
        [GROUP_ID],
        [PRINCIPAL_ID],
        [WORKSPACE_ID],
      ]);
      const contextLastIndex = queryCalls.lastIndexOf(contextCalls[contextCalls.length - 1]);
      const approvalContextIndex = queryCalls.findIndex((call) => call.text.includes("device_enrollment_approval_context"));
      expect(contextLastIndex).toBeLessThan(approvalContextIndex);
    });
  });

  describe("server resolves authority — client cannot supply tenant", () => {
    it("uses AuthUser.groupId (not request body group_id) for membership resolution", async () => {
      const { pool, queryCalls } = createMockPool({});
      mockGetAppPool.mockReturnValue(pool);

      // Body attempts to inject a different group_id
      const req = makeRequest(
        makeValidBody({ group_id: "allura-evil" }),
        makeAuthHeaders(),
      );
      await POST(req);

      // The approve call should use the AuthUser's groupId, not the body's
      const approveCall = queryCalls.find((c) =>
        c.text.includes("device_enrollment_approve"),
      );
      expect(approveCall!.params[3]).toBe(GROUP_ID);
    });
  });
});
