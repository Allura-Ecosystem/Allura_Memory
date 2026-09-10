# Story 29.14 — Grace-Path Recovery Endpoint — Old-Key Recovery-Only During Grace Window

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** C — Automatic Device-Key Rotation  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a paired desktop bridge that crashed after rotation activation and lost the receipt,
I want to recover using my old key during the bounded grace window,
So that I can re-pair or re-issue a rotation receipt — but I cannot mint normal runtime MCP access with the old key.

## Outcome

the user's bridge crashes after activation, loses the receipt, and on restart the new key is unreadable. the user's old key (within 24h grace) can call `/recovery` to get a rotation-receipt re-issue or a `403 RECOVERY_REQUIRED` telling him to re-pair — but cannot access MCP (AC-18, HIGH-F2).

**Scope:** Implement `src/app/api/device-pairing/recovery/route.ts` (purpose=`recovery_status`) — accept exactly signed `{ device_id, receipt_id }`; resolve `group_id` → RLS; verify RFC 9421 `recovery_status` signature using only the server-HMAC-authenticated old key material retained in the activated receipt; require the supplied receipt ID to match that authenticated receipt; row-lock `paired_devices`; check `grace_exchange_count < ALLURA_DEVICE_GRACE_MAX_EXCHANGES` (default 5) under row lock; increment `grace_exchange_count`; if grace expired → 403 `KEY_EXPIRED`; return the public-safe persisted activation receipt with `{ status: RECOVERED }`. **Decision: no recovery bearer token is issued.** The old key gets no MCP, role, or reusable API credential; it can only obtain the re-issued receipt through a declared proof-of-possession route. Audit `DEVICE_ROTATION_RECOVERED` with `metadata.recovery=true, via="grace"` (transactional).

**Dependencies:** Story 29.2, Story 29.7, Story 29.13

**Blocks:** Story 29.16, Story 29.18, Story 29.19, Story 29.21

**Acceptance Criteria IDs:** AC-18 (crash after activation can complete from rotation receipt/grace path without Clerk).

**Architecture/ADR references:** §6.5 (grace recovery-only), §4.4 step 9 (key_generation mismatch routes to grace), §11.1 (rotation recovered audit), AD-60, HIGH-F2.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/recovery/route.ts`
- Extended: `src/lib/device-pairing/rotation-service.ts` — `recoverViaGrace(input)`.
- Extended: `src/lib/device-pairing/challenge-service.ts` — server-authenticated prior-generation recovery challenges.
- No migration changes and no recovery bearer-token scope.

**Required tests:**
- `src/lib/device-pairing/__tests__/grace-recovery.live-db.test.ts` — real stage → activate → recovery challenge issuer → old-key proof; exact 9-component signature coverage; no public old-key material; stored HMAC-authenticated receipt validates; six parallel valid proofs at max five yield five recoveries and one `GRACE_LIMIT_EXCEEDED`.
- Integration lane (real PG).

**Governance/security evidence:**
- Grace is recovery-only — no normal MCP token (HIGH-F2, §6.5).
- Rate-limited per device (`grace_exchange_count` under row lock, default 5, §6.5).
- `grace_exchange_count` checked + incremented atomically (MED-1 closure).
- No recovery bearer token or normal MCP token is issued.
- Transactional `insertEvent` fail-closed (NFR5).
- No private key crosses network (NFR1).

**Rollback or failure behavior:** If grace expired, 403 `KEY_EXPIRED` — must re-pair via Clerk. If rate limit exceeded, 429 `GRACE_LIMIT_EXCEEDED` — must re-pair. If signature fails, challenge not consumed.

**Definition of Done:**
- `POST /api/device-pairing/recovery` returns the public-safe persisted activation receipt on valid old-key signature within grace.
- Old key cannot mint normal MCP access.
- Rate limit enforced via `grace_exchange_count`.
- Audit transactional.
- Integration tests pass.

**Non-goals:**
- No normal MCP token mint via grace (HIGH-F2).
- No extension of grace window beyond 72h.
- No bypass of rate limit.

---

## Active Execution Ledger — 2026-09-10

- **Baseline:** `3c231dc4` (Story 29.13 activation).
- **State:** done; receipt-bound recovery contract restored and final-review approved. Local commit pending; no push, deployment, secret change, or production DB mutation.
- **Receipt:** focused 29.12–29.14 unit/route/config/manifest regressions 42/42; `POSTGRES_USER=ronin4life` live stage+activate+recovery inventory 13/13; `bun run typecheck`; scoped ESLint; `git diff --check` all green.
- **Security proof:** public activation/recovery receipts omit `old_public_key` and `old_key_algo`; stored JSONB retains HMAC-authenticated old-key verification material; recovery challenge advertises server-derived prior generation; exact nine-component proof coverage; six parallel proofs at max five produced five recoveries, one `GRACE_LIMIT_EXCEEDED`, counter/audits 5, and zero MCP tokens.
