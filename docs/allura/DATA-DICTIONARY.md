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

**Workspace RLS:** Migrations 39 and 40 preserve every heterogeneous pre-existing `events` policy and add `workspace_scope_restrictive_policy`. PostgreSQL ANDs this restrictive `allura_app` tenant/workspace predicate with the permissive policy set, so an A-scoped app transaction cannot read or write same-group workspace B events without erasing predicates owned by earlier migrations.

**`event_type` values**

| Value | Description |
|-------|-------------|
| `memory_add` | A memory was written by an agent |
| `memory_search` | A search query was executed |
| `memory_get` | A single memory was fetched by ID |
| `memory_list` | All memories for a user were listed |
| `memory_delete` | A memory was soft-deleted |
| `memory_promoted` | A memory was successfully promoted to `graph_memories` |
| `promotion_failed` | `graph_memories` write failed — episodic record retained |
| `promotion_queued` | SOC2 mode — memory queued for human approval |
| `proposal_created` | A canonical proposal was created for HITL review |
| `proposal_approved` | A proposal was approved and promoted to `graph_memories` |
| `notion_sync_pending` | A proposal is queued for Notion page creation |
| `debug:root_cause_found` | Phase 1 complete — root cause identified with evidence (POL-006) |
| `debug:hypothesis_tested` | Phase 3 — a single hypothesis was minimally tested |
| `debug:fix_implemented` | Phase 4 — fix shipped after root cause confirmed (requires prior `debug:root_cause_found`) |
| `neo4j_unavailable` | Graph backend was unreachable — system degraded gracefully (event name retained for back-compat; Neo4j retired Epic 23) |
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

**Workspace scope, trace identity, and index:** `workspace_id` is nullable only for legacy rows and is required by the `allura_app` workspace-RLS boundary. `idx_canonical_proposals_workspace_queue` is `(group_id, workspace_id, status, score DESC)` partial on non-null workspace IDs. `idx_canonical_proposals_trace_ref_unique` remains the single partial unique index on non-null `trace_ref`: `events.id` is a globally durable identifier, so one event belongs to one workspace and cannot legitimately yield proposals in two workspaces. Migration 39 does not drop or replace that index with a scoped duplicate. It preserves every heterogeneous pre-existing policy byte-for-byte and adds `workspace_scope_restrictive_policy`; PostgreSQL ANDs that restrictive tenant/workspace predicate with the existing permissive policy set.

---

## PostgreSQL: workspace evidence lifecycle (migration 39)

### `evidence_requests`
`id` UUID PK; non-null `group_id`, `workspace_id`, `proposal_id`, `requested_by`, `reason`, `state` (`requested|satisfied|reopened|cancelled`), timestamps/resolver, and JSONB-array `evidence_references`. FKs bind both `(group_id, workspace_id)` to `workspaces` and `(group_id, workspace_id, proposal_id)` to `canonical_proposals`; cross-workspace proposal references are rejected. Index: `evidence_requests_scope_proposal_state_idx`.

### `governance_receipts`
Immutable scoped receipt: UUID `id`, scope, required proposal identity/version and evidence-request identity, action, server-issued actor/role, nonblank rationale and policy reference/version, `memory_id`, `result_ref`, source event/witness, immutable non-empty JSONB-array evidence references, SHA-256 `evidence_identity_hash` over the complete sorted unique reference array, database-issued occurrence time, and truthful `outbox_state` (`not_enqueued|queued|synced|failed|not_applicable`; Migration-38 `delivered` maps to `synced`). Reordering the same full evidence set retains replay identity; changing any member changes it. When `source_event_id` is non-null, the `governance_receipts_source_event_scope_fkey` binds `(group_id, workspace_id, source_event_id)` to the event's composite scoped identity, rejecting cross-workspace and cross-tenant provenance forgery. The `NOT VALID` upgrade constraints preserve pre-existing data without a workspace backfill while enforcing every new write. Index: `governance_receipts_scope_proposal_occurred_idx`; update/delete trigger rejects mutation.

### `semantic_projections`
Derived, rebuildable scoped index: UUID `id`, source kind/id, projection version, independent source-revision and Markdown content hashes, non-empty JSONB-array `source_refs` (canonical source table/row relationships), redaction policy version, governed Markdown, optional vector/model, build state/failure, and generated time. Deterministic unique key includes scope, source identity, projection version, both hashes, **source_refs**, and redaction policy. Index: `semantic_projections_scope_source_generated_idx`.

All three tables have forced workspace RLS for `allura_app`, using both transaction-local `app.current_group_id` and `app.current_workspace_id` in `USING`/`WITH CHECK`.

---

## PostgreSQL: Graph Adapter Tables

**Migrations:** `21-graph-adapter-tables.sql`, `24-graph-structural-context.sql`
**ADR:** AD-29 — Graph Adapter Pattern for Neo4j → RuVector Migration

These tables replace Neo4j nodes and relationships when `GRAPH_BACKEND=ruvector`. They implement the adjacency list pattern to replicate SUPERSEDES and structural context operations via PostgreSQL.

### `graph_memories`

**Migrations:** `21-graph-adapter-tables.sql`, `40-workspace-subgraph-forward-upgrade.sql`

Stores canonical (promoted) memory nodes equivalent to Neo4j's Memory label. Used by the RuVectorGraphAdapter when `GRAPH_BACKEND=ruvector`. Soft-deletes are marked via `deprecated=true`; restored memories set `restored_at`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | TEXT | Yes | Memory node identifier (UUID) |
| `group_id` | TEXT | Yes | Tenant namespace. CHECK: `^allura-[a-z0-9-]+$` |
| `workspace_id` | TEXT | Current rows | Workspace authority. Legacy `NULL` rows are quarantined and excluded from application reads. |
| `workspace_scope_state` | TEXT | Yes | `workspace_scoped` only with a non-null workspace; `legacy_quarantined` only with `workspace_id IS NULL`. |
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

**Authority:** Migration 40 adds unique `(group_id, workspace_id, id)`, a same-scope workspace FK, and restrictive `allura_app` RLS. Canonical approval and controlled retrieval write/filter all three scope fields. Legacy `NULL` workspace rows remain owner-visible for remediation but are never current application knowledge.

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
| `neo4j` | Neo4j backend (legacy, retired Epic 23) | **Retired** |
| `ruvector` | PostgreSQL graph adapter tables (`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`) | **Default** |
| `ruvector-crate` | Native RuVector extension with HNSW and GNN support (not yet implemented) | Planned |

**Current default:** `ruvector` (sole backend since Epic 23; `neo4j` retired)

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

### `DashboardGovernanceActionSummary` (legacy dashboard adapter)

This adapter summary is **not** the durable `GovernanceReceipt` authority. The sole
current receipt contract is the Story 25.2a `GovernanceReceipt` definition below;
dashboard adapters must map that durable record rather than publish a second receipt shape.

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
| `label` | string | Yes | Human-readable source label, e.g. `PostgreSQL events`, `graph_memories`, `Curator proposals` |
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

## Story 25.2a Durable Workspace Evidence Contracts

Story 25.2a defines relational foundations only. Browser queue, map, assistant,
module, intake, external identity, demonstration, and later-story UI/API contracts
are intentionally excluded until their owning stories are implemented and reviewed.

### `EvidenceRequest`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Durable lifecycle identity. |
| `group_id` | string | Yes | Server-derived tenant scope. |
| `workspace_id` | string | Yes | Server-derived workspace scope. |
| `proposal_id` | UUID | Yes | Same-scope proposal identity. |
| `state` | `requested \| satisfied \| reopened \| cancelled` | Yes | Lifecycle state, separate from proposal status. |
| `reason` | string | Yes | Nonblank governed request rationale. |
| `requested_by` / `requested_at` | string / RFC 3339 | Yes | Server-issued requester and time. |
| `resolved_by` / `resolved_at` | string / RFC 3339 | No | Server-issued resolution identity and time. |
| `evidence_references` | string[] | Yes | Governed evidence identities. |

### `SemanticProjection`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Projection row identity. |
| `group_id` / `workspace_id` | string | Yes | Server-derived scope. |
| `source_kind` / `source_id` | string | Yes | Authoritative relational entity identity. |
| `source_refs` | object[] | Yes | Canonical same-scope table/row references used by the builder. |
| `markdown` | string | Yes | Deterministic governed Markdown derived from relational facts. |
| `projection_version` | string | Yes | Builder/schema version. |
| `source_revision_hash` | SHA-256 | Yes | Hash of canonical source facts. |
| `content_hash` | SHA-256 | Yes | Independent Markdown content hash. |
| `redaction_policy_version` | string | Yes | Applied classification/redaction policy. |
| `build_state` | `pending_embedding \| ready \| failed` | Yes | Projected/redacted Markdown is pending until a real embedding result is persisted. `ready` requires vector plus exact model and version. |
| `embedding` | vector \| null | No | Actual produced vector; null while pending or failed. |
| `embedding_model` / `embedding_model_version` | string / string \| null | No | Exact producer provenance, present only with a persisted vector and `ready` state. |
| `generated_at` | RFC 3339 | Yes | Server generation time; excluded from idempotency identity. |

### `GovernanceReceipt`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Immutable receipt identity. |
| `group_id` / `workspace_id` | string | Yes | Server-derived scope. |
| `proposal_id` / `proposal_version` | UUID / string | Yes | Exact proposal revision decided. |
| `evidence_request_id` | UUID | Conditional | Compatibility pointer to the first canonical evidence request; required for `request_evidence`. Complete membership is authoritative in `governance_receipt_evidence_requests`. |
| `evidence_identity_hash` | SHA-256 | Yes | Hash of the complete sorted, unique `evidence_references` array. |
| `actor_id` / `actor_role` | string | Yes | Server-issued authenticated reviewer identity (`curator | admin`). |
| `action` | `approve \| reject \| request_evidence` | Yes | Governed action. |
| `rationale` | string | Yes | Nonblank rationale. |
| `policy_reference` / `policy_version` | string | Yes | Governing policy identity. |
| `memory_id` | string \| null | No | Resulting promoted `graph_memories.id` when applicable. |
| `result_ref` | string \| null | No | Optional durable result identity for non-memory outcomes. |
| `outbox_state` | `not_enqueued \| queued \| synced \| failed \| not_applicable` | Yes | State derived from the durable outbox, never caller supplied. |
| `source_event_id` | bigint | Yes (current) | Same-scope authoritative source event; composite FK prevents cross-workspace provenance. |
| `witness_hash` | string \| null | No | Decision witness hash copied from the locked proposal transition. |
| `evidence_references` | string[] | Yes | Canonically sorted immutable source identities; not the relational authority for evidence-request membership. |
| `occurred_at` | RFC 3339 | Yes | Database-issued decision time (`DEFAULT NOW()` / SQL `NOW()`); callers do not supply it. |
| `created_at` | RFC 3339 | Yes | Database row creation time (`DEFAULT NOW()`). |

### `governance_receipt_evidence_requests`

Immutable FK-backed membership for **every** evidence request considered by a receipt. Fields are `receipt_id`, `group_id`, `workspace_id`, `proposal_id`, `evidence_request_id`, and zero-based canonical `ordinal`. Composite FKs bind both receipt and evidence request to the same tenant/workspace/proposal. `(receipt_id,evidence_request_id)` and `(receipt_id,ordinal)` are unique; update/delete triggers reject mutation, and both parent deletes are `RESTRICT`.

Proposal `status` remains `pending | approved | rejected`; request-evidence state is
read from `evidence_requests` and must never be collapsed into proposal status.

---

## Story 26.1 Allura Threat Intelligence Contracts

These began as documentation contracts and now describe downstream Allura evidence
shapes implemented across later Epic 26 stories. They do not define the upstream
Bumblebee scanner wire or snapshot-state contract, which is replanned in Story 26.7.
through governed, server-scoped APIs. No caller-supplied `group_id` or
`workspace_id` is authoritative.

### `ThreatAdvisoryEvidence`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Immutable evidence identity. |
| `group_id` / `workspace_id` | string | Yes | Server-derived tenant/workspace scope. |
| `source_id` / `source_url` | string / URL | Yes | Reviewed allowlist identity and canonical location. |
| `publisher` | string | Yes | Named publisher responsible for the advisory. |
| `published_at` / `fetched_at` | RFC 3339 | Yes | Publisher and retrieval times; used for freshness calculation. |
| `source_revision` / `content_hash` | string / SHA-256 | Yes | Upstream revision when available and immutable payload identity. |
| `trust_state` | `provisional \| verified \| rejected` | Yes | Verification outcome; only `verified` may support an alert. |
| `freshness_state` | `fresh \| stale \| degraded \| unknown` | Yes | Explicit freshness/degradation outcome. |
| `classification` / `redaction_policy_version` | string | Yes | Data handling and redaction provenance. |
| `retention_disposition` | string | Yes | Policy-defined retention class; deletion remains append-only/auditable. |
| `indicators` | object[] | Yes | Normalized affected artifact/version/CVE or equivalent supporting indicators. |

### `ThreatExposureAlert` — implemented as `threat_alerts` (migration 42, Story 26.4)

This planned contract is now implemented. One field differs from the original
plan: `state` is `lifecycle_state`, with the richer vocabulary Story 26.4's
own acceptance criteria required (`new | acknowledged | mitigated | resolved |
stale`) rather than the originally planned `open | acknowledged | resolved |
suppressed` — Story 26.3's in-memory `ExposureAlert.state` (always created as
`open`) still uses the original four-value enum and maps to `lifecycle_state:
"new"` on first persistence; the two are deliberately separate vocabularies
for two different layers (in-memory match output vs. durable, tenant-routed
lifecycle). `stale` is a lifecycle state, not a separate freshness column: it
means the alert's supporting evidence has degraded since creation, and is
never silently retained as if still current (AC-4). `resolved` is terminal —
a staleness transition never overwrites it.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Immutable alert identity. |
| `group_id` / `workspace_id` | string | Yes | Server-derived scope. |
| `inventory_ref` / `artifact_ref` | string | Yes | Authoritative approved inventory and affected artifact identities. |
| `advisory_refs` | string[] | Yes | Advisory identities that produced this alert (may span multiple advisories for the same exposure). |
| `match_type` | string | Yes | Deterministic correlation rule identifier. |
| `confidence` / `severity` | number / string | Yes | Bounded assessment with rule/source provenance. |
| `evidence_ids` | string[] | Yes | Complete immutable advisory/internal-evidence lineage. |
| `dedup_key` | string | Yes | Scope-bound idempotency identity for repeated observations; `UNIQUE (group_id, workspace_id, dedup_key)`. |
| `lifecycle_state` | `new \| acknowledged \| mitigated \| resolved \| stale` | Yes | Alert lifecycle; no enforcement state is implied. The only column an UPDATE may touch, besides `updated_at` — every other field is immutable once written (`app.guard_threat_alert_lifecycle_update()`). |
| `created_at` / `updated_at` | RFC 3339 | Yes | Database-issued alert and last-transition times. |

### `SimulatedMitigationProposal`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | UUID | Yes | Immutable proposal identity. |
| `alert_id` / `evidence_ids` | UUID / UUID[] | Yes | Same-scope alert and complete supporting evidence lineage. |
| `recommended_action` | string | Yes | Human-readable, non-executing mitigation recommendation. |
| `approval_state` | `draft \| reviewed \| approved \| rejected` | Yes | Human review lifecycle, not an enforcement result. |
| `approved_by` / `approved_at` | string / RFC 3339 | No | Server-issued only after a human decision. |
| `governance_receipt_id` | UUID | No | Required before a separately approved later workflow can consume it. |

**Prohibited V1 fields/actions:** endpoint scan command, policy activation flag,
CI/package block flag, schedule-change action, credential revocation, workspace lock,
or containment command. Their presence would violate AD-57 rather than extend this
contract.

---

## Story 26.2 Supply-Chain Inventory

Read-only metadata inventory of approved software and AI supply-chain artifacts.
This is a code-level contract in `src/lib/inventory/` backed by declared metadata
records; it performs no executable scanning, no package installation, and no
package-manager invocation. No DB tables or migrations are added for this story.
`trust_state` and `freshness_state` values are shared with the Story 26.1
`ThreatAdvisoryEvidence` contract; change both in lockstep.

### `InventoryRecord` — persisted as `inventory_records` (migration 44, Allura-local Story 26.2 adjunct)

The schema below was originally an in-memory-only shape (`src/lib/inventory/service.ts`).
It is now also a real, persisted table with the identical field names, populated by
reconciling real sources -- currently `bun.lock` only (`src/lib/inventory/lockfile-parser.ts`,
`reconciliation.ts`). Unlike `governance_receipts`/`mitigation_receipts`/`threat_alerts`,
this table is fully mutable (no restricted-column trigger) -- a real dependency's
version and hash genuinely change between reconciliation cycles.

This table is not the upstream Bumblebee raw/run/current snapshot contract. The Epic 26
Correct Course plans separate sanitized plugin ledgers and a nullable downstream adapter;
upstream fields must not be forced into this table using invented sentinels.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Immutable within-tenant key; re-ingestion of the same id updates the record. |
| `group_id` | string | Yes | Server-derived tenant namespace (`^allura-[a-z0-9-]+$`). |
| `workspace_id` | string | Yes | Server-derived workspace scope. |
| `artifact_type` | enum | Yes | `sbom`, `lockfile`, `package_manifest`, `ci_workflow`, `container_metadata`, `extension`, `mcp_manifest`, `skill`, `plugin`, `model_artifact`. |
| `ecosystem` | string | Yes | Logical ecosystem the artifact belongs to (e.g., `npm`, `python`, `github-actions`, `ollama`). |
| `package` | string | Yes | Artifact package or logical name. |
| `version` | string | Yes | Declared version string. |
| `hash` | string | Yes | Immutable identity hash for the artifact metadata. |
| `publisher` | string | Yes | Named publisher or owner of the artifact. |
| `workflow_reference` | string | Yes | Human-readable reference to the CI/workflow that produced or approved the artifact metadata. |
| `source_ref` | string | Yes | Reference to the declared source list this record came from. |
| `trust_state` | enum | Yes | `provisional`, `verified`, `rejected`. |
| `freshness_state` | enum | Yes | `fresh`, `stale`, `degraded`, `unknown`; stale or degraded records are surfaced explicitly, never silently omitted. |
| `created_at` | RFC 3339 | Yes | Record creation time. |
| `updated_at` | RFC 3339 | Yes | Last update time. |

### `InventorySourceRecord`

Declaration shape supplied to the service. The service normalizes it into an
`InventoryRecord` by stamping server-derived `group_id` and `workspace_id`. Callers
cannot supply an authoritative scope.

### `InventoryQuery`

Read-only query filters. Tenant scope is supplied separately from the authenticated
principal.

| Field | Type | Required | Description |
|---|---|---|---|
| `artifact_type` | enum | No | Filter by one of the artifact type values. |
| `ecosystem` | string | No | Case-insensitive filter by ecosystem. |
| `package` | string | No | Case-insensitive filter by package name. |

### `InventoryQueryResult`

| Field | Type | Required | Description |
|---|---|---|---|
| `records` | `InventoryRecord[]` | Yes | Matching records scoped to the authenticated tenant/workspace. |
| `total` | integer | Yes | Count of matching records. |
| `degraded` | boolean | Yes | True when partial data is returned. |
| `warnings` | string[] | Yes | Non-fatal warnings. |

---

## Story 26.5 — Governed Mitigation Policy Drafts

Read-only simulated policy draft generator. Source: `src/lib/mitigation/`. A validated `ExposureAlert` maps deterministically to a versioned `MitigationTemplate`, producing a reviewable `MitigationDraft` with dry-run results, scope explanation, and rollback evidence. It may also produce a local `MitigationDraftRecord` for simulated draft activity. Draft generation does not execute package blocks, CI changes, containment, connector actions, policy approval, or activation. Any future mutation must use the canonical governance receipt and approval path.

### `MitigationTemplate`

| Field                  | Type                                                         | Required | Description                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | `string`                                                     | Yes      | Stable template identifier.                                                                                                                                |
| `version`              | `string`                                                     | Yes      | Semantic version of the template; new versions are immutable.                                                                                              |
| `name`                 | `string`                                                     | Yes      | Human-readable template name.                                                                                                                              |
| `description`          | `string`                                                     | Yes      | What the draft proposes.                                                                                                                                   |
| `affected_scope_kinds` | `systems \| packages \| workflows \| tokens \| workspaces`[] | Yes      | Kinds of scope the policy would affect.                                                                                                                    |
| `parameter_schema`     | `ZodTypeAny`                                                 | Yes      | Immutable strict Zod object schema for typed, bounded parameters derived from alert fields. Free-text advisory content can never satisfy a parameter slot. |
| `dry_run_plan`         | `string`                                                     | Yes      | Human-readable description of what the dry-run computes.                                                                                                   |
| `rollback_plan`        | `string`                                                     | Yes      | Human-readable reversal plan, executed only via approved governance receipt.                                                                               |
| `created_at`           | `string`                                                     | Yes      | RFC 3339 template publication time.                                                                                                                        |

### `MitigationDraft`

| Field                              | Type                            | Required | Description                                                                                                         |
| ---------------------------------- | ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `id`                               | `string`                        | Yes      | Unique draft identity.                                                                                              |
| `group_id`                         | `string`                        | Yes      | Server-derived tenant namespace.                                                                                    |
| `workspace_id`                     | `string`                        | Yes      | Server-derived workspace scope.                                                                                     |
| `alert_id`                         | `string`                        | Yes      | Source `ExposureAlert` id.                                                                                          |
| `template_id` / `template_version` | `string` / `string`             | Yes      | Exact template revision used.                                                                                       |
| `parameters`                       | `Record<string, unknown>`       | Yes      | Validated against the template's `parameter_schema`. Only typed evidence fields from the alert may populate values. |
| `scope_explanation`                | `string`                        | Yes      | What systems, packages, workflows, tokens, or workspaces are affected.                                              |
| `dry_run_result`                   | `string`                        | Yes      | Description of what would happen without executing.                                                                 |
| `rollback_evidence`                | `string`                        | Yes      | Reversal evidence and governance path.                                                                              |
| `authority_state`                  | `"simulated_only"`              | Yes      | Drafts are never active policy.                                                                                     |
| `approval_state`                   | `draft \| reviewed \| rejected` | Yes      | Local simulated-draft lifecycle; approval is unavailable.                                                           |
| `evidence_ids`                     | non-empty `string[]`            | Yes      | Evidence references copied from the alert.                                                                          |
| `created_at`                       | `string`                        | Yes      | RFC 3339 draft creation time.                                                                                       |

### `MitigationDraftRecord`

Local, in-memory attribution record generated by `createDraftRecord` for simulated draft actions. It is **not** an authenticated or durable `GovernanceReceipt` and cannot approve, activate, or enforce a policy.

| Field                                 | Type                                                | Required | Description                                                      |
| ------------------------------------- | --------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| `id`                                  | `string`                                            | Yes      | Locally generated record identity.                               |
| `group_id` / `workspace_id`           | `string` / `string`                                 | Yes      | Scope copied from the simulated draft.                           |
| `draft_id`                            | `string`                                            | Yes      | Related `MitigationDraft` id.                                    |
| `actor_id` / `actor_role`             | `string` / `string`                                 | Yes      | Caller-supplied simulation attribution; not authenticated proof. |
| `action`                              | `draft_created \| draft_reviewed \| draft_rejected` | Yes      | Simulated draft action; approval is intentionally unavailable.   |
| `rationale`                           | `string`                                            | Yes      | Nonblank simulated-action rationale.                             |
| `policy_reference` / `policy_version` | `string` / `string`                                 | Yes      | Template id/version used for the draft.                          |
| `evidence_ids`                        | non-empty `string[]`                                | Yes      | Evidence references copied from the draft.                       |
| `occurred_at`                         | `string`                                            | Yes      | Locally generated simulation timestamp.                          |

### Template library

| Template id                         | Trigger                                        | Affected scope                    | Purpose                                    |
| ----------------------------------- | ---------------------------------------------- | --------------------------------- | ------------------------------------------ |
| `mitigation-compromised-dependency` | `package_version`, `package_hash`, `publisher` | `packages`, `systems`             | Propose a package pin/upgrade review.      |
| `mitigation-malicious-install-hook` | `workflow_reference`                           | `workflows`, `systems`            | Propose a workflow/action inspection gate. |
| `mitigation-credential-exposure`    | `indicator`                                    | `tokens`, `workspaces`, `systems` | Propose a token rotation review.           |

### Invariants

- Draft generation is read-only and in-memory only.
- Parameters are derived only from typed alert fields (`inventory_ref`, `artifact_ref`, `match_type`, `severity`, `evidence_ids`). Advisory free-text never becomes a parameter value or instruction.
- `authority_state` is always `simulated_only`; the draft API cannot approve or activate policy.
- Activation, enforcement changes, schedule changes, and external response actions are outside this slice and must use the canonical governance approval and receipt path.

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

---

## Story 26.3 — Exposure Matcher

Read-only matching of threat advisories against the Story 26.2 supply-chain inventory. Source: `src/lib/exposure/`.

### `ThreatAdvisory`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Advisory identifier. |
| `source_id` | `string` | Yes | External source identifier (e.g., GHSA, OSV). |
| `source_url` | `string` | Yes | Canonical source URL. |
| `publisher` | `string` | Yes | Entity that published the advisory. |
| `published_at` | `string` | Yes | RFC 3339 publication timestamp. |
| `fetched_at` | `string` | Yes | RFC 3339 fetch timestamp. |
| `source_revision` | `string` | Yes | Source revision or sequence id. |
| `content_hash` | `string` | Yes | Hash of the normalized advisory content. |
| `trust_state` | `provisional \| verified \| rejected` | Yes | Story 26.1 trust contract; only `verified` may match. |
| `freshness_state` | `fresh \| stale \| degraded \| unknown` | Yes | `stale`/`degraded`/`unknown` fail closed. |
| `classification` | `string` | Yes | Advisory category. |
| `retention_disposition` | `string` | Yes | Retention policy label. |
| `severity` | `low \| medium \| high \| critical` | Yes | Exposure severity. |
| `evidence_ids` | `string[]` | Yes | Supporting evidence references. |
| `indicators` | `Indicator[]` | Yes | Normalized match indicators. |

### `Indicator`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | `cve \| package \| version \| hash \| publisher \| workflow_reference \| credential \| install_hook \| action_ref` | Yes | Indicator kind. |
| `value` | `string` | Yes | Exact match value. |

### `ExposureMatch`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `inventory_ref` | `string` | Yes | Matched inventory record id. |
| `artifact_ref` | `string` | Yes | Matched artifact `source_ref`. |
| `advisory_ref` | `string` | Yes | Advisory id that produced the match. |
| `match_type` | `package_version \| package_hash \| workflow_reference \| indicator \| publisher` | Yes | Match classification. |
| `confidence` | `number` | Yes | 0–1; exact matching yields 1. |
| `severity` | `Severity` | Yes | Severity inherited from the advisory. |
| `evidence_ids` | `string[]` | Yes | Evidence references from the advisory. |

### `ExposureAlert`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Unique per alert creation (derived from `dedup_key` + creation timestamp). NOT stable across re-matches; consumers must key on `dedup_key` for idempotency. |
| `group_id` | `string` | Yes | Server-derived tenant namespace. |
| `workspace_id` | `string` | Yes | Server-derived workspace scope. |
| `inventory_ref` | `string` | Yes | Inventory record id. |
| `artifact_ref` | `string` | Yes | Artifact `source_ref`. |
| `advisory_refs` | `string[]` | Yes | Collapsed advisory ids for the same exposure. |
| `match_type` | `MatchType` | Yes | Match classification. |
| `confidence` | `number` | Yes | Exact match confidence. |
| `severity` | `Severity` | Yes | Highest severity among collapsed advisories. |
| `evidence_ids` | `string[]` | Yes | Merged evidence references. |
| `dedup_key` | `string` | Yes | SHA-256 of scope + inventory ref + artifact ref + match type. |
| `state` | `open \| acknowledged \| resolved \| suppressed` | Yes | Alert lifecycle state. |
| `created_at` | `string` | Yes | RFC 3339 creation timestamp. |

### `ExposureQuery`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `severity` | `Severity` | No | Filter by severity. |
| `state` | `AlertState` | No | Filter by alert state. |

### Matching rules

- Exact match only: package+version, package+hash, workflow/action reference, publisher, or indicator value must equal the inventory field.
- Fail-closed (both sides): a match requires the advisory **and** the inventory record to both have `trust_state === "verified"` and `freshness_state === "fresh"`. Any other trust or freshness state on either side produces no match.
- Scope is validated here; principal-binding is enforced at the API boundary (Story 26.1).
- Read-only: the matcher never writes to a database, filesystem, or subprocess, and never activates policy.
- Deduplication: one alert per unique exposure (`scope + inventory_ref + artifact_ref + match_type`); re-matching yields the same `dedup_key`.

### Match-type precedence

Matchers are evaluated from most specific to most general. A single inventory record produces at most one match per advisory:

1. `package_version` — both package and version match.
2. `package_hash` — hash matches.
3. `workflow_reference` — workflow/action reference matches.
4. `publisher` — publisher matches.
5. `indicator` — fallback for credential/install-hook/action indicators that do not map to a dedicated type.
