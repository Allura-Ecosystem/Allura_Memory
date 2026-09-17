# Story 29.9 — Exchange API — POST /api/device-pairing/exchange (Atomic Token Mint with Authority Resolution)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** B — Persistent Runtime Reconnection  
**Status:** done  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a paired desktop bridge,
I want to exchange a signed challenge for a short-lived MCP token,
So that I can connect to the MCP gateway as my human principal, with scopes derived from my current membership role and workspace lock mode, and at most one active token for my device at any time.

## Outcome

the user reboots, the desktop bridge calls `/exchange`, and Allura mints a fresh 15-minute token — no Clerk prompt (AC-03, AC-04, AC-11, AC-15).

**Scope:** Implement `src/app/api/device-pairing/exchange/route.ts` — resolve `group_id` via `resolve_device_route()` → `SET LOCAL app.current_group_id`; verify RFC 9421 `exchange` signature (Story 29.2) against `current_public_key`; in one transaction: row-lock `paired_devices` FOR UPDATE; verify `lifecycle_state=APPROVED`; consume `device_challenges` row (single-use); resolve current membership (`removed_at IS NULL`); if missing → revoke all device tokens + 403 `MEMBERSHIP_INACTIVE`; resolve workspace + `lock_mode`; derive scopes via `deriveScopesForMembershipRole(role)` filtered by lock mode (§5.2); if `full_lockdown` → 403 `WORKSPACE_LOCKED` + audit; revoke previous active token for device; mint new token via `createDeviceToken()` (`agent_name=principal_id`, scopes, `paired_device_id`); update `last_exchange_at`; audit `DEVICE_EXCHANGE_ALLOWED` (transactional fail-closed); commit.

**Dependencies:** Story 29.1, Story 29.2, Story 29.6, Story 29.7, Story 29.8

**Blocks:** Story 29.11, Story 29.12, Story 29.16, Story 29.18, Story 29.19, Story 29.20, Story 29.21

**Acceptance Criteria IDs:** AC-03 (later startups reconnect without Clerk), AC-04 (partial — access-token expiry triggers exchange, no Clerk), AC-11 (exchange derives principal/tenant/workspace/role/scopes/lock from server records), AC-13 (cross-tenant and cross-workspace selectors fail closed — client never supplies them), AC-14 (partial — `full_lockdown` blocks; restricted modes downscope), AC-15 (`PrincipalContext.principalId` = human; `paired_device_id` in audit).

**Architecture/ADR references:** §4.5, §4.4 (RFC 9421 exchange), §3.4a (RLS bootstrap), §5.1 (authority resolution), §5.2 (scope derivation), §5.5 (cross-tenant rejection), §11.1 (exchange audit), AD-60, AD-64, AD-66.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/exchange/route.ts`
- New: `src/lib/device-pairing/exchange-service.ts` — `exchangeToken(input)` orchestrates the full transaction.
- Uses: `resolve_device_route()`, `createDeviceToken()` (Story 29.6), `deriveScopesForMembershipRole()` (Story 29.6 / 2.3).
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/exchange-route.test.ts` — 200 on valid exchange; 401 `AUTH_EXPIRED` (challenge consumed/expired); 403 `WORKSPACE_LOCKED` (`full_lockdown`) + audit `DEVICE_EXCHANGE_DENIED`; 403 `MEMBERSHIP_INACTIVE` (membership removed → tokens revoked); token `agent_name=principal_id`, `paired_device_id` set, scopes = `deriveScopesForMembershipRole(role)` filtered by lock mode; previous token revoked; audit `DEVICE_EXCHANGE_ALLOWED` transactional; `PrincipalContext.principalId` = human.
- `src/lib/device-pairing/__tests__/cross-tenant.test.ts` (integration) — client-supplied tenant selector ignored; server uses only device row's `group_id`/`workspace_id`.
- Integration lane.

**Governance/security evidence:**
- Authority resolved server-side from current records (AC-11, §5.1).
- Client never supplies `group_id`/`workspace_id` (AC-13, §5.5).
- `full_lockdown` blocks; restricted modes downscope (AC-14, §5.2).
- `agent_name = principal_id` (AC-15, DEFERRABLE trigger backstop).
- Transactional `insertEvent` fail-closed (NFR5).
- Previous token revoked in same transaction as new token mint (AC-20 prep, §4.5).

**Rollback or failure behavior:** If signature fails, challenge not consumed (rolled back). If membership missing, tokens revoked + 403. If any step fails, entire transaction rolls back — no partial token, challenge stays unconsumed (bridge can retry). If DB connection lost mid-transaction, PostgreSQL rolls back.

**Definition of Done:**
- `POST /api/device-pairing/exchange` returns 200 with `access_token`, `expires_at`, `mcp_endpoint` on valid signed challenge.
- Authority resolved from current server records.
- `full_lockdown` blocks; restricted lock modes downscope.
- Previous active token revoked atomically with new token mint.
- Audit `DEVICE_EXCHANGE_ALLOWED` transactional.
- Integration tests pass.

**Non-goals:**
- No rotation (Workstream C).
- No revocation endpoint (Workstream D).
- No cache bypass wiring in `McpAuthenticator` (Story 29.10).
- No offline mutation queue (SPEC §9, §12 non-goal).

---
