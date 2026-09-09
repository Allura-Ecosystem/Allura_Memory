# Story 29.5 — Approval API — POST /api/device-pairing/approve

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a Clerk-authenticated human (the user or the user),
I want to approve the computer that just initiated pairing, with the server resolving my active membership and workspace,
So that the enrollment transaction is bound to my human identity, membership, workspace, and the device public key — and a one-time authorization code + completion nonce is issued for the bridge to redeem.

## Outcome

the user signs in through Clerk in the system browser, sees the device name and requested workspace, clicks "Approve", and the browser redirects to the deep link / loopback callback with `{ code, state, txn, completion_nonce }` (AC-01, AC-02).

**Scope:** Implement `src/app/api/device-pairing/approve/route.ts` — resolve `AuthUser` via `getAuthUser(request)`; call `device_enrollment_approve()` SECURITY DEFINER (row-locks, verifies `state` + expiry, flips PENDING→APPROVED); resolve active membership (`memberships` where `removed_at IS NULL`); resolve workspace; validate `callback_type` against deployment allowlist; acquire `pg_advisory_xact_lock` on SHA-256-derived 64-bit key for `(group_id, workspace_id, principal_id)`; check device count < limit (default 5); generate 256-bit authorization code (store SHA-256 hash only) + `completion_nonce` (bound to code/enrollment/PK, 60s TTL); audit `DEVICE_ENROLL_APPROVED` with `agent_id=<principal_id>`, `group_id=<approved_group_id>`; return `{ authorization_code, completion_nonce, callback }`.

**Dependencies:** Story 29.1, Story 29.3, Story 29.4

**Blocks:** Story 29.6, Story 29.16, Story 29.18, Story 29.19, Story 29.20

**Acceptance Criteria IDs:** AC-02 (server-resolved membership authority), AC-07 (partial — expired enrollment cannot be approved), AC-08 (PKCE state binds browser→bridge), AC-10 (five-device default limit enforced at approval via advisory lock + count).

**Architecture/ADR references:** §4.2, §4.2c (device limit), §3.1 (`device_enrollment_approve`), §11.1 (post-approval audit), AD-65, AD-63, HIGH-F4.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/approve/route.ts`
- New: `src/lib/device-pairing/approval-service.ts` — `approveEnrollment(input)` orchestrates membership resolution, advisory lock, count, code/nonce generation, SECURITY DEFINER call, audit.
- New: `src/lib/device-pairing/device-limit.ts` — `acquireDeviceCountLock(group, workspace, principal)`, `countApprovedDevices(...)`, `getDeviceLimit()` (default 5, configurable).
- Uses: `src/lib/auth/clerk.ts` (`getAuthUser`), `src/lib/membership/repository.ts`, `src/lib/auth/api-auth.ts` (middleware headers).
- No changes to existing auth files.

**Required tests:**
- `src/lib/device-pairing/__tests__/approve-route.test.ts` — 200 on valid approval; 404 `ENROLLMENT_NOT_FOUND`; 410 `ENROLLMENT_EXPIRED` (flips state to EXPIRED + audits `DEVICE_ENROLL_EXPIRED`); 400 `STATE_MISMATCH` + audit `DEVICE_ENROLL_DENIED`; 403 `MEMBERSHIP_INACTIVE` + audit; 409 `DEVICE_LIMIT_EXCEEDED` + audit; `authorization_code` is 256-bit base64url; `completion_nonce` is 32-byte base64url; both 60s expiry; audit `DEVICE_ENROLL_APPROVED` has `agent_id=principal_id`, `group_id=approved_group_id`.
- `src/lib/device-pairing/__tests__/device-limit.test.ts` — unit-level count + limit logic.
- Integration lane.

**Governance/security evidence:**
- Server resolves membership + workspace from Clerk identity — client never supplies authority (AC-02, §4.2 step 5-6).
- `pg_advisory_xact_lock` prevents TOCTOU on device count (HIGH-F4, §4.2c).
- Authorization code stored as SHA-256 only (AD-65, §4.2 step 10).
- Post-approval audit uses approved tenant/principal, not `allura-system` (AR11).
- `state` is bridge-side CSRF; PKCE verifier match is the server-side replay control at `/complete` (AD-65, §8.2).

**Rollback or failure behavior:** If any step fails after `device_enrollment_approve()`, the transaction rolls back — PENDING state restored. If audit fails, transaction rolls back (fail-closed). Advisory lock released on transaction end.

**Definition of Done:**
- `POST /api/device-pairing/approve` returns 200 with `authorization_code`, `completion_nonce`, `callback` on valid input.
- All error codes return correct HTTP status with audit events.
- Device limit enforced via advisory lock + count.
- `authorization_code_hash` and `completion_nonce` stored on the enrollment row; raw code never stored.
- Integration tests pass.

**Non-goals:**
- No `/complete` (Story 29.6).
- No proof-of-possession verification here (that happens at `/complete`).
- No `paired_devices` row creation (Story 29.6).
- No token mint (Story 29.6).

---
