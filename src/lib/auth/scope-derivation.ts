import { scopesForRole } from "@allura/rbac";
import type { Role, Scope } from "@allura/types";

/** Derive trusted MCP scopes from the server-resolved membership role. */
export function deriveScopesForMembershipRole(role: string): Scope[] {
  const effectiveRole: Role = role === "curator" ? "reviewer" : role as Role;
  return scopesForRole(effectiveRole);
}
