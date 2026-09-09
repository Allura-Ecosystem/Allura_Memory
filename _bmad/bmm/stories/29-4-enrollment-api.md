# Story 29.4 — Enrollment API — POST /api/device-pairing/enroll

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a desktop bridge,
I want to request an enrollment transaction by submitting my device public key, PKCE code challenge, and state,
So that I receive a pairing URL to open in the system browser, with a 10-minute single-use transaction that carries no tenant authority.

## Outcome

the user clicks "Connect to Allura" in the desktop client, the bridge calls `/enroll`, and a pairing URL is returned for the system browser — no token copied, no config edited (AC-01).

**Scope:** Implement `src/app/api/device-pairing/enroll/route.ts` — validate PKCE `code_challenge` (RFC 7636 S256), `pkce_state`, `key_algorithm` (server-accepted set: P-256 mandatory, Ed25519 optional, RSA-PSS legacy), `callback_type` (deployment allowlist); call `device_enrollment_create()` SECURITY DEFINER function; audit `DEVICE_ENROLL_REQUESTED` with `group_id='allura-system'`, `agent_id='device-enrollment'`; return `{ enrollment_transaction_id, pairing_url, expires_at }`.

**Dependencies:** Story 29.1, Story 29.3

**Blocks:** Story 29.5, Story 29.16, Story 29.18, Story 29.19, Story 29.20

**Acceptance Criteria IDs:** AC-07 (enrollment 10-min TTL, single-use, cannot be approved/reused after expiry), AC-09 (partial — enrollment carries no authority to mint access).

**Architecture/ADR references:** §4.1, §3.1 (device_enrollment_create), §11.1 (pre-human audit), AD-65, AD-63.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/enroll/route.ts`
- New: `src/lib/device-pairing/enrollment-service.ts` — `createEnrollment(input)` calls SECURITY DEFINER function, emits audit.
- New: `src/lib/device-pairing/audit.ts` — `emitDeviceAudit(eventType, groupId, agentId, metadata)` transactional insertEvent helper (fail-closed).
- Uses: `docker/postgres-init/060-device-enrollments.sql` (Story 29.1).
- No existing file changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/enroll-route.test.ts` — 201 on valid input; 400 `INVALID_PKCE` / `INVALID_PUBLIC_KEY` / `INVALID_KEY_ALGORITHM` / `CALLBACK_TYPE_DISABLED`; `expires_at` = NOW + 10 min; audit `DEVICE_ENROLL_REQUESTED` inserted with `group_id='allura-system'`, `agent_id='device-enrollment'`; no `group_id`/`workspace_id`/`principal_id` on the row.
- Integration lane (mocked DB or real PG).

**Governance/security evidence:**
- `device_enrollments` PENDING row has no tenant authority — enforced by `chk_enroll_pending_no_auth` CHECK constraint (AR1).
- Pre-human audit uses `allura-system` / `device-enrollment` (AR11, MED-F3).
- PKCE verifier never in the pairing URL (AD-65, §4.1 step 5).
- `group_id` on every audit write (NFR3).
- Transactional `insertEvent` fail-closed for lifecycle events (NFR5).

**Rollback or failure behavior:** If `device_enrollment_create()` fails, return 500; no partial row. If audit insert fails, the transaction rolls back (fail-closed). Bridge retries.

**Definition of Done:**
- `POST /api/device-pairing/enroll` returns 201 with `enrollment_transaction_id`, `pairing_url`, `expires_at` on valid input.
- All error codes return correct HTTP status.
- Audit event inserted transactionally.
- Integration tests pass.
- `bun run typecheck` passes.

**Non-goals:**
- No `/approve` (Story 29.5).
- No `/complete` (Story 29.6).
- No Clerk integration in this route (the browser hits Clerk later).
- No device limit check here (that happens at `/approve` and `/complete`).

---
