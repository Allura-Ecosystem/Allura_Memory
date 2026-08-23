# Data Dictionary: Allura Data Models

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed - this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

This document describes Allura's PostgreSQL-only governed memory data model. PostgreSQL holds append-only episodic evidence, canonical proposals, pgvector retrieval, promoted graph tables, receipts, and outbox state. Neo4j is sunset under AD-50; legacy naming is retained only where it describes a historical migration or compatibility record.

---

## Table of Contents

- [PostgreSQL: events](#postgresql-events)
- [PostgreSQL: canonical_proposals](#postgresql-canonical_proposals)
- [PostgreSQL: Graph Adapter Tables](#postgresql-graph-adapter-tables)
- [Environment Variables](#environment-variables)
- [RuVix Governance Artifacts](#ruvix-governance-artifacts)
- [RunRecord (AD-35)](#runrecord-ad-35)
- [Neo4j: Memory](#neo4j-memory)
- [Neo4j: Agent](#neo4j-agent)
- [Neo4j: Team](#neo4j-team)
- [Neo4j: Project](#neo4j-project)
- [Neo4j: Relationships](#neo4j-relationships)
- [Memory Command Center Adapter Contracts](#memory-command-center-adapter-contracts)
- [Metadata Payloads](#metadata-payloads)

---

## API Response Contracts

### `ApiResult<T>`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `data` | `T \| null` | Yes | Mapped response data or null when unavailable. |
| `error` | `string \| null` | Yes | Human-readable error, null when absent. |
| `degraded` | `boolean` | Yes | True when partial data is returned. |
| `warnings` | `ApiWarning[]` | Yes | Non-fatal warnings from adapters, validators, or backends. |

### `ApiWarning`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Stable warning identifier. |
| `code` | `string` | No | Optional machine code. |
| `message` | `string` | Yes | Operator-facing warning text. |
| `source` | `string` | Yes | Source subsystem. |
| `severity` | `info \| warning \| critical` | No | Warning severity. |

### `AuditEvent` export shape

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Audit event identifier. |
| `group_id` | `string` | Yes | Tenant boundary; must be preserved in export headers/metadata. |
| `actor_id` | `string` | Yes | Human, agent, or service actor. |
| `actor_type` | `human \| agent \| service` | Yes | Actor class. |
| `resource` | `string` | Yes | Resource acted on. |
| `action` | `string` | Yes | Action performed. |
| `before` | `unknown` | No | Previous value when captured. |
| `after` | `unknown` | No | Resulting value when captured. |
| `evidence_ids` | `string[]` | Yes | Evidence chain. |
| `policy_decision_id` | `string` | No | Policy decision reference. |
| `approval_decision_id` | `string` | No | Approval decision reference. |
| `timestamp` | `string` | Yes | Event timestamp. |
| `hash` | `string` | Yes | Chain hash when available. |
| `prev_hash` | `string` | Yes | Previous chain hash when available. |

API data rules: every record includes `group_id`; unknown source state renders as unknown, not zero; no fabricated counts; export/copy actions are read-only formatting operations over existing records and must not mutate PostgreSQL or Neo4j.

---

## PostgreSQL: `events`

**JSON Schema:** [`json-schema/event.schema.json`](../../json-schema/event.schema.json)

The primary and only append-only log. Every memory operation — add, search, get, list, delete, promotion — produces one row. Rows are permanent. No UPDATE or DELETE, ever. Every operation carries the RuVix identity envelope: `group_id`, `agent_id`, and (when available) `session_id`. Workspace-governed producers additionally persist `workspace_id`; legacy rows remain unscoped and are explicitly unavailable to workspace watchdog ingestion and to `allura_app` workspace-scoped reads/writes.

Columns below match `json-schema/event.schema.json` and the migrations in `docker/postgres-init/` (`00-traces.sql`, `10-brooks-tracking.sql`, `17-schema-version.sql`, `19-group-id-check-constraints.sql`). `halted_at` / `halt_ttl_ms` are NOT event columns — they belong to the budget enforcer entity (see Budget Enforcer section).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | bigserial | Yes | Auto-increment primary key; migration 39 additionally exposes `(group_id, workspace_id, id)` as the scoped composite key for receipt provenance. |
| `group_id` | varchar(255) | Yes | Tenant namespace. CHECK constraint: `^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$` (migration 19) |
| `workspace_id` | text | No (legacy) / Yes (workspace-governed) | Durable workspace scope for workspace-governed events. `(group_id, workspace_id)` references `workspaces`; no default backfill is assigned to legacy NULL rows. |
| `event_type` | varchar(100) | Yes | Operation type — see values below |
| `agent_id` | varchar(255) | Yes | Identifier of the agent or user who triggered the event |
| `workflow_id` | varchar(255) | No | Optional grouping for multi-step workflows (run/process id) |
| `step_id` | varchar(255) | No | Step identifier within a multi-step workflow |
| `parent_event_id` | bigint | No | FK to a parent event row, for causal chaining |
| `session_id` | varchar(255) | No | Session identifier for identity scoping and audit correlation (nullable; added in migration 10) |
| `runtime` | varchar(50) | No | Originating runtime. Default `unknown` |
| `status` | varchar(50) | Yes | One of `pending` / `completed` / `failed` / `cancelled`. Default `completed` |
| `metadata` | jsonb | No | Event-specific payload — see Metadata Payloads section |
| `outcome` | jsonb | No | Structured result/outcome of the operation |
| `error_message` | text | No | Error detail when `status = failed` |
| `error_code` | varchar(50) | No | Machine-readable error code when `status = failed` |
| `schema_version` | integer | Yes | Event schema version. Default 1 (migration 17) |
| `created_at` | timestamptz | Yes | Logical event timestamp. DEFAULT NOW(). Immutable. |
| `inserted_at` | timestamptz | Yes | Physical insert timestamp. DEFAULT NOW(). Immutable. |

**Workspace RLS:** Migration 39 replay-safely alters every pre-existing `events` policy so `allura_app` requires both `app.current_group_id` and `app.current_workspace_id` in `USING` and `WITH CHECK`. This closes PostgreSQL permissive-policy OR bypasses; an A-scoped app transaction cannot read or write same-group workspace B events.

**`event_type` values**

| Value | Description |
|-------|-------------|
| `memory_add` | A memory was written by an agent |
| `memory_search` | A search query was executed |
| `memory_get` | A single memory was fetched by ID |
| `memory_list` | All memories for a user were listed |
| `memory_delete` | A memory was soft-deleted |
| `memory_promoted` | A memory was successfully promoted to Neo4j |
| `promotion_failed` | Neo4j write failed — episodic record retained |
| `promotion_queued` | SOC2 mode — memory queued for human approval |
| `proposal_created` | A canonical proposal was created for HITL review |
| `proposal_approved` | A proposal was approved and promoted to Neo4j |
| `notion_sync_pending` | A proposal is queued for Notion page creation |
| `debug:root_cause_found` | Phase 1 complete — root cause identified with evidence (POL-006) |
| `debug:hypothesis_tested` | Phase 3 — a single hypothesis was minimally tested |
| `debug:fix_implemented` | Phase 4 — fix shipped after root cause confirmed (requires prior `debug:root_cause_found`) |
| `neo4j_unavailable` | Neo4j backend was unreachable — system degraded gracefully |
| `tool_approved` | MCP tool was approved through catalog governance |
| `tool_denied` | MCP tool was denied through catalog governance |
| `request_trace` | HTTP request traced by TraceMiddleware (Story 1.2) |
| `session_start` | Agent session began |
| `health_check` | System health check performed |
| `memory_restore` | A soft-deleted memory was restored within the recovery window |
| `memory_update` | Append-only versioned update (SUPERSEDES chain created) |
| `memory_promote` | Request promotion to Neo4j (creates proposal) |
| `sync_contract` | Sync contract mapping applied on curator approve or auto-promote — user_id→Agent, group_id→Project relationships wired |
| `control_plane_rule` | RuVix control plane rule evaluation or rule-anchored audit event |
| `kernel_rule` | DEPRECATED — pre-2026-08-20 name for `control_plane_rule`. Retained because the events table is append-only and historical rows can never be migrated. Do not emit; readers must still accept it. |
| `proposal_decided` | A curator proposal received a decision (approve or reject) |
| `proposal_rejected` | A curator proposal was rejected during HITL review |
| `auto_curated` | A workspace-scoped auto-curator proposal/evidence record. Its `source_event_ids` are validated in the same strict app-role transaction against the resolved `(group_id, workspace_id)` before the proposal and evidence row are written. |
| `governance_gate_checked` | A governance gate was evaluated (permit / defer / deny) |
| `session_end` | An agent session ended |

**`status` values**

| Value | Description |
|-------|-------------|
| `completed` | Operation succeeded |
| `failed` | Operation failed — see metadata.error |
| `pending` | Operation in progress or awaiting human action |

---

## PostgreSQL: `canonical_proposals`

**JSON Schema:** [`json-schema/canonical_proposals.schema.json`](../../json-schema/canonical_proposals.schema.json)

The HITL (Human-in-the-Loop) promotion queue. Proposals are scored by the curator engine and stored here pending human approval. Once approved, they are promoted to Neo4j as InsightHead/Insight nodes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | Yes | Primary key. Auto-generated via `gen_random_uuid()`. |
| `group_id` | varchar(255) | Yes | Tenant namespace. CHECK constraint: must match `^allura-`. |
| `content` | text | Yes | The proposed insight content text. |
| `score` | numeric(3,2) | Yes | Curator confidence score (0.00–1.00). CHECK: `score >= 0.0 AND score <= 1.0`. |
| `reasoning` | text | No | Curator engine's reasoning for the score. |
| `tier` | varchar(20) | Yes | Confidence tier. CHECK: one of `emerging`, `adoption`, `mainstream`. |
| `status` | varchar(20) | Yes | Lifecycle status. DEFAULT `pending`. CHECK: one of `pending`, `approved`, `rejected`. |
| `trace_ref` | bigint | No | Foreign key to `events.id` (the originating trace event). ON DELETE SET NULL. |
| `created_at` | timestamptz | Yes | Proposal creation timestamp. DEFAULT NOW(). |
| `decided_at` | timestamptz | No | Timestamp when the proposal was approved or rejected. |
| `decided_by` | varchar(255) | No | Identifier of the person or system that made the decision (e.g., `curator-cli`, `sabir`). |
| `rationale` | text | No | Human-provided rationale for the decision. |
| `witness_hash` | text | No | SHAKE-256 hash (64-byte output) of the decision payload for audit trail integrity. Indexed. |
| `notion_page_id` | text | No | Notion page ID after sync. Indexed (partial, WHERE NOT NULL). |
| `notion_synced_at` | timestamptz | No | Timestamp when the proposal was synced to Notion. |

**`tier` values**

| Value | Description |
|-------|-------------|
| `emerging` | Low confidence (0.0–0.5). Needs more evidence before promotion. |
| `adoption` | Medium confidence (0.5–0.75). Worth tracking but not yet mainstream. |
| `mainstream` | High confidence (0.75–1.0). Strong signal, ready for promotion. |

**`status` values**

| Value | Description |
|-------|-------------|
| `pending` | Awaiting human review and decision. |
| `approved` | Human approved. Promoted to Neo4j as InsightHead/Insight. |
| `rejected` | Human rejected. Not promoted. Retained for audit trail. |

**Indexes**

| Index | Type | Purpose |
|-------|------|---------|
| `canonical_proposals_pkey` | PRIMARY KEY | Unique row identifier |
| `idx_canonical_proposals_group_date` | btree | Efficient queries by group and date |
| `idx_canonical_proposals_pending` | btree (partial) | Fast pending proposal lookups |
| `idx_canonical_proposals_status` | btree | Status-based filtering |
| `idx_canonical_proposals_tier` | btree | Tier-based ordering |
| `idx_canonical_proposals_trace_ref_unique` | UNIQUE (partial) | Prevent duplicate proposals per trace |
| `idx_canonical_proposals_witness_hash` | btree (partial) | Audit trail lookups |
| `idx_canonical_proposals_notion_page_id` | btree (partial) | Notion sync lookups |

**Triggers**

| Trigger | Event | Function |
|---------|-------|----------|
| `trigger_proposal_created` | AFTER INSERT | `log_proposal_created()` — emits `proposal_created` event |
| `trigger_proposal_decided` | AFTER UPDATE | `log_proposal_decided()` — emits decision event |

**Foreign Keys**

- `trace_ref` → `events(id)` ON DELETE SET NULL
- `(group_id, workspace_id)` → `workspaces(group_id, workspace_id)` (`canonical_proposals_group_workspace_fkey`, NOT VALID for legacy rows)
- Composite candidate key: `(group_id, workspace_id, id)` (`canonical_proposals_group_workspace_id_key`), referenced by workspace evidence requests.
- Referenced by: `notion_sync_dlq.proposal_id` → `canonical_proposals(id)` ON DELETE SET NULL

**Workspace scope, trace identity, and index:** `workspace_id` is nullable only for legacy rows and is required by the `allura_app` workspace-RLS policy. `idx_canonical_proposals_workspace_queue` is `(group_id, workspace_id, status, score DESC)` partial on non-null workspace IDs. `idx_canonical_proposals_trace_ref_unique` remains the single partial unique index on non-null `trace_ref`: `events.id` is a globally durable identifier, so one event belongs to one workspace and cannot legitimately yield proposals in two workspaces. Migration 39 does not drop or replace that index with a scoped duplicate. The canonical-proposal RLS policy is created only when absent; every pre-existing canonical-proposal policy is altered in place to conjunct both group and workspace settings, preventing PostgreSQL permissive-policy OR semantics from retaining a group-only bypass.

---

## PostgreSQL: workspace evidence lifecycle (migration 39)

### `evidence_requests`
`id` UUID PK; non-null `group_id`, `workspace_id`, `proposal_id`, `requested_by`, `reason`, `state` (`requested|satisfied|reopened|cancelled`), timestamps/resolver, and JSONB-array `evidence_references`. FKs bind both `(group_id, workspace_id)` to `workspaces` and `(group_id, workspace_id, proposal_id)` to `canonical_proposals`; cross-workspace proposal references are rejected. Index: `evidence_requests_scope_proposal_state_idx`.

### `governance_receipts`
Immutable scoped receipt: UUID `id`, scope, subject/action, server-issued actor/role, nonblank rationale and policy reference/version, optional proposal version, `memory_id`, `result_ref`, source event/witness, immutable JSONB-array evidence references, occurrence time, and truthful `outbox_state` (`not_enqueued|queued|synced|failed|not_applicable`). When `source_event_id` is non-null, the `governance_receipts_source_event_scope_fkey` binds `(group_id, workspace_id, source_event_id)` to the event's composite scoped identity, rejecting cross-workspace and cross-tenant provenance forgery. The `NOT VALID` migration constraint preserves pre-existing data without a workspace backfill while enforcing every new write. This foundation does not claim a new decision or sync flow; `not_enqueued` means no outbox item was created. Index: `governance_receipts_scope_subject_occurred_idx`; update/delete trigger rejects mutation.

### `semantic_projections`
Derived, rebuildable scoped index: UUID `id`, subject/version, source revision hash, non-empty JSONB-array `source_refs` (source table/row relationships), redaction policy version, content, optional vector/model, build state/failure, built time. Deterministic unique key includes scope, subject, projection version, source hash, **source_refs**, and redaction policy. Index: `semantic_projections_scope_subject_built_idx`.

All three tables have forced workspace RLS for `allura_app`, using both transaction-local `app.current_group_id` and `app.current_workspace_id` in `USING`/`WITH CHECK`.

---

## PostgreSQL: Graph Adapter Tables

**Migrations:** `21-graph-adapter-tables.sql`, `24-graph-structural-context.sql`
**ADR:** AD-29 — Graph Adapter Pattern for Neo4j → RuVector Migration

These tables replace Neo4j nodes and relationships when `GRAPH_BACKEND=ruvector`. They implement the adjacency list pattern to replicate SUPERSEDES and structural context operations via PostgreSQL.

### `graph_memories`

**Migration:** `21-graph-adapter-tables.sql`

Stores canonical (promoted) memory nodes equivalent to Neo4j's Memory label. Used by the RuVectorGraphAdapter when `GRAPH_BACKEND=ruvector`. Soft-deletes are marked via `deprecated=true`; restored memories set `restored_at`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | TEXT | Yes | Memory node identifier (UUID) |
| `group_id` | TEXT | Yes | Tenant namespace. CHECK: `^allura-[a-z0-9-]+$` |
| `user_id` | TEXT | No | User identifier within tenant |
| `content` | TEXT | Yes | Memory text content |
| `score` | REAL | Yes | Confidence score (0.0–1.0). Default: `0.5` |
| `provenance` | TEXT | Yes | Origin: `conversation` or `manual`. CHECK constraint |
| `version` | INTEGER | Yes | Version number (incremented on SUPERSEDES). Default: `1` |
| `tags` | TEXT[] | No | Freeform tags array. Default: `'{}'` |
| `deprecated` | BOOLEAN | Yes | Soft-delete flag. Default: `false` |
| `deleted_at` | TIMESTAMPTZ | No | Timestamp of soft-delete |
| `restored_at` | TIMESTAMPTZ | No | Timestamp of restore |
| `created_at` | TIMESTAMPTZ | Yes | Node creation timestamp. Default: `NOW()` |
| `content_tsv` | tsvector | Yes | Generated tsvector for full-text search (stored) |

**Comments:** `graph_memories` stores canonical memory nodes replacing Neo4j Memory label. Slice C of the 2-Store RuVector Migration.

**Indexes:**
| Index | Type | Purpose |
|-------|------|---------|
| `graph_mem_content_fts` | GIN | Full-text search via `content_tsv @@ plainto_tsquery()` |
| `graph_mem_group_time` | btree (partial) | Tenant+time queries, filters `deprecated=false` |
| `graph_mem_group_user` | btree (partial) | User-scoped queries within tenant |
| `graph_mem_active` | btree (partial) | Active (non-deprecated, non-superseded) memories |
| `graph_mem_deleted` | btree (partial) | Soft-deleted memories for recovery queries |
| `graph_memories_pkey` | PRIMARY KEY | Composite key (`id, group_id`) |

**Foreign Keys:** None (referenced by `graph_supersedes`).

---

### `graph_supersedes`

**Migration:** `21-graph-adapter-tables.sql`

Adjacency table for SUPERSEDES relationships. Each row represents `(newer_id)-[:SUPERSEDES]->(superseded_id)` in Neo4j. Append-only: new rows on version update, deletes only for restore.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `newer_id` | TEXT | Yes | Memory ID that supersedes the old one (source node) |
| `superseded_id` | TEXT | Yes | Memory ID that has been superseded (target node) |
| `group_id` | TEXT | Yes | Tenant namespace. CHECK: `^allura-[a-z0-9-]+$` |
| `created_at` | TIMESTAMPTZ | Yes | Relationship timestamp. Default: `NOW()` |

**Comments:** `graph_supersedes` is the SUPERSEDES adjacency table replacing Neo4j SUPERSEDES relationships.

**Indexes:**
| Index | Type | Purpose |
|-------|------|---------|
| `graph_supersedes_pkey` | PRIMARY KEY | Composite key (`newer_id, superseded_id, group_id`) |
| `graph_supersedes_target` | btree | "Is this memory superseded?" queries by `superseded_id` |
| `graph_supersedes_source` | btree | "What does this memory supersede?" lineage queries by `newer_id` |

**Foreign Keys:**
| Constraint | References | On Delete |
|------------|-----------|-----------|
| `graph_supersedes_newer_id_fkey` | `graph_memories(id, group_id)` | CASCADE |
| `graph_supersedes_superseded_id_fkey` | `graph_memories(id, group_id)` | CASCADE |

---

### `graph_structural_nodes`

**Migration:** `24-graph-structural-context.sql`

Structural context nodes replacing Neo4j labeled nodes (Agent, Project, Task, Decision, etc.). Uses JSONB `props` field to store arbitrary node properties. Used when `GRAPH_BACKEND=ruvector` for non-Memory nodes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `node_id` | TEXT | Yes | Node identifier (UUID or logical ID) |
| `label` | TEXT | Yes | Node label (e.g. `Agent`, `Project`, `Task`, `Decision`) |
| `group_id` | TEXT | Yes | Tenant namespace. CHECK: `^allura-[a-z0-9-]+$` |
| `props` | JSONB | Yes | Arbitrary properties stored as JSONB. Default: `'{}'` |
| `created_at` | TIMESTAMPTZ | Yes | Node creation timestamp. Default: `NOW()` |
| `updated_at` | TIMESTAMPTZ | No | Last update timestamp |

**Comments:** `graph_structural_nodes` stores structural context nodes replacing Neo4j labeled nodes. Slice C of the 2-Store RuVector Migration.

**Indexes:**
| Index | Type | Purpose |
|-------|------|---------|
| `graph_struct_nodes_pkey` | PRIMARY KEY | Composite key (`node_id, group_id`) |
| `graph_struct_nodes_label_group` | btree | Label+group queries for node type filtering |
| `graph_struct_nodes_props_gin` | GIN | JSONB containment queries (`props @> '{}') |

---

### `graph_structural_edges`

**Migration:** `24-graph-structural-context.sql`

Structural context edges replacing Neo4j relationships (CONTRIBUTED, LEARNED, `AUTHORED_BY`, `RELATES_TO`, etc.). Stores directed relationships between structural nodes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from_id` | TEXT | Yes | Source node identifier |
| `to_id` | TEXT | Yes | Target node identifier |
| `rel_type` | TEXT | Yes | Relationship type (e.g. `CONTRIBUTES_TO`, `AUTHORED_BY`, `MEMBER_OF`) |
| `group_id` | TEXT | Yes | Tenant namespace. CHECK: `^allura-[a-z0-9-]+$` |
| `props` | JSONB | No | Relationship properties |
| `created_at` | TIMESTAMPTZ | Yes | Edge creation timestamp. Default: `NOW()` |

**Comments:** `graph_structural_edges` stores structural context edges replacing Neo4j relationships.

**Indexes:**
| Index | Type | Purpose |
|-------|------|---------|
| `graph_struct_edges_pkey` | PRIMARY KEY | Composite key (`from_id, to_id, rel_type, group_id`) |
| `graph_struct_edges_from` | btree | Outgoing edges from node queries |
| `graph_struct_edges_to` | btree | Incoming edges to node queries |
| `graph_struct_edges_type` | btree | Relationship type queries |

**Foreign Keys:** None (graph edges are not explicitly constrained to nodes — the adapter layer enforces references).

---

## Environment Variables

### `GRAPH_BACKEND`

**Migrations:** `21-graph-adapter-tables.sql`, `24-graph-structural-context.sql`
**ADR:** AD-49 — GRAPH_BACKEND Configuration Flag

Controls which graph backend adapter is active for memory and structural operations.

| Value | Description | Status |
|-------|-------------|--------|
| `neo4j` | Neo4j backend (legacy, Slice C) | **Default** |
| `ruvector` | PostgreSQL graph adapter tables (`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`) | Slice C+ |
| `ruvector-crate` | Native RuVector extension with HNSW and GNN support (not yet implemented) | Planned |

**Current default:** `neo4j`

**Adapter selection behavior:**
- `neo4j`: Uses `Neo4jGraphAdapter` in `src/lib/graph-adapter/neo4j-adapter.ts`
- `ruvector`: Uses `RuVectorGraphAdapter` in `src/lib/graph-adapter/ruvector-adapter.ts`
- `ruvector-crate`: Will use `RuVectorCrateGraphAdapter` (Slice E+)

**Runtime detection:** `RuVixGateReceipt.ruvector_status.graph_backend` reports the active adapter.

**Cross-references:** AD-49, `src/lib/graph-adapter/types.ts#IGraphAdapter`

---

## RuVix Governance Artifacts

### `PROMOTION_MODE` / `AUTO_APPROVAL_THRESHOLD`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `PROMOTION_MODE` | enum | Yes | Governs semantic promotion behavior: `soc2` or `auto` |
| `AUTO_APPROVAL_THRESHOLD` | float | Yes | Auto-promotion cutoff from `0.0` to `1.0`; default `0.85` |

### `Rule`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `RULE_id` | string | Yes | Stable RuVix rule identifier, e.g. `RULE-001` |
| `content` | text | Yes | Human-readable rule text |
| `confidence` | float | Yes | Confidence or enforcement score from `0.0` to `1.0` |
| `status` | enum | Yes | Rule lifecycle state (e.g. `active`, `deprecated`, `pending`) |

### `ControlPlaneRuleEvent`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rule_id` | string | Yes | RuVix rule that was evaluated |
| `event_type` | string | Yes | `control_plane_rule`. Rows written before the 2026-08-20 rename carry `kernel_rule`; the events table is append-only, so both remain valid in `event.schema.json` and readers must accept either. |
| `group_id` | string | Yes | Tenant namespace for the event |
| `agent_id` | string | Yes | Agent identity for the event |
| `session_id` | string | Yes | Session identity for the event |
| `score` | float | Yes | Rule evaluation score |
| `metadata` | jsonb | No | Evidence payload, decision rationale, and audit context |

### `RuVixGateReceipt`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gate_decision` | enum | Yes | RuVix disposition: `Permit`, `Defer`, or `Deny`. |
| `gate_reason` | string | Yes | Human-readable reason for the gate decision, including missing evidence when deferred or denied. |
| `receipt_id` | string | Yes | Stable governance receipt identifier linking action, evidence, and audit event. |
| `runtime_readiness` | enum | Yes | Runtime readiness label: `pgvector_bridge` (PG only), `ruvector_graph` (graph adapter active), or `full_ruvector` (native extension active). |
| `ruvector_status` | object | Yes | Current readiness evidence: when bridge mode, includes `vector_extension_version`, `ruvector_function_count`, `allura_memories_count`; when native mode, includes `graph_backend`, `native_extension_version`, `hnsw_index_status`, `gnn_enabled`, `dual_read_mode`. |
| `harness_hook_status` | enum | Yes | Hook lifecycle: `not_installed`, `proposed`, `approval_required`, `enabled`, `disabled`, or `blocked`. |
| `approval_required` | boolean | Yes | True when runtime/database/MCP/cron/hook/RuVix enforcement/semantic promotion/Notion sync/Done status approval is required before mutation. |

**Runtime readiness values:**

| Value | Description | When Active |
|-------|-------------|-------------|
| `pgvector_bridge` | PG backend only, Neo4j pending cutover | Current baseline |
| `ruvector_graph` | Graph adapter tables active (`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`) | Slice C+ |
| `full_ruvector` | Native RuVector extension active, Neo4j fully replaced | Slice E+ |

**RuVector native status fields (`ruvector_status` when native mode active):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `graph_backend` | string | Yes | Target graph adapter: `neo4j` (legacy), `ruvector` (PG tables), `ruvector-crate` (native extension) |
| `native_extension_version` | string | Yes | RuVector extension version string |
| `hnsw_index_status` | string | Yes | HNSW index state: `disabled`, `creating`, `created`, `optimizing` |
| `gnn_enabled` | boolean | Yes | Graph neural network processing enabled |
| `dual_read_mode` | boolean | Yes | True when both Neo4j and RuVector backends are queried |

**Current readiness baseline (TALON, 2026-06-02):** `vector_extension_version=0.8.2`, `ruvector_function_count=0`, `allura_memories_count≈3392`, `runtime_readiness=pgvector_bridge`.

**Cross-references:** AD-29, AD-49, RK-32, `21-graph-adapter-tables.sql`, `24-graph-structural-context.sql`

### `RuVixBrandRule`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rule_id` | string | Yes | Brand rule identifier, one of `BRAND-001` through `BRAND-006` |
| `content` | text | Yes | Enforceable brand rule text |
| `score` | float | Yes | Enforcement confidence or compliance score from `0.0` to `1.0` |
| `status` | enum | Yes | Rule lifecycle state (`active`, `deprecated`, `pending`) |

## RunRecord (AD-35)

`RunRecord` is the canonical product contract for evidence-gated orchestration
runs. Process-engine primitives currently persist `ProcessState` and append-only
events, but the canonical persistence contract is not complete. `RunRecord`
remains neutral durable state; policy and runtime state remain separated so
Allura Brain can store receipts without owning execution.

**Implementation status:** partial. Gates, checkpoints, event persistence,
replay, DAG validation, a headless runner, and SDK primitives exist. Durable
definition versioning, true post-checkpoint continuation, doctor findings,
idempotency guarantees, and product APIs remain required.

### `RunRecord`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `run_id` | string | Yes | Stable run identifier. Recommended format: UUID or `run-{timestamp}-{slug}`. |
| `group_id` | string | Yes | Tenant namespace; must match `^allura-`. |
| `definition_id` | string | Yes | Stable process-definition identifier used to reload a run. |
| `definition_revision` | string | Yes | Immutable definition revision pinned when the run starts. |
| `owner_team` | enum/string | Yes | Team accountable for execution, e.g. `RAM`, `TALON`, `Durham`, `IRIS`, `Troy`. |
| `reviewer_team` | enum/string | Yes | Team accountable for review or approval. |
| `goal` | string | Yes | One-sentence run objective in imperative form. |
| `journal_path` | string | No | Path or URI for the structured run receipt trail. |
| `status` | enum | Yes | `pending`, `running`, `paused`, `completed`, `failed`, or `cancelled`. |
| `created_at` | ISO timestamp | Yes | Run creation timestamp. |
| `completed_at` | ISO timestamp | No | Completion timestamp when status is `completed`. |

### `RunPolicy`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `allowed_actions` | list<string> | Yes | Bounded action classes allowed during the run. |
| `approval_breakpoints` | list<object> | Yes | Human approval stops for risky transitions such as destructive actions, data-bearing changes, deploys, public sends, semantic promotion, or Done/Approved status moves. |
| `quality_gates` | list<object> | Yes | Required checks before completion, such as tests, lint, typecheck, smoke tests, screenshots, API checks, or repo-specific gates. |
| `evidence_required` | list<string> | Yes | Evidence artifacts that must exist before Done. |

### `RunRuntimeState`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resume_state` | object | No | Minimal state needed to resume/replay an interrupted run. |
| `current_step_id` | string | No | First incomplete or currently executing step. |
| `attempt` | integer | Yes | Current bounded attempt number for the active step or quality loop. |
| `doctor_findings` | list<object> | No | Structured stale, failed, incomplete, revision-drifted, or approval-blocked findings. |
| `memory_writeback_candidate` | boolean | No | Runtime flag that a run outcome may be proposed for Brain writeback; actual writeback still follows Allura memory governance. |

**Persistence direction:** PostgreSQL owns run records, pinned definitions,
runtime state, and append-only run events. Do not double-write operational run
state to Neo4j. Neo4j may receive approved semantic relationships after the
operational contracts stabilize.

### `DashboardClaim`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `claim_id` | string | Yes | Stable claim identifier for a Memory Command Center assertion |
| `states_covered` | list<string> | Yes | UI states covered by the claim (empty, loading, error, success, mobile, keyboard, etc.) |
| `evidence_attached` | list<string> | Yes | Evidence bundle types attached to the claim (`screenshot`, `audit`, `anti-drift`) |
| `approval_status` | enum | Yes | Claim status (`pending`, `approved`, `rejected`) |

### `DurhamTokenAudit`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `allowed_prefix` | string | Yes | Approved Allura/Durham token prefixes for terminal/API docs and Memory Command Center surfaces |
| `forbidden_patterns` | list<string> | Yes | Disallowed tokens, unrelated project styles, generated logo-like marks, and unsupported brand treatments |
| `scope` | string | Yes | Terminal/API documentation, dashboard surface, or component under review |
| `status` | enum | Yes | Audit state (`pending`, `passed`, `failed`) |

### `DurhamGateEvent`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gate_id` | string | Yes | Stable gate identifier for a Durham ship review |
| `reviewers` | list<string> | Yes | Required reviewers: `Aaker`, `Glaser`, `Munari` |
| `artifact_ref` | string | Yes | Evidence artifact reference, including `docs/allura/BRAND-RULES-dashboard-v2.md` for Memory Command Center surfaces |
| `status` | enum | Yes | Gate state (`pending`, `passed`, `blocked`) |

### `memberships`

Human team membership + role per org (`group_id`). One row per (group_id, user_id). A
user may belong to multiple orgs (one row each). Current-state table; role changes UPDATE
`role`, removal is a soft-delete (`removed_at`). Every change is mirrored as an append-only
audit event (`membership_added` / `membership_role_changed` / `membership_removed`) so the
events append-only invariant (POL-002) holds as the trail. Migration: `docker/postgres-init/29-memberships.sql`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (uuid) | Yes | Surrogate key |
| `group_id` | string | Yes | Org tenant boundary; `^allura-[a-z0-9-]+$` (POL-001) |
| `user_id` | string | Yes | Stable identity (Clerk user id or email) |
| `email` | string | No | Display email |
| `role` | enum | Yes | `admin` \| `curator` \| `viewer` |
| `invited_by` | string | No | user_id of the admin who added them |
| `created_at` | timestamptz | Yes | Row creation |
| `updated_at` | timestamptz | Yes | Last role/state change |
| `removed_at` | timestamptz | No | Soft-delete marker; NULL = active member |

#### `role` enum

| Value | Meaning |
|-------|---------|
| `admin` | Full control: manage members/roles, integrations, governance overrides, approvals |
| `curator` | Approve/reject curator proposals; no member management |
| `viewer` | Read-only |

## Memory Command Center Adapter Contracts

Production dashboard components consume these mapped contracts, never raw database or substrate payloads.

### `DashboardResult<T>`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | `T \| null` | Yes | Mapped data or null when unavailable |
| `error` | `string \| null` | Yes | Human-readable error when the panel cannot show complete data |
| `degraded` | boolean | Yes | True when returned data is partial, stale, or missing a backing service |
| `warnings` | `DashboardWarning[]` | Yes | Non-fatal warnings from adapters, validators, or backends |
| `source` | `DashboardSource` | Yes | Source-of-truth descriptor for the panel |
| `freshness` | `DashboardFreshness` | Yes | Timestamp and freshness state for the panel |
| `group_id` | string | Yes | Active tenant scope; required on every dashboard page and operation |

### `GovernanceReceipt`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `receipt_id` | string | Yes | Stable receipt identifier |
| `intent` | string | Yes | Human-readable reason for the mutation or decision |
| `actor_id` | string | Yes | Person, agent, or service requesting the action |
| `group_id` | string | Yes | Tenant scope for the action |
| `source_refs` | list<string> | Yes | Memory, trace, proposal, or evidence IDs used before action |
| `policy_refs` | list<string> | Yes | RuVix rules, promotion mode, threshold, or role checks evaluated |
| `validation` | list<string> | Yes | Validation checks performed before completion |
| `audit_event_id` | string | Yes | Append-only PostgreSQL event that records the action |
| `result` | enum | Yes | `approved`, `rejected`, `requested_evidence`, `requested_changes`, `soft_deleted`, `recovered`, `blocked` |
| `gate_decision` | enum | Yes | RuVix disposition: `Permit`, `Defer`, or `Deny` |
| `gate_reason` | string | Yes | Reason for the gate decision |
| `approval_required` | boolean | Yes | True when the action cannot proceed without explicit approval |

### `DashboardSource`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | Yes | Human-readable source label, e.g. `PostgreSQL events`, `Neo4j graph`, `Curator proposals` |
| `endpoint` | string | Yes | API route or MCP tool that supplied data |
| `trust_level` | enum | Yes | `verified`, `degraded`, `unknown`, `external_untrusted` |

### `DashboardFreshness`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `observed_at` | ISO timestamp | Yes | When the data was observed |
| `status` | enum | Yes | `fresh`, `stale`, `unknown`, `not_live` |
| `message` | string | Yes | Plain-language freshness explanation |

## Neo4j: `Memory`

**JSON Schema:** [`json-schema/memory.schema.json`](../../json-schema/memory.schema.json)

Curated, promoted knowledge. Created via `MERGE`. Never edited after creation. Versioned via `SUPERSEDES` relationships.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string (UUID) | Yes | Unique identifier. Generated at promotion time. |
| `name` | string | Yes | Short descriptive title for the memory |
| `group_id` | string | Yes | Tenant namespace. Must match `^allura-`. |
| `category` | string | Yes | Memory classification — see values below |
| `type` | string | Yes | Memory type — see values below |
| `confidence` | float | Yes | Confidence score (0.0–1.0) |
| `tags` | list\<string\> | No | Freeform tags for retrieval filtering |
| `content` | string | Yes | The memory text |
| `source` | string | Yes | Origin of the memory — see values below |
| `notion_id` | string | No | Notion page ID for bidirectional traceability |
| `status` | string | Yes | Node lifecycle status — see values below |
| `score` | float | Yes | Confidence/relevance score (0.0–1.0) |
| `deprecated` | boolean | Yes | `true` when a newer version supersedes this node. Default: `false` |
| `created_at` | datetime | Yes | UTC timestamp of node creation |
| `source_event_id` | string | No | ID of the originating `events` row in Postgres |
| `purpose` | string | No | Intended use of the memory |
| `core_structure` | string | No | Structural template or pattern the memory follows |
| `knowledge_rules` | string | No | Rules governing how this memory should be used |

**`category` values**

| Value | Description |
|-------|-------------|
| `decision` | Architectural or design decision |
| `pattern` | Recurring pattern or practice |
| `rule` | Constraint or rule to follow |
| `fact` | Verified fact about the system |
| `lesson` | Lesson learned from experience |
| `insight` | Curated insight from trace analysis |
| `preference` | User or team preference |
| `standard` | Standard or guideline |

**`type` values**

| Value | Description |
|-------|-------------|
| `procedural` | How-to or process knowledge |
| `declarative` | Factual knowledge |
| `strategic` | High-level strategy or direction |
| `operational` | Day-to-day operational knowledge |

**`source` values**

| Value | Description |
|-------|-------------|
| `notion` | Imported from Notion knowledge base |
| `curator` | Created by curator from trace analysis |
| `manual` | Manually added |
| `conversation` | Extracted from conversation context |

**`status` values**

| Value | Description |
|-------|-------------|
| `active` | Current and retrievable |
| `deprecated` | Superseded by a newer version |
| `pending` | Awaiting approval |

**`deprecated` values**

| Value | Description |
|-------|-------------|
| `false` | Active — this is the current version |
| `true` | Superseded — a newer `Memory` node exists with a `SUPERSEDES` edge pointing here |

---

## Neo4j: `Agent`

**JSON Schema:** [`json-schema/agent.schema.json`](../../json-schema/agent.schema.json)

Structural context node representing an AI agent in the team. Agents are members of Teams, contribute to Projects, and author Memory nodes. Seeded via `scripts/neo4j-seed-agents.cypher`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique agent identifier (e.g. `brooks`, `pike`) |
| `name` | string | Yes | Human-readable agent name |
| `persona` | string | Yes | Agent persona description |
| `team` | string | Yes | Team name this agent belongs to |
| `category` | string | Yes | Agent classification — see values below |
| `type` | string | Yes | Agent type — see values below |
| `scope` | string | Yes | Operational scope — see values below |
| `platform` | string | Yes | Platform this agent runs on — see values below |
| `status` | string | Yes | Agent lifecycle status — see values below |
| `group_id` | string | Yes | Tenant namespace. Must match `^allura-`. |
| `description` | string | No | Extended description of the agent's role |

**`category` values**

| Value | Description |
|-------|-------------|
| `ram` | RAM team agent (engineering/execution) |
| `durham` | Durham team agent (creative/content) |
| `governance` | Governance/oversight agent |
| `ship` | Ship-level operational agent |

**`type` values**

| Value | Description |
|-------|-------------|
| `executor` | Task execution agent |
| `reviewer` | Review/audit agent |
| `curator` | Curation/approval agent |
| `orchestrator` | Orchestration/routing agent |
| `specialist` | Domain specialist agent |
| `creative` | Creative/content agent |

**`scope` values**

| Value | Description |
|-------|-------------|
| `project` | Scoped to a single project |
| `team` | Scoped to a team |
| `global` | Cross-team scope |

**`platform` values**

| Value | Description |
|-------|-------------|
| `openclaw` | Runs on OpenClaw |
| `claude` | Runs on Claude Code |
| `cursor` | Runs on Cursor |
| `opencode` | Runs on OpenCode |

**`status` values**

| Value | Description |
|-------|-------------|
| `active` | Currently operational |
| `inactive` | Temporarily disabled |
| `retired` | Permanently removed from rotation |

---

## Neo4j: `Team`

**JSON Schema:** [`json-schema/team.schema.json`](../../json-schema/team.schema.json)

Structural context node representing a team of agents. Seeded via `scripts/neo4j-seed-agents.cypher`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique team identifier (e.g. `ram`, `durham`) |
| `name` | string | Yes | Human-readable team name |
| `group_id` | string | Yes | Tenant namespace. Must match `^allura-`. |
| `icon` | string | No | Emoji or icon identifier for the team |
| `description` | string | No | Team description and purpose |

---

## Neo4j: `Project`

**JSON Schema:** [`json-schema/project.schema.json`](../../json-schema/project.schema.json)

Structural context node representing a project that agents contribute to and memories relate to. Seeded via `scripts/neo4j-seed-agents.cypher`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique project identifier (e.g. `allura-memory`) |
| `name` | string | Yes | Human-readable project name |
| `group_id` | string | Yes | Tenant namespace. Must match `^allura-`. |
| `status` | string | Yes | Project lifecycle status — see values below |
| `description` | string | No | Project description and scope |

**`status` values**

| Value | Description |
|-------|-------------|
| `active` | Currently in development |
| `planned` | Planned but not started |
| `complete` | Finished and delivered |
| `on-hold` | Temporarily paused |

---

## Neo4j: Relationships

| Relationship | Pattern | Cardinality | Description |
|---|---|---|---|
| `SUPERSEDES` | `(v2:Memory)-[:SUPERSEDES]->(v1:Memory)` | Many-to-one | v1 must be marked `deprecated: true`. v2 is the current version. Never edit v1. |
| `AUTHORED_BY` | `(m:Memory)-[:AUTHORED_BY]->(a:Agent)` | Many-to-one | Links a Memory to the Agent that authored it. |
| `RELATES_TO` | `(m:Memory)-[:RELATES_TO]->(p:Project)` | Many-to-many | Links a Memory to a Project it relates to. |
| `MEMBER_OF` | `(a:Agent)-[:MEMBER_OF]->(t:Team)` | Many-to-one | Agent is a member of a Team. |
| `CONTRIBUTES_TO` | `(a:Agent)-[:CONTRIBUTES_TO]->(p:Project)` | Many-to-many | Agent contributes to a Project. |
| `DELEGATES_TO` | `(a:Agent)-[:DELEGATES_TO]->(b:Agent)` | Many-to-many | Chain of command: Agent a delegates work to Agent b. |
| `ESCALATES_TO` | `(a:Agent)-[:ESCALATES_TO]->(b:Agent)` | Many-to-many | Escalation path: Agent a escalates to Agent b. |
| `HANDS_OFF_TO` | `(a:Agent)-[:HANDS_OFF_TO]->(b:Agent)` | Many-to-many | Creative flow handoff (Durham team pattern). |
| `PROPOSES_TO` | `(a:Agent)-[:PROPOSES_TO]->(b:Agent)` | One-to-one | Curator proposes to Auditor for approval. |
| `APPROVES_PROMOTION` | `(a:Agent)-[:APPROVES_PROMOTION]->(b:Agent)` | One-to-one | Auditor approves promotion back to Curator. |

**SUPERSEDES invariants:**
- A node with `deprecated: true` MUST have exactly one incoming `SUPERSEDES` edge
- A node with `deprecated: false` MUST have zero incoming `SUPERSEDES` edges (it is the head)
- The chain is traversable: `MATCH (head)-[:SUPERSEDES*]->(ancestor)` retrieves full lineage

**AUTHORED_BY invariants:**
- Every Memory node SHOULD have at least one `AUTHORED_BY` edge to an Agent
- An Agent may author many Memory nodes
- The Agent referenced MUST exist as an `Agent` node

**RELATES_TO invariants:**
- A Memory node may relate to zero or more Projects
- The Project referenced MUST exist as a `Project` node

**MEMBER_OF invariants:**
- Every Agent SHOULD belong to exactly one Team
- A Team contains one or more Agents

**DELEGATES_TO / ESCALATES_TO / HANDS_OFF_TO invariants:**
- These relationships form directed graphs between Agents
- No cycles: a delegation chain must not loop back to the originator
- `HANDS_OFF_TO` is specific to the Durham creative flow pattern

**PROPOSES_TO / APPROVES_PROMOTION invariants:**
- These form a bidirectional governance pair between Curator and Auditor roles
- `PROPOSES_TO`: Curator → Auditor (submission for review)
- `APPROVES_PROMOTION`: Auditor → Curator (approval granted)

---

## Metadata Payloads

The `metadata` JSONB column in `events` carries event-specific data. Shapes by `event_type`:

### `memory_add`

```jsonc
{
  "content": "User prefers dark mode",
  "user_id": "user-123",
  "score": 0.91,
  "stored": "both",           // "episodic" | "both" | "episodic+pending"
  "neo4j_id": "uuid",         // present if promoted
  "pending_review": false     // true if SOC2 mode queued
}
```

### `memory_search`

```jsonc
{
  "query": "user preferences",
  "user_id": "user-123",
  "result_count": 5,
  "sources": ["postgres", "neo4j"]
}
```

### `memory_delete`

```jsonc
{
  "memory_id": "uuid",
  "user_id": "user-123",
  "neo4j_deprecated": true    // false if memory was episodic-only
}
```

### `memory_promoted`

```jsonc
{
  "source_event_id": "12345",
  "neo4j_id": "uuid",
  "score": 0.91,
  "user_id": "user-123",
  "mode": "auto"              // "auto" | "manual"
}
```

### `promotion_failed`

```jsonc
{
  "source_event_id": "12345",
  "score": 0.91,
  "error": "Neo4j connection timeout",
  "fallback": "episodic_only"
}
```

### `proposal_approved`

Emitted when a curator approves a proposal and promotes it to Neo4j.

```jsonc
{
  "proposal_id": "uuid",          // canonical_proposals.id
  "memory_id": "uuid",           // Neo4j InsightHead insight_id
  "score": "0.85",               // Curator confidence score
  "tier": "mainstream",          // Confidence tier
  "rationale": "High specificity" // Optional human rationale
}
```

### `proposal_created`

Emitted by trigger when a new proposal is inserted into `canonical_proposals`.

```jsonc
{
  "proposal_id": "uuid",          // canonical_proposals.id
  "score": "0.85",               // Curator confidence score
  "tier": "mainstream",          // Confidence tier
  "trace_ref": 12345             // Originating events.id (may be null)
}
```

### `notion_sync_pending`

Emitted after approval to queue Notion page creation. Picked up by the notion-sync-worker.

```jsonc
{
  "proposal_id": "uuid",          // canonical_proposals.id
  "content": "Insight text...",   // Proposal content for Notion page title
  "score": 0.85,                 // Numeric score for Notion property
  "tier": "mainstream",          // Maps to Notion Type select
  "status": "approved",          // Proposal status at sync time
  "curator_id": "curator-cli",   // Who approved
  "rationale": "...",            // Optional rationale
  "decided_at": "2026-04-24T...", // ISO timestamp
  "data_source_id": "42894678-..." // Notion data source ID
}
```

**Redacted fields:** passwords, API keys, tokens, and any PII beyond `user_id` MUST NOT appear in `metadata`.

---

## Retrieval Gateway Contract

The retrieval gateway enforces typed contracts at the boundary between agent reads and the dual stores. All agent reads MUST pass through `POST /api/memory/retrieval` (AD-19). Source: `src/lib/retrieval/contract.ts`.

### SearchRequest

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Semantic query string |
| `group_id` | string | Yes | Tenant namespace — REQUIRED, enforced by policy |
| `user_id` | string | Yes | User identifier — must match agent identity |
| `limit` | integer | No | Maximum results (capped by config) |
| `min_score` | float | No | Minimum relevance score threshold (0–1) |
| `filters` | Record<string, string \| number \| boolean> | No | Optional key-value filters (e.g., source, conversation_id) |
| `include_global` | boolean | No | Whether to include global/shared memories |

### MemoryResult

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique memory identifier |
| `content` | string | Yes | Raw content text |
| `score` | float | Yes | Relevance score (0–1) |
| `source` | string | Yes | Source store: `'episodic'` \| `'semantic'` \| `'merged'` |
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | Yes | User identifier |
| `metadata` | Record<string, unknown> | No | Optional metadata payload |
| `created_at` | string | No | ISO 8601 creation timestamp |

### Validation

- Startup validator (`src/lib/retrieval/startup-validator.ts`) verifies contract integrity on service boot
- Policy layer (`src/lib/retrieval/policy.ts`) enforces group_id requirement and tenant scoping
- JSON Schema validation available via `json-schema/` directory for both `SearchRequest` and `MemoryResult`

---

## Budget Session Fields

Budget enforcement tracks session state for agent write operations. Halted sessions auto-expire after `haltTtlMs` (AD-27).

### Session State Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `halted_at` | Date | No | Timestamp when session was halted due to budget breach |
| `halt_ttl_ms` | integer | No | Auto-expiry TTL for halted sessions. Default: 3,600,000 (1 hour). Configurable via `EnforcerConfig.haltTtlMs` |
| `halt_reason` | HaltReason | No | Reason for halt: `budget_exhausted` \| `step_limit` \| `time_limit` \| `cost_limit` \| `manual` |

### Admin Reset

`POST /api/admin/reset-budget` — resets halted sessions for a specific `group_id` (or all if no group_id provided). Requires bearer auth.

---

## Epic 25 Review Console Contracts

These are UI/API contracts for the governed operator adapter. They do not authorize actions; the server derives the tenant, workspace, role, and allowed actions from the authenticated principal.

### `ReviewItem`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Proposal identifier. |
| `group_id` | string | Yes | Server-derived tenant boundary. |
| `workspace_id` | string \| null | Yes | Workspace boundary when the source model has one. |
| `summary` | string | Yes | Human-readable proposed learning. |
| `status` | `pending \| approved \| rejected \| evidence_requested` | Yes | Authoritative proposal state. |
| `score` | number | Yes | Curator score; never a substitute for evidence. |
| `tier` | string | Yes | Curator tier. |
| `requester` | object | Yes | Server-resolved requester/agent identity. |
| `trace_ref` | string \| null | Yes | Originating trace reference. |
| `evidence` | `EvidenceSummary[]` | Yes | Provenance summaries, possibly empty. |
| `allowed_actions` | string[] | Yes | Server-derived action names; UI may not add to this list. |
| `freshness` | `current \| stale \| degraded` | Yes | Truthfulness state for source data. |

### `EvidenceSummary`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Stable evidence reference. |
| `kind` | string | Yes | Trace, event, document, or other governed source type. |
| `summary` | string | Yes | Reviewable description. |
| `source` | string | Yes | Origin subsystem. |
| `available` | boolean | Yes | Whether governed detail is retrievable. |

### `RetrievalPlan`

| Field | Type | Required | Description |
|---|---|---|---|
| `scope` | object | Yes | Server-derived tenant/workspace and authorized role context. |
| `relational_filters` | object | Yes | Explicit IDs, state, actor, membership/role, and time filters applied before semantic expansion. |
| `relational_sources` | string[] | Yes | PostgreSQL tables/views that supplied authoritative facts. |
| `semantic_source` | string \| null | Yes | Candidate-expansion/ranking source, if used. |
| `evidence_refs` | string[] | Yes | Returned governed evidence/trace/receipt references. |
| `freshness` | `current \| stale \| degraded` | Yes | Truthfulness state of the result set. |
| `degraded_reason` | string \| null | Yes | Declared missing/unavailable retrieval dependency, if any. |

A semantic result cannot add a record outside `scope`, defeat `relational_filters`, or represent a factual state absent from `relational_sources`.

### `SubgraphQuery` and `SubgraphResponse`

The 2D and optional 3D map use one server-owned focused-subgraph contract. Callers may name an authorized anchor and intent; they never provide tenant, workspace, role, or policy authority.

| Field | Type | Required | Description |
|---|---|---|---|
| `anchor` | `{ kind, id }` | Conditional | Server-authorized entity, proposal, evidence request, receipt, event, memory, or structural node. Required except a saved server-authorized overview. |
| `intent` | `overview \| neighbors \| lineage \| review_context \| search` | Yes | Bounded map purpose. |
| `depth` | `0 \| 1 \| 2` | No | Server-capped traversal depth. |
| `relation_types` | string[] | No | Server allow-listed relationship filter. |
| `filters` | object | No | Allowed kind/status/time filters; server normalizes and validates them. |
| `continuation` | opaque string | No | Signed, expiring, scope/query/policy-bound continuation token. |
| `render_hint` | `2d \| 3d` | No | Renderer preference only; it never changes retrieval or authority. |

A `SubgraphResponse` returns typed nodes/edges, evidence references, freshness, explicit `complete \| partial \| empty \| denied \| degraded` state, traversal budget, semantic-expansion metadata, warnings, and a continuation only when the server truncated an authorized deterministic result.

Initial budgets are product safety caps, not scale claims: at most 200 nodes, 400 edges, and depth 2. A graph page must state when it is bounded or partial and offer an authorized continuation or aggregate—not imply whole-workspace coverage.

### `AssistantQuery` and `AssistantAnswer`

The first governed assistant is read-only and selected-item-scoped.

| Field | Type | Required | Description |
|---|---|---|---|
| `question` | string | Yes | User question about the selected authorized item. |
| `focus` | `{ kind, id }` | Yes | Current authorized proposal, evidence, receipt, or entity. |
| `answer` | string | Yes | Plain-language answer or explicit inability to verify. |
| `citations` | object[] | Yes | Authorized source IDs, kinds, freshness, and inspectable detail links. |
| `retrieval_plan` | `RetrievalPlan` | Yes | Same relational-first plan used by map/detail. |
| `allowed_actions` | object[] | Yes | Declarative server-provided hints only; actions still re-authorize through normal endpoints. |
| `state` | `complete \| partial \| degraded \| denied` | Yes | Truthful answer state. |

The assistant cannot choose scope, call raw storage, approve/reject/promote, invoke connectors, mint receipts, or hide stale/degraded evidence.

### `PolicyIntakeDraft`

A typed, non-authoritative workspace-policy proposal collected by the local dashboard or an external client such as Copilot Cowork MCP elicitation. The server supplies the schema, revalidates every field, derives scope, and returns a review summary before a separate save action.

| Field | Type | Required | Description |
|---|---|---|---|
| `workspace_name` | string | Yes | Human-readable requested name; not an authority identifier. |
| `member_rules` | object | Yes | Proposed viewer/curator/admin capabilities. |
| `allowed_source_kinds` | string[] | Yes | Proposed document, repository, or connector source allowlist. |
| `allowed_connector_ids` | string[] | Yes | Proposed connector manifest IDs; availability does not grant permission. |
| `ocr_policy` | object | Yes | OCR allowed, original retention, language/quality review, and low-confidence handling. |
| `classification_redaction` | object | Yes | Proposed classification and redaction-policy references. |
| `retention_policy` | object | Yes | Proposed source/evidence retention terms. |
| `assistant_authority` | `explain_only \| cited_read` | Yes | Initial assistant boundary; no decision authority. |
| `promotion_requires_human` | boolean | Yes | Must remain `true` for the first Copilot package. |
| `receipt_required` | boolean | Yes | Whether governed saved transitions require a receipt; initial value is `true`. |
| `client_context` | object | Yes | Non-authoritative adapter, package/skill version, and correlation ID for audit. No secrets. |

A `PolicyIntakeDraft` is not an active policy. `save_policy_draft` is confirmation-required, re-authorizes the principal, derives group/workspace context, validates referenced connector capabilities, records an audit event, and returns a truthful draft/receipt response. Cowork, skills, forms, widgets, and Exa results cannot activate a policy directly.

### `ExternalIdentityContext`

A validated, non-secret identity envelope resolved at an external-client adapter before Allura authorization. It does not replace Allura membership or role records.

| Field | Type | Required | Description |
|---|---|---|---|
| `provider` | `microsoft_entra \| claude_code \| codex` | Yes | Authenticated host identity provider. |
| `provider_tenant_id` | string \| null | Yes | Validated Microsoft Entra tenant ID when applicable. |
| `provider_subject_id` | string | Yes | Validated Entra object/user ID or reviewed host subject. |
| `group_claims` | string[] | Yes | Validated Entra groups when available; overage is an explicit failure/lookup state. |
| `app_role_claims` | string[] | Yes | Validated Entra app roles when available. |
| `token_issuer` | string | Yes | Validated issuer identifier; never used as display copy. |
| `token_audience` | string | Yes | Validated audience for the Allura connector. |
| `internal_principal_id` | string | Yes | Server-mapped Allura principal. |
| `mapped_memberships` | object[] | Yes | Server-resolved tenant/workspace memberships. |
| `mapped_roles` | string[] | Yes | Server-resolved Allura roles; client claims are inputs to mapping, not authority. |
| `mapping_version` | string | Yes | Identity/role mapping policy version. |
| `correlation_id` | string | Yes | Non-secret audit correlation. |

Unknown tenants, roles, claim overage, stale membership, disabled principals, invalid signature/issuer/audience/expiry, and forged claims fail closed. Bearer tokens and provider secrets are never stored in this contract.

### `WorkflowModuleManifest`

A server-issued, allow-listed, versioned declarative adapter that lets the stable dashboard shell present a governed domain workflow. It is not executable authority or arbitrary UI code.

| Field | Type | Required | Description |
|---|---|---|---|
| `module_id` | string | Yes | Stable kebab-case identity, for example `mortgage-approval-gate`. |
| `module_version` | semver | Yes | Module contract/content version. |
| `contract_version` | string | Yes | Compatible dashboard/shared-service contract version. |
| `display` | object | Yes | Plain title, summary, and approved token/icon references. |
| `stages` | `WorkflowStageDescriptor[]` | Yes | Ordered presentation stages using standard shell states. |
| `intake_schema_ref` | string | Yes | Server-owned typed intake schema reference. No inline executable validator. |
| `evidence_kinds` | `EvidenceKindDescriptor[]` | Yes | Allowed evidence labels and source requirements. |
| `relationships` | `RelationshipDescriptor[]` | Yes | Allow-listed plain-language relationship vocabulary. |
| `policy_refs` | string[] | Yes | Server-known policy identifiers/versions required by the workflow. |
| `required_capabilities` | string[] | Yes | Allow-listed service/tool capabilities; absence disables the module. |
| `host_skill_bindings` | `HostSkillBinding[]` | Yes | Canonical skill ID plus Cowork/Claude Code/Codex adapter references. |
| `feature_flag` | string | Yes | Server-side enable/disable control. |
| `rollback_id` | string | Yes | Tested rollback/runbook identity. |
| `integrity` | object | Yes | Source/version/hash/signature or trust-policy evidence used by the registry. |

A module cannot contain JavaScript, SQL, credentials, direct URLs to internal storage, role mappings, policy outcomes, mutation handlers, or receipt generators. The registry rejects unknown, duplicate, incompatible, untrusted, capability-missing, or disabled modules before rendering.

### `MortgageReviewCase`

A sanitized demonstration entity for Story 25.5a. It proves governed workflow transitions but is not an underwriting or lending-decision record.

| Field | Type | Required | Description |
|---|---|---|---|
| `case_id` | UUID | Yes | Synthetic case identity. |
| `scope` | object | Yes | Server-derived tenant/workspace. |
| `source_refs` | object[] | Yes | Synthetic document/event references. |
| `ocr_evidence_refs` | object[] | Yes | Original-page, engine/version, span, quality, classification, and redaction references. |
| `policy_ref` | string | Yes | Deterministic demonstration policy/version. |
| `review_state` | `intake \| evidence_missing \| ready_for_review \| decided` | Yes | Workflow state only. |
| `allowed_actions` | string[] | Yes | Server-derived actions; no underwriting semantics. |
| `receipt_id` | UUID \| null | Yes | Server-issued receipt after a permitted human decision. |

Fixtures contain no real applicant PII, protected-class data, financial data, customer records, credit score, pricing, or automated approval/denial result.

### `SemanticProjection`

A rebuildable, governed Markdown document assembled from a relational entity and its meaningful header/detail relationships before embedding. It is a retrieval derivative, never the source of truth.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Projection identity. |
| `scope` | object | Yes | Server-derived tenant/workspace scope. |
| `source_kind` | string | Yes | Entity family, such as `memory_proposal` or `decision_receipt`. |
| `source_refs` | object[] | Yes | Header/detail table-row references used to assemble content. |
| `markdown` | string | Yes | Deterministic, human-inspectable projection content. |
| `projection_version` | string | Yes | Builder/schema version. |
| `content_hash` | string | Yes | Integrity/rebuild comparison hash. |
| `redaction_policy` | string | Yes | Applied data-classification/redaction rule. |
| `embedding_model` | string \| null | Yes | Derived-index model/version when embedded. |
| `generated_at` | RFC 3339 | Yes | Projection generation time. |

An embedding may be deleted and rebuilt from `source_refs`; it never becomes authority over the relational records.

### `DecisionReceipt`

| Field | Type | Required | Description |
|---|---|---|---|
| `decision_id` | UUID | Yes | Immutable decision identifier. |
| `proposal_id` | UUID | Yes | Reviewed proposal. |
| `proposal_version` | string | Yes | Version actually decided. |
| `actor` | object | Yes | Server-issued actor and role. |
| `action` | `approve \| reject \| request_evidence` | Yes | Terminal/transition action. |
| `rationale` | string | Yes | Nonblank human rationale. |
| `policy_ref` | string | Yes | Governing policy/version. |
| `evidence_refs` | string[] | Yes | Evidence considered by the decision. |
| `timestamp` | RFC 3339 | Yes | Decision time. |
| `memory_id` | UUID \| null | Yes | Resulting approved memory when created. |
| `sync_state` | `committed \| queued \| failed` | Yes | Truthful outbox/synchronization state. |

### `ReviewApiError`

| HTTP | Code | UI behavior |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Keep input; identify invalid field. |
| 401 | `UNAUTHENTICATED` | Stop; require a new authenticated session. |
| 403 | `FORBIDDEN` | Show a permission state; never an empty queue. |
| 404 | `NOT_FOUND` | Explain the item is absent or no longer available in scope. |
| 409 | `DECISION_CONFLICT` | Refresh authoritative state; never show success. |
| 503 | `DEPENDENCY_DEGRADED` | Display degraded source state and retry option. |

---

## Sync Contract Mapping Table

The sync contract (`src/lib/graph-adapter/sync-contract-mappings.ts`) provides deterministic mappings for relationship wiring during memory promotion (AD-28).

### Mapping Tables

| Mapping | Source Key | Target Node | Used By |
|---------|-----------|------------|----------|
| `user_id → Agent` | `user_id` (e.g., `fowler`, `woz-builder`) | Agent node `name` property | Curator approve, auto-promote |
| `group_id → Project` | `group_id` (e.g., `allura-system`) | Project node `name` property | Curator approve, auto-promote |

### Event Log

When the sync contract applies mappings, an event with `event_type = 'sync_contract'` is written to PostgreSQL `events` table with metadata containing:

```jsonc
{
  "memory_id": "uuid",
  "agent_name": "Fowler",
  "project_name": "Allura Memory",
  "relationships_wired": ["AUTHORED_BY", "CONTRIBUTES_TO"]
}
```

### `control_plane_rule`

```jsonc
{
  "rule_id": "RULE-004",
  "event_type": "control_plane_rule",
  "score": 0.91,
  "status": "active",
  "evidence": "proposal_created",
  "audit_ref": "events.id"
}
```
