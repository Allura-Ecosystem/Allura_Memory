/**
 * Allura Memory Role Definitions and Permission Checks
 *
 * Implements hierarchical RBAC with three roles:
 *   viewer < curator < admin
 *
 * Role checks use numeric levels for efficient comparison:
 *   roleLevel(userRole) >= roleLevel(requiredRole)
 *
 * Reference: Phase 7 benchmark — RBAC with curator/admin/viewer roles
 */

import {
  ALLURA_ROLES,
  AlluraRole,
  PermissionCheckResult,
  ROLE_LEVEL,
} from "./types";

// ── Role Hierarchy ─────────────────────────────────────────────────────────

/**
 * Get the numeric level for a role.
 * Higher number = more permissions.
 */
export function roleLevel(role: AlluraRole): number {
  return ROLE_LEVEL[role];
}

/**
 * Check if `userRole` has at least the permissions of `requiredRole`.
 *
 * Uses numeric comparison on the role hierarchy:
 *   admin (2) >= curator (1) >= viewer (0)
 *
 * @example
 *   hasPermission("curator", "viewer")   // true — curator can do viewer things
 *   hasPermission("viewer", "curator")    // false — viewer cannot do curator things
 *   hasPermission("admin", "curator")     // true — admin can do curator things
 */
export function hasPermission(userRole: AlluraRole, requiredRole: AlluraRole): boolean {
  return roleLevel(userRole) >= roleLevel(requiredRole);
}

/**
 * Detailed permission check with reason for denial.
 *
 * Returns a structured result that can be used to build
 * 403 Forbidden responses with explanatory messages.
 */
export function checkPermission(
  userRole: AlluraRole,
  requiredRole: AlluraRole,
): PermissionCheckResult {
  const allowed = hasPermission(userRole, requiredRole);

  return {
    allowed,
    reason: allowed
      ? undefined
      : `Role '${userRole}' does not have '${requiredRole}' permission. Required: ${requiredRole} or above.`,
    requiredRole,
    actualRole: userRole,
  };
}

// ── Role Validation ────────────────────────────────────────────────────────

/**
 * Type guard: check if a value is a valid AlluraRole.
 */
export function isValidRole(value: unknown): value is AlluraRole {
  return typeof value === "string" && (ALLURA_ROLES as readonly string[]).includes(value);
}

/**
 * Parse a role from unknown input, with fallback.
 *
 * @param value - The value to parse (typically from verified identity metadata or env)
 * @param fallback - Default role if value is invalid (defaults to "viewer")
 */
export function parseRole(value: unknown, fallback: AlluraRole = "viewer"): AlluraRole {
  if (isValidRole(value)) {
    return value;
  }
  return fallback;
}

// ── Role Descriptions (for UI) ─────────────────────────────────────────────

export const ROLE_DESCRIPTIONS: Record<AlluraRole, string> = {
  viewer: "Can view memories, search, and read traces/insights",
  curator: "Can approve/reject proposals and manage knowledge promotion",
  admin: "Full access including admin routes, user management, and system config",
} as const;

/**
 * Get all roles that satisfy a minimum role requirement.
 *
 * @example
 *   rolesAtOrAbove("curator") → ["curator", "admin"]
 */
export function rolesAtOrAbove(minimumRole: AlluraRole): AlluraRole[] {
  const minimumLevel = roleLevel(minimumRole);
  return ALLURA_ROLES.filter((role) => roleLevel(role) >= minimumLevel);
}

/**
 * Get all roles below a given role.
 *
 * @example
 *   rolesBelow("admin") → ["viewer", "curator"]
 */
export function rolesBelow(maximumRole: AlluraRole): AlluraRole[] {
  const maximumLevel = roleLevel(maximumRole);
  return ALLURA_ROLES.filter((role) => roleLevel(role) < maximumLevel);
}