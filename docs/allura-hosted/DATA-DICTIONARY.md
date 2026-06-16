# Allura Hosted Platform — Data Dictionary

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

Canonical field-level reference. No field name or enum value should appear in code/schema before it appears here. Anchor: [BLUEPRINT.md](./BLUEPRINT.md).

> JSON schemas (to be added): `json-schema/hosted/*.schema.json`. Each entity section will link to its schema file once authored.

> **Tenancy (ADR-001):** `group_id` identifies the **organization** — the only tenant boundary. `workspace_id` is a sub-scope *within* a `group_id`; workspace isolation is enforced at the API/CHECK layer. All `group_id` fields below carry the org scope (shared across the org's workspaces), never a per-workspace value. `allura-system` is platform-tier only.

---

## Organization

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `name` | string | Yes | Display name. |
| `created_by` | uuid (User) | Yes | Founding user. |
| `created_at` | timestamptz | Yes | Creation time. |
| `group_id` | string | Yes | **Tenant boundary.** Server-generated org scope key, pattern `^allura-[a-z0-9-]+$` (e.g. `allura-faithmeats`). Immutable. (ADR-001) |
| `plan` | enum(`free`,`team`,`enterprise`) | Yes | Billing tier (billing deferred). |

Relationships: `Organization 1—1 group_id`; `Organization 1—N Workspace`. The `group_id` lives here, not on Workspace.

## Workspace

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` (workspace_id) | uuid | Yes | Primary key / sub-scope identifier within the org. |
| `org_id` | uuid (Organization) | Yes | Parent tenant (owns the `group_id`). |
| `name` | string | Yes | Display name. |
| `group_id` | string | Yes | Inherited from the parent org; **shared** by all workspaces in the org, not unique per workspace. (ADR-001) |
| `team` | string | No | `metadata.team` label for role-within-tenant scoping. |
| `lock_mode` | enum (see below) | Yes | Current workspace lock state. |
| `created_at` | timestamptz | Yes | Creation time. |

### `lock_mode` values

| Value | Meaning |
|-------|---------|
| `normal` | All actions permitted (subject to RBAC). |
| `read_only` | No writes by anyone. |
| `no_agent_writes` | Humans may write; agents may not. |
| `no_promotions` | Writes allowed; curator promotion disabled. |
| `full_lockdown` | All actions denied except admin unlock. |

Relationships: `Workspace N—1 group_id` (shared via parent org); `Workspace 1—N {UserMembership, MCPToken, Agent, Memory, AuditEvent}` scoped by `workspace_id`.

## User

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `email` | string | Yes | Login identifier. |
| `mfa_enabled` | boolean | Yes | Required true for admin-level memberships. |
| `created_at` | timestamptz | Yes | Creation time. |

## UserMembership

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `user_id` | uuid (User) | Yes | Member. |
| `workspace_id` | uuid (Workspace) | Yes | Scope. |
| `role` | enum (see Roles) | Yes | Assigned role. |
| `created_at` | timestamptz | Yes | Grant time. |

### Role values

| Value | Purpose |
|-------|---------|
| `owner` | Full control, billing, users, security, delete workspace. |
| `admin` | Manage users, roles, agents, tokens, governance settings. |
| `reviewer` | Approve, reject, promote, supersede, deprecate memory. |
| `employee` | Add/search memory, run assigned workflows, submit evidence. |
| `viewer` | Read-only. |
| `auditor` | Audit/export access, no mutation. |
| `agent` | MCP-only access through scoped token. |

## MCPToken

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `token_hash` | string | Yes | Hash of the raw token. Raw token is never stored. |
| `token_prefix` | string | Yes | Short display prefix (e.g., `allura_mcp_ab12…`). |
| `agent_name` | string | Yes | Logical agent name. |
| `org_id` | uuid (Organization) | Yes | Owning org. |
| `workspace_id` | uuid (Workspace) | Yes | Bound workspace. |
| `group_id` | string | Yes | Server-injected **org** scope (inherited from the parent org; never client-supplied). |
| `scopes` | string[] | Yes | Granted scopes (see below). |
| `expires_at` | timestamptz | Yes | Expiry. |
| `revoked` | boolean | Yes | Revocation flag. |
| `last_used_at` | timestamptz | No | Last successful use. |
| `created_by` | uuid (User) | Yes | Issuing user. |

### Scope values

| Value | Grants |
|-------|--------|
| `memory:read` | Search/get/list memory. |
| `memory:write` | Add memory. |
| `memory:delete` | Soft-delete memory. |
| `memory:forget` | Forget (redaction) memory. |
| `memory:promote` | Promote to trusted knowledge (reviewer-only). |
| `review:read` | View curator queue. |
| `review:approve` | Approve proposals. |
| `review:reject` | Reject proposals. |
| `receipt:create` | Write audit receipts. |
| `audit:read` | Read audit log. |
| `audit:export` | Export audit log. |
| `agents:create` / `agents:revoke` | Manage agents. |
| `tokens:create` / `tokens:rotate` | Manage tokens. |
| `workspace:lock` | Change lock mode. |
| `admin:users` / `admin:roles` | Admin management. |

**Default agent scopes:** `memory:read`, `memory:write`, `receipt:create`.
**Reviewer scopes:** `memory:read`, `review:read`, `review:approve`, `review:reject`, `memory:promote`.

### Physical tables (Phase 1 slice — source of truth)

The conceptual `Organization` lives in **Clerk**, not Postgres, so the physical schema
has no `organizations` table; the org `group_id` is carried directly on the workspace row.
Primary keys are `TEXT` (app-generated), not `uuid`. Migrations:
[`27-workspaces.sql`](../../docker/postgres-init/27-workspaces.sql),
[`28-mcp-tokens.sql`](../../docker/postgres-init/28-mcp-tokens.sql).

**`workspaces`** — `workspace_id` (PK, TEXT) · `group_id` (TEXT, NOT NULL, strict CHECK
`^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$`) · `name` · `lock_mode` (DEFAULT `normal`, CHECK
in the five `lock_mode` values above) · `created_by` · `created_at` · `updated_at`.

**`mcp_tokens`** — `id` (PK, TEXT) · `group_id` (TEXT, NOT NULL, strict CHECK) ·
`workspace_id` (TEXT, NOT NULL, FK → `workspaces.workspace_id`) · `agent_name` ·
`token_prefix` (UNIQUE index — the lookup key) · `token_hash` (HMAC-SHA256; raw token
never stored) · `scopes` (TEXT[]) · `expires_at` · `revoked_at` · `last_used_at` ·
`created_by` · `created_at`. The logical `revoked` flag = `revoked_at IS NOT NULL`.

## Agent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `workspace_id` | uuid (Workspace) | Yes | Scope. |
| `name` | string | Yes | Agent name. |
| `type` | enum(`claude`,`codex`,`opencode`,`cursor`,`custom`) | Yes | Agent runtime. |
| `token_id` | uuid (MCPToken) | No | Active token. |
| `last_seen_at` | timestamptz | No | Last activity. |

## Memory

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `group_id` | string | Yes | Org tenant scope (shared across the org). |
| `workspace_id` | uuid | Yes | Workspace sub-scope within the org. |
| `layer` | enum(`episodic`,`semantic`) | Yes | Storage layer. |
| `content` | text | Yes | Memory body. |
| `source` | string | Yes | Origin (agent, human, dream, import). |
| `actor_id` | string | Yes | Who created it. |
| `confidence` | float | No | 0–1 confidence. |
| `status` | enum(`raw`,`proposed`,`approved`,`superseded`,`deprecated`,`deleted`) | Yes | Review/lifecycle state. |
| `provenance_ids` | string[] | Yes | Evidence/trace references. |
| `created_at` | timestamptz | Yes | Creation time. |

Notes: episodic rows are append-only; semantic versions link via `SUPERSEDES`.

## CuratorProposal

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `group_id` | string | Yes | Tenant scope. |
| `memory_id` | uuid (Memory) | Yes | Candidate memory. |
| `confidence` | float | No | Score. |
| `evidence_ids` | string[] | Yes | Linked evidence. |
| `status` | enum(`pending`,`approved`,`rejected`,`needs_evidence`) | Yes | Review state. |
| `rationale` | text | Conditional | Required on approve/reject. |
| `decided_by` | uuid (User) | Conditional | Reviewer. |
| `decided_at` | timestamptz | Conditional | Decision time. |

## AuditEvent

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. |
| `group_id` | string | Yes | Tenant scope. |
| `actor_id` | string | Yes | User or agent. |
| `role` | string | Yes | Actor role at decision time. |
| `token_prefix` | string | No | If token-authenticated. |
| `workspace_id` | uuid (Workspace) | Yes | Scope. |
| `action` | string | Yes | Tool/endpoint invoked. |
| `decision` | enum(`permit`,`deny`,`defer`) | Yes | Policy outcome. |
| `evidence_ids` | string[] | No | Linked evidence. |
| `prev_hash` | string | Yes | Previous event hash (chain). |
| `hash` | string | Yes | This event hash. |
| `created_at` | timestamptz | Yes | Append time. |

## DreamRun

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Primary key. |
| `workspace_id` | string | Yes | Scope. |
| `group_id` | string | Yes | Tenant scope. |
| `provider` | enum(`claude`,`openai`,`gemini`,`local`,`ruvector`,`screenpipe`,`github`,`notion`,`teams`,`slack`,`cursor`,`codex`,`opencode`) | Yes | Dream provider. |
| `input_sources` | string[] | Yes | Source IDs. |
| `status` | enum(`queued`,`running`,`completed`,`failed`,`canceled`) | Yes | Run state. |
| `created_by` | string | Yes | Initiator. |
| `created_at` | string | Yes | Creation time. |

## DreamCandidate

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Primary key. |
| `dream_run_id` | string | Yes | Parent run. |
| `type` | enum(`new_memory`,`merge_duplicate`,`supersede_old`,`contradiction`,`pattern`,`risk`) | Yes | Candidate kind. |
| `summary` | string | Yes | Human-readable summary. |
| `evidence_ids` | string[] | Yes | Required evidence. |
| `confidence` | number | Yes | 0–1 score. |
| `requires_human_approval` | boolean (always true) | Yes | HITL invariant. |

---

## Events

| Event | Producer | Consumer | Key payload fields |
|-------|----------|----------|--------------------|
| `memory.added` | Memory Engine | Curator, Audit | `group_id`, `memory_id`, `actor_id` |
| `curator.proposed` | Curator | Command Center, Audit | `proposal_id`, `confidence` |
| `curator.approved` / `curator.rejected` | Reviewer (HITL) | Memory Engine, Audit | `proposal_id`, `rationale`, `decided_by` |
| `token.revoked` / `token.rotated` | Bumblebee | MCP Gateway, Audit | `token_prefix`, `workspace_id` |
| `dream.completed` | Dream Engine | Curator, Audit | `dream_run_id`, candidate count |

---

## References

- [BLUEPRINT.md](./BLUEPRINT.md)
- [DESIGN-AUTH.md](./DESIGN-AUTH.md) · [DESIGN-BUMBLEBEE.md](./DESIGN-BUMBLEBEE.md) · [DESIGN-MCP-GATEWAY.md](./DESIGN-MCP-GATEWAY.md) · [DESIGN-CURATOR.md](./DESIGN-CURATOR.md) · [DESIGN-AUDIT.md](./DESIGN-AUDIT.md)
