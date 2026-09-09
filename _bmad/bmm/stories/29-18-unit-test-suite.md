# Story 29.18 — Unit Test Suite — State, Signing, Replay, Expiry, Scope, Redaction, PKCE, Authorization Code, Agent-Name Invariant (AC-26)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** F — Validation Evidence  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want a complete unit test suite covering state transitions, canonical challenge signing, replay, expiry, scope derivation, and audit redaction,
So that the architecture's correctness claims are verified at the unit level before integration.

## Outcome

Every state transition, signature, replay attempt, expiry, scope derivation, and audit redaction rule is verified by a fast unit test (AC-26).

**Scope:** Consolidate and complete all unit test targets from §12.2. Many are created in earlier stories (1.1–5.2); this story fills any gaps and ensures the full suite runs under `bun run test:unit`. Required targets: `state-machine.test.ts`, `rfc9421-payload.test.ts` (Story 29.2), `rfc9421-ecdsa-p1363.test.ts` (Story 29.2), `scope-derivation.test.ts` (Story 29.8), `pkce.test.ts` (Story 29.3), `audit-redaction.test.ts` (Story 29.16), `idempotency.test.ts` (Story 29.12), `device-limit.test.ts` (unit-level, Story 29.5), `agent-name-invariant.test.ts` (Story 29.1), `grace-window.test.ts` (Story 29.13), `authorization-code.test.ts` (Story 29.3), `rfc9421-body-swap.test.ts` (Story 29.2), `rfc9421-target-uri.test.ts` (Story 29.2).

**Dependencies:** Story 29.1, Story 29.2, Story 29.3, Story 29.4, Story 29.5, Story 29.6, Story 29.7, Story 29.8, Story 29.9, Story 29.10, Story 29.11, Story 29.12, Story 29.13, Story 29.14, Story 29.15, Story 29.16, Story 29.17

**Blocks:** None.

**Acceptance Criteria IDs:** AC-26 (unit tests cover state transitions, canonical challenge signing, replay, expiry, scope derivation, and audit redaction).

**Architecture/ADR references:** §12.1 (unit lane), §12.2 (unit targets list), AD-64, AD-66.

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/__tests__/state-machine.test.ts` (if not created in earlier stories) — PENDING→APPROVED→CONSUMED (device_enrollments) + APPROVED→REVOKED/LOST (paired_devices); rotation sub-state CURRENT_KEY→NEXT_KEY_STAGED→NEXT_KEY_PROVEN→NEW_KEY_ACTIVE→CURRENT_KEY.
- Fill any gaps from §12.2 list.
- No migration changes.

**Required tests:**
- All §12.2 unit targets pass under `bun run test:unit`.
- `state-machine.test.ts` — all transitions + invariants (STATE-MACHINE.md).
- Full suite: `bun run test:unit` passes.

**Governance/security evidence:**
- Unit lane covers AC-26 scope (§12.1).
- No DB required (unit lane — mocked or pure functions).
- Tests do not contain real credentials (AC-25 scan covers them).

**Rollback or failure behavior:** If a unit test fails, CI fails — the bug must be fixed before merge.

**Definition of Done:**
- All §12.2 unit test targets exist and pass under `bun run test:unit`.
- `bun run typecheck` passes.
- No `vi.mocked` anti-pattern (per AGENTS.md Story 29.10 note — use real implementations or test doubles).

**Non-goals:**
- No integration tests (Story 29.19).
- No E2E tests (Story 29.20).
- No platform contract tests (Story 29.21).

---
