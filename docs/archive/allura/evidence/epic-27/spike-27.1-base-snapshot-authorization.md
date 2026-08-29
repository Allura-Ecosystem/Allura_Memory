# Spike 27.1 — Authorized-Base-Snapshot Contract Against Existing Allura Authorization Seams

> ⚠️ **SPIKE — DESIGN ONLY. NOT IMPLEMENTATION.**
> This note does not change `src/`, adds no migration, and executes nothing. It is the
> bounded experiment-first first step of Epic 27: a design probe for Story 27.1 that maps
> the epic's authorized-base-snapshot invariant onto authorization machinery that exists at
> HEAD (`cb16f1a8`, branch `develop`). Decisions here are hypotheses for Story 27.2+ to
> implement and for Story 27.6 to gate.

## 1. Spike scope and non-goals

**In scope:** where the "branch inherits only from an authorized base snapshot" check would
hang on existing seams; which seam answers which part of the check (auth → tenant →
workspace-scope → base-record authority); whether branch state can live as tenant-scoped
tables/views under the single PostgreSQL authority; an honest list of planning-doc-vs-code
conflicts.

**Non-goals (explicit):** no dependency adoption, no AgenticOW/AgentDB recon (Story 27.2),
no branch mechanics, no promotion adapter (Story 27.3), no schema DDL, no runtime code, no
reconciling the conflicts found — conflicts are *reported* to the epic owner (Brooks), not
resolved here.

## 2. The contract a fork request must satisfy (restated from planning invariants 1, 2, 6)

At fork time the request supplies a candidate base snapshot identified by:

- `group_id` (tenant; `^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$` per migration 19 and
  `src/lib/validation/group-id.ts`),
- `workspace_id` (sub-scope *within* the tenant — ADR-001; never a tenant of its own),
- base revision (content-addressed snapshot id/hash),
- plus the future branch identities `task_id` and `agent_id` (invariant 1's remaining
  components become the branch row, not the fork check).

The fork check is: **the base snapshot must exist, must be authorized for the requesting
principal, and must belong to the same group_id + workspace_id as the request.** Any of
tenant, workspace, or base-record mismatch ⇒ fail closed.

## 3. Seam mapping (verified against HEAD code)

### 3.1 Identity and roles — `PrincipalContext` (`src/lib/auth/principal-context.ts`)

- `PrincipalContext` carries `principalId`, `workspaceId?`, `tenantIds[]`, `roles[]`
  (`viewer`/`curator`/`admin`), `scopes[]`, `authMethod` (`mcp_token` | `service_identity` |
  `web_session` | `dev_local`). The module docstring states the IRON LAW: every field
  originates from a *verified credential*, and tool arguments are *selectors that never
  grant authority*.
- **The fork request's `group_id`/`workspace_id` are selectors.** Authority is
  `tenantIds` ∩ `workspaceId` ∩ `roles`/`scopes`. A fork for a tenant outside
  `tenantIds` ⇒ `TENANT_MISMATCH` (403); a role short of `curator`/`admin` where
  branch-create is gated ⇒ `ROLE_INSUFFICIENT` (403); missing scope ⇒ `SCOPE_INSUFFICIENT`
  (403). These reason codes are stable and already surface in audit events — the fork check
  should reuse them rather than invent new codes.

### 3.2 Effective-tenant seam — `resolveApiTenant` (Story 24.12, `src/lib/auth/api-auth.ts` + `web-principal.ts`)

- Story 24.12 established the single seam returning a discriminated 400/401/403/ok with **no
  protected-route `allura-system` fallback**. The fork endpoint's first authorization hop
  should be exactly this seam: malformed selector → 400 `INVALID_GROUP_ID`, missing identity
  → 401, foreign tenant → 403 `TENANT_MISMATCH`, matching → ok.
- Workspace scope then layers on: `PrincipalContext.workspaceId` (bound at credential
  verification — see Bumblebee `inject-context.ts`, ADR-001: `group_id` + `workspace_id` +
  `scopes` come ONLY from the validated token) must equal the base snapshot's `workspace_id`;
  a workspace bound to the token is verified, a workspace in the request body is a selector.

### 3.3 Workspace governance — `workspaces.lock_mode` (migration 27)

- `workspaces` (migration 27) has `lock_mode` ∈ `normal | read_only | no_agent_writes |
  no_promotions | full_lockdown`, and workspace is unambiguously a sub-scope column, not a
  tenant. The spike's hypothesis: branch *creation* is blocked under `read_only` and
  `full_lockdown`; *fork writes* under `no_agent_writes`; *promotion proposals* under
  `no_promotions`; `normal` allows all. This reuses an existing governance surface rather
  than minting a parallel branch-policy table.

### 3.4 Row-level enforcement — tenant RLS (migration 36)

- Migration 36 RLS-enforces ≥30 tenant tables on `group_id = current_setting('app.current_group_id', true)`
  with `FOR ALL ... TO allura_app`. Any new branch/base-snapshot tables (see §4) must be
  added to this model with the same transaction-local setting (the skill's RLS alignment
  pitfall: use exactly `app.current_group_id`, forward/backward-compatible helpers set both
  it and `app.current_tenant`). RLS answers "same tenant" for branch rows; the *workspace*
  dimension stays at the API/CHECK layer per ADR-001, so the workspace check must live in
  query predicates/CHECK constraints, not in a second RLS axis.
- `mcp_tokens` and `memberships` already carry their own policies; the fork endpoint's
  credential path is already tenant-scoped.

## 4. Where branch state would live (no second memory authority)

Hypothesis for Story 27.2/27.3 to validate — **all branch state inside the existing
PostgreSQL authority, tenant-scoped, RLS-compatible:**

- **`branch_registry` (new, tenant-scoped):** one row per branch; columns
  `branch_id`, `group_id`, `workspace_id`, `task_id`, `agent_id`, `base_snapshot_id`,
  `branch_revision`, `status` (check against planning invariant 8: include
  `degraded|expired|rejected|quarantined|rolled_back` in addition to `active`),
  `created_by`, `created_at`, `retention_expires_at` (unbounded retention is explicitly out
  of scope). This table *describes* branches; it is not a memory authority.
- **`base_snapshots` (new, tenant-scoped):** rows for authorized bases —
  `snapshot_id`, `group_id`, `workspace_id`, `base_revision`, `source_table`/`row_range`
  or a `state_hash` over the referenced canon, `authorized_by`, `authorized_at`. The
  planning doc's invariant 2 ("inherits only from an authorized base snapshot") becomes a
  **foreign-key + authorized-by join**, not a rule enforced in application code.
- **Existing tables to lean on, not duplicate:** `checkpoints` (migration 03) already
  stores `group_id`, `state_hash`, `event_count`, `witness_log_count` for deterministic
  replay — a candidate carrier for the *base-state hash* half of a base snapshot; 
  `allura_memories` remains the sole canonical semantic store (no shadow store);
  `promotion_proposals` + `approval_transitions` (migration 06) remain the only promotion
  path, which Story 27.3 will feed with diffs.
- **Views, not a second authority:** a read-only view over canon + branch delta tables
  (e.g. `branch_read_through`) keeps "read-through" semantics without copying canonical data.
  Nothing in this design gives a branch the ability to mutate canon — branch deltas are
  records keyed by branch_id, and promotion is the only path that folds deltas into canon.

## 5. Fail-closed enumeration (design targets for the 27.2/27.6 tests)

| Case | Expected | Seam |
|---|---|---|
| Fork with `group_id` outside principal's `tenantIds` | 403 `TENANT_MISMATCH` | `resolveApiTenant` / PrincipalContext |
| Fork with `workspace_id` ≠ token-bound workspace | 403 (selector vs. verified mismatch) | PrincipalContext.workspaceId + inject-context |
| Base snapshot id not present in `base_snapshots` | 404/403, no row created | base_snapshots lookup |
| Base snapshot in different group/workspace | 403, no row created | RLS predicate + workspace predicate |
| Workspace `lock_mode` blocks the operation | 403/409, no row created | workspaces.lock_mode |
| Role/scope too weak for branch create | 403 `ROLE_INSUFFICIENT`/`SCOPE_INSUFFICIENT` | PrincipalContext |
| Client-supplied scope/role claiming authority | Ignored (selectors never grant) | PrincipalContext construction |
| Branch past `retention_expires_at` or expired | status `expired`, reads blocked | branch_registry status/expiry |
| Branch poisoned after review | status `quarantined` (or `rejected`/`rolled_back`), no promotion possible | branch_registry + 27.3 adapter |

## 6. Planning-vs-code conflicts noted honestly (NOT resolved by this spike)

1. **The "authorized base snapshot" concept does not exist in canon at HEAD.** There is no
   `base_snapshots` table, no `branch_registry`, and no fork endpoint. The planning doc's
   invariant 2 describes a contract to be created; this spike's §4 is the proposal for where
   it lands. The closest existing artifacts are `checkpoints` (replay checkpoints: event
   counts/state hashes) and `witness_logs`, which are replay-focused, not branch bases.
2. **`workspace_id` in the planning doc's branch identity vs. ADR-001 semantics.** The doc
   lists `workspace_id` as a branch-identity component; the codebase treats workspace as a
   sub-scope column that never becomes its own tenant. Consistent, but the Epic 27 branch
   tables must preserve that sub-scope discipline (workspace checks at API/CHECK layer, RLS
   only on group_id) or they will contradict ADR-001.
3. **Planning doc's draft story table vs. the derived Story Map.** The planning doc still
   carries its original seven draft story rows (27.1 upstream recon … 27.7 gate) with
   different 27.1/27.2/27.3 meanings. The new `## Story Map` section names 27.1 as the
   base-snapshot-authorization spike (this spike) and re-merges draft rows; the doc now
   contains two numbering schemes. The Story Map explicitly declares itself operative, and
   draft rows are retained for provenance — but this dual numbering is a doc-level
   inconsistency for the epic owner to ratify.
4. **No AgenticOW dependency exists at HEAD** (checked: no agenticow package or integration
   in the tree). The Product boundary's "AgenticOW may provide disposable
   branch/checkpoint/diff mechanics" is therefore forward-looking; nothing executes in
   Stories 27.1 or 27.2 recon until a pinned revision is adopted there.

## 7. Verification receipts (for this spike's claims)

- `src/lib/auth/principal-context.ts` — PrincipalContext fields, IRON LAW docstring,
  reason codes (`TENANT_MISMATCH`, `ROLE_INSUFFICIENT`, `SCOPE_INSUFFICIENT`),
  `PRINCIPAL_ROLES = ["viewer","curator","admin"]`.
- `src/lib/auth/api-auth.ts` + `src/lib/auth/web-principal.ts` — `resolveApiTenant` seam
  (Story 24.12 file `_bmad/bmm/stories/24-12-effective-tenant-authority-seam.md`).
- `src/lib/guard/inject-context.ts` — ADR-001: scope derived from validated token only.
- `docker/postgres-init/27-workspaces.sql` — `workspaces` table + `lock_mode` values.
- `docker/postgres-init/36-tenant-rls.sql` — RLS policy model on `app.current_group_id`,
  table list, `app.current_principal()`.
- `docker/postgres-init/06-promotion-proposals.sql` — `promotion_proposals` +
  `approval_transitions` (only promotion path).
- `docker/postgres-init/03-witness-logs.sql` — `checkpoints` (base-state-hash candidate).
- `docker/postgres-init/16-ruvector-memories.sql` — `allura_memories` (sole canonical store).
- `_bmad/bmm/planning/epic-27-governed-branchable-learning-memory.md` — invariants 1–8,
  out-of-scope list, new Story Map section.
