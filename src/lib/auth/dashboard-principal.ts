import "server-only"

import { headers } from "next/headers"

import { cloudflareAccessUser, isCloudflareAccessEnabled } from "./cloudflare-access"
import { isDevAuthActive } from "./config"
import { getDevUserSync } from "./dev-auth"
import type { AuthUser } from "./types"

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
 *   - Cloudflare Access identity headers (production, when enabled), or
 *   - the DevAuthProvider (non-production, explicitly enabled).
 *
 * It never reads `x-allura-*` headers, so a forged header cannot create,
 * elevate, or scope a principal at the dashboard boundary.
 *
 * Production with Cloudflare Access disabled has no provider capable of
 * establishing a principal, so this returns `null` (fail closed) — never a
 * DevAuth fallback.
 */
export async function getDashboardPrincipal(): Promise<AuthUser | null> {
  if (isCloudflareAccessEnabled()) {
    return cloudflareAccessUser(await headers())
  }

  // Production without Cloudflare Access has no provider that can establish a
  // principal. Fail closed — never fall back to DevAuth there, even if a stale
  // ALLURA_DEV_AUTH_ENABLED flag is set.
  if (process.env.NODE_ENV === "production" || !isDevAuthActive()) {
    return null
  }

  return getDevUserSync()
}