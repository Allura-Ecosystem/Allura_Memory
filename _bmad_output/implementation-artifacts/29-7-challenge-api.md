# Story 29.7 — Challenge API — POST /api/device-pairing/challenge (RLS Bootstrap)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** B — Persistent Runtime Reconnection  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a paired desktop bridge,
I want to request a single-use challenge nonce from Allura,
So that I can sign it with my enrolled private key to prove possession, with the server resolving my authoritative `group_id` without me supplying it.

## Outcome

The desktop bridge calls `/challenge` with only `device_id` + `purpose`, and receives a 60-second nonce + audience + server context — no tenant leaked, no replay possible.

**Scope:** Implement `src/app/api/device-pairing/challenge/route.ts` — call `resolve_device_route(device_id)` SECURITY DEFINER (returns `group_id` or NULL); if NULL → 403 `DEVICE_NOT_APPROVED` + audit `DEVICE_EXCHANGE_DENIED` (`group_id='allura-system'`, `agent_id='device-enrollment'`); `SET LOCAL app.current_group_id`; re-read `paired_devices` under RLS; verify `lifecycle_state=APPROVED`; validate `purpose` against device state; generate 32-byte nonce; insert `device_challenges` row (`group_id`, `purpose`, `expires_at=NOW+60s`); audit `DEVICE_CHALLENGE_ISSUED`; return `{ challenge_id, nonce, audience, purpose, server_context, expires_at }` where `server_context` contains only `{ device_id, key_generation, server_time }` (no principal/group/workspace — LOW-F1).

**Dependencies:** Story 29.1, Story 29.6

**Blocks:** Story 29.9, Story 29.11, Story 29.12, Story 29.13, Story 29.14, Story 29.16, Story 29.18, Story 29.19, Story 29.20, Story 29.21

**Acceptance Criteria IDs:** AC-09 (partial — challenge is single-use 60s, audience-bound, cannot be replayed), AC-11 (partial — server resolves group_id from device row, not client).

**Architecture/ADR references:** §4.3, §3.3 (device_challenges), §3.4a (resolve_device_route RLS bootstrap), §11.1 (challenge audit), AD-64, LOW-F1.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/challenge/route.ts`
- New: `src/lib/device-pairing/challenge-service.ts` — `issueChallenge(deviceId, purpose)`.
- Uses: `resolve_device_route()` SECURITY DEFINER (migration 063).
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/challenge-route.test.ts` — 200 on valid APPROVED device; 403 `DEVICE_NOT_APPROVED` for non-APPROVED/missing device + audit; `server_context` has no `principal_id`/`group_id`/`workspace_id` (LOW-F1); nonce is 32-byte base64url; `expires_at` = NOW+60s; audit `DEVICE_CHALLENGE_ISSUED` with `agent_id=principal_id`, `group_id=resolved_group_id`; `purpose` validated against device state (e.g., `rotation_stage` rejected if no pending key).
- `src/lib/device-pairing/__tests__/resolve-device-route.test.ts` (integration) — `resolve_device_route()` returns authoritative `group_id` for APPROVED device; NULL for REVOKED/LOST/missing; RLS bootstrap via `SET LOCAL app.current_group_id`; client-supplied tenant ignored.
- Integration lane (real PG for RLS).

**Governance/security evidence:**
- `resolve_device_route()` is SECURITY DEFINER, fixed `search_path`, returns only `group_id` — no other columns (AR4, §3.4a).
- `server_context` excludes principal/group/workspace (LOW-F1, §4.3 step 4).
- Challenge is single-use, 60s TTL, `consumed_at` tracked (AR4, §3.3).
- `group_id` on every `device_challenges` write (NFR3).
- RLS enforced on `device_challenges` (AR4).

**Rollback or failure behavior:** If `resolve_device_route()` returns NULL, return 403 + audit; no challenge row. If nonce insert fails, return 500; no partial state. Bridge retries.

**Definition of Done:**
- `POST /api/device-pairing/challenge` returns 200 with challenge payload on valid APPROVED device.
- 403 for non-APPROVED devices with audit.
- `server_context` contains no tenant/principal identity.
- RLS bootstrap works end-to-end.
- Integration tests pass.

**Non-goals:**
- No `/exchange` (Story 29.9).
- No signature verification here (that happens at `/exchange`).
- No token mint (Story 29.9).

---

## Active Execution Ledger — 2026-09-09

- **Baseline:** `eefdc560` (Story 29.6 verified local commit).
- **State:** done — verified local checkpoint pending; no shared Allura stack touched.
- **Last receipt:** disposable `pgvector:pg16` containers (unique name, loopback-only port `55432`, tmpfs data, random one-run credentials, auto-removed) caught two real defects and prove the final RLS contract. RED/GREEN 1: authoritative `app.current_workspace_id` + `app.current_principal` now follow the row-locked approved-device reread before audited writes. RED/GREEN 2: unresolved device denial now writes only a fixed-identity, `failed` `DEVICE_EXCHANGE_DENIED` event through migration 067; `PUBLIC` has no execute grant. Final receipts: route/service 7/7, isolated live PostgreSQL 2/2, broader 293 passed/25 expected live skips, TypeScript/diff/credential scan clean, and production build green (59 pages).
- **Review receipt:** initial independent review rejected the denial path; remediation review approved with 0 BLOCK/HIGH/MED. Two non-blocking evidence/metadata notes were resolved; a remaining TOCTOU observation is defense-in-depth, with the authoritative locked reread failing closed.
- **Next named gate:** create the verified local Git checkpoint, complete the Story 29.7 Kanban card, then dispatch the dependency-ready Story 29.8 worker.
- **Required receipts before review:** focused suite, live DB suite, typecheck, diff hygiene, static scan, build.
- **Review/commit gate:** independent BMAD review with no BLOCK/HIGH/MED; governance check; local commit only. No push, deploy, secret change, or production DB mutation.
- **Loop control:** a green slice is not a response boundary; execute the next named gate immediately unless Sabir explicitly stops or a real blocker occurs.
