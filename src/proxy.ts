/**
 * Allura Memory — Proxy Middleware (Next.js 16)
 *
 * Runs before every request. Responsibilities:
 *  1. Allow explicitly-declared public routes through without auth
 *  2. Require authentication on every other route
 *  3. Enforce RBAC — return 401/403 or redirect as appropriate
 *  4. Inject x-allura-* headers for downstream use
 *
 * FAIL CLOSED (Story 24.11a). Both branches resolve authority through the one
 * manifest in src/lib/auth/route-scope-manifest.ts. A pathname that matches
 * neither manifest is denied, not passed through. There is no branch that
 * serves an unmatched path without a principal.
 *
 * Auth strategy:
 *  - Route handlers with their own token gates bypass first
 *  - Production: Cloudflare Access identity headers (when enabled);
 *    otherwise fail closed with no principal
 *  - Development: DevAuthProvider fallback (explicitly enabled, never in
 *    production)
 *
 * Route authority lives in src/lib/auth/route-scope-manifest.ts (single source).
 * Role helpers live in src/lib/auth/roles.ts.
 */

import { NextRequest, NextResponse } from "next/server"

import { cloudflareAccessUser, isCloudflareAccessEnabled } from "@/lib/auth/cloudflare-access"
import { getDevUserSync } from "@/lib/auth/dev-auth"
import { emitGatedAudit } from "@/lib/auth/edge-audit"
import { AUTH_LOGIN_PATH } from "@/lib/auth/redirect-target"
import { hasPermission } from "@/lib/auth/roles"
import { resolveRouteAuthority } from "@/lib/auth/route-scope-manifest"
import type { AlluraRole } from "@/lib/auth/types"

const AUTH_HEADER_NAMES = [
  "x-allura-user-id",
  "x-allura-role",
  "x-allura-group-id",
  "x-allura-workspace-id",
  "x-allura-session-id",
  "x-allura-email",
  "x-allura-name",
  "x-allura-image-url",
] as const

// ── Route Classification ─────────────────────────────────────────────────────

/**
 * Static assets and Next.js internals, which are files rather than routes.
 *
 * Anything under /api/ is a route handler and is never treated as an asset, no
 * matter what its path looks like. Without that guard a path containing a dot
 * (e.g. /api/memory/report.json) would skip the gate entirely via the
 * `pathname.includes(".")` test below.
 */
function isStaticAsset(pathname: string): boolean {
  if (pathname.startsWith("/api/")) return false
  return (
    pathname.startsWith("/_next/") || pathname.startsWith("/favicon") || pathname.includes(".")
  )
}

/**
 * Terminal denial for a request whose principal could not be verified.
 *
 * Used where the gate cannot reach a decision (e.g. the auth provider returned
 * an unrecognised result). Fail closed: deny rather than forward.
 */
function denyUnverified(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required", statusCode: 401 }, { status: 401 })
  }
  const loginUrl = new URL(AUTH_LOGIN_PATH, request.url)
  loginUrl.searchParams.set("redirect_url", pathname)
  return NextResponse.redirect(loginUrl)
}

function denyInvalidAuthority(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Invalid authenticated authority", statusCode: 403 },
      { status: 403 },
    )
  }
  return NextResponse.redirect(new URL("/unauthorized", request.url))
}

/**
 * Keyless production has no provider capable of establishing a principal.
 * Public routes must still reach their own degraded/fail-closed surfaces;
 * otherwise the login target redirects to itself forever. Protected routes
 * remain denied and continue to use the normal login redirect.
 */
function handleKeylessProduction(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  if (isStaticAsset(pathname)) {
    return nextWithoutAuthHeaders(request)
  }

  const authority = resolveRouteAuthority(pathname)
  if (authority.kind === "public") {
    return nextWithoutAuthHeaders(request)
  }

  return denyUnverified(request)
}

// ── Dev Auth Handler ──────────────────────────────────────────────────────────

type AuthForwardHeaders = {
  userId: string
  role: AlluraRole
  groupId: string
  workspaceId?: string
  sessionId?: string
  email?: string
  name?: string
  imageUrl?: string
}

export function nextWithAuthHeaders(request: NextRequest, auth: AuthForwardHeaders): NextResponse {
  const requestHeaders = new Headers(request.headers)
  for (const header of AUTH_HEADER_NAMES) {
    requestHeaders.delete(header)
  }
  requestHeaders.set("x-allura-user-id", auth.userId)
  requestHeaders.set("x-allura-role", auth.role)
  requestHeaders.set("x-allura-group-id", auth.groupId)
  if (auth.workspaceId) requestHeaders.set("x-allura-workspace-id", auth.workspaceId)
  if (auth.sessionId) requestHeaders.set("x-allura-session-id", auth.sessionId)
  if (auth.email) requestHeaders.set("x-allura-email", auth.email)
  if (auth.name) requestHeaders.set("x-allura-name", auth.name)
  if (auth.imageUrl) requestHeaders.set("x-allura-image-url", auth.imageUrl)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export function nextWithoutAuthHeaders(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers)
  for (const header of AUTH_HEADER_NAMES) {
    requestHeaders.delete(header)
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

function handleDevAuth(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl

  // Static assets and Next.js internals — files, not routes.
  if (isStaticAsset(pathname)) {
    return nextWithoutAuthHeaders(request)
  }

  // Single source of route authority — same call as the production branch.
  const authority = resolveRouteAuthority(pathname)

  // Explicitly declared public route — pass through with auth headers stripped.
  if (authority.kind === "public") {
    return nextWithoutAuthHeaders(request)
  }

  // Declared or undeclared: either way a principal is required. An undeclared
  // path is denied (UNDECLARED_ROUTE_ROLE), never passed through.
  const requiredRole: AlluraRole = authority.requiredRole
  const scopeName: string = authority.scopeName

  const devUser = getDevUserSync()

  // No dev user and route is protected — 401
  if (!devUser) {
    emitGatedAudit(request, scopeName, "unauthorized", "unauthenticated", "none")
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required", statusCode: 401 }, { status: 401 })
    }
    const loginUrl = new URL(AUTH_LOGIN_PATH, request.url)
    loginUrl.searchParams.set("redirect_url", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // RBAC check
  if (!hasPermission(devUser.role, requiredRole)) {
    emitGatedAudit(request, scopeName, "forbidden", "authenticated", devUser.role)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "Insufficient permissions",
          statusCode: 403,
          required: requiredRole,
          actual: devUser.role,
        },
        { status: 403 }
      )
    }
    const url = new URL("/unauthorized", request.url)
    url.searchParams.set("required", requiredRole)
    url.searchParams.set("actual", devUser.role)
    return NextResponse.redirect(url)
  }

  // Authenticated and authorized — forward auth context to route handlers.
  emitGatedAudit(request, scopeName, "authorized", "authenticated", devUser.role)
  return nextWithAuthHeaders(request, {
    userId: devUser.id,
    role: devUser.role,
    groupId: devUser.groupId,
    workspaceId: devUser.workspaceId,
    sessionId: devUser.sessionId,
    email: devUser.email,
    name: devUser.name,
    imageUrl: devUser.imageUrl,
  })
}

function handleCloudflareAccess(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  if (isStaticAsset(pathname)) return nextWithoutAuthHeaders(request)
  const authority = resolveRouteAuthority(pathname)
  if (authority.kind === "public") return nextWithoutAuthHeaders(request)
  const user = cloudflareAccessUser(request.headers)
  if (!user) return denyUnverified(request)
  if (!hasPermission(user.role, authority.requiredRole)) return denyInvalidAuthority(request)
  return nextWithAuthHeaders(request, {
    userId: user.id,
    role: user.role,
    groupId: user.groupId,
    workspaceId: user.workspaceId,
    sessionId: user.sessionId,
    email: user.email,
    name: user.name,
  })
}

// ── Proxy Export ─────────────────────────────────────────────────────────────

/**
 * Next.js 16 Proxy — routes to Cloudflare Access (production), the keyless
 * fail-closed gate (production without CF Access), or DevAuthProvider
 * (non-production, explicitly enabled).
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const routeAuthority = resolveRouteAuthority(request.nextUrl.pathname)
  if (
    routeAuthority.kind === "declared" &&
    routeAuthority.authStrategy === "route_handler" &&
    routeAuthority.methods?.includes(request.method)
  ) {
    return nextWithoutAuthHeaders(request)
  }
  if (isCloudflareAccessEnabled()) {
    return handleCloudflareAccess(request)
  }
  if (process.env.NODE_ENV === "production") {
    return handleKeylessProduction(request)
  }
  return handleDevAuth(request)
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}