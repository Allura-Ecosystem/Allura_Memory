import { describe, expect, it } from "vitest";
import { createPrincipalContext, resolveBudgetTenant, PrincipalAuthError } from "../principal-context";

const principal = (tenantIds: string[], scopes: string[] = ["admin:budget"]) =>
  createPrincipalContext({
    principalId: "admin",
    tenantIds,
    roles: ["admin"],
    scopes,
    authMethod: "mcp_token",
    sessionId: "session-1",
    credentialId: "tok-1",
  });

describe("budget route tenant binding", () => {
  it("binds an omitted group to a single authorized tenant", () => {
    expect(resolveBudgetTenant(principal(["allura-system"]))).toBe("allura-system");
  });

  it("rejects omitted group for multi-tenant principals instead of expanding to all", () => {
    expect(() => resolveBudgetTenant(principal(["allura-a", "allura-b"]))).toThrow(PrincipalAuthError);
  });

  it("rejects omission even when a global budget capability is present", () => {
    for (const candidate of [
      () => resolveBudgetTenant(principal(["allura-a", "allura-b"])),
      () => resolveBudgetTenant(principal(["allura-a", "allura-b"], ["admin:budget", "admin:budget:global"])),
    ]) {
      try {
        candidate();
        throw new Error("expected refusal");
      } catch (error) {
        expect(error).toBeInstanceOf(PrincipalAuthError);
        expect((error as PrincipalAuthError).reasonCode).toBe("TENANT_MISMATCH");
      }
    }
  });
});
