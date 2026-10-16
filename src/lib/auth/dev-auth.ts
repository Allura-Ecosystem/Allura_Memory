/**
 * DevAuthProvider — Development-mode auth bypass
 *
 * Outside production, when explicitly enabled via ALLURA_DEV_AUTH_ENABLED,
 * this provider returns a synthetic authenticated user from env vars.
 *
 * This allows local development and testing without any auth provider setup.
 * It is NEVER active in production.
 */

import { getDevAuthConfig, isDevAuthActive } from "./config";
import { hasPermission } from "./roles";
import type { AlluraRole, AuthProvider, AuthUser } from "./types";

/**
 * DevAuthProvider implements AuthProvider for local development.
 *
 * Returns a synthetic user based on environment variables:
 * - ALLURA_DEV_AUTH_ROLE (default: "admin")
 * - ALLURA_DEV_AUTH_GROUP_ID (default: "allura-system")
 * - ALLURA_DEV_AUTH_USER_ID (default: "dev-user-allura")
 * - ALLURA_DEV_AUTH_EMAIL (default: "dev@allura.local")
 *
 * ⚠️ This provider is ONLY active when:
 *   1. ALLURA_DEV_AUTH_ENABLED=true (default outside production)
 *   2. NODE_ENV !== "production"
 */
export class DevAuthProvider implements AuthProvider {
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!isDevAuthActive()) {
      return null;
    }

    const devConfig = getDevAuthConfig();

    return {
      id: devConfig.defaultUserId,
      email: devConfig.defaultEmail,
      name: "Dev User",
      role: devConfig.defaultRole,
      groupId: devConfig.defaultGroupId,
      workspaceId: devConfig.defaultWorkspaceId,
      sessionId: `dev:${devConfig.defaultUserId}`,
      imageUrl: undefined,
    };
  }

  async hasRole(requiredRole: AlluraRole): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user) {
      return false;
    }
    return hasPermission(user.role, requiredRole);
  }

  async getGroupId(): Promise<string> {
    const user = await this.getCurrentUser();
    return user?.groupId ?? "allura-system";
  }
}

/**
 * Singleton instance for convenience.
 */
export const devAuthProvider = new DevAuthProvider();

/**
 * Check if dev auth is currently active.
 *
 * Useful in middleware to decide whether DevAuthProvider applies.
 */
export function isDevAuthEnabled(): boolean {
  return isDevAuthActive();
}

/**
 * Get the current dev user (or null if dev auth is disabled).
 *
 * This is a synchronous convenience wrapper for server-side use
 * where async is not needed.
 */
export function getDevUserSync(): AuthUser | null {
  if (!isDevAuthActive()) {
    return null;
  }

  const devConfig = getDevAuthConfig();

  return {
    id: devConfig.defaultUserId,
    email: devConfig.defaultEmail,
    name: "Dev User",
    role: devConfig.defaultRole,
    groupId: devConfig.defaultGroupId,
    workspaceId: devConfig.defaultWorkspaceId,
    sessionId: `dev:${devConfig.defaultUserId}`,
    imageUrl: undefined,
  };
}
