# Story 29.8 — Scope Derivation by Lock Mode and Demotion/Removal/Workspace-Lock Atomic Revocation

**Epic:** 29 — Desktop Device Pairing and Persistent Authentication  
**Workstream:** B — Persistent Runtime Reconnection  
**Status:** backlog  
**Planning authority:** `../planning/epic-29-desktop-device-pairing-and-persistent-authentication.md`

## User Story

As the Allura platform,
I want scope derivation to respect workspace lock mode, and demotion/removal/workspace-lock changes to atomically revoke all linked device tokens at the mutation path,
So that a demoted user's device token never retains elevated scopes, a removed membership blocks exchange immediately, and a locked-down workspace's device tokens cannot retain prior scopes — no 15-minute window.

## Outcome

When the user is demoted from admin to viewer, his next desktop exchange mints a viewer-scoped token; his previous admin-scoped device token is already revoked. When a workspace enters `full_lockdown`, all its device tokens are immediately invalid (AC-12, AC-14).

**Scope:** Implement `src/lib/device-pairing/scope-derivation.ts` — `deriveScopesForMembershipRole(role)` (shared helper, AR9) + `applyLockModeToScopes(scopes, lockMode)` per §5.2 matrix (`normal` = full role scopes; `read_only` = `["memory:read","audit:read"]`; `no_agent_writes` = role scopes minus write/delete/forget; `no_promotions` = role scopes minus promote/review; `full_lockdown` = exchange refused). Extend `src/lib/membership/repository.ts` mutation paths (`updateRole`, `removeMembership`) to atomically revoke linked device tokens via `revokeByMembershipChange()` in the same transaction. Extend `src/lib/workspaces` mutation path (`updateLockMode`) to atomically revoke via `revokeByWorkspaceLockChange()`. Add `revokeByMembershipChange(groupId, principalId)` and `revokeByWorkspaceLockChange(workspaceId)` to `src/lib/mcp-token/repository.ts`.

**Dependencies:** Story 29.1, Story 29.6

**Blocks:** Story 29.9, Story 29.18, Story 29.19, Story 29.20, Story 29.21

**Acceptance Criteria IDs:** AC-12 (demotion downscopes next token; removal blocks exchange), AC-14 (`full_lockdown` blocks exchange; restricted lock modes downscope correctly).

**Architecture/ADR references:** §5.2 (scope derivation matrix), §5.3 (curator→reviewer translation), §5.4 (atomic revocation at mutation path — consistency fix L), §2.2 (`revokeByMembershipChange`/`revokeByWorkspaceLockChange`), AD-66.

**Source code and migration touchpoints:**
- New: `src/lib/device-pairing/scope-derivation.ts` — `applyLockModeToScopes(scopes, lockMode)`.
- Extended: `src/lib/auth/scope-derivation.ts` (created in Story 29.6) — ensure `deriveScopesForMembershipRole` is the single source of truth.
- Extended: `src/lib/membership/repository.ts` — `updateRole()`, `removeMembership()` call `revokeByMembershipChange()` in same transaction.
- Extended: workspace mutation path (find via `rg "lock_mode" src/lib/`) — `updateLockMode()` calls `revokeByWorkspaceLockChange()` in same transaction.
- Extended: `src/lib/mcp-token/repository.ts` — add `revokeByMembershipChange(groupId, principalId)` and `revokeByWorkspaceLockChange(workspaceId)` (revoke `WHERE paired_device_id IN (SELECT id FROM paired_devices WHERE group_id=$1 AND principal_id=$2 AND revoked_at IS NULL)` and `... WHERE workspace_id=$1`).
- No migration changes.

**Required tests:**
- `src/lib/device-pairing/__tests__/scope-derivation.test.ts` — role + lock_mode → scopes matrix (including `curator→reviewer` translation); `full_lockdown` returns empty (exchange refused); `read_only` returns `["memory:read","audit:read"]` regardless of role; `no_agent_writes` strips write/delete/forget; `no_promotions` strips promote/review.
- `src/lib/device-pairing/__tests__/integration/membership-demotion.test.ts` — demotion downscopes next token (curator→reviewer); previous token revoked atomically in same txn; no 15-min window.
- `src/lib/device-pairing/__tests__/integration/membership-removal.test.ts` — removed membership blocks exchange + revokes tokens.
- `src/lib/device-pairing/__tests__/integration/workspace-lockdown.test.ts` — `full_lockdown` blocks; `read_only` downscopes; workspace lock change atomically revokes linked device tokens.
- `src/lib/device-pairing/__tests__/integration/demotion-atomic-revoke.test.ts` — membership role change atomically revokes linked device tokens in same txn; next exchange mints downscoped token.
- `src/lib/device-pairing/__tests__/integration/workspace-lock-atomic-revoke.test.ts` — workspace lock_mode change atomically revokes linked device tokens in same txn.
- Integration lane (real PG).

**Governance/security evidence:**
- Demotion/removal/workspace-lock changes atomically revoke device tokens at mutation path — no 15-min window (AR8, §5.4, consistency fix L).
- Device tokens bypass `CredentialCache` (AD-66) → revocation immediate on all replicas.
- `curator → reviewer` translation via shared helper (AR9, HIGH-F5).
- `group_id` on every revocation write (NFR3).
- Transactional revocation (fail-closed).

**Rollback or failure behavior:** If revocation fails, the membership/workspace mutation rolls back — the change does not take effect. Operator must retry. No partial state.

**Definition of Done:**
- `applyLockModeToScopes()` implements the full §5.2 matrix.
- `deriveScopesForMembershipRole()` used by both principal-context factory and `createDeviceToken`.
- `updateRole()` / `removeMembership()` / `updateLockMode()` atomically revoke linked device tokens.
- All integration tests pass.
- `bun run typecheck` passes.

**Non-goals:**
- No new RBAC roles (SPEC §12 non-goal).
- No change to `@allura/rbac` `ROLE_SCOPES` table.
- No non-device token revocation logic changes (device tokens only).

---
