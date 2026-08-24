# Story 24.11a — Fail-Closed Web Authority and Manifest as Single Source

> [!NOTE]
> **AI-Assisted Documentation** — scaffolded 2026-08-23 from enumerated recon findings
> (`scratchpad/scout-24-11-findings.md`). Not yet reviewed by Pike or Fowler.

**Status:** ready-for-dev
**Priority:** P0-Critical
**Owner:** Troy + Brooks
**Depends on:** 24.2 (done); 24.3 (done)
**Blocks:** 24.11b, 25.3, and every browser-facing Epic 25 story
**Split from:** Story 24.11, divided 2026-08-23 because the combined scope produced a diff
too large for an independent reviewer to audit carefully — the exact failure mode CA-24-12
exists to prevent.

## Outcome

The production HTTP gate fails **closed**. One manifest is the single source of route
authority. An unmatched path is denied, not served.

## The defect this closes

`src/proxy.ts:248-250` passes any path unmatched by the hardcoded `ROLE_GATES` table
(`src/proxy.ts:199-223`) to `nextWithoutAuthHeaders` — **served fully unauthenticated in
production**. `ROLE_GATES` covers 13 matchers across 8 route families; the manifest declares
46 entries. **20+ manifest-protected route families are open right now**, including
`tokens`, `members`, `workspaces`, `agents`, `projects`, `teams`, `settings`, `dreams`,
`scheduled-tasks`, and `dashboard`.

This is the literal violation of Epic 24's unchecked cross-epic criterion: *"Production
HTTP requests without a verified principal fail closed."*

## Rollout decision (recorded 2026-08-23)

**Fail closed immediately**, rather than log-only-then-enforce. Rationale: the blast radius
is smallest now because nothing is live — there is no working sign-in (Story 25.2b) and no
dashboard (Story 25.4). The consumers of the currently-open routes are internal scripts,
the watchdog, and local development, not users. Fixing it before Story 25.4 puts a console
on top of it is strictly cheaper than fixing it after.

## Acceptance Criteria

- [x] An unmatched request path is **denied**, not passed through. A test asserts that a
      request to a route absent from every gate returns 401/403 and renders no tenant data.
      The `nextWithoutAuthHeaders` fall-through at `src/proxy.ts:248-250` is removed or
      inverted.
- [x] The production Clerk branch consumes `src/lib/auth/route-scope-manifest.ts`. The
      hardcoded `ROLE_GATES` table at `src/proxy.ts:199-223` is **deleted**. One manifest is
      the single source of route authority for both the dev-auth and production branches.
- [x] A rollout note enumerates every route family that becomes newly enforced, states the
      expected breakage, and defines the rollback. Merging without it is not permitted.
- [x] `/api/brain/memories` and `/api/brain/search` require an authenticated principal.
      `/api/brain/health` may remain public only if explicitly listed in the manifest with a
      recorded rationale, consistent with the other `/api/health/*` liveness routes.
- [x] `scripts/validate-route-scope-manifest.ts`'s `SCAN_DIRS = [src/app, src/app/api]`
      double-scan bug is fixed so output is not inflated 2x, and a
      `validate:route-scope-manifest` entry is added to `package.json`.
- [x] That validator runs as a **required** CI check and fails the build when a route
      handler is missing from the manifest or declares a role weaker than it enforces. The
      route count is emitted as a commit-bound artifact.
- [x] `withPermission` (`src/lib/auth/api-auth.ts:234-257`) either checks its
      `PermissionAction` argument or the argument is removed. No parameter is accepted and
      silently discarded at line 241.
- [x] **CA-24-02 status guard.** An automated check fails when a story is marked `done` in
      `sprint-status.yaml` while its acceptance criteria remain unchecked or its Dev Agent
      Record is incomplete.

## Evidence Command

```bash
bun run typecheck && bun run test:unit && bun run validate:route-scope-manifest
```

## Out of scope — belongs to 24.11b

The 36 per-route `group_id` reconciliations and handler-level authorization on
`src/app/api/memory/[id]/route.ts`. Once this story lands, those routes are gated at the
proxy; 24.11b adds defense in depth behind that gate.

## Hard boundary

Do **not** touch Story 24.4's uncommitted work: `src/lib/memory/`, `src/curator/`,
`docker/postgres-init/`, or any `*.e2e.test.ts` under those paths. That work is pending
independent review. In particular, `promotion-outbox-worker.e2e.test.ts` still uses
`getPool()` instead of the app-role pool — that fix belongs to Story 24.4, its owner, not
to this story.

---

## Dev Agent Record

**Agent:** Woz (Allura-governed Team RAM), slice A of a three-slice split.
**Date:** 2026-08-23
**Slice scope:** AC-1, AC-2, AC-3, AC-4, AC-7. AC-5, AC-6 and AC-8 belong to
other slices and are deliberately left unchecked here.

> The checked boxes above are the **implementer's** self-assessment of AC-1,
> AC-2, AC-3, AC-4 and AC-7. No review, approval or sign-off has occurred. The
> story status is unchanged and is not `done`.

### Files changed

| File | Change |
|---|---|
| `src/proxy.ts` | `ROLE_GATES` deleted; both branches call `resolveRouteAuthority()`; unmatched paths denied; `isStaticAsset()` no longer exempts `/api/*`; unexpected-Clerk-result fallback denies instead of forwarding |
| `src/lib/auth/route-scope-manifest.ts` | Added `PUBLIC_ROUTE_MANIFEST` (rationale required per entry), `UNDECLARED_ROUTE_ROLE = "admin"`, `RouteAuthority`, `getPublicEntry()`, `resolveRouteAuthority()`; declared `/api/brain/memories` and `/api/brain/search`; fixed the dead `:path*` matcher and added exact-one-segment `:param` semantics; explicitly declared 28 existing handlers as `pending-review:*` admin for Story 24.11b authority review |
| `src/lib/auth/api-auth.ts` | `void action;` removed; added `ACTION_MINIMUM_ROLE` + `minimumRoleForAction()`; effective role is the stricter of `requiredRole` and the action floor; unknown actions fail closed to admin |
| `src/app/api/brain/memories/route.ts` | `withPermission` gate; `group_id` principal-derived; `user_id` defaults to the principal, not `"ronin704"` |
| `src/app/api/brain/search/route.ts` | `withPermission` gate; `group_id` principal-derived |
| `src/app/api/brain/health/route.ts` | Stays public; documents its `PUBLIC_ROUTE_MANIFEST` rationale |
| `src/__tests__/auth-middleware.test.ts` | +runtime cases: undeclared-route denial (401/403, no tenant data, no forwarded auth headers), Class A enforcement, brain routes, public allowlist, Clerk-branch denial, wildcard and ordinary dynamic-segment precedence, and `/api/projects/:id` pending-review admin coverage |
| `src/lib/auth/__tests__/with-permission-action.test.ts` | New: 17 cases pinning `PermissionAction` enforcement |
| `vitest.config.unit.ts` | +1 include line for the new test file |
| `scripts/validate-route-scope-manifest.ts`, `tests/scripts/validate-route-scope-manifest.test.ts` | Added single-root coverage validation, role-strength enforcement using the stricter explicit-role/action floor, zero-gap/zero-weak artifact status, and no-baseline regression coverage |
| `docs/archive/allura/24-11a-FAIL-CLOSED-WEB-AUTHORITY-ROLLOUT.md` | New: AC-3 rollout note, corrected `/api/projects/:id` Class B/admin-pending-review inventory |

### Evidence — observed exit codes

```
bun run typecheck                         -> recorded by repair worklog
bun run test:unit                         -> recorded by repair worklog
bun run validate:route-scope-manifest     -> recorded by repair worklog (zero uncovered; zero weak roles)
```

### Defect found while enumerating for AC-3

`matchesPattern()` expanded `"/x/:path*"` into a regex requiring a double
slash, so every `:path*` entry in both manifests was dead. Invisible under the
old permissive fall-through; under fail-closed it would have gated
`/auth/v2/login` itself. Fixed with a regression test. See §8 of the rollout
note.

### Known gaps left open by this slice

- The 28 explicitly declared `pending-review:*` admin handlers require Story
  24.11b's reviewed least-privilege assignments. Their current authority is
  deliberately restrictive and adds no permissive access.
- `/api/health/metrics` stays public via `/api/health/:path*` while reading a
  client-supplied `group_id`. Pre-existing; belongs to 24.11b.
- The 36 per-route `group_id` reconciliations remain out of scope (24.11b).
