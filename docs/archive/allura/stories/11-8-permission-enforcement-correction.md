# Story 11.8 Correction: Permission Enforcement

**Status:** partially-verified — 2026-06-12
**Priority:** P0
**Source:** Epic 13.1, tenant isolation invariants, RK-19

> **Evidence (2026-06-12, Team RAM / Claude CLI):** Permission contract proven
> by `src/__tests__/permission-profile.test.ts` (6/6, now wired into the default
> vitest lane). Root cause: `requireRole` (`src/lib/auth/api-auth.ts`) nulled
> `user` in BOTH the unauthenticated and the insufficient-role branches, so the
> canonical handler guard `if (!roleCheck.user) return 401` could not
> distinguish "no identity" from "forbidden" — an authenticated viewer hitting
> an admin-only PATCH wrongly received `401`. Fix: added an explicit
> `authenticated` discriminator and populate `user` on the forbidden branch, so
> unauthenticated → `401` and authenticated-but-forbidden → `403`. This corrects
> the contract for all ~20 `requireRole` call sites with zero call-site churn.
> Added a deterministic unauthenticated `401` test. Typecheck clean; full suite
> 2165/2165 green. **Remaining:** durable audit-receipt persistence (currently a
> warning), and the deleted `src/middleware.ts` auth-header-injection replacement
> (deletion is a preserved user change — see Blockers).

## Story

As a tenant-scoped operator, I need authentication and authorization failures to
have stable semantics so that clients can distinguish missing identity from
insufficient permission.

## Acceptance Criteria

- [ ] Unauthenticated mutations return `401`.
- [ ] Authenticated but unauthorized mutations return `403`.
- [ ] Tenant and user scope propagate through dashboard, API, and runtime
      profiles.
- [ ] The middleware/proxy replacement is documented and integration-tested.
- [ ] Permission decisions create an auditable receipt without leaking secrets.
- [ ] The focused permission-profile test passes.

## Verification

- Test anonymous, authenticated-denied, and authenticated-allowed mutations.
- Prove cross-tenant access is rejected.
- Prove the desktop/web route receives the same authorization semantics.

