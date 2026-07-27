/**
 * Tenant Onboarding API Tests — Story 22.2
 *
 * Verifies:
 * - POST /api/tenants creates a new tenant (201)
 * - GET /api/tenants lists all active tenants
 * - GET /api/tenants/:group_id returns single tenant details
 * - PATCH /api/tenants/:group_id updates tenant config
 * - All endpoints require admin role (403 for non-admin)
 * - Duplicate group_id rejected with 409
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

const queryMock = vi.fn();

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

// ── Import after mocks ─────────────────────────────────────────────────────────

import { POST, GET } from "@/app/api/tenants/route";
import { GET as GET_SINGLE, PATCH } from "@/app/api/tenants/[group_id]/route";
import { requireRole } from "@/lib/auth/api-auth";

beforeEach(() => {
  queryMock.mockReset();
  vi.mocked(requireRole).mockReturnValue({
    allowed: true,
    authenticated: true,
    user: { id: "admin-1", email: "admin@test.com", role: "admin", groupId: "allura-system" },
    requiredRole: "admin",
    actualRole: "admin",
  } as any);
});

// ── Helper: create a NextRequest with JSON body ──────────────────────────────

function makeRequest(
  method: string,
  url: string,
  body?: unknown
): NextRequest {
  const init: Record<string, unknown> = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  // NextRequest's RequestInit has a stricter signal type than DOM's; use `as any` to bridge
  return new NextRequest(url, init as any);
}

// ── POST /api/tenants ──────────────────────────────────────────────────────────

describe("Story 22.2 — POST /api/tenants", () => {
  it("creates a new tenant and returns 201", async () => {
    const mockRow = {
      group_id: "allura-newco",
      name: "NewCo",
      description: "A new company",
      owner_agent_id: "founder",
      config: {},
      active: true,
      created_at: new Date("2026-07-27T00:00:00Z"),
    };
    // First query: duplicate check (no rows)
    // Second query: INSERT RETURNING
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [mockRow] });

    const req = makeRequest("POST", "http://localhost/api/tenants", {
      group_id: "allura-newco",
      name: "NewCo",
      description: "A new company",
      owner_agent_id: "founder",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.group_id).toBe("allura-newco");
    expect(data.name).toBe("NewCo");
  });

  it("rejects duplicate group_id with 409", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ group_id: "allura-system" }] });

    const req = makeRequest("POST", "http://localhost/api/tenants", {
      group_id: "allura-system",
      name: "System",
      owner_agent_id: "admin",
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("rejects missing required fields with 400", async () => {
    const req = makeRequest("POST", "http://localhost/api/tenants", {
      group_id: "allura-test",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid group_id format with 400", async () => {
    const req = makeRequest("POST", "http://localhost/api/tenants", {
      group_id: "invalid",
      name: "Invalid",
      owner_agent_id: "admin",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
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

    const req = makeRequest("POST", "http://localhost/api/tenants", {
      group_id: "allura-test",
      name: "Test",
      owner_agent_id: "admin",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});

// ── GET /api/tenants ───────────────────────────────────────────────────────────

describe("Story 22.2 — GET /api/tenants", () => {
  it("lists all active tenants", async () => {
    const mockRows = [
      {
        group_id: "allura-system",
        name: "Allura System",
        description: "System tenant",
        owner_agent_id: "gilliam",
        created_at: new Date("2026-07-26T00:00:00Z"),
      },
      {
        group_id: "allura-faithmeats",
        name: "Faith Meats",
        description: "Halal meat processing",
        owner_agent_id: "brooks",
        created_at: new Date("2026-07-26T00:00:00Z"),
      },
    ];
    queryMock.mockResolvedValue({ rowCount: 2, rows: mockRows });

    const req = makeRequest("GET", "http://localhost/api/tenants");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tenants).toHaveLength(2);
    expect(data.tenants[0].group_id).toBe("allura-system");
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

    const req = makeRequest("GET", "http://localhost/api/tenants");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

// ── GET /api/tenants/[group_id] ────────────────────────────────────────────────

describe("Story 22.2 — GET /api/tenants/:group_id", () => {
  it("returns tenant details including config", async () => {
    const mockRow = {
      group_id: "allura-faithmeats",
      name: "Faith Meats",
      description: "Halal meat processing",
      owner_agent_id: "brooks",
      config: { promotion_threshold: 0.85 },
      active: true,
      created_at: new Date("2026-07-26T00:00:00Z"),
    };
    queryMock.mockResolvedValue({ rowCount: 1, rows: [mockRow] });

    const req = makeRequest("GET", "http://localhost/api/tenants/allura-faithmeats");
    const res = await GET_SINGLE(req, { params: { group_id: "allura-faithmeats" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.group_id).toBe("allura-faithmeats");
    expect(data.config).toEqual({ promotion_threshold: 0.85 });
  });

  it("returns 404 for non-existent tenant", async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });

    const req = makeRequest("GET", "http://localhost/api/tenants/allura-unknown");
    const res = await GET_SINGLE(req, { params: { group_id: "allura-unknown" } });
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/tenants/[group_id] ──────────────────────────────────────────────

describe("Story 22.2 — PATCH /api/tenants/:group_id", () => {
  it("updates tenant config", async () => {
    const updatedRow = {
      group_id: "allura-faithmeats",
      name: "Faith Meats",
      description: "Halal meat processing",
      owner_agent_id: "brooks",
      config: { promotion_threshold: 0.90, auto_approval_mode: "aggressive" },
      active: true,
      created_at: new Date("2026-07-26T00:00:00Z"),
    };
    // First query: existence check
    // Second query: UPDATE RETURNING
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ group_id: "allura-faithmeats" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [updatedRow] });

    const req = makeRequest("PATCH", "http://localhost/api/tenants/allura-faithmeats", {
      config: { promotion_threshold: 0.90, auto_approval_mode: "aggressive" },
    });

    const res = await PATCH(req, { params: { group_id: "allura-faithmeats" } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.promotion_threshold).toBe(0.90);
  });

  it("returns 404 for non-existent tenant", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const req = makeRequest("PATCH", "http://localhost/api/tenants/allura-unknown", {
      config: { promotion_threshold: 0.85 },
    });

    const res = await PATCH(req, { params: { group_id: "allura-unknown" } });
    expect(res.status).toBe(404);
  });

  it("returns 400 when no fields to update", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [{ group_id: "allura-system" }] });

    const req = makeRequest("PATCH", "http://localhost/api/tenants/allura-system", {});

    const res = await PATCH(req, { params: { group_id: "allura-system" } });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin role", async () => {
    vi.mocked(requireRole).mockReturnValue({
      allowed: false,
      authenticated: true,
      reason: "Role 'curator' insufficient for 'admin'",
      requiredRole: "admin",
      actualRole: "curator",
      user: { id: "curator-1", email: "curator@test.com", role: "curator", groupId: "allura-system" },
    } as any);

    const req = makeRequest("PATCH", "http://localhost/api/tenants/allura-system", {
      config: { promotion_threshold: 0.85 },
    });

    const res = await PATCH(req, { params: { group_id: "allura-system" } });
    expect(res.status).toBe(403);
  });
});