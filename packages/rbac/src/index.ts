// @allura/rbac — shared permission logic.
// Roles and scopes are defined in @allura/types; this package maps roles to
// scopes and enforces the approval invariant (AD-04: agents cannot approve).

import type { Role, Scope } from "@allura/types";

export const DEFAULT_AGENT_SCOPES: Scope[] = [
  "memory:read",
  "memory:write",
  "receipt:create",
];

export const REVIEWER_SCOPES: Scope[] = [
  "memory:read",
  "review:read",
  "review:approve",
  "review:reject",
  "memory:promote",
];

const ALL_SCOPES: Scope[] = [
  "memory:read",
  "memory:write",
  "memory:delete",
  "memory:forget",
  "memory:promote",
  "review:read",
  "review:approve",
  "review:reject",
  "receipt:create",
  "audit:read",
  "audit:export",
  "agents:create",
  "agents:revoke",
  "tokens:create",
  "tokens:rotate",
  "workspace:lock",
  "admin:users",
  "admin:roles",
];

export const ROLE_SCOPES: Record<Role, Scope[]> = {
  owner: ALL_SCOPES,
  admin: [
    "memory:read",
    "memory:write",
    "memory:delete",
    "review:read",
    "audit:read",
    "audit:export",
    "agents:create",
    "agents:revoke",
    "tokens:create",
    "tokens:rotate",
    "workspace:lock",
    "admin:users",
    "admin:roles",
  ],
  reviewer: REVIEWER_SCOPES,
  employee: ["memory:read", "memory:write", "receipt:create"],
  viewer: ["memory:read", "audit:read"],
  auditor: ["audit:read", "audit:export"],
  agent: DEFAULT_AGENT_SCOPES,
};

export function scopesForRole(role: Role): Scope[] {
  return ROLE_SCOPES[role] ?? [];
}

export function hasScope(granted: Scope[], required: Scope): boolean {
  return granted.includes(required);
}

/**
 * AD-04: agents can never approve memory promotions, regardless of granted scopes.
 * A non-agent role may approve only if it holds `review:approve`.
 */
export function canApprove(role: Role, granted: Scope[]): boolean {
  if (role === "agent") return false;
  return hasScope(granted, "review:approve");
}
