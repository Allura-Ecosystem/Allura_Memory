# Story 29.15 — Revocation and Mark-Lost APIs

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** D — Device Revocation and Recovery  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a human principal or tenant admin,
I want to revoke or mark lost a paired device,
So that the device is permanently terminal, all its linked MCP tokens are immediately invalid on all replicas, all future exchanges are blocked, and a replacement requires a new Clerk-mediated pairing.

## Outcome

the user reports his laptop stolen. An admin marks it LOST. The device's tokens are invalid on the next MCP request (bypass cache — AD-66), and no new exchange can mint a token. the user must re-pair a replacement via Clerk (AC-22, AC-23).

**Scope:** Implement `src/app/api/device-pairing/revoke/route.ts` and `src/app/api/device-pairing/mark-lost/route.ts` — authority check (`user_initiated`: `AuthUser.id == paired_devices.principal_id`; `admin_initiated`: AuthUser is admin of device's `group_id`); row-lock `paired_devices` FOR UPDATE; if `lifecycle_state IN ('REVOKED','LOST')` → return `ALREADY_REVOKED`; UPDATE `lifecycle_state='REVOKED'` (or `'LOST'`), `revoked_at`/`lost_at=NOW()`; revoke all linked tokens (`UPDATE mcp_tokens SET revoked_at=NOW() WHERE paired_device_id=$1 AND revoked_at IS NULL`); `pg_notify('device_cache_invalidation', ...)` (optimization for non-device tokens only — device tokens bypass cache); audit `DEVICE_REVOKED` / `DEVICE_MARKED_LOST` (transactional fail-closed); all in one transaction. Also implement `GET /api/device-pairing/devices` (list caller's approved devices — `AuthUser.id` is the principal filter, client cannot list another user's devices).

**Dependencies:** Story 29.1, Story 29.10

**Blocks:** Story 29.16, Story 29.18, Story 29.19, Story 29.21

**Acceptance Criteria IDs:** AC-22 (revocation/loss immediately blocks new exchanges and invalidates all linked access tokens and caches), AC-23 (a revoked/lost device cannot be restored; replacement requires a new pairing).

**Architecture/ADR references:** §4.7, §3.1b (terminal CHECK constraint), §7 (AD-66 — device tokens bypass cache), §16.3, §11.1 (revoke/lost audit), AD-66.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/revoke/route.ts`
- New: `src/app/api/device-pairing/mark-lost/route.ts`
- New: `src/app/api/device-pairing/devices/route.ts` (GET — list caller's approved devices)
- New: `src/lib/device-pairing/revocation-service.ts` — `revokeDevice(input)`, `markLostDevice(input)`, `listDevicesForPrincipal(principalId)`.
- Uses: `src/lib/mcp-token/repository.ts` (revoke `WHERE paired_device_id`).
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/revocation.test.ts` (integration) — revoke → tokens revoked, device tokens immediate (AD-66 — bypass cache, no listener-drop window), new exchanges blocked (`lifecycle_state=REVOKED` → 403), audit `DEVICE_REVOKED` transactional; `ALREADY_REVOKED` for terminal device; authority check: user can revoke own device, admin can revoke within their `group_id`, cross-tenant admin rejected.
- `src/lib/device-pairing/__tests__/mark-lost.test.ts` — same for LOST + `DEVICE_MARKED_LOST` audit.
- `src/lib/device-pairing/__tests__/devices-list.test.ts` — `GET /devices` returns only caller's approved devices; cross-user listing rejected.
- `src/lib/device-pairing/__tests__/terminal-irreversibility.test.ts` — revoked/lost device cannot transition back to APPROVED; replacement requires new pairing (new enrollment → approve → complete).
- Integration lane (real PG).

**Governance/security evidence:**
- Revocation/loss atomically: marks device terminal + revokes all linked tokens + invalidates caches + rejects new exchanges/rotations + audit (SPEC §8, AC-22).
- Device tokens bypass cache → immediate on all replicas (AD-66, §7).
- `REVOKED` and `LOST` are terminal — CHECK constraint `lifecycle_state IN ('APPROVED','REVOKED','LOST')` (AR2, §3.1b).
- A lost/revoked device cannot be restored — recovery creates a new pairing (SPEC §8, AC-23).
- Audit without credential material (NFR1, §11.1).
- Transactional `insertEvent` fail-closed (NFR5).
- Authority check: user can revoke own; admin can revoke within tenant (SPEC §8).

**Rollback or failure behavior:** If authority check fails, 403 + no mutation. If audit fails, transaction rolls back — device stays APPROVED (fail-closed means the security decision doesn't take effect without the audit; operator must retry). If DB connection lost, PostgreSQL rolls back.

**Definition of Done:**
- `POST /api/device-pairing/revoke` and `/mark-lost` return 200 on valid authority.
- All linked tokens revoked atomically.
- `lifecycle_state` terminal; no restore path.
- New exchanges blocked (403).
- Audit transactional.
- `GET /api/device-pairing/devices` returns only caller's devices.
- Integration tests pass.

**Non-goals:**
- No device restore (AC-23 — terminal).
- No PG LISTEN/NOTIFY listener implementation (optimization for non-device tokens only; not required for device-token correctness).
- No admin cross-tenant revocation (SPEC §8 — admin only within authorized tenant/workspace).

---
