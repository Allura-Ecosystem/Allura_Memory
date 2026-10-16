# Story 29.10 — McpAuthenticator — Bypass CredentialCache for Paired-Device Tokens + PrincipalContext Extension

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** B — Persistent Runtime Reconnection  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the MCP gateway,
I want to bypass the in-process `CredentialCache` for paired-device tokens and always hit PostgreSQL,
So that revocation of a device token is immediate on all replicas — no listener-drop window, no TTL lag, no Redis dependency.

## Outcome

When the user revokes his device, his stolen token is invalid on the very next MCP request, even if the gateway runs on multiple replicas (AC-22 partial — immediate revocation).

**Scope:** Extend `src/lib/auth/mcp-authenticator.ts` `authenticate()` — if `credentialRecord.paired_device_id !== null`, bypass `CredentialCache` and resolve from DB directly. Extend `src/lib/auth/principal-context.ts` — `pairedDeviceId` field (added in Story 29.6) is populated from the credential record; `buildAuthAuditEvent` projects `paired_device_id` in metadata (added in Story 29.6 — verify here). Verify `canRebindSession` treats `pairedDeviceId` as part of equality (a device-token credential is bound to one device; rebind across devices is a security event).

**Dependencies:** Story 29.1, Story 29.6

**Blocks:** Story 29.15, Story 29.18, Story 29.19, Story 29.20, Story 29.21

**Acceptance Criteria IDs:** AC-15 (`PrincipalContext.principalId` = human; `paired_device_id` in audit metadata — verified end-to-end through the authenticator), AC-22 (partial — device tokens bypass cache so revocation is immediate).

**Architecture/ADR references:** §2.2 (PrincipalContext extension, B5), §7 (AD-66 cache bypass), §7.3 (PG LISTEN/NOTIFY optimization only), §11.1 (`paired_device_id` in audit), AD-66.

**Source code and migration touchpoints:**
- Extended: `src/lib/auth/mcp-authenticator.ts` — `authenticate()` bypass branch for `paired_device_id IS NOT NULL`.
- Extended: `src/lib/auth/principal-context.ts` — verify `pairedDeviceId` in `canRebindSession` equality (Story 29.6 added the field; this story verifies the equality semantics end-to-end).
- No migration changes.

**Required tests:**
- `src/lib/auth/__tests__/mcp-authenticator-device-token.test.ts` — paired-device token bypasses `CredentialCache` (DB hit on every auth); revocation reflected on next request without cache clear; non-device token still uses cache (when TTL > 0); `PrincipalContext.pairedDeviceId` populated; `canRebindSession` treats device-token credential as bound to one device.
- `src/lib/auth/__tests__/principal-context-paired-device.test.ts` — `buildAuthAuditEvent` projects `paired_device_id`; `canRebindSession` equality includes `pairedDeviceId`.
- Unit + integration lane.

**Governance/security evidence:**
- Device tokens bypass cache → immediate revocation on all replicas (AD-66, §7, BLOCK-F3).
- `pairedDeviceId` in `canRebindSession` equality — rebind across devices is a security event (AR13, B5).
- `paired_device_id` in audit metadata, never the private key (AR13, §11.1).
- PG LISTEN/NOTIFY is optimization only for non-device tokens (AD-62 revised).

**Rollback or failure behavior:** If the bypass branch fails, authentication fails closed — no token accepted. The cache fallback is NOT used for device tokens (that would reintroduce the 60s window).

**Definition of Done:**
- `McpAuthenticator.authenticate()` bypasses `CredentialCache` for `paired_device_id IS NOT NULL`.
- Revocation reflected on next request without any cache clear.
- `PrincipalContext.pairedDeviceId` populated and part of `canRebindSession`.
- `buildAuthAuditEvent` projects `paired_device_id`.
- Unit + integration tests pass.

**Non-goals:**
- No PG LISTEN/NOTIFY listener implementation (that's an optimization for non-device tokens — separate concern, not required for correctness; can be deferred).
- No Redis (AD-66 eliminates the need).
- No change to non-device token cache behavior.

---
