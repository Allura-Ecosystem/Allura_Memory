# Story 29.4 — Enrollment API — POST /api/device-pairing/enroll

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** done
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
- Uses: `docker/postgres-init/60-device-enrollments.sql` (logical schema version `060`; Story 29.1).
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

## Implementation — Test Inventory and Traceability

### Files created

| File | Purpose |
|---|---|
| `src/app/api/device-pairing/enroll/route.ts` | POST route — Zod parse, validate, delegate to service, map errors to HTTP codes |
| `src/lib/device-pairing/enrollment-service.ts` | `createEnrollment()` — validation, `device_enrollment_create()` call, audit, pairing URL |
| `src/lib/device-pairing/audit.ts` | `emitDeviceAudit()` — transactional `insertEvent` helper (fail-closed) |
| `src/lib/device-pairing/config.ts` | Extended: `getEnrollmentTtlMs()`, `getPairingCallbackAllowlist()` |
| `src/lib/device-pairing/__tests__/enroll-route.test.ts` | Integration-lane route test (mocked PG pool) — 19 tests |

### Test inventory (19 tests, all passing)

| # | Test | AC / Architecture ref |
|---|---|---|
| 1 | 201 on valid input returns `enrollment_transaction_id`, `pairing_url`, `expires_at` | AC-07, §4.1 |
| 2 | 400 INVALID_PKCE for missing `pkce_code_challenge` | §4.1 error codes |
| 3 | 400 INVALID_PKCE for empty `pkce_code_challenge` | §4.1 error codes |
| 4 | 400 INVALID_PKCE for malformed S256 challenge (43-char base64url required) | RFC 7636, §4.1 |
| 5 | 400 INVALID_PKCE for missing `pkce_state` | §4.1 error codes |
| 6 | 400 INVALID_PKCE for under-length (less than 16 chars) `pkce_state` | §4.1 error codes |
| 7 | 400 INVALID_PUBLIC_KEY for missing `public_key` | §4.1 error codes |
| 8 | 400 INVALID_PUBLIC_KEY for empty `public_key` | §4.1 error codes |
| 9 | 400 INVALID_PUBLIC_KEY for non-PEM/JWK-shaped `public_key` | §4.1 error codes |
| 10 | 400 INVALID_KEY_ALGORITHM for unsupported algo (`rsa-2048`) | §4.1 step 2, §9.1 |
| 11 | 400 INVALID_KEY_ALGORITHM for missing `key_algorithm` | §4.1 step 2 |
| 12 | 400 CALLBACK_TYPE_DISABLED for `loopback` when allowlist is `["deep_link"]` | §4.1 step 3, AD-63, LOW-F4 |
| 13 | 201 accepts `callback_type` in allowlist | §4.1 step 3 |
| 14 | `expires_at` is ~10 minutes (600000ms) from now | AC-07, §4.1 step 4 |
| 15 | Audit `DEVICE_ENROLL_REQUESTED` inserted with `group_id=allura-system`, `agent_id=device-enrollment` | §11.1, MED-F3, AR11 |
| 16 | Audit metadata includes `enrollment_transaction_id`, `device_label`, `callback_type`, `key_algorithm`, `key_fingerprint` | §11.1 audit table |
| 17 | `device_enrollment_create()` call does not pass `group_id`/`workspace_id`/`principal_id` (10 params, no tenant selector) | AR1, §3.1 `chk_enroll_pending_no_auth` |
| 18 | Fail-closed: audit insert failure triggers ROLLBACK, no COMMIT, returns 500 | §11.1 HIGH-F1, NFR5 |
| 19 | `pairing_url` contains only `txn` + `state` (no verifier) | AD-65, §4.1 step 5 |

### Validation results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `bun run typecheck` | PASS |
| Focused integration | `bun vitest run src/lib/device-pairing/__tests__/enroll-route.test.ts --config vitest.config.integration.ts` | 19/19 PASS |
| Integration lane | `bun run test:integration` | 498 passed; 1 pre-existing failure: `genesis-engine.test.ts` needs a configured project manifest/live DB |
| Unit lane | `bun run test:unit` | 2,649 passed; 4 pre-existing failures outside this story |

### Code Review

- Final BMAD review: **APPROVED** — zero Block, High, or Medium findings.
- Remediated during review: exact RFC 7636 S256 challenge shape, minimum PKCE state length, and PEM/JWK-shaped public-key validation. Final focused integration: 19/19 passing; typecheck clean.

### Non-goals honored

- No migrations changed or added (migration 060 from Story 29.1 is used as-is)
- No live DB mutations
- No deploy, commit, or push
- No secrets edited
- No `/approve` or `/complete` implementation
