# Story 24.12 — Findings-Only Code Review

**Verdict:** **APPROVE**

**Independent reviewers:** Pike, Fowler (re-review after remediation)

**Frozen scope:** `web-principal.ts` (`resolveApiTenant`, `resolveWebApprovalTenant`), `api-auth.ts` (`getGroupIdFromAuth`, `withPermission` guard), `principal-context.ts` (`INVALID_GROUP_ID`), `vitest.config.unit.ts`, `api-tenant-seam.test.ts`, story + sprint-status. No application route migrated.

## Acceptance criteria

| Criterion | Status |
| --- | --- |
| Malformed selector → 400 INVALID_GROUP_ID | Met (canonical `INVALID_GROUP_ID:400`) |
| Missing identity → 401 | Met (`AUTH_MISSING:401`) |
| Foreign tenant → 403 TENANT_MISMATCH | Met |
| Matching/absent selector → authenticated tenant | Met |
| No protected-route allura-system fallback | Met (removed) |
| Helpers reconcile to single seam | Met |
| No route migration | Met |

## Findings remediated (Fowler round 1)

1. `getGroupIdFromAuth` threw bare `Error` with non-canonical `INVALID_GROUP_ID`. Now throws `PrincipalAuthError` with canonical codes; `REASON_STATUS` gained `INVALID_GROUP_ID:400`.
2. `withPermission` refusal was unguarded (could 500). Now maps `PrincipalAuthError` to a stable 400/401/403 `NextResponse`.
3. Refusal path untested. Added `getGroupIdFromAuth` refusal-path tests (unauthenticated + malformed + mismatch).
4. Story status was stale. Set to Review then Done.

## Verification

- Focused seam + web-principal + permission: **30/30**
- Broader auth + curator routes: **124/124**
- Full unit lane (independent Pike run): **1903 passed / 0 failed / 160 skipped**
- `tsc --noEmit`: exit 0
- `git diff --check`: clean

## Non-blocking notes

- `agents/route.ts` retains a pre-existing dead `?? "allura-system"` line; pre-existing, out of 24.12 scope, not a regression.
- The `withPermission` tenant-refusal catch is exercised via helper tests and role-refusal tests, not a dedicated `withPermission`-level case.

## Context7 note

Context7 was OAuth/quota-blocked in the Docker MCP gateway and via REST (`Quota Exceeded`/`invalid_format`). Per the user's Option-A decision, the Next.js route-handler contract was derived from installed `node_modules/next` types, existing repo `route.ts` handlers, and the repository auth contract. Recorded here for evidence truth.
