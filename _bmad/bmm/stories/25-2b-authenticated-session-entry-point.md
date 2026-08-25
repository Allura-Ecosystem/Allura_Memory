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

## Tasks / Subtasks

- [x] Add failing tests for strict Clerk authority, route entry, production DevAuth guard, redirect safety, and the proxy smoke flow.
- [x] Add a real Clerk login route and compatibility sign-in/unauthorized surfaces.
- [x] Mount ClerkProvider only when Clerk is configured and fail closed in production when it is not.
- [x] Derive curator identity, group_id, and workspace scope from server-verified auth headers.
- [x] Remove Clerk runtime/import failure fallback to DevAuth and preserve login redirects for expired sessions.
- [x] Run focused auth tests, existing middleware tests, typecheck, and diff validation.

## Dev Agent Record

### Implementation Plan

1. Keep `/auth/v2/login` as the canonical login target and make it a real Clerk `SignIn` route with safe same-origin redirect handling.
2. Add an exact curator route-scope declaration before the broad dashboard declaration.
3. Make Clerk authority metadata fail closed for missing role, `group_id`, or workspace scope; forward only middleware-derived identity headers.
4. Render the curator handoff page from server-side auth context and add a proxy smoke test for unauthenticated and development-authenticated requests.

### Completion Notes

- Clerk authority requires a valid Allura role, `group_id`, and workspace scope from verified Clerk metadata; malformed metadata fails closed instead of defaulting to a tenant or role.
- Clerk UI modules are loaded dynamically only when Clerk is configured. Keyless production renders the degraded login state and protected requests redirect to login; development may use the explicit DevAuthProvider path.
- Clerk runtime/import failures and expired or invalid sessions redirect to `/auth/v2/login`; they do not fall back to DevAuth.
- The server-derived curator handoff displays principal, workspace, tenant, and role from middleware-injected headers. Browser query/body values are not used as authority.
- The Story 25.2a workspace-tuple database validation path was removed and is not part of this story.
- Route protection compatibility exports are derived from `route-scope-manifest.ts`, and login-target references use `redirect-target.ts`.
- The smoke test verifies unauthenticated redirect, degraded login rendering, dev-auth middleware forwarding, and curator identity/tenant/workspace rendering. Interactive Clerk sign-in remains unverified without Clerk credentials.

### File List

- `src/app/layout.tsx`
- `src/app/clerk-provider.tsx`
- `src/app/clerk-sign-in.tsx`
- `src/app/auth/v2/login/[[...sign-in]]/page.tsx`
- `src/app/dashboard/curator/page.tsx`
- `src/app/unauthorized/page.tsx`
- `src/proxy.ts`
- `src/lib/auth/api-auth.ts`
- `src/lib/auth/clerk.ts`
- `src/lib/auth/config.ts`
- `src/lib/auth/index.ts`
- `src/lib/auth/dev-auth.ts`
- `src/lib/auth/redirect-target.ts`
- `src/lib/auth/route-scope-manifest.ts`
- `src/lib/auth/types.ts`
- `src/lib/auth/__tests__/story-25-2b-auth-entry.test.ts`
- `src/__tests__/auth-middleware.test.ts`

### Change Log

- 2026-08-25: Implemented authenticated session entry point and focused route smoke coverage; no commit created.
- 2026-08-25: Review-cycle fixes removed the out-of-scope workspace-tuple database authority, made Clerk UI loading conditional, consolidated route authority, centralized login targets, and added invalid-session plus rendered-handoff assertions.
- 2026-08-25: `src/__tests__/auth-middleware.test.ts` intentionally renamed the dev group_id from `allura-roninmemory` to `allura-system` to correct namespace drift; this is governance-required and outside strict Story 25.2b scope.
- 2026-08-25: Review cycle 2 fixed the keyless-production redirect loop by resolving route authority before denial; public `/auth/v2/login` now reaches its 200 degraded “Authentication unavailable” render, while protected routes still redirect to login. Added focused proxy coverage for both paths.
