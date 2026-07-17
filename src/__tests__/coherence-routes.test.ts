/**
 * API route tests for the Coherence Monitor (Story 2.1)
 *
 * Tests the GET /api/coherence/conflicts and POST /api/coherence/resolve
 * handlers with mocked auth, pool, and sentry. Kept in the unit lane because
 * the routes delegate to monitor functions that are themselves mocked here.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => ({ user: { id: "curator-1", role: "curator" }, allowed: true })),
  unauthorizedResponse: vi.fn(() => new Response("unauthorized", { status: 401 })),
  forbiddenResponse: vi.fn(() => new Response("forbidden", { status: 403 })),
}));

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
}));

vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(),
}));

// Import after mocks are registered
import { GET as getConflicts } from "@/app/api/coherence/conflicts/route";
import { POST as postResolve } from "@/app/api/coherence/resolve/route";
import { requireRole } from "@/lib/auth/api-auth";

beforeEach(() => {
  queryMock.mockReset();
  vi.mocked(requireRole).mockReturnValue({
    user: { id: "curator-1", role: "curator" },
    allowed: true,
  } as any);
});

describe("GET /api/coherence/conflicts", () => {
  it("returns active conflicts for a valid group_id", async () => {
    queryMock.mockResolvedValue({
      rows: [
        {
          id: 1,
          group_id: "allura-test",
          memory_id_a: 10,
          memory_id_b: 11,
          conflict_type: "entity_attribute",
          description: "ProjectX.status differs",
          severity: "medium",
          status: "active",
          created_at: new Date("2026-01-01T00:00:00Z"),
          resolved_at: null,
        },
      ],
    });

    const req = new NextRequest(
      "http://localhost/api/coherence/conflicts?group_id=allura-test"
    );
    const res = await getConflicts(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group_id).toBe("allura-test");
    expect(body.count).toBe(1);
    expect(body.conflicts[0].conflict_type).toBe("entity_attribute");
  });

  it("returns 400 when group_id is missing", async () => {
    const req = new NextRequest("http://localhost/api/coherence/conflicts");
    const res = await getConflicts(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid group_id format", async () => {
    const req = new NextRequest(
      "http://localhost/api/coherence/conflicts?group_id=bad"
    );
    const res = await getConflicts(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/coherence/resolve", () => {
  it("resolves a conflict and returns the new status", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });

    const req = new NextRequest("http://localhost/api/coherence/resolve", {
      method: "POST",
      body: JSON.stringify({
        conflict_id: 42,
        group_id: "allura-test",
        action: "supersede",
        rationale: "memory 11 is the latest truth",
      }),
    });
    const res = await postResolve(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.resulting_status).toBe("superseded");
    expect(body.resolved_by).toBe("curator-1");
  });

  it("uses the authenticated curator id, not the body curator_id", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    const req = new NextRequest("http://localhost/api/coherence/resolve", {
      method: "POST",
      body: JSON.stringify({
        conflict_id: 42,
        group_id: "allura-test",
        action: "dismiss",
        rationale: "not a real conflict",
        curator_id: "spoofed",
      }),
    });
    const res = await postResolve(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolved_by).toBe("curator-1");
  });

  it("requires a rationale", async () => {
    const req = new NextRequest("http://localhost/api/coherence/resolve", {
      method: "POST",
      body: JSON.stringify({
        conflict_id: 42,
        group_id: "allura-test",
        action: "dismiss",
      }),
    });
    const res = await postResolve(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/rationale/i);
  });

  it("rejects an unknown action", async () => {
    const req = new NextRequest("http://localhost/api/coherence/resolve", {
      method: "POST",
      body: JSON.stringify({
        conflict_id: 42,
        group_id: "allura-test",
        action: "bogus",
        rationale: "x",
      }),
    });
    const res = await postResolve(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the conflict is not found / not active", async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
    const req = new NextRequest("http://localhost/api/coherence/resolve", {
      method: "POST",
      body: JSON.stringify({
        conflict_id: 999,
        group_id: "allura-test",
        action: "dismiss",
        rationale: "already gone",
      }),
    });
    const res = await postResolve(req);
    expect(res.status).toBe(404);
  });

  it("rejects a non-positive conflict_id", async () => {
    const req = new NextRequest("http://localhost/api/coherence/resolve", {
      method: "POST",
      body: JSON.stringify({
        conflict_id: 0,
        group_id: "allura-test",
        action: "dismiss",
        rationale: "x",
      }),
    });
    const res = await postResolve(req);
    expect(res.status).toBe(400);
  });
});