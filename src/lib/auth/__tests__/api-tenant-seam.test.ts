import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { type ApiTenantResult, resolveApiTenant } from "../web-principal";
import { getGroupIdFromAuth } from "../api-auth";
import { PrincipalAuthError } from "../principal-context";
import type { AuthUser } from "../types";

const curator = { id: "clerk-curator-1", email: "curator@example.test", role: "curator" as const, groupId: "allura-faithmeats" };

function ok(r: ApiTenantResult) { return r.status === "ok" ? r.groupId : `not-ok:${r.status}`; }

/** Build a minimal authenticated NextRequest with the middleware-injected identity headers. */
function authedRequest(user: AuthUser): NextRequest {
  const url = new URL("http://localhost/api/test");
  const req = new NextRequest(url, {
    headers: {
      "x-allura-user-id": user.id,
      "x-allura-session-id": "sess-1",
      "x-allura-role": user.role,
      "x-allura-group-id": user.groupId,
      "x-allura-email": user.email,
    },
  });
  return req;
}

describe("resolveApiTenant — effective-tenant authority seam", () => {
  it("missing identity → 401 (unauthenticated), never falls back to allura-system", () => {
    expect(resolveApiTenant(null, undefined).status).toBe("unauthenticated");
    expect(resolveApiTenant(null, "allura-system").status).toBe("unauthenticated");
    expect(ok(resolveApiTenant(null, undefined))).toBe("not-ok:unauthenticated");
  });

  it("malformed request selector → 400 INVALID_GROUP_ID", () => {
    for (const bad of ["*", "Acme", "x", "", "allura-system!", 123, "group%2Fid"] as const) {
      const r = resolveApiTenant(curator, bad);
      expect(r.status, `selector ${JSON.stringify(bad)}`).toBe("invalid_group_id");
    }
  });

  it("valid selector for a different tenant → 403 TENANT_MISMATCH", () => {
    const r = resolveApiTenant(curator, "allura-acme");
    expect(r.status).toBe("tenant_mismatch");
    if (r.status === "tenant_mismatch") expect(r.reason).toMatch(/TENANT_MISMATCH/);
  });

  it("matching selector → authenticated active tenant (ok)", () => {
    const r = resolveApiTenant(curator, "allura-faithmeats");
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.groupId).toBe("allura-faithmeats");
  });

  it("absent selector → authenticated active tenant (ok), no fallback", () => {
    const r = resolveApiTenant(curator, undefined);
    expect(r.status).toBe("ok");
    if (r.status === "ok") expect(r.groupId).toBe("allura-faithmeats");
  });

  it("never returns allura-system for a protected-route caller", () => {
    expect(ok(resolveApiTenant(curator, undefined))).toBe("allura-faithmeats");
    expect(ok(resolveApiTenant(curator, "allura-faithmeats"))).toBe("allura-faithmeats");
    // no hard-coded fallback
    expect(ok(resolveApiTenant({ ...curator, groupId: "allura-system" }, undefined))).toBe("allura-system");
  });
});

describe("getGroupIdFromAuth — refusal path via the seam", () => {
  it("authenticated matching/absent selector → tenant, no allura-system fallback", () => {
    const req = authedRequest(curator);
    expect(getGroupIdFromAuth(req)).toBe("allura-faithmeats");
    expect(getGroupIdFromAuth(req, "allura-faithmeats")).toBe("allura-faithmeats");
  });

  it("malformed fallback selector → throws PrincipalAuthError INVALID_GROUP_ID (400)", () => {
    const req = authedRequest(curator);
    try {
      getGroupIdFromAuth(req, "Bad!");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrincipalAuthError);
      if (error instanceof PrincipalAuthError) {
        expect(error.reasonCode).toBe("INVALID_GROUP_ID");
        expect(error.httpStatus).toBe(400);
      }
    }
  });

  it("foreign fallback selector → throws PrincipalAuthError TENANT_MISMATCH (403)", () => {
    const req = authedRequest(curator);
    try {
      getGroupIdFromAuth(req, "allura-acme");
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrincipalAuthError);
      if (error instanceof PrincipalAuthError) {
        expect(error.reasonCode).toBe("TENANT_MISMATCH");
        expect(error.httpStatus).toBe(403);
      }
    }
  });

  it("no identity → seam returns 401 (AUTH_MISSING), no allura-system fallback", () => {
    // The pure seam proves the unauthenticated → 401 mapping deterministically.
    // On the origin/main lineage getAuthUser returns a dev user in a non-Clerk
    // dev environment, so this is asserted at the seam level, not via the wrapper.
    expect(resolveApiTenant(null, "allura-system").status).toBe("unauthenticated");
    expect(resolveApiTenant(null, undefined).status).toBe("unauthenticated");
  });
});
