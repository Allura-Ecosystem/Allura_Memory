import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const { requireRoleMock } = vi.hoisted(() => ({ requireRoleMock: vi.fn() }));

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: requireRoleMock,
  unauthorizedResponse: vi.fn(() => new Response(null, { status: 401 })),
  forbiddenResponse: vi.fn(() => new Response(null, { status: 403 })),
}));

import { GET } from "@/app/api/audit/cross-tenant/route";
import { runCrossTenantAudit, runCrossTenantAuditWithCleanup } from "@/lib/audit/cross-tenant-test";

describe("cross-tenant audit authority", () => {
  it("fails closed instead of fabricating tenant scope for synthetic writes", async () => {
    await expect(runCrossTenantAudit()).rejects.toThrow("requires verified workspace principals");
    await expect(runCrossTenantAuditWithCleanup()).rejects.toThrow("requires verified workspace principals");
  });

  it("returns fail-closed service-unavailable to an authenticated admin", async () => {
    requireRoleMock.mockReturnValue({
      allowed: true,
      user: { id: "admin-1" },
      requiredRole: "admin",
      actualRole: "admin",
    });

    const response = await GET(new NextRequest("http://localhost/api/audit/cross-tenant"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("unavailable without verified cross-workspace audit principals"),
      status: "unavailable",
    });
  });

  it("preserves unauthenticated and non-admin denials", async () => {
    requireRoleMock.mockReturnValueOnce({ allowed: false, user: null });
    expect((await GET(new NextRequest("http://localhost/api/audit/cross-tenant"))).status).toBe(401);

    requireRoleMock.mockReturnValueOnce({ allowed: false, user: { id: "viewer-1" } });
    expect((await GET(new NextRequest("http://localhost/api/audit/cross-tenant"))).status).toBe(403);
  });
});
