import { describe, expect, it } from "vitest";
import { resolveWebApprovalTenant, webPrincipalFromAuthUser } from "../web-principal";

describe("webPrincipalFromAuthUser", () => {
  it("derives a tenant-locked curator principal from the verified web identity", () => {
    const principal = webPrincipalFromAuthUser(
      { id: "clerk-curator-1", email: "curator@example.test", role: "curator", groupId: "allura-faithmeats" },
      "web-session-1",
    );

    expect(principal).toMatchObject({
      principalId: "clerk-curator-1",
      tenantIds: ["allura-faithmeats"],
      roles: ["curator"],
      authMethod: "web_session",
    });
    expect(principal.scopes).toContain("review:approve");
  });

  it("refuses a wildcard or malformed tenant from the web identity", () => {
    expect(() => webPrincipalFromAuthUser(
      { id: "clerk-curator-1", email: "curator@example.test", role: "curator", groupId: "*" },
      "web-session-1",
    )).toThrow(/Wildcard tenant is not permitted for web_session/);
  });

  it("rejects a body tenant that differs from the authenticated tenant", () => {
    const user = { id: "clerk-curator-1", email: "curator@example.test", role: "curator" as const, groupId: "allura-faithmeats" };
    expect(resolveWebApprovalTenant(user, "allura-faithmeats")).toBe("allura-faithmeats");
    expect(() => resolveWebApprovalTenant(user, "allura-system")).toThrow(/TENANT_MISMATCH/);
  });
});
