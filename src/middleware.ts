/**
 * Allura Memory Middleware
 *
 * Combines two responsibilities:
 * 1. Auth header injection — reads Clerk or dev-auth identity and injects
 *    x-allura-* headers so API route handlers receive a trusted auth context
 *    without touching Clerk internals themselves.
 * 2. Trace emission — fires a background trace event to /api/trace for
 *    authenticated requests (fire-and-forget, never blocks the response).
 *
 * Design decisions:
 * - Runs in Edge Runtime (no pg Pool, no Node-only APIs)
 * - Auth headers are injected only when an authenticated identity is resolved
 * - Unauthenticated requests pass through without modification
 * - Health / live / ready endpoints are always skipped
 * - Static asset paths are always skipped
 * - x-internal-trace header prevents trace loops
 */

import { NextRequest, NextResponse } from "next/server";

// ── Path Matching ─────────────────────────────────────────────────────────────

/** Paths that bypass auth injection and tracing entirely. */
const SKIP_PATHS = [
  "/api/health",
  "/api/live",
  "/api/ready",
  "/api/trace",         // prevents trace loop
  "/_next",
  "/favicon.ico",
  "/healthz",
  "/ping",
];

function shouldSkip(pathname: string): boolean {
  return SKIP_PATHS.some(
    (skip) => pathname === skip || pathname.startsWith(skip + "/"),
  );
}

// ── Auth Resolution (Edge-safe) ───────────────────────────────────────────────

/**
 * Attempt to resolve an Allura auth identity from the incoming request.
 *
 * Resolution order:
 * 1. Clerk auth headers — when Clerk middleware has already run upstream
 *    (Clerk injects __clerk_db_jwt and related cookies/headers; the
 *    canonical approach is to use @clerk/nextjs/server clerkMiddleware, but
 *    that requires installing @clerk/nextjs. Without the package we detect
 *    the Clerk session token from the cookie and forward what we can.)
 * 2. Dev auth headers — ALLURA_DEV_AUTH_* env vars injected at build time
 *    as edge-compatible constants.
 * 3. No identity — pass through without injecting headers.
 *
 * Edge runtime constraint: we cannot import server-only modules or call
 * getAuthConfig() (which uses pg Pool). We read env vars directly here.
 */

interface EdgeAuthContext {
  userId: string;
  role: string;
  groupId: string;
  email: string;
  name?: string;
}

function resolveEdgeAuth(request: NextRequest): EdgeAuthContext | null {
  // 1. If auth headers are already present (e.g., from a parent middleware or
  //    an authenticated server-to-server call), trust them as-is and skip
  //    re-injection. This avoids double-injection in test scenarios.
  const existingUserId = request.headers.get("x-allura-user-id");
  if (existingUserId) {
    return null; // already injected — pass through
  }

  // 2. Clerk: check for the Clerk session cookie. In a real Clerk setup the
  //    actual user payload comes from clerkMiddleware(). Here we detect
  //    whether Clerk is configured and skip to dev-auth if not.
  const clerkEnabled =
    typeof process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY === "string" &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length > 0 &&
    typeof process.env.CLERK_SECRET_KEY === "string" &&
    process.env.CLERK_SECRET_KEY.length > 0;

  if (clerkEnabled) {
    // Clerk is configured. The full Clerk session verification requires the
    // @clerk/nextjs SDK (which calls the Clerk API). When @clerk/nextjs is
    // installed, replace this block with:
    //
    //   import { clerkMiddleware, getAuth } from "@clerk/nextjs/server";
    //   const { userId, sessionClaims } = getAuth(request);
    //
    // Until then, we emit no headers for Clerk-authenticated requests and let
    // the route handler use @clerk/nextjs/server directly. The dev-auth path
    // below is the active code path for local development.
    return null;
  }

  // 3. Dev auth — reads env vars directly (edge-safe).
  const devAuthEnabled = process.env.ALLURA_DEV_AUTH_ENABLED !== "false";
  const isProduction = process.env.NODE_ENV === "production";

  if (devAuthEnabled && !isProduction) {
    return {
      userId: process.env.ALLURA_DEV_AUTH_USER_ID ?? "dev-user-allura",
      role: process.env.ALLURA_DEV_AUTH_ROLE ?? "admin",
      groupId: process.env.ALLURA_DEV_AUTH_GROUP_ID ?? "allura-system",
      email: process.env.ALLURA_DEV_AUTH_EMAIL ?? "dev@allura.local",
      name: "Dev User",
    };
  }

  return null;
}

// ── Trace Emission ────────────────────────────────────────────────────────────

/**
 * Fire-and-forget trace event.
 *
 * Sends a background POST to /api/trace.
 * Never awaited — adds zero latency to the response path.
 * Silently swallows all errors so trace failures never break requests.
 */
function emitTrace(
  request: NextRequest,
  groupId: string,
  startTime: number,
): void {
  const { pathname } = request.nextUrl;

  try {
    const traceUrl = new URL("/api/trace", request.url);

    fetch(traceUrl.toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-trace": "allura-auth-middleware",
      },
      body: JSON.stringify({
        group_id: groupId,
        event_type: "request_trace",
        agent_id: "auth-middleware",
        metadata: {
          method: request.method,
          path: pathname,
          duration_ms: Math.round(performance.now() - startTime),
        },
        status: "completed",
      }),
    }).catch(() => {
      // Silently swallow — trace failures must never surface to the caller
    });
  } catch {
    // Swallow synchronous errors too
  }
}

// ── Middleware Entry Point ────────────────────────────────────────────────────

/** Headers that only the middleware may set. Strip from inbound requests. */
const TRUSTED_HEADERS = [
  "x-allura-user-id",
  "x-allura-role",
  "x-allura-group-id",
  "x-allura-email",
  "x-allura-name",
  "x-internal-trace",
];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const startTime = performance.now();

  // Always skip static assets, health endpoints, and trace endpoint.
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  // Skip internal trace requests BEFORE stripping headers.
  // Only trust this header when it matches our exact middleware token.
  // External callers sending arbitrary values are rejected (header is stripped below).
  const internalTrace = request.headers.get("x-internal-trace");
  if (internalTrace === "allura-auth-middleware") {
    return NextResponse.next();
  }

  // SECURITY: Strip all trusted auth headers from inbound requests.
  // Without this, an external caller could set x-allura-user-id and
  // x-allura-role to impersonate any user/role/tenant.
  const cleanHeaders = new Headers(request.headers);
  for (const h of TRUSTED_HEADERS) {
    cleanHeaders.delete(h);
  }

  // resolveEdgeAuth reads env vars and cookies, not injected headers.
  // Pass original request — cleanHeaders are used only for downstream injection.
  const authContext = resolveEdgeAuth(request);

  if (!authContext) {
    // No identity resolved — pass through with cleaned headers.
    return NextResponse.next({ request: { headers: cleanHeaders } });
  }

  // Inject auth context into the already-cleaned headers for downstream route handlers.
  const requestHeaders = new Headers(cleanHeaders);
  requestHeaders.set("x-allura-user-id", authContext.userId);
  requestHeaders.set("x-allura-role", authContext.role);
  requestHeaders.set("x-allura-group-id", authContext.groupId);
  requestHeaders.set("x-allura-email", authContext.email);
  if (authContext.name) {
    requestHeaders.set("x-allura-name", authContext.name);
  }

  // Emit trace in the background (non-blocking).
  emitTrace(request, authContext.groupId, startTime);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

// ── Matcher Configuration ─────────────────────────────────────────────────────

export const config = {
  matcher: [
    /**
     * Apply middleware to:
     * - /api/* routes (all API handlers)
     * - /dashboard/* routes (dashboard UI)
     *
     * Exclude:
     * - _next/static — build artifacts
     * - _next/image  — image optimization
     * - favicon.ico
     *
     * Health endpoints (/api/health, /api/live, /api/ready) are matched by
     * the pattern but skipped via shouldSkip() above, keeping the exclusion
     * logic in one place rather than split between matcher and runtime code.
     */
    "/api/:path*",
    "/dashboard",
    "/dashboard/:path*",
  ],
};
