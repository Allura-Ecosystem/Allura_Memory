/**
 * Auth Barrel Export
 *
 * Central import point for all auth modules.
 *
 * Usage:
 *   import { hasPermission, getAuthConfig, DevAuthProvider } from "@/lib/auth";
 */

// ── Types ───────────────────────────────────────────────────────────────────
export type {
  AlluraRole,
  AuthUser,
  AuthProvider,
  ClerkAlluraMetadata,
  ClerkPublicMetadata,
  DevAuthConfig,
  PermissionProfile,
  PermissionCheckResult,
  RouteProtection,
} from "./types";

export {
  ALLURA_ROLES,
  CANONICAL_ROLE_IDS,
  ROLE_LEVEL,
} from "./types";

export type {
  PermissionAction,
  PermissionPrincipalKind,
  RoleId,
} from "./types";

export type {
  PermissionProfileRequestBody,
  PermissionProfileValidationResult,
} from "./permission-profile";

export {
  PermissionProfileRequestBodySchema,
  PermissionProfileSchema,
  updatePermissionProfile,
  validatePermissionProfile,
} from "./permission-profile";

// ── Role Utilities ──────────────────────────────────────────────────────────
export {
  hasPermission,
  checkPermission,
  isValidRole,
  parseRole,
  roleLevel,
  rolesAtOrAbove,
  rolesBelow,
  ROLE_DESCRIPTIONS,
} from "./roles";

// ── Clerk Integration ───────────────────────────────────────────────────────
export {
  extractAlluraMetadata,
  buildAuthUser,
  isClerkConfigured,
  getClerkPublishableKey,
  buildClerkMetadataPayload,
} from "./clerk";

// ── Configuration ───────────────────────────────────────────────────────────
export {
  authEnvSchema,
  getAuthConfig,
  clearAuthConfig,
  isClerkEnabled,
  isDevAuthActive,
  getDevAuthConfig,
  AUTH_ROUTES,
} from "./config";

export type { AuthEnvConfig } from "./config";

// ── Dev Auth ────────────────────────────────────────────────────────────────
export {
  DevAuthProvider,
  devAuthProvider,
  isDevAuthEnabled,
  getDevUserSync,
} from "./dev-auth";

// ── API Auth Helpers ─────────────────────────────────────────────────────────
export {
  getAuthUser,
  requireAuth,
  requireRole,
  unauthorizedResponse,
  forbiddenResponse,
  getGroupIdFromAuth,
} from "./api-auth";
