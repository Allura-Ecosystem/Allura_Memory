/**
 * API Route Auth Helpers
 *
 * Server-side utilities for checking authentication and authorization
 * in Next.js API route handlers.
 *
 * Usage in route handlers:
 *   import { requireAuth, requireRole } from "@/lib/auth/api-auth";
 *
 *   export async function GET(request: NextRequest) {
 *     const user = requireAuth(request);
 *     if (!user) return unauthorizedResponse();
 *
 *     const roleCheck = requireRole(request, "curator");
 *     if (!roleCheck.allowed) return forbiddenResponse(roleCheck);
 *
 *     // ... proceed with authenticated request
 *   }
 *
 * Reference: Phase 7 benchmark — RBAC with curator/admin/viewer roles
 */

import { NextRequest, NextResponse } from "next/server";
import { validateGroupId } from "@/lib/validation/group-id";
import { isDevAuthActive } from "./config";
import { getDevUserSync } from "./dev-auth";
import { checkPermission, isValidRole, roleLevel } from "./roles";
import { minimumRoleForAction } from "./permission-action-role";
import { resolveApiTenant } from "./web-principal";
import { PrincipalAuthError } from "./principal-context";
import type { AlluraRole, AuthUser, PermissionAction, PermissionCheckResult } from "./types";

// ── Discriminated Union for requireRole ──────────────────────────────────────

/**
 * Discriminated union return type for requireRole.
 *
 * When allowed is true, user is guaranteed non-null.
 * When allowed is false, reason is always present. Authenticated callers retain
 * their user so route handlers can distinguish forbidden (403) from
 * unauthenticated (401) requests.
 */
export type RoleCheckResult =
  | { allowed: true; authenticated: true; user: AuthUser; requiredRole: AlluraRole; actualRole: AlluraRole }
  | {
      allowed: false;
      // `authenticated` distinguishes the two failure modes that route handlers
      // must map to different HTTP statuses:
      //   authenticated === false → no identity → 401 Unauthorized
      //   authenticated === true  → identity present, role insufficient → 403 Forbidden
      // `user` is populated when authenticated so the canonical guard
      // `if (!roleCheck.user) return unauthorizedResponse()` means *only* "no identity".
      authenticated: boolean;
      reason: string;
      user: AuthUser | null;
      requiredRole: AlluraRole;
      actualRole: AlluraRole;
    };

const AUTHORITY_HEADER_NAMES = [
  "x-allura-user-id",
  "x-allura-session-id",
  "x-allura-role",
  "x-allura-group-id",
  "x-allura-workspace-id",
  "x-allura-email",
  "x-allura-name",
  "x-allura-image-url",
] as const;

function isValidAuthorityIdentifier(value: string | null): value is string {
  return typeof value === "string"
    && value.trim() !== ""
    && !/[\u0000-\u001f\u007f]/.test(value);
}

// ── Auth Resolution ─────────────────────────────────────────────────────────

/**
 * Get the authenticated user from the request.
 *
 * In production with Clerk: reads from middleware-injected headers.
 * In development without Clerk: returns the dev user.
 *
 * Returns null if no authenticated user is found.
 */
export function getAuthUser(request: NextRequest): AuthUser | null {
  // Prefer middleware-injected headers when present. This keeps API route tests
  // and server-to-server calls honest even when dev auth fallback is enabled.
  const userId = request.headers.get("x-allura-user-id");
  const role = request.headers.get("x-allura-role");
  const groupId = request.headers.get("x-allura-group-id");
  const email = request.headers.get("x-allura-email");
  const name = request.headers.get("x-allura-name");
  const imageUrl = request.headers.get("x-allura-image-url");
  const workspaceId = request.headers.get("x-allura-workspace-id");
  const sessionId = request.headers.get("x-allura-session-id");
  const hasAuthorityHeaders = AUTHORITY_HEADER_NAMES.some((header) => request.headers.has(header));

  if (hasAuthorityHeaders) {
    if (
      !isValidAuthorityIdentifier(userId)
      || !isValidAuthorityIdentifier(sessionId)
      || !isValidRole(role)
      || !isValidAuthorityIdentifier(workspaceId)
    ) {
      return null;
    }

    let validatedGroupId: string;
    try {
      validatedGroupId = validateGroupId(groupId);
    } catch {
      return null;
    }

    return {
      id: userId,
      email: email ?? "",
      name: name ?? undefined,
      role,
      groupId: validatedGroupId,
      workspaceId,
      sessionId,
      imageUrl: imageUrl ?? undefined,
    };
  }

  // Development mode: use DevAuthProvider only when no auth headers exist.
  if (isDevAuthActive()) {
    return getDevUserSync();
  }

  return null;
}

/**
 * Require authentication — returns the user or null.
 *
 * Use this when the route requires authentication but not a specific role.
 * If null is returned, respond with `unauthorizedResponse()`.
 */
export function requireAuth(request: NextRequest): AuthUser | null {
  return getAuthUser(request);
}

/**
 * Require a minimum role — returns a discriminated union result.
 *
 * Use this when the route requires a specific role level.
 * If `allowed` is false, respond with `forbiddenResponse(result)`.
 *
 * When `result.allowed` is true, TypeScript narrows `result.user` to AuthUser (non-null).
 * When `result.allowed` is false, `result.user` is null and `result.reason` is always present.
 */
export function requireRole(
  request: NextRequest,
  requiredRole: AlluraRole,
): RoleCheckResult {
  const user = getAuthUser(request);

  if (!user) {
    return {
      allowed: false,
      authenticated: false,
      reason: "Authentication required",
      requiredRole,
      actualRole: "viewer" as AlluraRole,
      user: null,
    };
  }

  const result = checkPermission(user.role, requiredRole);

  if (result.allowed) {
    return {
      allowed: true,
      authenticated: true,
      user,
      requiredRole: result.requiredRole,
      actualRole: result.actualRole,
    };
  }

  // Authenticated but role insufficient → keep the user so handlers map this
  // to 403 Forbidden (not 401). This is the root-cause fix for the permission
  // contract: previously `user` was nulled here, making forbidden requests
  // indistinguishable from unauthenticated ones.
  return {
    allowed: false,
    authenticated: true,
    reason: result.reason ?? `Role '${user.role}' insufficient for '${requiredRole}'`,
    user,
    requiredRole: result.requiredRole,
    actualRole: result.actualRole,
  };
}

// ── Response Helpers ─────────────────────────────────────────────────────────

/**
 * Standard 401 Unauthorized response.
 */
export function unauthorizedResponse(message: string = "Authentication required"): NextResponse {
  return NextResponse.json(
    {
      error: message,
      statusCode: 401,
    },
    { status: 401 }
  );
}

/**
 * Standard 403 Forbidden response with role details.
 */
export function forbiddenResponse(
  result: PermissionCheckResult,
): NextResponse {
  return NextResponse.json(
    {
      error: "Insufficient permissions",
      statusCode: 403,
      required: result.requiredRole,
      actual: result.actualRole,
      message: result.reason,
    },
    { status: 403 }
  );
}

/**
 * Extract group_id from auth context via the Story 24.12 authority seam.
 *
 * Reconciles with `resolveWebApprovalTenant`: both now delegate to
 * `resolveApiTenant` in `web-principal.ts`.
 *
 * Resolution order (highest precedence first):
 * 1. AuthUser.groupId — from Clerk or dev-auth (always trusted)
 * 2. fallbackGroupId parameter — caller-supplied explicit override
 *
 * SECURITY: There is NO hard-coded "allura-system" fallback for protected
 * routes. Caller-supplied query parameters are intentionally excluded.
 * Accepting group_id from unauthenticated request query strings allows tenant
 * injection. Only authenticated identity determines the effective tenant.
 *
 * @throws PrincipalAuthError (INVALID_GROUP_ID 400 / AUTH_MISSING 401 / TENANT_MISMATCH 403)
 * when the request cannot be resolved to an authenticated active tenant without
 * an unsafe default. This is a breaking change from the prior silent
 * `allura-system` fallback and is the point of Story 24.12.
 */
export function getGroupIdFromAuth(
  request: NextRequest,
  fallbackGroupId?: string,
): string {
  const user = getAuthUser(request);
  // Explicit caller-supplied fallback is permitted only when no identity exists;
  // otherwise authority comes from the authenticated tenant via the seam.
  const selector = fallbackGroupId;
  const result = resolveApiTenant(user, selector);
  if (result.status === "ok") {
    return result.groupId;
  }
  if (result.status === "invalid_group_id") {
    throw new PrincipalAuthError("INVALID_GROUP_ID", result.reason);
  }
  if (result.status === "tenant_mismatch") {
    throw new PrincipalAuthError("TENANT_MISMATCH", result.reason);
  }
  // unauthenticated — no hard-coded allura-system fallback
  throw new PrincipalAuthError("AUTH_MISSING", "authenticated tenant required; no protected-route tenant fallback");
}

// ── Action -> Role Floor ─────────────────────────────────────────────────────

/**
 * Minimum AlluraRole that may perform each PermissionAction.
 *
 * Story 24.11a AC-7. `withPermission` previously accepted a PermissionAction
 * and discarded it (`void action`), so a caller could pass a destructive action
 * with a permissive requiredRole and the action name would have no effect. The
 * argument is now enforced: the effective requirement is the stricter of the
 * caller-supplied requiredRole and this floor.
 *
 * Reads are viewer, mutations are curator, tenant/identity administration is
 * admin. Covers every literal member of PermissionAction plus the extra action
 * strings used by route handlers (memory:write, memory:delete).
 */
// Shared with the static validator so two-argument withPermission calls retain
// the exact same action floor in runtime and CI analysis.
export { minimumRoleForAction } from "./permission-action-role";

/** The stricter of two roles. */
function stricterRole(a: AlluraRole, b: AlluraRole): AlluraRole {
  return roleLevel(a) >= roleLevel(b) ? a : b;
}

// ── withPermission Helper ────────────────────────────────────────────────────

/**
 * Resolve auth, check role, and return the user + groupId in one call.
 *
 * Returns the resolved user and groupId when the check passes.
 * Returns a NextResponse (401 or 403) when the check fails.
 *
 * The effective requirement is `stricter(requiredRole, minimumRoleForAction(action))`.
 * Both arguments are enforced; neither is decorative.
 *
 * Usage:
 *   const result = await withPermission(request, "memory:read");
 *   if (result instanceof NextResponse) return result;
 *   const { user, groupId } = result;
 *
 * @param request - Incoming Next.js request
 * @param action - PermissionAction being requested; enforced via ACTION_MINIMUM_ROLE
 * @param requiredRole - Minimum AlluraRole required (defaults to "viewer")
 */
export async function withPermission(
  request: NextRequest,
  action: PermissionAction,
  requiredRole: AlluraRole = "viewer",
): Promise<{ user: AuthUser; groupId: string } | NextResponse> {
  const effectiveRole = stricterRole(requiredRole, minimumRoleForAction(action));

  const roleCheck = requireRole(request, effectiveRole);

  if (!roleCheck.allowed) {
    // authenticated === false → no identity → 401
    // authenticated === true  → identity present, role insufficient → 403
    if (!roleCheck.authenticated) {
      return unauthorizedResponse();
    }
    return forbiddenResponse(roleCheck);
  }

  // Resolve the effective tenant via the Story 24.12 seam. A refusal must map
  // to a stable 400/401/403 response rather than propagate as an unhandled 500.
  let groupId: string;
  try {
    groupId = getGroupIdFromAuth(request);
  } catch (error) {
    if (error instanceof PrincipalAuthError) {
      return NextResponse.json(
        {
          error: error.reasonCode,
          statusCode: error.httpStatus,
          message: error.message,
        },
        { status: error.httpStatus },
      );
    }
    throw error;
  }

  return { user: roleCheck.user, groupId };
}
