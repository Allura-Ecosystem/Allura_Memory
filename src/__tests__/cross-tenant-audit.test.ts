/**
 * Cross-Tenant Audit Tests — Story 22.6
 *
 * Verifies:
 * - The audit endpoint requires admin auth (403 for non-admin)
 * - The audit engine creates synthetic tenants, seeds memories, and cleans up
 * - No leaks are found on a clean run (mocked)
 * - The response includes the required fields
 * - Cleanup runs even when the audit fails
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock environment ──────────────────────────────────────────────────────────

process.env.ALLURA_DEV_AUTH_ENABLED = "true";
// @ts-expect-error — NODE_ENV is read-only in Next.js types but must be set for tests
process.env.NODE_ENV = "test";
delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
delete process.env.CLERK_SECRET_KEY;

// ── Mutable mock state ────────────────────────────────────────────────────────

const queryMock = vi.fn();
const memorySearchMock = vi.fn();
const memoryAddMock = vi.fn();

let mockAuthResult: {
  allowed: boolean;
  authenticated: boolean;
  reason?: string;
  requiredRole: string;
  actualRole: string;
  user: { id: string; email: string; role: string; groupId: string } | null;
} = {
  allowed: true,
  authenticated: true,
  requiredRole: "admin",
  actualRole: "admin",
  user: { id: "admin-1", email: "admin@test.com", role: "admin", groupId: "allura-system" },
};

// ── Mock api-auth ──────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => mockAuthResult),
  unauthorizedResponse: vi.fn(() =>
    new Response(JSON.stringify({ error: "Authentication required", statusCode: 401 }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  ),
  forbiddenResponse: vi.fn((result: { requiredRole: string; actualRole: string; reason: string }) =>
    new Response(
      JSON.stringify({
        error: "Insufficient permissions",
        statusCode: 403,
        required: result.requiredRole,
        actual: result.actualRole,
        message: result.reason,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )
  ),
}));

// ── Mock postgres connection ──────────────────────────────────────────────────

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
}));

// ── Mock canonical-tools ──────────────────────────────────────────────────────

vi.mock("@/mcp/canonical-tools", () => ({
  memory_search: memorySearchMock,
  memory_add: memoryAddMock,
  memory_get: vi.fn(),
  memory_list: vi.fn(),
  memory_delete: vi.fn(),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { GET } from "@/app/api/audit/cross-tenant/route";
import {
  runCrossTenantAuditWithCleanup,
  getLastCleanupSucceeded,
} from "@/lib/audit/cross-tenant-test";
import { requireRole } from "@/lib/auth/api-auth";

// ── Helper ────────────────────────────────────────────────────────────────────

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, { method: "GET" } as any);
}

beforeEach(() => {
  queryMock.mockReset();
  memorySearchMock.mockReset();
  memoryAddMock.mockReset();
  vi.mocked(requireRole).mockReturnValue({
    allowed: true,
    authenticated: true,
    user: { id: "admin-1", email: "admin@test.com", role: "admin", groupId: "allura-system" },
    requiredRole: "admin",
    actualRole: "admin",
  } as any);
});

// ── runCrossTenantAuditWithCleanup ────────────────────────────────────────────

describe("Story 22.6 — runCrossTenantAuditWithCleanup", () => {
  it("creates synthetic tenants, seeds memories, runs queries, and cleans up", async () => {
    // Mock: INSERT (tenant creation) — succeed for all
    // Mock: memory_add — succeed
    // Mock: memory_search — return empty results (no leaks)
    // Mock: DELETE (cleanup) — succeed
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    memoryAddMock.mockResolvedValue({
      id: "mem-synth",
      stored: "episodic",
      score: 0.5,
      created_at: "2026-07-27T00:00:00Z",
    });
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 1,
    });

    const result = await runCrossTenantAuditWithCleanup({
      tenantCount: 3,
      memoriesPerTenant: 2,
      queriesPerPair: 5,
    });

    expect(result.tenants_tested).toBe(3);
    expect(result.queries_per_pair).toBe(5);
    expect(result.total_queries).toBe(30); // 3 tenants × 2 pairs × 5 queries
    expect(result.leaks_found).toBe(0);
    expect(result.status).toBe("pass");
    expect(result.leak_details).toHaveLength(0);
    expect(result.cleanup_succeeded).toBe(false); // patched by route

    // Verify tenant creation queries were made
    const insertCalls = queryMock.mock.calls.filter(
      (c: any[]) => (c[0] as string).includes("INSERT INTO tenants")
    );
    expect(insertCalls.length).toBe(3);

    // Verify memory_add was called 3 tenants × 2 memories = 6 times
    expect(memoryAddMock).toHaveBeenCalledTimes(6);

    // Verify cleanup queries were made
    const deleteCalls = queryMock.mock.calls.filter(
      (c: any[]) => (c[0] as string).includes("DELETE FROM")
    );
    expect(deleteCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("detects leaks when search returns cross-tenant data", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    memoryAddMock.mockResolvedValue({
      id: "mem-synth",
      stored: "episodic",
      score: 0.5,
      created_at: "2026-07-27T00:00:00Z",
    });

    // Simulate a leak: return results from tenant 1 when querying from tenant 0
    memorySearchMock.mockResolvedValue({
      results: [
        {
          id: "mem-leak",
          content: "audit-1-0-some-unique-token",
          score: 0.9,
          source: "episodic",
          provenance: "conversation",
          created_at: "2026-07-27T00:00:00Z",
        },
      ],
      count: 1,
      latency_ms: 1,
    });

    const result = await runCrossTenantAuditWithCleanup({
      tenantCount: 2,
      memoriesPerTenant: 1,
      queriesPerPair: 1,
    });

    expect(result.status).toBe("fail");
    expect(result.leaks_found).toBeGreaterThan(0);
    expect(result.leak_details.length).toBeGreaterThan(0);
    expect(result.leak_details[0].source_tenant).toContain("synth-0");
    expect(result.leak_details[0].target_tenant).toContain("synth-1");
  });

  it("cleanup runs even when audit encounters errors", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    memoryAddMock.mockRejectedValue(new Error("DB write failed"));

    await expect(
      runCrossTenantAuditWithCleanup({
        tenantCount: 2,
        memoriesPerTenant: 1,
        queriesPerPair: 1,
      })
    ).rejects.toThrow();

    // Verify cleanup still ran (DELETE queries were issued)
    const deleteCalls = queryMock.mock.calls.filter(
      (c: any[]) => (c[0] as string).includes("DELETE FROM")
    );
    expect(deleteCalls.length).toBeGreaterThanOrEqual(2);
  });
});

// ── GET /api/audit/cross-tenant ────────────────────────────────────────────────

describe("Story 22.6 — GET /api/audit/cross-tenant", () => {
  it("returns 200 with audit result on clean run (admin)", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    memoryAddMock.mockResolvedValue({
      id: "mem-synth",
      stored: "episodic",
      score: 0.5,
      created_at: "2026-07-27T00:00:00Z",
    });
    memorySearchMock.mockResolvedValue({
      results: [],
      count: 0,
      latency_ms: 1,
    });

    const req = makeRequest("http://localhost/api/audit/cross-tenant?tenants=2&memories=1&queries=1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenants_tested).toBe(2);
    expect(data.status).toBe("pass");
    expect(data.leaks_found).toBe(0);
    expect(data.cleanup_succeeded).toBeDefined();
  });

  it("returns 500 when leaks are detected", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    memoryAddMock.mockResolvedValue({
      id: "mem-synth",
      stored: "episodic",
      score: 0.5,
      created_at: "2026-07-27T00:00:00Z",
    });
    memorySearchMock.mockResolvedValue({
      results: [
        {
          id: "mem-leak",
          content: "audit-1-0-unique-token",
          score: 0.9,
          source: "episodic",
          provenance: "conversation",
          created_at: "2026-07-27T00:00:00Z",
        },
      ],
      count: 1,
      latency_ms: 1,
    });

    const req = makeRequest("http://localhost/api/audit/cross-tenant?tenants=2&memories=1&queries=1");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.status).toBe("fail");
    expect(data.leaks_found).toBeGreaterThan(0);
  });

  it("returns 403 for non-admin role", async () => {
    vi.mocked(requireRole).mockReturnValue({
      allowed: false,
      authenticated: true,
      reason: "Role 'viewer' insufficient for 'admin'",
      requiredRole: "admin",
      actualRole: "viewer",
      user: { id: "viewer-1", email: "viewer@test.com", role: "viewer", groupId: "allura-system" },
    } as any);

    const req = makeRequest("http://localhost/api/audit/cross-tenant");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(requireRole).mockReturnValue({
      allowed: false,
      authenticated: false,
      reason: "No auth token",
      requiredRole: "admin",
      actualRole: "anonymous",
      user: null,
    } as any);

    const req = makeRequest("http://localhost/api/audit/cross-tenant");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 on internal error", async () => {
    queryMock.mockRejectedValue(new Error("DB connection lost"));

    const req = makeRequest("http://localhost/api/audit/cross-tenant?tenants=2&memories=1&queries=1");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });
});