# Story 25.2b — Code Review Evidence Report

> [!NOTE]
> **AI-Assisted Documentation** — assembled by Brooks (reconciliation chair) from
> subagent gate reports, 2026-08-25. Defer to test output and diffs as primary evidence.

**Story:** 25.2b — Authenticated Session Entry Point
**Epic:** 25 — Governed Curator Review Console
**Surface:** `.worktrees/epic-25-bmad-closure` @ `feat/epic-25-bmad-closure` (base `64af9365`)
**Builder:** Woz (subagent, TDD) · **Orchestrator:** Brooks (main thread)
**Verdict:** ✅ **APPROVED — all gates green after 2 fix cycles (max 3)**

## Gate Chain Results

| Gate | Reviewer | Cycle 1 | Cycle 2 | Final |
|---|---|---|---|---|
| Scope | Jobs (intent gate) | CHANGES-REQUESTED (3 findings) | APPROVE | ✅ |
| Interface | Pike | CHANGES-REQUESTED (3 findings) | CHANGES-REQUESTED (1 High: keyless redirect loop) | ✅ APPROVE |
| Maintainability / truthfulness | Fowler | CHANGES-REQUESTED (4 findings) | APPROVE | ✅ APPROVE (regression re-check cycle 3) |
| Schema/RLS | Knuth | NOT DISPATCHED — no schema/migration/DB-write changes in diff | — | n/a |

## Defects Found and Fixed

1. **[HIGH, scope+truthfulness]** Woz implemented workspace-tuple DB validation (`web-session-authority.ts`) — Story 25.2a territory — then misrecorded it as absent. **Fix:** module deleted, all references removed; AC-3 satisfied by fail-closed server-derived metadata checks alone. Per-request PostgreSQL coupling on the Clerk auth path eliminated.
2. **[HIGH, crash risk]** Static `ClerkProvider`/`SignIn` imports could crash keyless production before fail-closed fallback rendered. **Fix:** dynamic Clerk client wrappers (`clerk-provider.tsx`, `clerk-sign-in.tsx`).
3. **[HIGH, redirect loop]** Keyless production denied all routes before route-authority resolution — public login route redirected to itself; degraded "Authentication unavailable" state unreachable over HTTP. Found by Pike in cycle 2. **Fix:** `handleKeylessProduction()` resolves manifest authority first (`src/proxy.ts:82-103, 354-357`); login renders 200 degraded, protected routes 307 to it.
4. **[MED, split authority]** `config.ts` PROTECTED_ROUTES/PUBLIC_ROUTES duplicated `route-scope-manifest`. **Fix:** derived from manifest — one authority surface.
5. **[MED, AC-5/AC-6 coverage gaps]** Expired-session redirect and full-flow rendering untested. **Fix:** focused tests added (`story-25-2b-auth-entry.test.ts`, `auth-middleware.test.ts:302-317`).
6. **[LOW]** `/auth/v2/login` magic strings centralized in `redirect-target.ts`; phantom `sign-in` file claim struck from File List; namespace-drift rename (`allura-roninmemory` → `allura-system`) explicitly documented in Change Log.

## Verification Evidence

- `bun run typecheck` — **passed**
- Focused Vitest: `story-25-2b-auth-entry.test.ts` + `auth-middleware.test.ts` — **80/80 passed** (7 story tests, 73 middleware)
- `bun run build` — passed (cycle 0); `git diff --check` — clean
- Route manifest validation — 0 uncovered, 0 weak
- Dev smoke: unauthenticated `/dashboard/curator` → 307 login; authenticated → 200 with server-derived identity

## Honest Residuals (recorded, not hidden)

1. **Interactive Clerk sign-in not exercised** — no Clerk credentials available in this environment. Unit/degraded-path coverage is complete; live interactive proof is assigned to the Epic 25 closure gate (signed-in browser screenshot).
2. Tests emit expected `ECONNREFUSED` warnings from audit telemetry (no local audit endpoint running) — cosmetic, no failures.
3. `resolveValidatedWebApprovalScope` (25.2a) remains absent from this branch — correctly so; 25.2a is dependency-blocked and its scope was not consumed here.

## Status Advancement

Story 25.2b advanced to `done` in `_bmad/bmm/stories/sprint-status.yaml` only after this report was written green, per loop contract C2.
