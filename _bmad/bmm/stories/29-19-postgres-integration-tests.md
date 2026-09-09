# Story 29.19 — PostgreSQL Integration Test Suite — Atomicity, Uniqueness, Membership, Locks, Revocation, Concurrency, Device Limit (AC-20, AC-27)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** F — Validation Evidence  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want a complete PostgreSQL integration test suite proving transaction atomicity, the one-active-token invariant, membership changes, workspace locks, revocation, concurrency, and the device-limit advisory lock,
So that the architecture's DB-level correctness claims are verified against a real PostgreSQL 16 instance.

## Outcome

Concurrent exchanges finish with at most one active token; concurrent rotations converge to one key generation; the device limit holds under concurrent `/complete` calls; revocation is immediate; demotion/removal/lock changes atomically revoke tokens (AC-20, AC-27).

**Scope:** Consolidate and complete all integration test targets from §12.3. Many are created in earlier stories (1.1, 1.6, 2.2, 2.3, 3.3, 4.1); this story fills gaps and ensures the full suite runs under `bun run test:integration` with `RUN_E2E_TESTS=true`. Required targets: `exchange-atomicity.test.ts`, `rotation-concurrency.test.ts`, `membership-removal.test.ts`, `membership-demotion.test.ts`, `workspace-lockdown.test.ts`, `revocation.test.ts`, `replay-cache.test.ts`, `cross-tenant.test.ts`, `device-limit-concurrency.test.ts`, `agent-name-trigger.test.ts`, `authorization-code-redeem.test.ts`, `rfc9421-body-swap.test.ts` (integration variant), `rfc9421-target-uri.test.ts` (integration variant), `resolve-device-route.test.ts`, `demotion-atomic-revoke.test.ts`, `workspace-lock-atomic-revoke.test.ts`, `grace-recovery-only.test.ts`.

**Dependencies:** Story 29.1, Story 29.4, Story 29.5, Story 29.6, Story 29.7, Story 29.8, Story 29.9, Story 29.10, Story 29.12, Story 29.13, Story 29.14, Story 29.15, Story 29.16

**Blocks:** None.

**Acceptance Criteria IDs:** AC-20 (two concurrent exchanges finish with at most one active MCP token for the device), AC-27 (PostgreSQL integration tests prove transaction atomicity, uniqueness, membership changes, workspace locks, revocation, and concurrency).

**Architecture/ADR references:** §12.1 (integration lane), §12.3 (integration targets list), §4.2c (device limit concurrency test — HIGH-F4), §4.5 (exchange atomicity), §6.3 (rotation concurrency), AD-66.

**Source code and migration touchpoints:**
- Fill any gaps from §12.3 list.
- New: `src/lib/device-pairing/__tests__/integration/exchange-atomicity.test.ts` (if not created in Story 29.9) — concurrent exchanges → one active token (AC-20).
- New: `src/lib/device-pairing/__tests__/integration/rotation-concurrency.test.ts` (if not created in Story 29.13) — concurrent rotations → one key_generation (AC-21 — but AC-21 is covered in Workstream C; this test verifies it).
- New: `src/lib/device-pairing/__tests__/integration/device-limit-concurrency.test.ts` — `pg_advisory_xact_lock` + concurrent `/complete` → exactly `limit` rows (HIGH-F4 mandatory DB test).
- No migration changes.

**Required tests:**
- All §12.3 integration test targets pass under `bun run test:integration` with `RUN_E2E_TESTS=true`.
- `exchange-atomicity.test.ts` — N concurrent exchanges → at most 1 active token (AC-20).
- `device-limit-concurrency.test.ts` — N > limit concurrent `/complete` calls → exactly `limit` rows (HIGH-F4).
- `rotation-concurrency.test.ts` — 2 concurrent rotations → 1 `key_generation` (AC-21).
- Full suite: `bun run test:integration` passes.

**Governance/security evidence:**
- Integration lane covers AC-20, AC-27 scope (§12.1).
- Real PostgreSQL 16 (`RUN_E2E_TESTS=true`) — no mocked DB for atomicity/concurrency claims.
- `pg_advisory_xact_lock` collision risk documented (§4.2c) — test verifies correctness at expected scale.
- Partial unique index `idx_mcp_tokens_one_active_per_device` is the DB-level backstop for AC-20 (§3.2).

**Rollback or failure behavior:** If an integration test fails, CI fails — the concurrency/atomicity bug must be fixed before merge.

**Definition of Done:**
- All §12.3 integration test targets exist and pass under `bun run test:integration` with `RUN_E2E_TESTS=true`.
- AC-20 (concurrent exchanges → one active token) verified.
- AC-27 (atomicity, uniqueness, membership, locks, revocation, concurrency) verified.
- Device-limit concurrency test passes.
- `bun run typecheck` passes.

**Non-goals:**
- No unit tests (Story 29.18).
- No E2E tests (Story 29.20).
- No platform contract tests (Story 29.21).
- No mocked-DB concurrency tests (real PG only for atomicity claims).

---
