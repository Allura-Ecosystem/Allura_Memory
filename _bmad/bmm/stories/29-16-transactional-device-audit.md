# Story 29.16 — Transactional Audit Emission for All Device Lifecycle Events

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** E — Audit and Credential Hygiene  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want every device lifecycle and security decision to produce an append-only audit event in the same transaction as the state change,
So that no security decision is lost and the audit trail is authoritative for compliance and incident response.

## Outcome

Every enrollment, approval, completion, challenge, exchange, rotation, revocation, and loss decision has a durable, transactional audit event with allowlisted metadata (AC-24).

**Scope:** Implement `src/lib/device-pairing/audit.ts` (created in Story 29.4 — extend it here to cover all 13 event families): `DEVICE_ENROLL_REQUESTED`, `DEVICE_ENROLL_APPROVED`, `DEVICE_ENROLL_DENIED`, `DEVICE_ENROLL_EXPIRED`, `DEVICE_PAIRING_COMPLETE`, `DEVICE_CHALLENGE_ISSUED`, `DEVICE_EXCHANGE_ALLOWED`, `DEVICE_EXCHANGE_DENIED`, `DEVICE_ROTATION_STAGED`, `DEVICE_ROTATION_ACTIVATED`, `DEVICE_ROTATION_RECOVERED`, `DEVICE_REVOKED`, `DEVICE_MARKED_LOST`, `DEVICE_RECOVERED_AS_NEW_PAIRING`. Each uses transactional `insertEvent` (fail-closed) — NOT `emitAuthAudit` (fire-and-forget). Verify all API routes from Stories 1.4–4.1 call the correct audit helper. Pre-human events use `group_id='allura-system'`, `agent_id='device-enrollment'`; post-approval use approved tenant/principal. Metadata is allowlisted per §11.1 table.

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
