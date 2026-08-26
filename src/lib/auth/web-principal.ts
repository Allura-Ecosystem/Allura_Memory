import type { AuthUser } from "./types";
import { createPrincipalContext, PrincipalAuthError, type PrincipalContext } from "./principal-context";
import { validateGroupId } from "@/lib/validation/group-id";

/**
 * Discriminated result of effective-tenant resolution for an API route.
 * Maps 1:1 to HTTP status codes so a route handler can respond correctly
 * without its own tenant inference.
 *
 * - `invalid_group_id`   → 400 (malformed/blank request selector)
 * - `unauthenticated`    → 401 (no verified identity)
 * - `tenant_mismatch`    → 403 (selector names a different tenant)
 * - `ok`                 → 200 (authenticated active tenant)
 */
export type ApiTenantResult =
  | { status: "invalid_group_id"; reason: string }
  | { status: "unauthenticated" }
  | { status: "tenant_mismatch"; reason: string; requested: string; effective: string }
  | { status: "ok"; groupId: string; user: AuthUser };

function isMalformedSelector(selector: unknown): boolean {
  // Absent selector (undefined/null) is NOT malformed — it simply asserts nothing
  // and resolves to the authenticated tenant (ok).
  if (selector === undefined || selector === null) return false;
  if (typeof selector !== "string") return true;
  const trimmed = selector.trim();
  if (trimmed.length === 0) return true;
  try {
    validateGroupId(trimmed);
    return false;
  } catch {
    return true;
  }
}

/**
 * Story 24.12 — single effective-tenant authority seam for API route handlers.
 *
 * Reconciles `getGroupIdFromAuth` (api-auth) and `resolveWebApprovalTenant`
 * (web-principal) into one path. Authority is always the authenticated
 * `AuthUser.groupId`; the request `selector` is an equality assertion only and
 * can never grant or widen tenant scope. A protected route NEVER falls back to
 * a hard-coded `allura-system` tenant.
 *
 * @param user       - Verified authenticated identity, or null if none.
 * @param selector   - Optional request-supplied group_id (query/body/header). Treated
 *                     as an equality assertion only.
 */
export function resolveApiTenant(user: AuthUser | null, selector: unknown): ApiTenantResult {
  if (!user) {
    return { status: "unauthenticated" };
  }

  if (isMalformedSelector(selector)) {
    return { status: "invalid_group_id", reason: "INVALID_GROUP_ID: request tenant selector is malformed or empty" };
  }

  const trustedGroupId = user.groupId;
  if (typeof selector === "string" && selector.trim() !== trustedGroupId) {
    return {
      status: "tenant_mismatch",
      reason: `TENANT_MISMATCH: authenticated tenant '${trustedGroupId}' does not match requested tenant '${selector.trim()}'`,
      requested: selector.trim(),
      effective: trustedGroupId,
    };
  }

  return { status: "ok", groupId: trustedGroupId, user };
}

/**
 * Adapts a middleware-verified Clerk/dev identity to the shared approval
 * principal contract. The tenant comes exclusively from AuthUser.groupId;
 * request bodies never participate in this authority decision.
 */
export function webPrincipalFromAuthUser(user: AuthUser, sessionId: string): PrincipalContext {
  return createPrincipalContext({
    principalId: user.id,
    tenantIds: [user.groupId],
    roles: [user.role],
    authMethod: "web_session",
    sessionId,
  });
}

/**
 * Treat a body group_id as an equality assertion only. Authority remains the
 * tenant already bound to the authenticated web identity.
 *
 * Delegates to the Story 24.12 `resolveApiTenant` seam (throws on mismatch for
 * backward-compatible callers). The seam is the single authority path.
 */
export function resolveWebApprovalTenant(user: AuthUser, requestedGroupId: unknown): string {
  const result = resolveApiTenant(user, requestedGroupId);
  if (result.status === "ok") {
    return result.groupId;
  }
  if (result.status === "tenant_mismatch") {
    throw new PrincipalAuthError("TENANT_MISMATCH", result.reason);
  }
  if (result.status === "invalid_group_id") {
    // Existing convention (principal-context.ts) maps a malformed group_id to
    // TENANT_MISMATCH; keep that throw code for backward-compatible callers.
    throw new PrincipalAuthError("TENANT_MISMATCH", result.reason);
  }
  // unauthenticated
  throw new PrincipalAuthError("AUTH_MISSING", "resolveWebApprovalTenant requires an authenticated principal");
}
