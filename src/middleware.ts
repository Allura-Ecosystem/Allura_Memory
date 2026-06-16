import { NextRequest, NextResponse } from "next/server";

// Edge middleware — identity header contract (DESIGN-AUTH).
//
// 1. Anti-spoof: strip any client-supplied `x-allura-*` headers on every matched
//    request. Downstream code (getAuthUser) trusts these headers as
//    middleware-injected, so they must never originate from the caller.
// 2. Dev injection: when dev-auth is enabled, inject identity + workspace from env
//    so the dashboard has a group_id/workspace_id without Clerk. In production the
//    Clerk session injects these (wired separately); this slice does not alter that.
//
// The /mcp gateway authenticates via bearer token (Bumblebee) and derives
// group_id + workspace_id from the token, so it is excluded from this matcher.

const ALLURA_HEADERS = [
  "x-allura-user-id",
  "x-allura-role",
  "x-allura-group-id",
  "x-allura-workspace-id",
  "x-allura-email",
  "x-allura-name",
  "x-allura-image-url",
] as const;

function devAuthEnabled(): boolean {
  return process.env.ALLURA_DEV_AUTH_ENABLED !== "false";
}

export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);

  // (1) Anti-spoof — remove anything the client tried to send.
  for (const h of ALLURA_HEADERS) headers.delete(h);

  // (2) Dev injection (no Clerk). Production injection happens via Clerk session.
  if (devAuthEnabled() && !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    headers.set("x-allura-user-id", process.env.ALLURA_DEV_AUTH_USER_ID ?? "dev-user-allura");
    headers.set("x-allura-role", process.env.ALLURA_DEV_AUTH_ROLE ?? "admin");
    headers.set("x-allura-group-id", process.env.ALLURA_DEV_AUTH_GROUP_ID ?? "allura-system");
    headers.set("x-allura-workspace-id", process.env.ALLURA_DEV_AUTH_WORKSPACE_ID ?? "ws-dev");
    headers.set("x-allura-email", process.env.ALLURA_DEV_AUTH_EMAIL ?? "dev@allura.local");
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Apply to dashboard + API, but NOT the /mcp bearer-token gateway, Next internals,
  // or static assets.
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
