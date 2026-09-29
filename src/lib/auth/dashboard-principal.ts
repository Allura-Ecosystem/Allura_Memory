import "server-only"

import { unstable_rethrow } from "next/navigation"

import { extractAlluraMetadata } from "./clerk"
import { isClerkEnabled } from "./config"
import { getDevUserSync } from "./dev-auth"
import { PrincipalProviderUnavailableError } from "./principal-errors"
import type { AuthUser, ClerkAlluraMetadata } from "./types"

export { PrincipalProviderUnavailableError } from "./principal-errors"

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
 * Provider-delegated session authority (Story 30.5): a fresh Clerk Backend API
 * lookup must confirm that the same session is still active for the same user.
 * JWT claims can be stale, so the claim alone cannot prove next-request
 * revocation, and the `sts` claim is optional on the JWT payload
 * (@clerk/shared jwtPayloadParser: `claims.sts ?? null`) — an absent claim
 * means "not asserted", not "not active", so it defers to the authoritative
 * lookup rather than denying a valid session. A `pending` session never
 * reaches here: Clerk's `treatPendingAsSignedOut` default converts it to a
 * signed-out object with no `userId`.
 *
 * A missing, revoked, expired or mismatched session returns `null` (no
 * principal). A provider that cannot be consulted at all raises
 * {@link PrincipalProviderUnavailableError} so callers classify the outage as
 * a degraded dependency instead of reporting it as an access denial.
 */
export async function getDashboardPrincipal(): Promise<AuthUser | null> {
  if (isClerkEnabled()) {
    let authResult: Awaited<ReturnType<typeof import("@clerk/nextjs/server").auth>>
    try {
      const { auth } = await import("@clerk/nextjs/server")
      authResult = await auth()
    } catch (error) {
      // Clerk's auth() reads headers(), so this catch also sees Next's
      // dynamic-rendering and control-flow signals, which Clerk deliberately
      // rethrows. Wrapping one would hide it from Next's predicates and turn
      // a bail-to-dynamic into a prerender failure, or worse, let a caller
      // render "degraded" into a statically cached page. Let them through
      // first; only a genuine provider failure becomes an outage.
      unstable_rethrow(error)
      // An outage is not a denial. Raise so the caller reports "degraded".
      throw new PrincipalProviderUnavailableError("Clerk session provider unavailable", { cause: error })
    }
    if (!authResult) return null
    const { userId, sessionId, sessionStatus } = authResult
    const claims = authResult.sessionClaims as { allura?: ClerkAlluraMetadata } | null | undefined

    if (!userId || !sessionId) return null
    // Only an explicitly asserted non-active claim denies here. An absent
    // claim defers to the authoritative Backend API lookup below.
    if (sessionStatus !== null && sessionStatus !== undefined && sessionStatus !== "active") return null

    let session: { id?: unknown; userId?: unknown; status?: unknown } | null
    try {
      const { clerkClient } = await import("@clerk/nextjs/server")
      session = await (await clerkClient()).sessions.getSession(sessionId)
    } catch (error) {
      unstable_rethrow(error)
      // Never substitute a stale JWT or DevAuth when Clerk cannot be consulted.
      throw new PrincipalProviderUnavailableError("Clerk session lookup unavailable", { cause: error })
    }
    // A malformed provider response is not authority. Shape-check before
    // comparing so it fails closed instead of raising an untyped TypeError.
    if (!session || typeof session !== "object") return null
    if (session.id !== sessionId || session.userId !== userId || session.status !== "active") return null

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
