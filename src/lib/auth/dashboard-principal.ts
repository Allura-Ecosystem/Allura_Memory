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
 *
 * Provider-delegated session authority (Story 30.5): a signed token must
 * report an active session AND a fresh Clerk Backend API lookup must confirm
 * that the same session remains active for the same user. JWT claims can be
 * stale, so the claim alone cannot prove next-request revocation. A missing,
 * revoked, expired, mismatched, or unavailable provider session fails closed.
 */
export async function getDashboardPrincipal(): Promise<AuthUser | null> {
  if (isClerkEnabled()) {
    let authResult: Awaited<ReturnType<typeof import("@clerk/nextjs/server").auth>> | null = null
    try {
      const { auth } = await import("@clerk/nextjs/server")
      authResult = await auth()
    } catch {
      // Fail closed: a Clerk outage is not an authenticated principal.
      return null
    }
    if (!authResult) return null
    const { userId, sessionId, sessionStatus } = authResult
    const claims = authResult.sessionClaims as { allura?: ClerkAlluraMetadata } | null | undefined

    if (!userId || !sessionId) return null
    if (sessionStatus !== "active") return null

    try {
      const { clerkClient } = await import("@clerk/nextjs/server")
      const session = await (await clerkClient()).sessions.getSession(sessionId)
      if (session.id !== sessionId || session.userId !== userId || session.status !== "active") return null
    } catch {
      // Never substitute a stale JWT or DevAuth when Clerk cannot confirm authority.
      return null
    }

    try {
      const claim = claims?.allura
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
