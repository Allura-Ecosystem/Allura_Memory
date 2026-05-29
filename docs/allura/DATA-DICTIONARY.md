# Data Dictionary: Allura Data Models

This document describes every table and node type in Allura's dual-database data model. PostgreSQL holds episodic memory (append-only event log). Neo4j holds semantic memory (versioned knowledge graph).

---

## Table of Contents

- [PostgreSQL: events](#postgresql-events)
- [PostgreSQL: canonical_proposals](#postgresql-canonical_proposals)
- [RuVix Governance Artifacts](#ruvix-governance-artifacts)
- [Neo4j: Memory](#neo4j-memory)
- [Neo4j: Agent](#neo4j-agent)
- [Neo4j: Team](#neo4j-team)
- [Neo4j: Project](#neo4j-project)
- [Neo4j: Relationships](#neo4j-relationships)
- [Dashboard Adapter Contracts](#dashboard-adapter-contracts)
- [Metadata Payloads](#metadata-payloads)

---

## Dashboard v2 condensed data contracts

### `DashboardResult<T>`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `data` | `T \| null` | Yes | Mapped dashboard data or null when unavailable. |
| `error` | `string \| null` | Yes | Human-readable error, null when absent. |
| `degraded` | `boolean` | Yes | True when partial data is rendered. |
| `warnings` | `DashboardWarning[]` | Yes | Non-fatal warnings from adapters, validators, or backends. |

### `DashboardWarning`

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

Dashboard data rules: every record includes `group_id`; unknown source state renders as unknown, not zero; no fabricated counts; export/copy actions are read-only formatting operations over existing records and must not mutate PostgreSQL or Neo4j.

---

## Dashboard Adapter Contracts

These are logical UI/adapter contracts for the Mission Control dashboard rebuild. They do not create new persistence stores. They define the fields the dashboard must display or consume so the rebuilt development surface on `3334` can safely replace the current Docker dashboard on `3100` after validation.

### `DashboardRouteParityItem`

Maps the `6420` visual/reference memory dashboard capability into the Mission Control route that must preserve it.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source_surface` | string | Yes | Reference surface, e.g. `localhost:6420` |
| `source_capability` | string | Yes | Capability observed on the reference surface, e.g. `Memories`, `Insights`, `Approval Queue` |
| `target_surface` | string | Yes | Development integration target, e.g. `localhost:3334` |
| `target_route` | string | Yes | Mission Control route, e.g. `/allura`, `/telemetry`, `/agents` |
| `parity_status` | enum | Yes | `missing`, `partial`, `complete`, `intentionally_changed` |
| `evidence_ref` | string | No | Screenshot, test, Notion page, or validation artifact proving parity status |
| `notes` | string | No | Explanation of gaps or intentional differences |

### `AdapterDeclaration`

Declares each Mission Control route's source of truth and allowed behavior. Every route must expose this declaration in UI or validation evidence before `3100` cutover.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adapter_id` | string | Yes | Stable identifier, e.g. `allura-brain`, `notion-work-board`, `resource-manifest` |
| `display_name` | string | Yes | Human-readable name |
| `route` | string | Yes | Mission Control route using the adapter |
| `system_of_record` | string | Yes | Authoritative source, e.g. Notion, Allura Brain APIs, Resource Manifest |
| `read_policy` | string | Yes | What the adapter may read |
| `write_policy` | string | Yes | What writes are allowed, if any |
| `memory_scope` | string | Yes | What memory/context may be persisted to Allura Brain |
| `evidence_policy` | string | Yes | Required proof before status changes or cutover |
| `retention_policy` | string | No | How long operational/evidence data is retained |
| `degradation_behavior` | string | Yes | What UI shows when the adapter is unavailable or unknown |
| `approved_actions` | list<string> | No | Explicit allowed actions |
| `prohibited_actions` | list<string> | Yes | Actions that must never be performed by this adapter |

### `CutoverGate`

Defines the required validation gates before Mission Control replaces the current Docker dashboard on `3100`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gate_id` | string | Yes | Stable gate ID, e.g. `route-parity`, `auth-validation`, `rollback-ready` |
| `description` | string | Yes | What must be proven |
| `status` | enum | Yes | `pending`, `passed`, `failed`, `waived` |
| `owner` | string | Yes | Responsible person or agent/team |
| `evidence_ref` | string | No | Link to test output, screenshot, Notion validation page, or commit |
| `decided_by` | string | No | Captain/human approver for pass/waive decisions |
| `decided_at` | datetime | No | Decision timestamp |

---

## PostgreSQL: `events`

**JSON Schema:** [`json-schema/event.schema.json`](../../json-schema/event.schema.json)

The primary and only append-only log. Every memory operation — add, search, get, list, delete, promotion — produces one row. Rows are permanent. No UPDATE or DELETE, ever. Every operation carries the RuVix identity envelope: `group_id`, `agent_id`, and `session_id`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | bigserial | Yes | Auto-increment primary key |
| `group_id` | varchar(255) | Yes | Tenant namespace. CHECK constraint: must match `^allura-` |
| `event_type` | varchar(100) | Yes | Operation type — see values below |
| `agent_id` | varchar(255) | Yes | Identifier of the agent or user who triggered the event |
| `workflow_id` | varchar(255) | No | Optional grouping for multi-step workflows |
| `session_id` | varchar(255) | Yes | Session identifier for identity scoping and audit correlation |
| `status` | varchar(50) | Yes | Default: `completed`. See values below |
| `metadata` | jsonb | No | Event-specific payload — see Metadata Payloads section |
| `created_at` | timestamptz | Yes | Write timestamp. DEFAULT NOW(). Immutable. |
| `halted_at` | timestamptz | No | When a budget session was halted. Present only when `event_type` relates to budget enforcement. |
| `halt_ttl_ms` | integer | No | Budget enforcer auto-expiry TTL in milliseconds. Default: 3600000 (1 hour). See AD-27. |

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
| `kernel_rule` | RuVix kernel rule evaluation or rule-anchored audit event |

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
- Referenced by: `notion_sync_dlq.proposal_id` → `canonical_proposals(id)` ON DELETE SET NULL

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

### `KernelRuleEvent`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rule_id` | string | Yes | RuVix rule that was evaluated |
| `event_type` | string | Yes | Must be `kernel_rule` |
| `group_id` | string | Yes | Tenant namespace for the event |
| `agent_id` | string | Yes | Agent identity for the event |
| `session_id` | string | Yes | Session identity for the event |
| `score` | float | Yes | Rule evaluation score |
| `metadata` | jsonb | No | Evidence payload, decision rationale, and audit context |

### `RuVixBrandRule`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rule_id` | string | Yes | Brand rule identifier, one of `BRAND-001` through `BRAND-006` |
| `content` | text | Yes | Enforceable brand rule text |
| `score` | float | Yes | Enforcement confidence or compliance score from `0.0` to `1.0` |
| `status` | enum | Yes | Rule lifecycle state (`active`, `deprecated`, `pending`) |

### `DashboardClaim`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `claim_id` | string | Yes | Stable claim identifier for a dashboard assertion |
| `states_covered` | list<string> | Yes | UI states covered by the claim (empty, loading, error, success, mobile, keyboard, etc.) |
| `evidence_attached` | list<string> | Yes | Evidence bundle types attached to the claim (`screenshot`, `audit`, `anti-drift`) |
| `approval_status` | enum | Yes | Claim status (`pending`, `approved`, `rejected`) |

### `DurhamTokenAudit`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `allowed_prefix` | string | Yes | Only `--durham-*` CSS custom properties are allowed in dashboard scope |
| `forbidden_patterns` | list<string> | Yes | Disallowed tokens and styles: `dark-green`, `brand-gold`, `Poppins`, `Inter`, `Montserrat` |
| `scope` | string | Yes | Dashboard surface or component under review |
| `status` | enum | Yes | Audit state (`pending`, `passed`, `failed`) |

### `DurhamGateEvent`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gate_id` | string | Yes | Stable gate identifier for a Durham ship review |
| `reviewers` | list<string> | Yes | Required reviewers: `Aaker`, `Glaser`, `Munari` |
| `artifact_ref` | string | Yes | Evidence artifact reference, including `docs/allura/BRAND-RULES-dashboard-v2.md` |
| `status` | enum | Yes | Gate state (`pending`, `passed`, `blocked`) |

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

### `kernel_rule`

```jsonc
{
  "rule_id": "RULE-004",
  "event_type": "kernel_rule",
  "score": 0.91,
  "status": "active",
  "evidence": "proposal_created",
  "audit_ref": "events.id"
}
```
