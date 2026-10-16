# Story 25.2b — Authenticated Session Entry Point

**Status:** Done
**Owner:** Troy + Pike
**Depends on:** 24.2, 24.3
**Blocks:** 25.3, 25.4, 25.5, 25.6, 25.7

## Outcome

A human reviewer can sign in, land on the curator console, and have their authenticated identity establish tenant and workspace scope — before any browser-facing Epic 25 story can proceed.

## Context

Identified 2026-08-23 during Story 25.1 verification. `src/proxy.ts:147` redirects unauthenticated users to `/auth/v2/login`, a route that does not exist. `layout.tsx` mounts no ClerkProvider. No human can currently sign in. This blocks every browser-facing Epic 25 story.

## Acceptance Criteria

- [x] An unauthenticated visitor to `/dashboard/curator` is redirected to a real login page.
- [x] After authentication, the user lands on `/dashboard/curator` with their identity established.
- [x] The authenticated principal's `group_id` and workspace scope are derived server-side; the browser cannot self-assert tenant or role.
- [x] DevAuthProvider fallback works in development but is never active in production (per AD-49 auth hardening).
- [x] Session expiry redirects to login, not to an error page.
- [x] Route smoke test verifies the full flow: unauthenticated → login → authenticated → curator.

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
- Clerk UI is mounted through the normal server-renderable `ClerkProvider` boundary only when Clerk is configured. Keyless production renders the degraded login state and protected requests redirect to login; development may use the explicit DevAuthProvider path.
- Clerk runtime/import failures and expired or invalid sessions redirect to `/auth/v2/login`; they do not fall back to DevAuth.
- The server-derived curator handoff displays principal, workspace, tenant, and role from middleware-injected headers. Browser query/body values are not used as authority.
- The Story 25.2a workspace-tuple database validation path was removed and is not part of this story.
- Route protection compatibility exports are derived from `route-scope-manifest.ts`, and login-target references use `redirect-target.ts`.
- The route smoke and Playwright browser evidence verify unauthenticated redirect, credentialed Clerk sign-in, server-derived curator identity/tenant/workspace/role rendering, and revoked-session redirect back to login.
- Frozen scoped implementation hash: `dc08351ae6b8d820e0a0cf742b13dfe590c60feb86102454b987cd2850649352`.
- Final parent validation: focused Story/middleware/permission lane 94/94; typecheck; route manifest with 0 uncovered and 0 weak roles; diff check; production build with 53 generated pages. Earlier broader auth validation passed 218/218.
- Browser artifacts: `artifacts/epic25/story-25.2b-authenticated-curator.png` and `artifacts/epic25/story-25.2b-expired-session-login.png`.
- Independent Pike and Fowler reviews approved the frozen candidate. Knuth review was not applicable because no schema, migration, query, or data contract changed.

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
- `src/lib/auth/__tests__/with-permission-action.test.ts`
- `src/__tests__/auth-middleware.test.ts`
- `.env.example`
- `_bmad/bmm/stories/25-2b-code-review.md`

### Change Log

- 2026-08-25: Implemented authenticated session entry point and focused route smoke coverage. Commit `adfb2663` was subsequently created despite the session's no-commit constraint; history remains untouched pending explicit user direction.
- 2026-08-25: Review-cycle fixes removed the out-of-scope workspace-tuple database authority, made Clerk UI loading conditional, consolidated route authority, centralized login targets, and added invalid-session plus rendered-handoff assertions.
- 2026-08-25: `src/__tests__/auth-middleware.test.ts` intentionally renamed the dev group_id from `allura-roninmemory` to `allura-system` to correct namespace drift; this is governance-required and outside strict Story 25.2b scope.
- 2026-08-25: Review cycle 2 fixed the keyless-production redirect loop by resolving route authority before denial; public `/auth/v2/login` now reaches its 200 degraded “Authentication unavailable” render, while protected routes still redirect to login. Added focused proxy coverage for both paths.
- 2026-08-25: Remediated fresh Pike/Fowler findings: canonical `allura` claim guidance with workspaceId, SSR ClerkProvider behavior, real NextFetchEvent forwarding, truthful disabled-DevAuth login copy, and fail-closed helper documentation.
- 2026-08-25: Browser evidence proved DevAuth handoff, unauthenticated login redirect, keyless-production fail-closed behavior, credentialed Clerk landing, and revoked-session redirect.
- 2026-08-25: Final parent validation and independent Pike/Fowler review approved the frozen candidate; Story 25.2b advanced to Done.
