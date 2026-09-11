# Story 29.20 — E2E Test — Browser-to-Desktop PKCE Completion with Clerk Test Instance (AC-28)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** F — Validation Evidence  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want an E2E test that uses a dedicated Clerk test instance and a headless browser to prove the full browser→desktop PKCE completion flow,
So that the pairing journey is verified end-to-end from Connect → Clerk → approve → complete → MCP call.

## Outcome

The full pairing flow is proven against a real (test) Clerk instance, a headless browser, and the real Allura API — the user's journey works (AC-28).

**⚠️ Implementation prerequisite B1:** This story requires the **Clerk test instance** (B1). The architecture defines the E2E strategy (§12.4); runtime acceptance for AC-28 requires B1 evidence (a dedicated Clerk test app with test users, or a test-only `/api/device-pairing/_test/approve` endpoint guarded by `NODE_ENV=test` and excluded from production builds). **No runtime acceptance for AC-28 is claimed in this document.** This story implements the test scaffold and strategy; the test passes only when B1 is procured.

**Scope:** Implement `src/lib/device-pairing/__tests__/e2e/pairing-flow.test.ts` — per §12.4: (1) mock system browser with Playwright; (2) generate test keypair in-memory; (3) call `/enroll` → get pairing URL; (4) navigate Playwright to pairing URL → simulate Clerk sign-in with test token (B1); (5) call `/approve` with `state` (NO PKCE verifier — AD-65); (6) receive deep-link callback (intercepted by test harness) with `code, state, txn, completion_nonce` (no `device_id`); (7) call `/complete` with `code` + `completion_nonce` + PKCE verifier + RFC 9421 signed proof (`pairing_complete`); (8) call `/challenge` (purpose=`exchange`) → `/exchange` with RFC 9421 signed proof; (9) use returned token to call MCP gateway `memory_search`; (10) assert `PrincipalContext.principalId` is the human, not `device:{id}`. If B1 is unavailable, the test skips with a clear `B1_NOT_PROCURED` reason.

**Dependencies:** Story 29.1, Story 29.4, Story 29.5, Story 29.6, Story 29.7, Story 29.8, Story 29.9, Story 29.10; B1 Clerk test instance is required for runtime acceptance of AC-28.

**Blocks:** None.

**Acceptance Criteria IDs:** AC-28 (E2E tests use a dedicated Clerk test instance/test-token strategy and prove browser-to-desktop PKCE completion). **No runtime acceptance claimed — gated on B1.**

**Architecture/ADR references:** §12.1 (E2E lane), §12.4 (E2E strategy), §16.1 (pairing sequence), AD-65, AD-64.

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/__tests__/e2e/pairing-flow.test.ts`
- New: `src/lib/device-pairing/__tests__/e2e/clerk-test-harness.ts` — B1-dependent Clerk test token helper (skips if `ALLURA_CLERK_TEST_INSTANCE_URL` not set).
- New (optional, if B1 is a test-only endpoint): `src/app/api/device-pairing/_test/approve/route.ts` — guarded by `NODE_ENV=test`, excluded from production builds.
- Extended: `package.json` — ensure `test:e2e` lane runs this test with `RUN_E2E_TESTS=true`.
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/e2e/pairing-flow.test.ts` — full §12.4 flow; skips with `B1_NOT_PROCURED` if Clerk test instance unavailable; passes end-to-end when B1 is procured.
- E2E lane (`RUN_E2E_TESTS=true`).

**Governance/security evidence:**
- B1 is an explicit implementation prerequisite (architecture §14, final review §1 focus area 9).
- No runtime acceptance for AC-28 claimed in this document.
- Test-only endpoint (if used) guarded by `NODE_ENV=test`, excluded from production builds.
- No production Clerk credentials in test artifacts (AC-25 scan covers them).
- `PrincipalContext.principalId` is the human, not `device:{id}` (AC-15 verified end-to-end).

**Rollback or failure behavior:** If B1 is not procured, the test skips (does not fail CI). If B1 is procured and the test fails, CI fails — the pairing flow bug must be fixed.

**Definition of Done:**
- E2E test scaffold implements the full §12.4 flow.
- Test skips gracefully when B1 is not procured.
- When B1 is procured, the test passes end-to-end.
- `PrincipalContext.principalId` asserted as human.
- No production code paths touched by the test-only endpoint.
- `bun run typecheck` passes.
- **AC-28 runtime acceptance is NOT claimed by this document — it requires B1 evidence at implementation time.**

**Non-goals:**
- No production Clerk integration testing (B1 is a test instance).
- No real OS keystore in E2E (in-memory keypair for server-side E2E — §12.4 step 2).
- No claim of AC-28 runtime acceptance in this planning artifact.

---
