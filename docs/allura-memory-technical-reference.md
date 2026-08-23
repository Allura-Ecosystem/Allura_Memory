# Allura Memory System — Comprehensive Technical Reference

> **Version**: 2026-07-10 | **Contract**: v1 | **Schema**: fm-1.0  
> **Repository**: `~/Projects/Allura-ecosystem/allura-memory/`  
> **Docker**: `allura-memory-mcp` (port 5888), `knowledge-postgres` (5432), `knowledge-neo4j` (7687)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Dual-Store Model: PostgreSQL + Neo4j](#2-dual-store-model-postgresql--neo4j)
3. [Memory Search — Federated Retrieval](#3-memory-search--federated-retrieval)
4. [Governance System — 6 Invariant Policies](#4-governance-system--6-invariant-policies)
5. [MCP Server Tools — All 20 Endpoints](#5-mcp-server-tools--all-20-endpoints)
6. [Curator System — HITL Promotion Pipeline](#6-curator-system--hitl-promotion-pipeline)
7. [Embedding Pipeline — Ollama vs OpenAI](#7-embedding-pipeline--ollama-vs-openai)
8. [Memory Lifecycle: Add / Search / Delete](#8-memory-lifecycle-add--search--delete)
9. [Group IDs and Tenant Isolation](#9-group-ids-and-tenant-isolation)
10. [Graph Adapter Pattern](#10-graph-adapter-pattern)
11. [Budget & Circuit Breaker System](#11-budget--circuit-breaker-system)

---

## 1. Architecture Overview

Allura Memory is a dual-store, HITL-governed memory system designed for AI agents. It combines episodic (PostgreSQL) and semantic (Neo4j) stores, with all promotions from episodic→semantic gated through human-in-the-loop (HITL) review.

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client (Agent)                        │
│              OpenAI Agents SDK / Hermes / OWUI               │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Streamable HTTP (port 5888)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Canonical HTTP Gateway                          │
│         src/mcp/canonical-http-gateway.ts                     │
│  20 tools: 11 memory + 5 governance + 4 audit               │
│  Bearer auth (ALLURA_MCP_AUTH_TOKEN)                        │
│  Rate limiting + CORS + Sentry instrumentation               │
└──────┬────────────────┬──────────────────┬─────────────────┘
       │                │                  │
       ▼                ▼                  ▼
┌──────────┐  ┌──────────────┐  ┌──────────────────┐
│ Memory   │  │ Governance   │  │ Audit Tools      │
│ Tools    │  │ Tools        │  │ (read-only)      │
│ (11 ops) │  │ (5 ops)      │  │ (4 ops)          │
└────┬─────┘  └──────┬───────┘  └────────┬─────────┘
     │               │                   │
     ▼               ▼                   ▼
┌──────────────────────────────────────────────────┐
│         Canonical Connection Helper               │
│    src/mcp/canonical-tools/connection.ts          │
│  getConnections() → { pg: Pool, neo4j: Driver }   │
│  Singleton pools, env-loaded config               │
└──────┬───────────────────────────────────────────┘
       │
       ├──────────┐
       ▼          ▼
┌──────────┐ ┌──────────────┐
│PostgreSQL│ │    Neo4j     │
│(5432)    │ │   (7687)     │
│          │ │              │
│events    │ │ Memory nodes  │
│canonical │ │ Insight nodes │
│_proposals│ │ SUPERSEDES    │
│allura_   │ │ relationships│
│memories  │ │              │
└──────────┘ └──────────────┘
       │
       ▼
┌──────────────────┐
│   RuVector        │
│ (pg extension)    │
│ vector(1024)      │
│ HNSW + BM25       │
│ RRF fusion        │
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  Ollama           │
│ (11434)           │
│ qwen3-embedding:8b│
│ MRL → 1024d       │
└──────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `src/mcp/canonical-http-gateway.ts` | MCP Streamable HTTP server, tool registration, request routing |
| `src/mcp/canonical-tools.ts` | 11 memory operations (add, search, get, list, delete, update, promote, export, restore, list_deleted, cleanup) |
| `src/mcp/governance-tools.ts` | 5 governance tools (list_policies, get_policy, check_gate, update_policy, audit_log) |
| `src/mcp/audit-tools.ts` | 4 audit tools (query_events, health_report, agent_activity, invariant_check) |
| `src/mcp/canonical-tools/connection.ts` | Singleton PG pool + Neo4j driver management |
| `src/mcp/canonical-tools/budget-circuit.ts` | Budget enforcement + circuit breakers |
| `src/lib/curator/score.ts` | Heuristic scoring (0.0–1.0) with tier classification |
| `src/lib/ruvector/bridge.ts` | RuVector hybrid search (vector ANN + BM25 with RRF) |
| `src/lib/ruvector/embedding-service.ts` | Embedding generation via Ollama/HuggingFace |
| `src/lib/graph-adapter/factory.ts` | Graph backend selection (neo4j / ruvector / ruvector-crate) |
| `src/lib/graph-adapter/neo4j-adapter.ts` | Neo4j Cypher implementation of IGraphAdapter |
| `src/lib/validation/group-id.ts` | Tenant isolation validation (allura-* pattern) |
| `src/curator/approve-cli.ts` | Headless HITL approval CLI for pending proposals |

---

## 2. Dual-Store Model: PostgreSQL + Neo4j

### PostgreSQL (Episodic Store)

All memory writes start here. The `events` table is **append-only** — no UPDATE or DELETE is ever performed on event rows.

**Schema (key tables)**:

| Table | Purpose |
|-------|---------|
| `events` | Append-only event log (memory_add, memory_delete, memory_update, governance_*, etc.) |
| `canonical_proposals` | HITL queue — pending/approved/rejected promotion proposals |
| `allura_memories` | RuVector vector store — `content`, `embedding vector(1024)`, `memory_type`, `user_id`, `group_id` |
| `allura_feedback` | SONA feedback loop for relevance learning |

**Events table columns**: `id` (BIGSERIAL), `group_id`, `event_type`, `agent_id`, `status`, `metadata` (JSONB), `created_at`. No `updated_at` column — structurally enforces append-only.

**Event types**:
- `memory_add` — Memory created (episodic)
- `memory_delete` — Soft-delete event
- `memory_update` — Versioned update event
- `memory_restore` — Recovery within 30-day window
- `memory_promote_requested` — Promotion queued
- `proposal_created` — Auto-created proposal (from memory_add scoring)
- `proposal_approved` — HITL approved → promoted to Neo4j
- `proposal_rejected` — HITL rejected (stays in episodic, still searchable)
- `governance_policy_updated` — HITL policy override
- `governance_gate_checked` — Gate evaluation logged
- `governance_approval_consumed` — Approval ref consumed (idempotency lock)
- `embedding_backfill` — Background embedding generation
- `notion_sync_pending` — (optional) Notion sync trigger

### Neo4j (Semantic Store)

Stores promoted/canonical memories as graph nodes. Never mutated in-place — all updates use the SUPERSEDES pattern.

**Node labels**:
- `:Memory` — Standard promoted memory nodes
- `:Insight` — Curator-promoted insight nodes (with `InsightHead` pointing to current version)
- `:deprecated` — Applied to superseded nodes

**Relationships**:
- `(:Memory v2)-[:SUPERSEDES]->(:Memory v1:deprecated)` — Versioning lineage
- `(:Memory)-[:AUTHORED_BY]->(:Agent)` — Sync contract link
- `(:Memory)-[:RELATES_TO]->(:Project)` — Sync contract link

**Indexes**:
- `memory_search_index` — Full-text index on Memory nodes
- `insight_search_index` — Full-text index on Insight nodes

### RuVector (Vector Store)

A PostgreSQL extension providing hybrid vector search. The `allura_memories` table stores:
- `embedding` column: `vector(1024)` — 1024-dimensional vectors (Matryoshka-reduced)
- HNSW index for approximate nearest neighbor (ANN) search
- BM25 via `ts_rank` for text search
- Reciprocal Rank Fusion (RRF) to combine both

Every `memory_add` projects to RuVector for immediate semantic searchability, even before HITL promotion.

---

## 3. Memory Search — Federated Retrieval

### Two-Mode Search

`memory_search` operates in two modes based on the `status` parameter:

#### Mode 1: Approved-Only (default, `status="approved"`)

Returns **only canonical Neo4j insights**. This is the production path — unapproved episodic traces cannot pollute agent reasoning.

```
Query → Neo4j full-text search (insight_search_index + memory_search_index)
      → Filter: group_id match, not deprecated, not superseded
      → Return ranked results
```

If Neo4j is unavailable: returns empty results with `degraded: true` and `degraded_reason: "graph_unavailable"`. Does NOT silently fall back to episodic.

#### Mode 2: All (`status != "approved"`)

Three-tier federated search with cascade fallback:

```
Step 1: RuVector (primary) — hybrid vector ANN + BM25 with RRF fusion
  ↓ (if results < limit)
Step 2: Neo4j (fallback 1) — full-text search on Memory/Insight nodes
  ↓ (if results < limit)
Step 3: PostgreSQL (fallback 2) — ILIKE text match on events table
  ↓
Merge: Deduplicate by ID, sort by score DESC, slice to limit
```

### Scoring

**RuVector RRF Fusion** (in `src/lib/ruvector/bridge.ts`):
- Vector pass: `1 - (embedding <=> query_embedding)` cosine distance → vector_score
- BM25 pass: `ts_rank(to_tsvector('english', content), plainto_tsquery('english', query))`
- RRF: `score = 1/(60+rank_v) + 1/(60+rank_b)`, normalized to 0–1 by dividing by `2/(60+1)`
- Threshold: 0.3 for recall (lower than default 0.5)

**Neo4j scoring**: Full-text `score` from `db.index.fulltext.queryNodes` + memory `score` field

**PostgreSQL fallback**: Fixed score of 0.5 (episodic without embedding)

### include_global Parameter

The `include_global` parameter (default: `true`) controls whether memories from `allura-global` group are included in search results. This enables cross-tenant shared knowledge while maintaining tenant isolation by default.

### Unified Search (UI-facing)

`src/server/actions/search.ts` provides `unifiedSearch()` — searches across 7 entity types in parallel:
- `memory` (via RuVector `retrieveMemories` with hybrid mode)
- `run`, `work-item`, `project`, `evidence`, `handoff`, `definition` (via SQL ILIKE)

Results merged: memory results (with score) first, then structured entities by recency.

---

## 4. Governance System — 6 Invariant Policies

All 6 policies are **critical severity** and **non-overridable** (the `overridable: false` flag is structural; HITL overrides can change descriptions but not the invariant itself).

### Policy Registry (canonical, static in `src/lib/governance/policies.ts`)

| ID | Name | Invariant Key | Description |
|----|------|---------------|-------------|
| pol-001 | group_id Required on Every Operation | `group_id_required` | Every DB read/write MUST include a valid `group_id` matching `^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`. Primary tenant isolation boundary. |
| pol-002 | Append-Only Events (No UPDATE/DELETE) | `append_only_events` | The `events` table is append-only. No UPDATE or DELETE on trace rows. Soft-deletes append a `memory_delete` event. Updates create a new row. |
| pol-003 | Neo4j Versioning via SUPERSEDES | `neo4j_supersedes` | Neo4j nodes are never mutated in-place. Updates create a new node + `[:SUPERSEDES]` relationship. Old node marked `:deprecated` but never deleted. |
| pol-004 | HITL Required for Promotion | `hitl_promotion` | Agents cannot autonomously promote memories to Neo4j. All promotions queue to `canonical_proposals` for human review. `PROMOTION_MODE=auto` is accepted only for backward-compat parsing; canonical promotion is always HITL-gated. |
| pol-005 | DB Operations via Canonical Connection Only | `db_connection_only` | All DB operations MUST use `getConnections()` from `canonical-tools/connection.ts`. Direct shell or `docker exec` for data operations is forbidden. |
| pol-006 | allura-* Tenant Namespace Enforcement | `allura_namespace` | All group_ids MUST use `allura-*` namespace. Default tenant for system operations: `allura-system`. |

### Gate Evaluation (`governance_check_gate`)

When called, evaluates all 6 invariants against the proposed action + context:
1. **group_id check**: Validates `groupId.startsWith("allura-")`
2. **Append-only check**: Flags actions containing `update|delete|mutate|overwrite` (except `governance_apply_policy_override`)
3. **Neo4j SUPERSEDES check**: Flags actions matching `neo4j.*edit|neo4j.*mutate|set.*node|edit.*node`
4. **HITL check**: Flags `autonomous.*promot|auto.*promot|skip.*hitl|bypass.*hitl` or `context.bypass_hitl === true`
5. **DB connection check**: Flags `context.via_docker_exec === true` or `context.via_raw_shell === true`
6. **Namespace check**: Validates full regex `^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`

Each invariant returns `{ pass: boolean, reason: string }`. Overall pass = all 6 pass. A `governance_gate_checked` event is appended to the audit log (non-blocking if logging fails).

### HITL Policy Override (`governance_update_policy`)

Policy overrides require:
1. An `approval_ref` — UUID of an approved, unconsumed `canonical_proposals` entry
2. The approval must belong to the same tenant (cross-tenant protection)
3. The approval must not have been consumed (checked via `governance_approval_consumed` event)

The override runs inside a single PostgreSQL transaction with `SELECT ... FOR UPDATE` on the proposal row to prevent TOCTOU races. Both `governance_policy_updated` and `governance_approval_consumed` events are appended atomically.

### Live Invariant Check (`audit_invariant_check`)

Reads live data to validate all 6 invariants:
1. Checks CHECK constraints on `events` table (information_schema)
2. Verifies all events have valid `allura-*` group_id
3. Confirms no `updated_at` column exists (structural append-only enforcement)
4. Queries Neo4j for SUPERSEDES relationships
5. Checks no approved proposals lack `decided_by` (no unapproved promotions)
6. Verifies no deprecated namespace prefixes (`ronin`, `claw`)

---

## 5. MCP Server Tools — All 20 Endpoints

The MCP server (`allura-memory-canonical`) exposes 20 tools via Streamable HTTP transport at port 5888 (env: `ALLURA_MCP_HTTP_PORT`).

### Memory Tools (11)

| # | Tool | Description | Key Parameters |
|---|------|-------------|----------------|
| 1 | `memory_add` | Add a memory. Writes to PG (episodic), scores content, queues eligible memories for HITL review. Also projects to RuVector for immediate searchability. | `group_id*`, `user_id*`, `content*`, `metadata?`, `threshold?` |
| 2 | `memory_search` | Federated search across both stores. Default: approved-only (Neo4j). With `status != approved`: RuVector → Neo4j → PG cascade. | `query*`, `group_id*`, `user_id?`, `limit?`, `min_score?`, `include_global?` |
| 3 | `memory_get` | Retrieve single memory by ID. Tries Neo4j first (semantic), falls back to PG (episodic). Includes recent usage count. | `id*`, `group_id*` |
| 4 | `memory_list` | List all memories for a user within a tenant. Merges both stores, deduplicates by ID (Neo4j wins), sorts, paginates. | `group_id*`, `user_id*`, `limit?`, `offset?`, `sort?` |
| 5 | `memory_delete` | Soft-delete a memory. Appends `memory_delete` event to PG, marks Neo4j node as `:deprecated`. 30-day recovery window. | `id*`, `group_id*`, `user_id*` |
| 6 | `memory_update` | Append-only versioned update. Appends audit event to PG. If in Neo4j: creates new node + SUPERSEDES, marks old deprecated. | `id*`, `group_id*`, `user_id*`, `content*`, `reason?`, `metadata?` |
| 7 | `memory_promote` | Request curator promotion for an episodic memory. Never auto-promotes — always routes through `canonical_proposals`. Idempotent. | `id*`, `group_id*`, `user_id*`, `curator_id?`, `rationale?` |
| 8 | `memory_export` | Export memories filtered by group_id. `canonical_only=true`: Neo4j only. `false`: both stores merged and deduplicated. | `group_id*`, `user_id?`, `canonical_only?`, `limit?`, `offset?` |
| 9 | `memory_restore` | Restore a soft-deleted memory within 30-day window. Removes deprecated flag + SUPERSEDES in Neo4j. Appends restore event to PG. | `id*`, `group_id*`, `user_id*` |
| 10 | `memory_list_deleted` | List soft-deleted memories within recovery window. Returns content, deletion date, `recovery_days_remaining`. | `group_id*`, `user_id?`, `limit?`, `offset?` |
| 11 | `memory_cleanup` | Reset halted budget sessions for a group (or all groups). Clears stale circuit breaker state without touching stored memories. | `group_id?` |

### Governance Tools (5)

| # | Tool | Description | Key Parameters |
|---|------|-------------|----------------|
| 12 | `governance_list_policies` | List all 6 canonical invariant policies, merged with any approved HITL overrides. Read-only. | `group_id*` |
| 13 | `governance_get_policy` | Retrieve a single policy by ID (pol-001 through pol-006), merged with HITL overrides. | `group_id*`, `policy_id*` |
| 14 | `governance_check_gate` | Evaluate all 6 invariants for a proposed action. Appends `governance_gate_checked` event to audit log. | `group_id*`, `action*`, `context?` |
| 15 | `governance_update_policy` | HITL-gated policy override. Requires `approval_ref` from an approved, unconsumed canonical_proposals entry. Appends `governance_policy_updated` + `governance_approval_consumed` events. | `group_id*`, `policy_id*`, `approval_ref*`, `description*`, `updated_by*`, `rationale?` |
| 16 | `governance_audit_log` | Paginated read of governance audit events. Filters by event_type. Read-only. | `group_id*`, `event_type?`, `limit?`, `offset?` |

### Audit Tools (4)

| # | Tool | Description | Key Parameters |
|---|------|-------------|----------------|
| 17 | `audit_query_events` | Query events table with filters (agent_id, event_type, date_range, source). Paginated. Read-only. | `group_id*`, `agent_id?`, `event_type?`, `date_range?`, `source?`, `limit?`, `offset?` |
| 18 | `audit_health_report` | Check all subsystem health: PostgreSQL, Neo4j, embedding backfill, curator queue depth, MCP tool count. | `group_id*` |
| 19 | `audit_agent_activity` | Query event activity for a specific agent. Optional time range filter. Paginated. Read-only. | `group_id*`, `agent_id*`, `time_range?`, `limit?`, `offset?` |
| 20 | `audit_invariant_check` | Validate all 6 governance invariants against live data. Returns per-check pass/fail with violation counts. Read-only. | `group_id*` |

### MCP Transport & Auth

- **Transport**: MCP Streamable HTTP at `/mcp` endpoint
- **Auth**: Bearer token via `ALLURA_MCP_AUTH_TOKEN` env var (timing-safe comparison). If not set, auth disabled (dev mode).
- **Rate limiting**: Applied at HTTP layer
- **CORS**: Configured via `src/lib/cors/`
- **Sentry**: Error instrumentation via `src/lib/observability/`

---

## 6. Curator System — HITL Promotion Pipeline

### Promotion Flow

```
memory_add (agent writes memory)
    │
    ├─→ PostgreSQL events table (INSERT, append-only)
    │
    ├─→ RuVector allura_memories (INSERT with embedding, immediate search)
    │
    └─→ curatorScore() evaluation
         │
         ├─ score < threshold (0.85 default) → episodic only, no proposal
         │
         └─ score >= threshold
              │
              ├─ Dedup check against existing pending/approved proposals
              │   (near-duplicate detection via text similarity)
              │
              ├─ Skip for -loadtest group_ids
              │
              └─ INSERT into canonical_proposals (status='pending')
                  → Returns pending_review: true

 Later, human/curator reviews:

    canonical_proposals (status='pending')
         │
         ├─ approve-cli.ts (bun run curator:approve --auto-approve)
         │   OR
         ├─ API route /api/curator/approve
         │   OR
         ├─ Manual per-ID HITL (reject with rationale)
         │
         ├─ APPROVED:
         │   ├─ createInsight() in Neo4j (new Insight node + InsightHead)
         │   ├─ UPDATE canonical_proposals SET status='approved', decided_by, witness_hash
         │   ├─ INSERT proposal_approved event (append-only)
         │   └─ (optional) notion_sync_pending event
         │
         └─ REJECTED:
             ├─ UPDATE canonical_proposals SET status='rejected', decided_by, witness_hash
             └─ INSERT proposal_rejected event (append-only)
                 Memory stays in episodic store, still searchable
```

### Curator Scoring (`src/lib/curator/score.ts`)

Rule-based heuristic scorer. NOT an LLM — uses deterministic signals:

| Signal | Effect |
|--------|--------|
| **Machine echo guard** | Raw tool-call JSON starting with `{"type":` → confidence 0.3, suppressed |
| **Specificity markers** | `I always/never/prefer/hate/like/love`, `my favorite/preferred/typical` → +0.15 |
| **Length** | >20 words: +0.10, >50 words: +0.05 |
| **Source** | `conversation`: +0.10 (vs `manually_added`: 0) |
| **Usage count** | ≥1: +0.05, ≥3: +0.05, ≥5: +0.05 |
| **Freshness** | ≤7 days: +0.05, ≤1 day: +0.05 |
| **Vague phrases** | `something/stuff/maybe/i think` → -0.15 (min 0.4) |

**Base**: 0.5, **Cap**: 1.0, **Round**: 2 decimals

**Tier thresholds** (default: `[0.6, 0.75, 0.85]`):
- `emerging`: confidence < 0.60
- `adoption`: 0.60 ≤ confidence < 0.85
- `mainstream`: confidence ≥ 0.85

**Auto-approval threshold**: 0.85 (env: `AUTO_APPROVAL_THRESHOLD`). Score ≥ threshold queues for HITL review. Score < threshold = episodic only.

### Auto-Curator (`src/lib/curator/auto-curator.ts`)

Pattern detection system that accepts only a server-resolved workspace scope, reads events through a strict app-role workspace transaction, and proposes candidate insights. Candidate provenance retains `source_event_ids` plus their `(group_id, workspace_id)` scope; all source IDs are revalidated in the proposal/evidence transaction before a write:
- **Failure patterns**: Same error, same agent, same workspace (≥2 occurrences)
- **Win patterns**: Successful promotions (≥3 occurrences)
- **Approval patterns**: High/low approval rate detection
- **Tool risk patterns**: Tool governance decisions

Candidates are deduped against existing memories (Jaccard similarity):
- ≥0.90: duplicate (skip)
- 0.80–0.89: supersede (flag for HITL)
- 0.65–0.79: related (include as reference)
- <0.65: new (proceed)

### Witness Hash

Every approval/rejection generates a SHAKE-256 (64-byte) witness hash over: `proposal_id|group_id|content|score|tier|decision|decided_at|curator_id`. This provides tamper-evident audit trail.

---

## 7. Embedding Pipeline — Ollama vs OpenAI

### Configuration (`src/lib/ruvector/embedding-service.ts`)

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `RUVECTOR_EMBEDDING_MODEL` | `qwen3-embedding:8b` | Model name |
| `RUVECTOR_EMBEDDING_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `RUVECTOR_EMBEDDING_API_KEY` | (none) | Bearer token for hosted providers |
| `RUVECTOR_EMBEDDING_SEND_DIMENSIONS` | `true` | Send `dimensions` param (set `false` for HuggingFace) |

### Ollama (Local, Default)

- **Model**: `qwen3-embedding:8b` (or `0.6b` variant)
- **Endpoint**: `POST http://localhost:11434/v1/embeddings` (OpenAI-compatible)
- **Dimensions**: 1024 (via Matryoshka Representation Learning / MRL truncation)
- **Request body**: `{ model, input, dimensions: 1024 }`
- **Timeout**: 30s (5s for warmup)
- **Batch**: Max 5 concurrent requests

### HuggingFace Inference Providers (Serverless)

- **Models**: BAAI/bge-m3 or similar (native 1024-dim)
- **Config**: Set `RUVECTOR_EMBEDDING_SEND_DIMENSIONS=false` (native dims, no MRL)
- **Auth**: `RUVECTOR_EMBEDDING_API_KEY` as Bearer token
- **Zero local RAM** required

### Graceful Degradation

If embedding generation fails (Ollama down, timeout, invalid response):
1. Memory is still stored — with `embedding = NULL`
2. Status becomes `"stored_pending_embedding"`
3. Search falls back to BM25 text-only mode (no vector ANN)
4. Background backfill process can generate embeddings later

### RuVector Storage

Embeddings stored in `allura_memories.embedding` column as `vector(1024)`:
- HNSW index for ANN
- Cosine distance: `embedding <=> query_vector`
- Vector must be formatted as string literal `'[0.1,0.2,...]'` (pg driver can't send JS arrays to ruvector columns)

---

## 8. Memory Lifecycle: Add / Search / Delete

### Adding a Memory

```typescript
// Via MCP tool
memory_add({
  group_id: "allura-team-durham",
  user_id: "agent-brooks",
  content: "User prefers concise responses under 200 words",
  metadata: {
    source: "conversation",      // or "manual"
    conversation_id: "conv-123",
    agent_id: "brooks"
  },
  threshold: 0.85               // override default promotion threshold
})
```

**Flow**:
1. Validate `group_id` (must match `^allura-[a-z0-9]...`)
2. Budget pre-check (rate limiting per group+agent)
3. INSERT into `events` table (append-only, event_type=`memory_add`)
4. Project to RuVector `allura_memories` (with embedding, non-blocking on failure)
5. Score via `curatorScore()` heuristic
6. If score < threshold → return `stored: "episodic"`
7. If score ≥ threshold:
   - Dedup check against pending/approved proposals
   - If duplicate → return with `duplicate: true`
   - If unique → INSERT into `canonical_proposals` (status=`pending`)
   - Return `stored: "episodic"`, `pending_review: true`

### Searching Memories

```typescript
// Default: approved-only (canonical Neo4j insights only)
memory_search({
  query: "user preferences for response length",
  group_id: "allura-team-durham",
  limit: 10,
  // status defaults to "approved"
})

// All memories (includes episodic)
memory_search({
  query: "user preferences for response length",
  group_id: "allura-team-durham",
  status: "all",    // triggers federated cascade
  user_id: "agent-brooks",  // optional scope
  limit: 10,
  min_score: 0.5,
  include_global: true
})
```

### Deleting a Memory

```typescript
memory_delete({
  id: "mem-abc123",
  group_id: "allura-team-durham",
  user_id: "agent-brooks"
})
```

**Flow**:
1. INSERT `memory_delete` event into PG (append-only — no UPDATE/DELETE on events)
2. Mark Neo4j node as `:deprecated` with `deleted_at` timestamp
3. Original rows remain for audit trail
4. **30-day recovery window** — can be restored via `memory_restore`
5. Use `memory_list_deleted` to see recoverable memories

### Updating a Memory

```typescript
memory_update({
  id: "mem-abc123",
  group_id: "allura-team-durham",
  user_id: "agent-brooks",
  content: "Updated: User prefers responses under 150 words",
  reason: "User clarified preference",
  metadata: { agent_id: "brooks" }
})
```

**Flow**:
1. INSERT `memory_update` event into PG (append-only)
2. If memory exists in Neo4j:
   - Get current version number
   - CREATE new Memory node with incremented version
   - CREATE `(:new)-[:SUPERSEDES]->(:old)` relationship
   - SET old node `:deprecated`
3. If episodic-only or Neo4j unavailable: return `stored: "episodic"` with degraded meta

### Promoting a Memory

```typescript
memory_promote({
  id: "mem-abc123",
  group_id: "allura-team-durham",
  user_id: "agent-brooks",
  curator_id: "curator-sabir",
  rationale: "High-confidence user preference"
})
```

**Flow**:
1. Check if already canonical in Neo4j → return `status: "already_canonical"`
2. Check for existing pending proposal (idempotency) → return existing proposal_id
3. Dedup check against pending/approved proposals
4. Fetch memory content from PG events
5. Score via `curatorScore()`
6. INSERT into `canonical_proposals` (status=`pending`)
7. INSERT `memory_promote_requested` event into PG
8. Return `status: "queued"` with proposal_id

---

## 9. Group IDs and Tenant Isolation

### Validation Rules (`src/lib/validation/group-id.ts`)

| Rule | Value |
|------|-------|
| **Pattern** | `^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$` |
| **Min length** | 2 characters |
| **Max length** | 64 characters |
| **Case** | Lowercase only (NFR11) |
| **Prefix** | Must start with `allura-` |

### Reserved Group IDs

- `allura-global` — Global/shared context
- `allura-system` — System operations (default tenant)
- `allura-admin` — Admin operations
- `allura-public` — Public context

### Active Group IDs (4 tenants)

| Group ID | Purpose |
|----------|---------|
| `allura-system` | System operations, infrastructure, default tenant |
| `allura-faith-meats` | Faith Meats business domain |
| `allura-team-durham` | Team Durham workspace |
| `allura-team-ram` | Team RAM (AI agent orchestration) |

### Tenant Isolation Enforcement

- **Every** MCP tool call validates `group_id` via `validateGroupId()` — throws `GroupIdValidationError` on failure
- **Every** SQL query includes `WHERE group_id = $1` — parameterized, no string interpolation
- **Every** Neo4j Cypher query includes `m.group_id = $groupId` filter
- **Cross-tenant protection**: `governance_update_policy` verifies `approval.group_id === groupId` inside the transaction
- **CHECK constraints** on `events` table enforce the pattern at the database level (14 CHECK constraints found)
- **Load-test isolation**: Group IDs ending in `-loadtest` skip the proposal queue to prevent test pollution

### RuVector Tenant Model (ARCH-001)

In RuVector, `user_id` and `group_id` columns receive the same validated value. The `userId` parameter to `storeMemory()`/`retrieveMemories()` IS the `group_id` (tenant). A future iteration may separate these when per-user isolation within a tenant is needed.

---

## 10. Graph Adapter Pattern

The graph adapter is a pluggable abstraction behind the `IGraphAdapter` interface. Selected via `GRAPH_BACKEND` env var:

| Backend | Env Value | Description |
|---------|-----------|-------------|
| **Neo4j** (default) | `GRAPH_BACKEND=neo4j` | Legacy Cypher-based adapter. Uses full-text indexes for search. |
| **RuVector** | `GRAPH_BACKEND=ruvector` | PG-based adapter using RuVector tables. Target for migration. |
| **RuVector Crate** | `GRAPH_BACKEND=ruvector-crate` | Native Rust addon (opt-in, never default). Requires vendored `.node` binary. |

**Factory**: `src/lib/graph-adapter/factory.ts` — `createGraphAdapter({ pg, neo4j, crate })`

The adapter implements these operations:
- `createMemory` — Create a Memory node
- `getMemory` — Get by ID (tries InsightHead first, then Memory)
- `searchMemories` — Full-text search (insight_search_index + memory_search_index)
- `listMemories` — List with count
- `supersedesMemory` — Create versioned update with SUPERSEDES relationship
- `softDeleteMemory` — Mark as deprecated
- `restoreMemory` — Remove deprecated flag + SUPERSEDES relationships
- `checkCanonical` — Check if memory is already promoted
- `getVersion` — Get current version number
- `exportMemories` — Export filtered memories
- `getDeprecatedMemories` — Get deprecated nodes by IDs
- `checkDuplicate` — Content-based duplicate check
- `linkMemoryContext` — Create AUTHORED_BY and RELATES_TO relationships

---

## 11. Budget & Circuit Breaker System

### Budget Enforcement

- `memory_add`: Budget **pre-check** (write-intensive, rate limited). If budget exceeded → error, memory NOT stored.
- `memory_update`, `memory_delete`, `memory_promote`: Budget **tracked** (record usage after call).
- Read operations: No budget check (reads are cheap).
- Fail-open: If budget/circuit breaker can't initialize, requests pass through.

### Circuit Breakers

All DB operations wrapped in `withCircuitBreaker(service, groupId, operation, fn)`:
- **Services**: `postgres`, `graph` (Neo4j)
- Opens on repeated failures, prevents cascade
- `resetHaltedGroup(groupId)` clears stale sessions
- `memory_cleanup` tool resets halted budget sessions

### Response Metadata

Every tool response includes a `meta` object:
```json
{
  "contract_version": "v1",
  "degraded": false,
  "stores_used": ["postgres", "graph"],
  "stores_attempted": ["postgres", "graph"],
  "warnings": []
}
```

When a store is unavailable:
```json
{
  "degraded": true,
  "stores_used": ["postgres"],
  "warnings": ["graph_unavailable"]
}
```

---

## Quick Reference: Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ALLURA_MCP_HTTP_PORT` | 3201 (Docker: 5888) | MCP server port |
| `ALLURA_MCP_AUTH_TOKEN` | (none) | Bearer auth token |
| `POSTGRES_HOST` | localhost | PG host |
| `POSTGRES_PORT` | 5432 | PG port |
| `POSTGRES_DB` | memory | PG database |
| `POSTGRES_USER` | allura | PG user |
| `POSTGRES_PASSWORD` | (required) | PG password |
| `NEO4J_URI` | bolt://localhost:7687 | Neo4j URI |
| `NEO4J_USER` | neo4j | Neo4j user |
| `NEO4J_PASSWORD` | (required) | Neo4j password |
| `GRAPH_BACKEND` | neo4j | Graph adapter: neo4j / ruvector / ruvector-crate |
| `RUVECTOR_EMBEDDING_MODEL` | qwen3-embedding:8b | Embedding model |
| `RUVECTOR_EMBEDDING_BASE_URL` | http://localhost:11434 | Ollama URL |
| `RUVECTOR_EMBEDDING_API_KEY` | (none) | Bearer token for hosted providers |
| `RUVECTOR_EMBEDDING_SEND_DIMENSIONS` | true | Send dimensions param (false for HuggingFace) |
| `AUTO_APPROVAL_THRESHOLD` | 0.85 | Score threshold for HITL queue |
| `PROMOTION_MODE` | soc2 | Compat only — always HITL-gated |
| `ALLURA_GROUP_ID` | allura-system | Default group for scripts |

---

## Quick Reference: Docker Containers

| Container | Port | Purpose |
|-----------|------|---------|
| `allura-memory-mcp` | 5888 | MCP server (Streamable HTTP) |
| `knowledge-postgres` | 5432 | PostgreSQL + RuVector extension |
| `knowledge-neo4j` | 7687 | Neo4j (Bolt protocol) |
| Ollama | 11434 | Embedding model server |

---

*This document is generated from source code analysis of the Allura Memory System codebase at `~/Projects/Allura-ecosystem/allura-memory/`. For authoritative details, refer to source files and the BLUEPRINT.md.*