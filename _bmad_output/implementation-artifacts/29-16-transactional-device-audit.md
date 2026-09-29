# Story 29.16 — Transactional Audit Emission for All Device Lifecycle Events

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** E — Audit and Credential Hygiene  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want every device lifecycle and security decision to produce an append-only audit event in the same transaction as the state change,
So that no security decision is lost and the audit trail is authoritative for compliance and incident response.

## Outcome

Every enrollment, approval, completion, challenge, exchange, rotation, revocation, and loss decision has a durable, transactional audit event with allowlisted metadata (AC-24).

**Scope:** Implement `src/lib/device-pairing/audit.ts` (created in Story 29.4 — extend it here to cover all 13 implemented event families): `DEVICE_ENROLL_REQUESTED`, `DEVICE_ENROLL_APPROVED`, `DEVICE_ENROLL_DENIED`, `DEVICE_ENROLL_EXPIRED`, `DEVICE_PAIRING_COMPLETE`, `DEVICE_CHALLENGE_ISSUED`, `DEVICE_EXCHANGE_ALLOWED`, `DEVICE_EXCHANGE_DENIED`, `DEVICE_ROTATION_STAGED`, `DEVICE_ROTATION_ACTIVATED`, `DEVICE_ROTATION_RECOVERED`, `DEVICE_REVOKED`, `DEVICE_MARKED_LOST`. Each uses transactional `insertEvent` (fail-closed) — NOT `emitAuthAudit` (fire-and-forget). Verify all API routes from Stories 1.4–4.1 call the correct audit helper. Pre-human events use `group_id='allura-system'`, `agent_id='device-enrollment'`; post-approval use approved tenant/principal. Metadata is allowlisted per §11.1 table. `DEVICE_RECOVERED_AS_NEW_PAIRING` is excluded: there is no implemented recovery-as-new-pairing state transition in Epic 29; existing old-key grace recovery is represented by `DEVICE_ROTATION_RECOVERED`.

**Dependencies:** Story 29.4, Story 29.5, Story 29.6, Story 29.7, Story 29.9, Story 29.12, Story 29.13, Story 29.14, Story 29.15

**Blocks:** Story 29.17, Story 29.18, Story 29.19

**Acceptance Criteria IDs:** AC-24 (every lifecycle/security decision creates an append-only event).

**Architecture/ADR references:** §11.1 (audit events table + transactional vs fire-and-forget), §11.4 (structured logs), MED-F3 (pre-human `agent_id`), AR11.

**Source code and migration touchpoints:**
- Extended: `src/lib/device-pairing/audit.ts` — `emitDeviceAudit(eventType, groupId, agentId, metadata, txClient)` — transactional `insertEvent` (fail-closed).
- Extended: all device-pairing API routes — verify they call `emitDeviceAudit` transactionally, never `emitAuthAudit` for `DEVICE_*` events.
- No migration changes (`events` table from migration 00 + immutability from migration 37).

**Required tests:**
- `src/lib/device-pairing/__tests__/audit-transactional.test.ts` — for each of the 13 event families: if `insertEvent` fails, the state-changing transaction rolls back (fail-closed); `emitAuthAudit` is never used for `DEVICE_*` events; pre-human events use `group_id='allura-system'`, `agent_id='device-enrollment'`; post-approval events use approved tenant/principal.
- `src/lib/device-pairing/__tests__/audit-redaction.test.ts` — no event metadata contains private keys, raw MCP tokens, Clerk tokens, PKCE verifiers, unconsumed challenges, or rotation secrets (AC-25 partial — unit-level).
- Integration lane (real PG for transactional rollback).

**Governance/security evidence:**
- Device-lifecycle events use transactional `insertEvent` (fail-closed) — HIGH-F1, NFR5.
- `emitAuthAudit` (fire-and-forget) is for `mcp_auth_decision` only — never `DEVICE_*` (§11.1).
- `events` append-only — migration 37 immutable trigger (NFR4).
- Pre-human events use `allura-system` / `device-enrollment` (AR11, MED-F3).
- Metadata allowlisted per §11.1 table (AC-24, AC-25).
- `group_id` on every event (NFR3).

**Rollback or failure behavior:** If `insertEvent` fails, the entire state-changing transaction rolls back (fail-closed). This is the intended behavior — a security decision without an audit trail is not allowed to commit.

**Definition of Done:**
- All 13 device event families emit transactional `insertEvent` in the same transaction as the state change.
- `emitAuthAudit` never used for `DEVICE_*` events.
- Pre-human vs post-approval `agent_id`/`group_id` correct.
- Metadata allowlisted.
- Integration tests prove fail-closed rollback.
- `bun run typecheck` passes.

**Non-goals:**
- No change to `emitAuthAudit` for `mcp_auth_decision` events (that path stays fire-and-forget).
- No metrics implementation (§11.3 — separate concern, not an AC).
- No structured log format changes (§11.4 — existing pattern).

---

## Active Execution Ledger — 2026-09-10

- **Baseline:** `f01bf0d1` (Story 29.15 verified commit).
- **State:** unverified WIP — no commit / no push / no deploy / no secret change / no production DB mutation.
- **RED receipts:** live device-audit test was initially absent from `vitest.config.live-db.ts` (config reported no matching test); the existing relevant live lane initially ran 20/24, with four completion proofs blocked before audit by a missing test-only MCP token secret.
- **GREEN receipts:** registered device-audit immutability proof 1/1; corrected the completion fixture’s test-only secret and reran the relevant live lane 27/27. Existing strict caller metadata remains compatible with the narrow 13-type allowlist; no unknown key or credential-shaped value was permitted.
- **Validation receipt:** focused 29.4–29.16 device-pairing directory is 264 passed / 48 skipped; typecheck passes; scoped ESLint has 0 errors / 4 pre-existing import-order warnings; `git diff --check` passes. The full registered live-db inventory was also run with `POSTGRES_USER=ronin4life RUN_E2E_TESTS=true`, but is not clean: 18 failed / 89 passed / 105 skipped in unrelated graph, curator, Bumblebee, SDK and genesis suites due missing app-role credentials and absent shared-schema columns/tables. The seven Story 29.16-relevant live files are green 27/27.
- **Pike final-review remediation (2026-09-10):** Story 29.9 exchange now supplies its already locked, server-resolved `LockMode` to the shared device-token chokepoint. Normal, read-only/no-agent-writes, no-promotions, and full-lockdown scope policy is covered; full lockdown fails before a token insert. The missing-workspace exchange denial now uses the paired device's resolved group, workspace, and principal with `failed` status.
- **Next named gate:** resolve unrelated shared live-db prerequisites, then rerun the full inventory and 13-family matrix.
- **Required receipts before review:** focused suite, live DB suite, typecheck, scoped lint, diff hygiene, static scan.
- **Review/commit gate:** independent BMAD review and governance check; user-directed deliverable remains uncommitted.

## Audit Coverage Matrix — 2026-09-10

| Event family | Current source and transaction | Actual evidence | Status |
| --- | --- | --- | --- |
| `DEVICE_ENROLL_REQUESTED` | `enrollment-service.createEnrollment`; create + audit before commit | `enroll-route.test.ts`; 13-family allowlist case | Unit-covered |
| `DEVICE_ENROLL_APPROVED` | `approval-service.approveEnrollment`; approval + audit before commit | `approve-route.test.ts`; 13-family allowlist case | Unit-covered |
| `DEVICE_ENROLL_DENIED` | `approval-service`, `complete-service`, completion route; denial audit commits only as its owning decision | `approve-route.test.ts`, `complete-service.test.ts`, `complete-route.test.ts` | Unit-covered |
| `DEVICE_ENROLL_EXPIRED` | `approval-service` / `complete-service`; expiry transition + audit in one transaction | `complete-service.test.ts` expiry rollback | Unit-covered |
| `DEVICE_PAIRING_COMPLETE` | `complete-service.completePairing`; device + token + enrollment consume + audit | `completion-transaction.live-db.test.ts` real `events` trigger rollback | Live forced-failure |
| `DEVICE_CHALLENGE_ISSUED` | `challenge-service.issueChallenge`; challenge insert + audit | `challenge-service.live-db.test.ts` real `events` trigger rollback | Live forced-failure |
| `DEVICE_EXCHANGE_ALLOWED` | `exchange-service.exchangeToken`; locked device/workspace/membership authority plus shared lock-aware token mint | `exchange-service.test.ts`, `repository.device.test.ts` (all lock modes), `exchange.live-db.test.ts` | Unit + live covered |
| `DEVICE_EXCHANGE_DENIED` | `challenge-service.issueChallenge` pre-human denial and `exchange-service.exchangeToken` resolved-device denial | `challenge-service.live-db.test.ts`, `exchange-service.test.ts`, `exchange.live-db.test.ts` | Unit + live covered |
| `DEVICE_ROTATION_STAGED` | `rotation-service.stageRotation`; challenge consume + pending key + audit | `rotation-stage.live-db.test.ts` real `events` trigger rollback | Live forced-failure |
| `DEVICE_ROTATION_ACTIVATED` | `rotation-service.activateRotation`; challenge consume + key swap + audit | `rotation-activate.live-db.test.ts` real `events` trigger rollback | Live forced-failure |
| `DEVICE_ROTATION_RECOVERED` | `rotation-service.recoverViaGrace`; challenge consume + counter increment + audit | `grace-recovery.live-db.test.ts` real `events` trigger rollback | Live forced-failure |
| `DEVICE_REVOKED` | `revocation-service.revokeDevice`; device/token transition + audit | `revocation-service.live-db.test.ts` real `events` trigger rollback | Live forced-failure |
| `DEVICE_MARKED_LOST` | `revocation-service.markLostDevice`; same `transitionDevice` transaction | `revocation-service.test.ts` shared transaction contract | Unit-covered via shared path |

`DEVICE_RECOVERED_AS_NEW_PAIRING` remains excluded: no recovery-as-new-pairing transition exists; grace recovery emits `DEVICE_ROTATION_RECOVERED`.
