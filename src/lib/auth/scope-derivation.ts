import { type AlluraRole, ROLE_LEVEL } from "@/lib/auth/types";
import { scopesForRole } from "@allura/rbac";
import type { LockMode, Role, Scope } from "@allura/types";

/** Derive trusted MCP scopes from the server-resolved membership role. */
export function deriveScopesForMembershipRole(role: string): Scope[] {
  const effectiveRole: Role = role === "curator" ? "reviewer" : role as Role;
  return scopesForRole(effectiveRole);
}

/**
 * A role change revokes an existing device credential only when the new role
 * drops at least one scope the old credential could carry. Promotions and
 * scope-equivalent changes preserve an otherwise-valid token.
 */
export function roleLosesDeviceAuthority(previousRole: string, nextRole: string): boolean {
  const previousLevel = ROLE_LEVEL[previousRole as AlluraRole];
  const nextLevel = ROLE_LEVEL[nextRole as AlluraRole];
  if (previousLevel === undefined || nextLevel === undefined || previousLevel <= nextLevel) return false;
  const nextScopes = new Set(deriveScopesForMembershipRole(nextRole));
  return deriveScopesForMembershipRole(previousRole).some((scope) => !nextScopes.has(scope));
}

/** Apply the workspace lock policy to server-derived device-token scopes. */
export function deriveDeviceTokenScopes(membershipRole: string, lockMode: LockMode): Scope[] {
  const roleScopes = deriveScopesForMembershipRole(membershipRole);
  switch (lockMode) {
    case "normal":
      return roleScopes;
    case "read_only":
    case "no_agent_writes":
      return ["memory:read", "audit:read"];
    case "no_promotions":
      return roleScopes.filter((scope) =>
        scope !== "memory:promote" && scope !== "review:approve" && scope !== "review:reject",
      );
    case "full_lockdown":
      throw new Error("Workspace is locked for device token minting");
    default:
      throw new Error("Workspace lock mode is invalid for device token minting");
  }
}
