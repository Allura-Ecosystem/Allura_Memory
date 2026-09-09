# Story 29.6 — Complete API — POST /api/device-pairing/complete (OAuth Authorization Code Redemption + pairing_complete Proof)

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** A — Pair a Desktop Device  
**Status:** done
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a desktop bridge,
I want to redeem the authorization code + PKCE verifier + completion nonce + RFC 9421 signed proof at `/complete`,
So that the server creates a `paired_devices` row (APPROVED, all authority NOT NULL), mints my first short-lived MCP token, and marks the enrollment consumed — in one atomic transaction.

## Outcome

the user's desktop client receives the callback, calls `/complete`, and gets back `{ device_id, access_token, expires_at, mcp_endpoint }` — pairing is complete, the desktop can connect to MCP (AC-01, AC-06, AC-09).

**Scope:** Implement `src/app/api/device-pairing/complete/route.ts` — call `device_enrollment_lock_for_complete()`; hash presented code + match `authorization_code_hash`; verify `completion_nonce` + expiry; verify PKCE S256 (`BASE64URL(SHA256(verifier)) == stored pkce_code_challenge`); verify RFC 9421 `pairing_complete` signature (Story 29.2) with `x-allura-nonce=completion_nonce`, `x-allura-proof-id=enroll_<uuid>`; revalidate membership/workspace; acquire advisory lock + re-check device limit; INSERT `paired_devices` (APPROVED, all authority from `approved_*` columns); mint first MCP token via `createDeviceToken()` (`agent_name=approved_principal_id`); audit `DEVICE_PAIRING_COMPLETE` (transactional); call `device_enrollment_consume()`; all in one transaction.

**Dependencies:** Story 29.1, Story 29.2, Story 29.3, Story 29.5

**Blocks:** Story 29.7, Story 29.8, Story 29.9, Story 29.10, Story 29.16, Story 29.18, Story 29.19, Story 29.20, Story 29.21

**Acceptance Criteria IDs:** AC-06 (private key in OS store; server stores only public key — verified via RFC 9421 signature), AC-08 (PKCE + state binding completed at `/complete`), AC-09 (copied device ID/public key/callback URL/consumed challenge cannot mint access — `/complete` requires the private key to sign the RFC 9421 proof).

**Architecture/ADR references:** §4.2b, §3.1 (`lock_for_complete`/`consume`), §3.1b (`paired_devices` INSERT), §3.2 (`createDeviceToken` + DEFERRABLE trigger), §4.2c (advisory lock re-check), §4.4 (RFC 9421 `pairing_complete`), §16.1, AD-60, AD-61, AD-64, AD-65, AD-66.

**Source code and migration touchpoints:**
- New: `src/app/api/device-pairing/complete/route.ts`
- New: `src/lib/device-pairing/complete-service.ts` — `completePairing(input)` orchestrates the full transaction.
- Extended: `src/lib/mcp-token/repository.ts` — add `createDeviceToken(input)` variant: `agent_name` derived from locked `paired_devices.principal_id` (never client-supplied), `paired_device_id` set, scopes derived via `deriveScopesForMembershipRole(role)` filtered by lock mode (wired in Story 29.8; this story mints with `normal` mode scopes).
- Extended: `src/lib/auth/principal-context.ts` — add optional `pairedDeviceId?: string` field; add `pairedDeviceId` to `canRebindSession` equality; project `paired_device_id` in `buildAuthAuditEvent` metadata (AR13, B5).
- New: `src/lib/auth/scope-derivation.ts` — `deriveScopesForMembershipRole(role)` shared helper (AR9, HIGH-F5); refactor existing `principal-context.ts:212` to use it.
- Uses: Story 29.2 (`verifyDeviceSignature`), Story 29.3 (`verifyPkceS256`, `hashAuthorizationCode`).

**Required tests:**
- `src/lib/device-pairing/__tests__/complete-route.test.ts` — 200 on valid completion; 404 `ENROLLMENT_NOT_FOUND`; 410 `ENROLLMENT_EXPIRED` / `CODE_EXPIRED` / `COMPLETION_NONCE_EXPIRED`; 400 `INVALID_CODE` / `COMPLETION_NONCE_MISMATCH` / `PKCE_MISMATCH` + audit `DEVICE_ENROLL_DENIED`; 401 `AUTH_INVALID` (RFC 9421 signature fails) + audit; 403 `MEMBERSHIP_INACTIVE` (revalidation fails) + audit; 409 `DEVICE_LIMIT_EXCEEDED` (count changed between approve and complete); `paired_devices` row created with all authority NOT NULL; first MCP token has `agent_name=principal_id`, `paired_device_id` set; audit `DEVICE_PAIRING_COMPLETE` transactional; enrollment state = CONSUMED.
- `src/lib/device-pairing/__tests__/complete-route.test.ts` and `complete-route-rfc9421.test.ts` — typed route errors/audits plus real ECDSA P-256 and RSA-PSS `pairing_complete` proof vectors. `src/lib/device-pairing/__tests__/completion-transaction.live-db.test.ts` (real PostgreSQL) replaces the planned `authorization-code-redeem.test.ts` integration name: it proves commit/replay, token-mint rollback, and completion-audit rollback.
- Integration lane (real PG for transactional assertions).

**Governance/security evidence:**
- `paired_devices` all authority NOT NULL by construction — INSERT uses `approved_*` columns (AR2, BLOCK-F1).
- `agent_name = paired_devices.principal_id` enforced by DEFERRABLE trigger at COMMIT (AR3, B6).
- PKCE verifier presented only here, from bridge memory — never from URL/browser (AD-65, §8.2).
- RFC 9421 `pairing_complete` proof binds the exact `/complete` request + `completion_nonce` (AD-64, §4.4).
- `PrincipalContext.pairedDeviceId` added to `canRebindSession` equality (AR13, B5).
- `deriveScopesForMembershipRole(role)` shared helper handles `curator → reviewer` translation (AR9, HIGH-F5).
- Transactional `insertEvent` fail-closed (NFR5).
- Device limit re-checked under advisory lock at `/complete` (HIGH-F4, §4.2c).

**Rollback or failure behavior:** If any step fails (code mismatch, PKCE mismatch, signature fail, membership inactive, device limit), the entire transaction rolls back — no `paired_devices` row, no token, enrollment stays APPROVED (or flips to EXPIRED if code/nonce expired). Bridge can retry if state allows; otherwise must re-enroll.

**Definition of Done:**
- `POST /api/device-pairing/complete` returns 200 with `device_id`, `access_token`, `expires_at`, `mcp_endpoint` on valid input.
- `paired_devices` row created with `lifecycle_state=APPROVED`, all authority NOT NULL, `enrollment_id` set (audit correlation, not FK).
- First MCP token minted with `agent_name=principal_id`, `paired_device_id` set.
- `PrincipalContext` carries `pairedDeviceId`; `canRebindSession` reflects it.
- `deriveScopesForMembershipRole()` shared helper used by both principal-context factory and `createDeviceToken`.
- Enrollment state = CONSUMED, `consumed_at` + `authorization_code_consumed_at` set.
- Audit `DEVICE_PAIRING_COMPLETE` inserted transactionally.
- Integration tests pass.

## Active Execution Ledger — 2026-09-09

- **Baseline:** `4a2dd796` (Story 29.5 verified local commit).
- **State:** done — final independent review approved and governance passed. Local commit is the final story artifact; no push, deployment, secret change, or production database action is authorized.
- **Last receipt:** final acceptance is green: 286 focused tests passed (23 expected live skips), TypeScript and diff hygiene passed, and static added-line scan found no hardcoded secrets, bare dynamic execution, shell invocation, or unsafe deserialization. Disposable PostgreSQL app-role tests are 5/5 green: success/replay, post-transaction-start expiry, two-pool concurrent redemption (exactly one commit), token-mint rollback, and completion-audit rollback. Auth audit persistence (93/93), completion service (17/17), and RFC/route vectors (17/17) remain green.
- **Review:** final independent BMAD review APPROVED with no BLOCK/HIGH/MED; one LOW unreachable route fallback deferred to later cleanup.
- **Governance:** local-only commit passed all six invariants.
- **Next story:** 29.7 — challenge API; no retrospective until Epic 29 closes.

**Non-goals:**
- No `/challenge` or `/exchange` (Story 29.7, 2.2).
- No rotation endpoints (Workstream C).
- No revocation (Workstream D).
- No cache bypass wiring in `McpAuthenticator` (Story 29.10 — but the token is minted here with `paired_device_id` so the bypass will apply).

---
