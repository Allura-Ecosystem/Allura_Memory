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
 *  - Production: Clerk middleware (SSO + RBAC) — dynamically loaded
 *  - Development: DevAuthProvider fallback (no Clerk needed)
 *
 * CRITICAL: Clerk is imported dynamically to avoid import-time crashes
 * when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. The @clerk/nextjs
 * package throws at import time if publishableKey is missing, making
 * the isClerkEnabled() check useless if Clerk is imported at the top level.
 *
 * Route authority lives in src/lib/auth/route-scope-manifest.ts (single source).
 * Role helpers live in src/lib/auth/roles.ts.
 */

import { NextRequest, NextResponse } from "next/server"

import { isClerkEnabled } from "@/lib/auth/config"
import { getDevUserSync } from "@/lib/auth/dev-auth"
import { resolveRouteAuthority } from "@/lib/auth/route-scope-manifest"
import { hasPermission } from "@/lib/auth/roles"
import type { AlluraRole } from "@/lib/auth/types"
import { emitGatedAudit } from "@/lib/auth/edge-audit"

const AUTH_HEADER_NAMES = [
  "x-allura-user-id",
  "x-allura-role",
  "x-allura-group-id",
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
  const loginUrl = new URL("/auth/v2/login", request.url)
  loginUrl.searchParams.set("redirect_url", pathname)
  return NextResponse.redirect(loginUrl)
}

// ── Dev Auth Handler ──────────────────────────────────────────────────────────

type AuthForwardHeaders = {
  userId: string
  role: AlluraRole
  groupId: string
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
    const loginUrl = new URL("/auth/v2/login", request.url)
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
    email: devUser.email,
    name: devUser.name,
    imageUrl: devUser.imageUrl,
  })
}

// ── Production Clerk Handler ─────────────────────────────────────────────────

let _clerkHandler: ((request: NextRequest) => Promise<NextResponse>) | null = null

async function handleClerkAuth(request: NextRequest): Promise<NextResponse> {
  // Dynamic import — only loads Clerk when needed.
  // This avoids the import-time crash when publishableKey is missing.
  if (!_clerkHandler) {
    try {
      const { clerkMiddleware } = await import("@clerk/nextjs/server")
      const { extractAlluraMetadata } = await import("@/lib/auth/clerk")
      type ClerkPublicMetadata = import("@/lib/auth/types").ClerkPublicMetadata

      // Story 24.11a AC-2: the hardcoded ROLE_GATES table that used to live here
      // is deleted. It covered 13 matchers across 8 route families while the
      // manifest declared 46 entries, and every path it did not match fell
      // through to nextWithoutAuthHeaders — served fully unauthenticated in
      // production. Authority now comes from resolveRouteAuthority() only, the
      // same call the dev-auth branch makes.

      const clerkInstance = clerkMiddleware(async (auth, req) => {
        const { pathname } = req.nextUrl

        // Static assets and Next.js internals — files, not routes.
        if (isStaticAsset(pathname)) {
          return nextWithoutAuthHeaders(req)
        }

        // Single source of route authority — same call as the dev-auth branch.
        const authority = resolveRouteAuthority(pathname)

        // Explicitly declared public route — pass through, headers stripped.
        if (authority.kind === "public") {
          return nextWithoutAuthHeaders(req)
        }

        // Declared or undeclared: either way a principal is required. There is
        // no fall-through that serves an unmatched path unauthenticated.
        const requiredRole: AlluraRole = authority.requiredRole
        const clerkScopeName: string = authority.scopeName

        // Require auth
        const { userId, sessionClaims } = await auth()

        if (!userId) {
          emitGatedAudit(req, clerkScopeName, "unauthorized", "unauthenticated", "none")
          if (pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Authentication required", statusCode: 401 }, { status: 401 })
          }
          const loginUrl = new URL("/auth/v2/login", req.url)
          loginUrl.searchParams.set("redirect_url", pathname)
          return NextResponse.redirect(loginUrl)
        }

        // RBAC check
        const { role, groupId } = extractAlluraMetadata(
          sessionClaims?.publicMetadata as ClerkPublicMetadata | undefined
        )

        if (!hasPermission(role, requiredRole)) {
          emitGatedAudit(req, clerkScopeName, "forbidden", "authenticated", role)
          if (pathname.startsWith("/api/")) {
            return NextResponse.json(
              {
                error: "Insufficient permissions",
                statusCode: 403,
                required: requiredRole,
                actual: role,
              },
              { status: 403 }
            )
          }
          const url = new URL("/unauthorized", req.url)
          url.searchParams.set("required", requiredRole)
          url.searchParams.set("actual", role)
          return NextResponse.redirect(url)
        }

        // Authenticated and authorized — forward auth context to route handlers.
        emitGatedAudit(req, clerkScopeName, "authorized", "authenticated", role)
        return nextWithAuthHeaders(req, {
          userId,
          role,
          groupId,
        })
      })

      // Wrap clerkInstance to match our handler signature.
      // clerkMiddleware returns a Next.js middleware function;
      // we call it with (request, evt) to get a Response.
      _clerkHandler = async (req: NextRequest) => {
        try {
          // clerkMiddleware returns a function that Next.js calls with (req, evt).
          // In dynamic context, we call it directly.
          const result = await (clerkInstance as any)(req, {} as any)
          // If result is a Response, wrap it; if it's already a NextResponse, return it
          if (result instanceof NextResponse) {
            return result
          }
          if (result instanceof Response) {
            return new NextResponse(result.body, {
              status: result.status,
              statusText: result.statusText,
              headers: result.headers,
            })
          }
          // Unexpected return shape from Clerk. Fail closed (Story 24.11a):
          // an unrecognised result is not evidence of a verified principal.
          console.error("[proxy] Clerk handler returned an unexpected result shape; denying")
          return denyUnverified(req)
        } catch (err) {
          console.error("[proxy] Clerk handler error, falling back to dev auth:", err)
          return handleDevAuth(req)
        }
      }
    } catch (err) {
      console.warn("[proxy] Clerk dynamic import failed, using DevAuthProvider:", err)
      // Wrap sync handleDevAuth in async signature to match handler type
      _clerkHandler = async (req: NextRequest) => handleDevAuth(req)
    }
  }
  return _clerkHandler!(request)
}

// ── Proxy Export ─────────────────────────────────────────────────────────────

/**
 * Next.js 16 Proxy — conditionally routes to Clerk or DevAuthProvider.
 *
 * Clerk is loaded dynamically to avoid import-time crashes when
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not configured.
 */
export default async function proxy(request: NextRequest, _event?: unknown): Promise<NextResponse> {
  if (!isClerkEnabled()) {
    return handleDevAuth(request)
  }
  return handleClerkAuth(request)
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
