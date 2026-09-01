import "server-only"

import { extractAlluraMetadata } from "./clerk"
import { isClerkEnabled } from "./config"
import { getDevUserSync } from "./dev-auth"
import type { AuthUser, ClerkAlluraMetadata } from "./types"

/**
 * Server-owned dashboard principal derivation.
 *
 * Dashboard pages must never treat raw browser `x-allura-*` headers as
 * authority. Those headers are a middleware transport detail; a browser can
 * forge them, and a page that re-reads them from `headers()` would trust
 * caller-supplied role/tenant/workspace scope.
 *
 * This seam derives the principal from the two server-owned sources only:
 *   - Clerk's server-side session (`auth().sessionClaims.allura`), or
 *   - the DevAuthProvider (non-production, Clerk disabled).
 *
 * It never reads `x-allura-*` headers, so a forged header cannot create,
 * elevate, or scope a principal at the dashboard boundary.
 */
export async function getDashboardPrincipal(): Promise<AuthUser | null> {
  if (isClerkEnabled()) {
    const { auth } = await import("@clerk/nextjs/server")
    const { userId, sessionId, sessionClaims } = await auth()

    if (!userId || !sessionId) return null

    try {
      const claim = (sessionClaims as { allura?: ClerkAlluraMetadata } | null | undefined)?.allura
      const { role, groupId, workspaceId } = extractAlluraMetadata(claim)
      return {
        id: userId,
        email: "",
        role,
        groupId,
        workspaceId,
        sessionId,
      }
    } catch {
      // Fail closed: a malformed or missing Allura claim is not a principal.
      return null
    }
  }

  return getDevUserSync()
}
