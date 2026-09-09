# Story 29.11 — Offline and Key-Loss Failure Behavior

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** B — Persistent Runtime Reconnection  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As a desktop bridge,
I want the bridge to show "Offline — reconnecting" when Allura is unreachable and "Device must be paired again" when the OS secure-store key is lost,
So that network failures do not prompt for Clerk, and key loss does prompt for Clerk with a clear explanation.

## Outcome

the user's laptop reboots after a network outage — the bridge reconnects automatically. When the user's OS secure store is wiped, the bridge says "Device must be paired again" and prompts Clerk (AC-04, AC-05).

**Scope:** This is a **server-contract story** — the server defines the error codes the bridge must handle (`403 AUTH_INVALID`, `403 KEY_EXPIRED`, `403 MEMBERSHIP_INACTIVE`, `403 WORKSPACE_LOCKED`, `403 DEVICE_NOT_APPROVED`, `401 AUTH_EXPIRED`) and the retry semantics. The bridge UI is implemented in the out-of-repo desktop client. Server-side: document the error code contract in `src/lib/device-pairing/error-codes.ts` (typed enum + retry guidance) and ensure all exchange/challenge error responses include a `retry_after_ms` hint and a `recovery_action` field (`"retry"` / `"re_pair"` / `"clerk_required"`).

**Dependencies:** Story 29.7, Story 29.9

**Blocks:** Story 29.18

**Acceptance Criteria IDs:** AC-04 (reboots, client updates, temporary outages, access-token expiry, successful rotation do not prompt Clerk), AC-05 (key loss, revocation, lost-device recovery, membership recovery, explicit security re-enrollment clearly prompt Clerk and explain why).

**Architecture/ADR references:** §10.1 (network failures), §10.2 (key loss), §10.3 (server-side failures), §9.3 (key persistence across updates).

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/error-codes.ts` — `DevicePairingErrorCode` enum + `recoveryAction` mapping + `retryAfterMs` guidance.
- Extended: `src/app/api/device-pairing/exchange/route.ts` (Story 29.9) — error responses include `retry_after_ms` + `recovery_action`.
- Extended: `src/app/api/device-pairing/challenge/route.ts` (Story 29.7) — same.
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/error-contract.test.ts` — every error code maps to the correct `recovery_action` (`retry` for transient, `re_pair` for key loss/revoked/lost, `clerk_required` for membership recovery / explicit re-enrollment); `retry_after_ms` bounded (cap 30s per §10.1).
- Unit lane.

**Governance/security evidence:**
- Network failures do not prompt Clerk (SPEC §9, §2).
- Key loss / revocation / lost / membership recovery / explicit re-enrollment prompt Clerk (SPEC §2, AC-05).
- No offline mutation queue (SPEC §9, §12 non-goal).
- Cached reads only as clearly marked stale data under client retention policy (SPEC §9).

**Rollback or failure behavior:** This story IS the failure behavior contract. If the contract is wrong, the bridge mishandles errors — but the server remains correct.

**Definition of Done:**
- `DevicePairingErrorCode` enum covers all error codes from §4.x.
- Every error response includes `recovery_action` + `retry_after_ms`.
- Error contract tests pass.
- `bun run typecheck` passes.

**Non-goals:**
- No bridge UI implementation in this server repository.
- No offline mutation queue (SPEC §12 non-goal).
- No client-side retry loop implementation; this story provides the server contract only.

---
