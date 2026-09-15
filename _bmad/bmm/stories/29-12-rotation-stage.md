# Story 29.12 — Rotation Stage API — POST /api/device-pairing/rotation/stage

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** C — Automatic Device-Key Rotation  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a paired desktop bridge,
I want to stage a new public key for rotation by signing it with my current private key,
So that the server stores the pending next key and issues a rotation receipt — without activating it yet, so a crash leaves my current key usable.

## Outcome

the user's bridge creates a new keypair, signs a rotation request with the old key, and the server acknowledges — the old key still works (AC-16, AC-17).

**Scope:** Implement `src/app/api/device-pairing/rotation/stage/route.ts` — resolve `group_id` via `resolve_device_route()` → RLS; verify RFC 9421 `rotation_stage` signature against `current_public_key` (body bound via Content-Digest — includes `new_public_key`, `new_key_id`, `idempotency_key`); row-lock `paired_devices` FOR UPDATE; verify `lifecycle_state=APPROVED`; consume `device_challenges` row (purpose=`rotation_stage`); idempotency check (if `rotation_idempotency_key` matches, return existing staged state); `UPDATE paired_devices SET pending_next_public_key, pending_next_key_id, pending_next_key_algo, rotation_idempotency_key`; issue rotation receipt `{ receipt_id: "rot_<uuid>", device_id, new_key_id, issued_at, grace_expires_at: null, signature }`; audit `DEVICE_ROTATION_STAGED` (transactional); return `{ receipt_id, rotation_receipt }`.

**Dependencies:** Story 29.1, Story 29.2, Story 29.7, Story 29.9

**Blocks:** Story 29.13, Story 29.16, Story 29.18, Story 29.19, Story 29.21

**Acceptance Criteria IDs:** AC-16 (partial — rotation succeeds without Clerk; no private key crosses network — stage step), AC-19 (partial — replay stage with same idempotency key returns existing staged state).

**Architecture/ADR references:** §4.6 (stage), §6.1 (sub-state), §6.3 (idempotency), §6.4 (crash recovery), §11.1 (rotation staged audit), AD-60, AD-64.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/rotation/stage/route.ts`
- New: `src/lib/device-pairing/rotation-service.ts` — `stageRotation(input)`.
- Uses: `resolve_device_route()`, RFC 9421 verifier, `device_challenges` consume.
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/rotation-stage.test.ts` — 200 on valid stage; 401 `AUTH_EXPIRED` (challenge consumed); idempotency: replay with same `rotation_idempotency_key` returns existing staged state; 409 `NO_PENDING_KEY` not applicable here (stage creates it); 403 if device not APPROVED; audit `DEVICE_ROTATION_STAGED` transactional; `pending_next_*` set; `rotation_receipt` issued with `grace_expires_at: null`.
- `src/lib/device-pairing/__tests__/idempotency.test.ts` — replay stage/activate returns same state.
- Integration lane.

**Governance/security evidence:**
- RFC 9421 `rotation_stage` signature binds `new_public_key` via Content-Digest (AD-64, §4.6) — MITM body swap rejected.
- No private key crosses network (NFR1, AD-60).
- Idempotency key prevents duplicate staging (AC-19, §6.3).
- Transactional `insertEvent` fail-closed (NFR5).

**Rollback or failure behavior:** If signature fails, challenge not consumed. If idempotency key matches existing, return existing state (no mutation). If any step fails, transaction rolls back — `pending_next_*` not set, current key unaffected (AC-17 crash-before-activation).

**Definition of Done:**
- `POST /api/device-pairing/rotation/stage` returns 200 with receipt on valid input.
- Idempotency replay returns existing state.
- `pending_next_*` set; `rotation_idempotency_key` stored.
- Audit transactional.
- Integration tests pass.

**Non-goals:**
- No activation (Story 29.13).
- No grace window logic (Story 29.13).
- No concurrent rotation convergence test (Story 29.14 / Workstream F).

---

## Active Execution Ledger — 2026-09-10

- **Baseline:** `b94f1f35` (Story 29.7 verified commit; worktree also contains unrelated portal WIP, excluded from this story).
- **State:** implementation and final review approved; local commit pending.
- **Last receipt:** remediation closed single-use challenge enforcement, key/algorithm validation, receipt HMAC binding to staged key material, exact replay tuple matching, transactional audit persistence, and device-scoped idempotency indexing. Focused suite 15/15; disposable PostgreSQL live lane 11/11; `tsc --noEmit`, Story-scope ESLint, diff hygiene, and static credential scan pass. Independent Team RAM Codex 5.6 Terra reviewers Pike and Fowler both returned zero BLOCK/HIGH/MED approvals.
- **Next named gate:** governance-cleared local Story 29.12 commit; then advance to the next Epic 29 story.
- **Required receipts before review:** focused service/route tests, disposable PostgreSQL live-DB test, typecheck, diff hygiene, static credential scan.
- **Guard:** no commit / no push / no deploy / no secret change / no production DB mutation; exclude unrelated portal WIP.
