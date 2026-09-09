# Story 29.13 — Rotation Activate API — POST /api/device-pairing/rotation/activate (Atomic Key Swap + Grace Window)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** C — Automatic Device-Key Rotation  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a paired desktop bridge,
I want to activate the staged new key by signing a challenge with the new private key,
So that the server atomically swaps to the new key, sets a recovery-only grace window on the old key, and returns an updated signed receipt — completing rotation without Clerk.

## Outcome

the user's bridge proves the new key is readable and can sign, the server activates it, and the old key enters a 24-hour recovery-only grace window. If the bridge crashes after activation, it can recover via the receipt + grace path (AC-16, AC-18, AC-19).

**Scope:** Implement `src/app/api/device-pairing/rotation/activate/route.ts` — resolve `group_id` → RLS; verify RFC 9421 `rotation_activate` signature against `pending_next_public_key` (signed by the NEW key); row-lock `paired_devices` FOR UPDATE; idempotency: if `current_key_id == new_key_id` AND `rotation_receipt.receipt_id == $receipt_id` → return `ALREADY_ACTIVATED` with updated receipt; consume `device_challenges` (purpose=`rotation_activate`); atomic key swap: `current_* = pending_next_*`, `pending_next_* = NULL`, `key_generation = key_generation + 1`, `rotation_grace_expires_at = NOW + 24h` (configurable `ALLURA_DEVICE_KEY_GRACE_HOURS` 1–72), `grace_exchange_count = 0`, `rotation_receipt = $updated_receipt` (includes `grace_expires_at` + signature), `last_rotation_at = NOW()`; audit `DEVICE_ROTATION_ACTIVATED` (transactional); return `{ status: ACTIVATED, key_generation, rotation_receipt }`.

**Dependencies:** Story 29.2, Story 29.7, Story 29.12

**Blocks:** Story 29.14, Story 29.16, Story 29.18, Story 29.19, Story 29.21

**Acceptance Criteria IDs:** AC-16 (rotation succeeds without Clerk; no private key or long-lived bearer transmitted — activate step), AC-18 (crash after activation recovers via updated signed receipt + grace path), AC-19 (replay activation returns same state + updated receipt).

**Architecture/ADR references:** §4.6 (activate), §6.4 (crash recovery), §6.5 (grace recovery-only), §6.6 (cryptographic separation), §11.1 (rotation activated audit), AD-60, AD-64, MED-F6.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/rotation/activate/route.ts`
- Extended: `src/lib/device-pairing/rotation-service.ts` — `activateRotation(input)`.
- Uses: RFC 9421 verifier, `device_challenges` consume, `ALLURA_DEVICE_KEY_GRACE_HOURS` config.
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/rotation-activate.test.ts` — 200 ACTIVATED on valid activate; idempotency: replay with same `idempotency_key` returns `ALREADY_ACTIVATED` + updated receipt (AC-19); 409 `NO_PENDING_KEY` if no staged key; 401 `AUTH_EXPIRED` (challenge consumed); atomic key swap verified (`current_*` = new, `pending_*` = NULL, `key_generation` incremented, `rotation_grace_expires_at` set, `grace_exchange_count = 0`); `rotation_receipt` includes `grace_expires_at` + `signature` (MED-F6); audit `DEVICE_ROTATION_ACTIVATED` transactional.
- `src/lib/device-pairing/__tests__/grace-window.test.ts` — old key during grace → recovery-only (no normal MCP token); rate-limited via `grace_exchange_count` under row lock; rejection after grace expires.
- Integration lane.

**Governance/security evidence:**
- Atomic key swap in one transaction (AC-17/18, §4.6).
- `grace_exchange_count` reset to 0 at activation (MED-1 closure, §6.5).
- Grace is recovery-only — no normal MCP token mint (HIGH-F2, §6.5).
- Rate-limited per device (`ALLURA_DEVICE_GRACE_MAX_EXCHANGES`, default 5, §6.5).
- `rotation_receipt` signed by server, includes `grace_expires_at` (MED-F6, §4.6).
- No private key crosses network (NFR1).

**Rollback or failure behavior:** If signature fails, challenge not consumed, key not swapped (AC-17 — current key still valid). If idempotency match, return `ALREADY_ACTIVATED` (AC-19). If DB connection lost, PostgreSQL rolls back — no partial swap.

**Definition of Done:**
- `POST /api/device-pairing/rotation/activate` returns 200 ACTIVATED with updated receipt on valid input.
- Idempotency replay returns `ALREADY_ACTIVATED` + updated receipt.
- Atomic key swap: `current_*` = new, `pending_*` = NULL, `key_generation` incremented, `grace_expires_at` set, `grace_exchange_count = 0`.
- Grace window is recovery-only (tested in Story 29.14 / Workstream F).
- Audit transactional.
- Integration tests pass.

**Non-goals:**
- No grace-path recovery endpoint (Story 29.14).
- No concurrent rotation convergence test (Workstream F, AC-21).

---
