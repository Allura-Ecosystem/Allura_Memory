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
import { isClerkEnabled } from "./config";
import { getDevUserSync } from "./dev-auth";
import { checkPermission, parseRole } from "./roles";
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

  if (userId) {
    return {
      id: userId,
      email: email ?? "",
      name: name ?? undefined,
      role: parseRole(role, "viewer"),
      groupId: groupId ?? "allura-system",
      imageUrl: imageUrl ?? undefined,
    };
  }

  // Development mode: use DevAuthProvider only when no auth headers exist.
  if (!isClerkEnabled()) {
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
 * Extract group_id from auth context.
 *
 * Resolution order (highest precedence first):
 * 1. AuthUser.groupId — from Clerk or dev-auth (always trusted)
 * 2. fallbackGroupId parameter — caller-supplied explicit override
 * 3. "allura-system" — hard-coded safe default
 *
 * SECURITY: Caller-supplied query parameters are intentionally excluded.
 * Accepting group_id from unauthenticated request query strings allows
 * tenant injection — an unauthenticated caller could supply any tenant
 * and read cross-tenant data. Only authenticated identity determines
 * the effective tenant.
 */
export function getGroupIdFromAuth(
  request: NextRequest,
  fallbackGroupId?: string,
): string {
  const user = getAuthUser(request);
  if (user?.groupId) {
    return user.groupId;
  }

  // Use provided fallback or default — never caller-supplied query params
  return fallbackGroupId ?? "allura-system";
}

// ── withPermission Helper ────────────────────────────────────────────────────

/**
 * Resolve auth, check role, and return the user + groupId in one call.
 *
 * Returns the resolved user and groupId when the check passes.
 * Returns a NextResponse (401 or 403) when the check fails.
 *
 * Usage:
 *   const result = await withPermission(request, "memory:read");
 *   if (result instanceof NextResponse) return result;
 *   const { user, groupId } = result;
 *
 * @param request - Incoming Next.js request
 * @param action - PermissionAction being requested (for future policy checks)
 * @param requiredRole - Minimum AlluraRole required (defaults to "viewer")
 */
export async function withPermission(
  request: NextRequest,
  action: PermissionAction,
  requiredRole: AlluraRole = "viewer",
): Promise<{ user: AuthUser; groupId: string } | NextResponse> {
  // Suppress unused-variable warning for action — reserved for future
  // PermissionProfile.allowed_actions checks without breaking the signature.
  void action;

  const roleCheck = requireRole(request, requiredRole);

  if (!roleCheck.allowed) {
    // authenticated === false → no identity → 401
    // authenticated === true  → identity present, role insufficient → 403
    if (!roleCheck.authenticated) {
      return unauthorizedResponse();
    }
    return forbiddenResponse(roleCheck);
  }

  const groupId = getGroupIdFromAuth(request);

  return { user: roleCheck.user, groupId };
}
