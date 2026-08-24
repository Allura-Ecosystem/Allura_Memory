# Story 25.2b — Authenticated Session Entry Point

**Status:** Ready-for-dev
**Owner:** Troy + Pike
**Depends on:** 24.2, 24.3
**Blocks:** 25.3, 25.4, 25.5, 25.6, 25.7

## Outcome

A human reviewer can sign in, land on the curator console, and have their authenticated identity establish tenant and workspace scope — before any browser-facing Epic 25 story can proceed.

## Context

Identified 2026-08-23 during Story 25.1 verification. `src/proxy.ts:147` redirects unauthenticated users to `/auth/v2/login`, a route that does not exist. `layout.tsx` mounts no ClerkProvider. No human can currently sign in. This blocks every browser-facing Epic 25 story.

## Acceptance Criteria

- [ ] An unauthenticated visitor to `/dashboard/curator` is redirected to a real login page.
- [ ] After authentication, the user lands on `/dashboard/curator` with their identity established.
- [ ] The authenticated principal's `group_id` and workspace scope are derived server-side; the browser cannot self-assert tenant or role.
- [ ] DevAuthProvider fallback works in development but is never active in production (per AD-49 auth hardening).
- [ ] Session expiry redirects to login, not to an error page.
- [ ] Route smoke test verifies the full flow: unauthenticated → login → authenticated → curator.

## Evidence

- Route smoke test for the full authentication flow.
- Production vs dev auth mode verification.
- ClerkProvider mount verification in `layout.tsx`.

## Rollback

Disable the `/dashboard/curator` route. The governed MCP/API/CLI path remains canonical and does not depend on browser authentication.