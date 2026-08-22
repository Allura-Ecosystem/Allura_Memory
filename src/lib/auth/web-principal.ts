import type { AuthUser } from "./types";
import { createPrincipalContext, PrincipalAuthError, type PrincipalContext } from "./principal-context";

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
 */
export function resolveWebApprovalTenant(user: AuthUser, requestedGroupId: unknown): string {
  const principal = webPrincipalFromAuthUser(user, `web-tenant-check:${user.id}`);
  const trustedGroupId = principal.tenantIds[0];
  if (typeof requestedGroupId === "string" && requestedGroupId.trim() && requestedGroupId.trim() !== trustedGroupId) {
    throw new PrincipalAuthError(
      "TENANT_MISMATCH",
      `TENANT_MISMATCH: authenticated tenant '${trustedGroupId}' does not match requested tenant '${requestedGroupId.trim()}'`,
    );
  }
  return trustedGroupId;
}
