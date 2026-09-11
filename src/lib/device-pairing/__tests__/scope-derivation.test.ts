import { describe, expect, it } from "vitest";

import {
  deriveDeviceTokenScopes,
  deriveScopesForMembershipRole,
} from "@/lib/auth/scope-derivation";

describe("device-token scope derivation", () => {
  it("derives server-owned role scopes and maps curator to reviewer", () => {
    expect(deriveScopesForMembershipRole("curator")).toEqual(deriveScopesForMembershipRole("reviewer"));
  });

  it("preserves role scopes in normal mode", () => {
    expect(deriveDeviceTokenScopes("admin", "normal")).toEqual(deriveScopesForMembershipRole("admin"));
  });

  it.each(["read_only", "no_agent_writes"] as const)("limits %s to read and audit", (lockMode) => {
    expect(deriveDeviceTokenScopes("admin", lockMode)).toEqual(["memory:read", "audit:read"]);
  });

  it("removes promotion and review-decision scopes in no_promotions mode", () => {
    expect(deriveDeviceTokenScopes("admin", "no_promotions")).toEqual(
      deriveScopesForMembershipRole("admin").filter((scope) =>
        !["memory:promote", "review:approve", "review:reject"].includes(scope),
      ),
    );
  });

  it("fails closed for full_lockdown and an unknown lock mode", () => {
    expect(() => deriveDeviceTokenScopes("admin", "full_lockdown")).toThrow(/locked/i);
    expect(() => deriveDeviceTokenScopes("admin", "unknown" as never)).toThrow(/invalid/i);
  });
});
