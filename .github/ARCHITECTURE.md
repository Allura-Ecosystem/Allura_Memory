# Allura Architecture

This document describes Allura's system architecture, components, data flow, and design decisions.

---

## Table of Contents

- [System Overview](#system-overview)
- [Core Concepts](#core-concepts)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Storage Layer](#storage-layer)
- [Governance & Promotion](#governance--promotion)
- [Multi-Tenancy](#multi-tenancy)
- [Key Invariants](#key-invariants)

---

## System Overview

Allura is built on a **PostgreSQL-only architecture** that separates raw execution traces (PostgreSQL) from curated knowledge (PostgreSQL semantic layer with RuVector search).

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Agent                                │
│         (Claude, Cursor, OpenCode, etc.)                   │
└────────────────────────┬────────────────────────────────────┘
                         │ (MCP Protocol)
                         ↓
            ┌────────────────────────────┐
            │    Memory Engine           │
            │  1. Validate group_id      │
            │  2. Score content (0-1)    │
            │  3. Route to storage       │
            │  4. Dedup prevention       │
            │  5. Circuit breaker        │
            └────────┬───────────────────┘
                     │
        ┌────────────┼────────────────┐
        ↓            ↓                ↓
  ┌──────────┐ ┌──────────┐  ┌─────────────┐
  │PostgreSQL│ │PostgreSQL│  │   Curator   │
  │Episodic  │ │ Semantic │  │ (HITL Gate) │
  └──────────┘ └──────────┘  └─────────────┘
```

---

## Core Concepts

### Memory

A **memory** is a unit of information that an AI agent stores about a user or context. Every memory goes through a state machine:

```
1. Episodic Only      (score < 0.85)
   ↓
2. Pending Review     (score ≥ 0.85, SOC2 mode)
   ↓ [curator approval]
3. Both Layers        (episodic events + canonical graph_memories)
```

**Confidence Score (0.0–1.0):**
- 0.0–0.49: Low confidence → episodic only (no promotion candidate)
- 0.50–0.84: Medium confidence → episodic + eligible for manual promotion
- 0.85–1.0: High confidence → auto-queue for promotion (SOC2) or immediate promotion (auto mode)

### Episodic Memory (PostgreSQL)

Raw execution traces. **Append-only. Immutable. Never deleted.**

```sql
events (
  id:        bigserial (auto-increment)
  group_id:  varchar (e.g., "allura-myproject")
  event_type: varchar (e.g., "memory_add", "memory_promoted")
  agent_id:  varchar (source agent)
  metadata:  jsonb (payload)
  created_at: timestamptz (immutable)
)
```

Every memory write creates one `memory_add` event. If it gets promoted, a separate `memory_promoted` event is appended. Soft-deletes create a `memory_delete` event.

### Semantic Memory (PostgreSQL `graph_memories` / `graph_supersedes`)

Curated, versioned knowledge. **All updates create new rows.**

```sql
graph_memories (
  id         text,          -- "mem_..."
  group_id   text,          -- "allura-myproject"
  content    text,
  score      real,          -- 0.92
  version    integer,
  deprecated boolean,       -- false
  created_at timestamptz
)

graph_supersedes (newer_id, superseded_id, group_id)  -- (v2) supersedes (v1)
```

When a memory needs updating:
1. Insert a new `graph_memories` row (v2)
2. Insert a `graph_supersedes` edge (`newer_id` = v2, `superseded_id` = v1)
3. Mark v1 as `deprecated = true`
4. Never edit v1's content

This provides full versioning history and prevents accidental data loss.

---

## Component Architecture

### MCP Server (`src/mcp/memory-server.ts`)

Exposes 5 memory tools over the Model Context Protocol (stdio transport).

**Tools:**
- `memory_add(content, userId, metadata?)`
- `memory_search(query, userId, limit?)`
- `memory_get(memoryId)`
- `memory_list(userId, limit?, offset?)`
- `memory_delete(memoryId)`

**Validation:**
- Every request must include `group_id` (derived from environment or passed explicitly)
- Missing/invalid `group_id` → 400 error
- Content validation via Zod schemas

### Memory Engine (`src/lib/memory/`)

Core business logic:

1. **Scorer**: Computes confidence (0–1) via semantic similarity + agent metadata
2. **Router**: Determines: episodic-only vs. pending-review vs. both-stores
3. **Deduplicator**: Prevents duplicate `graph_memories` rows (same content, same user, same group)
4. **Promoter**: Moves high-confidence traces from episodic events to `graph_memories` (curator-gated)
5. **Searcher**: Hybrid search (RuVector vector ANN + PostgreSQL full-text, RRF fusion), merged by relevance

### Curator (`src/curator/`)

HITL approval workflow for promotion:

1. High-confidence traces (score ≥ 0.85) enter `proposals` queue
2. Curator reviews via dashboard: `/admin/pending`
3. Curator approves → Memory Engine writes to `graph_memories` + logs `memory_promoted` event
4. Curator rejects → Event logged, trace stays episodic-only

### PostgreSQL Client (`src/integrations/postgres.client.ts`)

- Connection pooling + retry logic
- Append-only write guardrails (no UPDATE/DELETE on events table)
- `group_id` validation at every query boundary

### RuVector Bridge (`src/lib/ruvector/bridge.ts`)

- Hybrid retrieval (vector ANN + `content_tsv` full-text, RRF fusion) on the same PostgreSQL instance
- `graph_supersedes` edge management
- Deprecation flag handling

---

## Data Flow

### Write Path (memory_add)

```
Agent calls memory_add("content", userId, metadata)
  ↓
MCP Server validates request
  - Validate group_id (CHECK constraint)
  - Validate content (not null, < 10KB)
  - Validate metadata (JSON schema)
  ↓
Memory Engine scores content
  - Semantic similarity to existing memories
  - Token overlap analysis
  - Agent confidence metadata
  - Result: confidence score (0–1)
  ↓
Router decision
  - score < 0.85? → Episodic only, return
  - score ≥ 0.85 + SOC2 mode? → Insert into proposals, return pending_review
  - score ≥ 0.85 + auto mode? → Promote immediately
  ↓
INSERT event into PostgreSQL
  - event_type: "memory_add"
  - metadata contains content, score, reasoning
  - created_at: NOW() (immutable)
  ↓
[If promotion eligible]
  Deduplicator checks graph_memories
    - Query: graph_memories WHERE group_id, user_id, content match
    - If found + score within threshold → return existing ID, stop
    - Else → proceed to promotion
  ↓
[If SOC2 mode]
  INSERT proposal
    - curator_id: NULL
    - approved_at: NULL
    - status: PENDING
  ↓
[If auto mode]
  INSERT into graph_memories
    - INSERT row with all properties
    - INSERT event: "memory_promoted"
  ↓
Return to agent
  - { id, status, stored }
```

### Search Path (memory_search)

```
Agent calls memory_search("query", userId, limit)
  ↓
Parallel: episodic search + semantic (RuVector hybrid) search
  ↓
PostgreSQL:
  - Full-text search on events.metadata->>'content'
  - WHERE group_id = ? AND deleted = false
  - LIMIT + OFFSET for pagination
  ↓
Semantic (graph_memories + RuVector):
  - Vector ANN + full-text (content_tsv), RRF fusion
  - WHERE group_id = ? AND deprecated = false AND deleted_at IS NULL
  - Filter by user_id
  - Relevance ranking
  ↓
Merge results
  - De-duplicate (same content, different sources)
  - Semantic results win on conflict
  - Sort by relevance + recency
  ↓
Return to agent
  - [{ id, content, source, score, created, used_count }]
```

---

## Storage Layer

### PostgreSQL (Episodic)

**Primary Table: `events`**

```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  group_id VARCHAR(255) NOT NULL CHECK (group_id ~ '^allura-'),
  event_type VARCHAR(100) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  workflow_id VARCHAR(255) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_group_id_created ON events(group_id, created_at DESC);
CREATE INDEX idx_events_event_type ON events(event_type);
CREATE INDEX idx_events_metadata_gin ON events USING GIN(metadata);
```

**Secondary Table: `proposals` (curator queue)**

```sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id VARCHAR(255) NOT NULL CHECK (group_id ~ '^allura-'),
  event_id BIGINT NOT NULL REFERENCES events(id),
  memory_id UUID NULL,  -- populated after curator approval
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  curator_id VARCHAR(255) NULL,
  notes TEXT NULL,
  approved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Invariants:**
- No row ever updated or deleted
- Every row has immutable `created_at`
- `group_id` enforced by CHECK constraint
- Full audit trail is implicit (just read `events`)

### PostgreSQL + RuVector (Semantic)

**Table: `graph_memories`**

```sql
INSERT INTO graph_memories (id, group_id, user_id, content, score, deprecated, created_at)
VALUES ('mem_...', 'allura-myproject', 'sabir', '...', 0.92, false, NOW());

-- Versioning edge
INSERT INTO graph_supersedes (newer_id, superseded_id, group_id)
VALUES ('mem_v2', 'mem_v1', 'allura-myproject');
```

**Invariants:**
- `deprecated` flag prevents stale row usage
- `graph_supersedes` chain provides version history
- Rows are never edited; updates create new rows
- Queries filter out `deprecated = true` rows

---

## Governance & Promotion

### Promotion Mode: SOC2 (Default)

**High Compliance. Human approval required.**

```
Memory created (score 0.92)
  ↓
Router: score ≥ 0.85? YES
Router: PROMOTION_MODE? SOC2
  ↓
INSERT into proposals (status: PENDING)
  ↓
Curator dashboard: /admin/pending
  ↓
Curator clicks APPROVE
  ↓
INSERT into graph_memories
INSERT event: memory_promoted
  ↓
Response to agent: { status: "promoted", stored: "both" }
```

### Promotion Mode: Auto

**Low Friction. For consumer use cases only.**

```
Memory created (score 0.92)
  ↓
Router: score ≥ 0.85? YES
Router: PROMOTION_MODE? auto
  ↓
INSERT into graph_memories immediately
INSERT event: memory_promoted
  ↓
Response to agent: { status: "promoted", stored: "both" }
```

### Deduplication

Before any `graph_memories` write, query for duplicates:

```sql
SELECT id FROM graph_memories
WHERE group_id = $1
  AND user_id = $2
  AND content = $3
  AND deprecated = false;
```

If found + score within `DUPLICATE_THRESHOLD`: return existing ID, skip write.

---

## Multi-Tenancy

### Tenant Isolation

**Hard boundary via schema-level CHECK constraint:**

```sql
ALTER TABLE events
ADD CONSTRAINT group_id_format
CHECK (group_id ~ '^allura-');
```

**Rules:**
- Every read/write **must** include valid `group_id`
- Invalid `group_id` → database constraint error (not application error)
- No application-layer bypass possible
- Soft-tenancy (row-level security) not used; schema enforcement is stronger

### Example: Tenant "allura-bank-lending"

```
Agent A (group_id: allura-bank-lending)
  ↓ memory_add("Borrower has 5-year credit history")
  ↓
PostgreSQL: INSERT into events (group_id = "allura-bank-lending", ...)

Agent B (group_id: allura-haccp-food)
  ↓ memory_search("borrower", userId)
  ↓
PostgreSQL: SELECT * FROM events WHERE group_id = "allura-haccp-food" ...
  [Agent B sees nothing from Agent A's tenant]
```

---

## Key Invariants

### 1. PostgreSQL is Append-Only

```sql
-- NEVER ALLOW
UPDATE events SET content = '...' WHERE id = ...;
DELETE FROM events WHERE id = ...;

-- ONLY ALLOW
INSERT INTO events (...) VALUES (...);
SELECT * FROM events WHERE ...;
```

### 2. Semantic Layer Uses SUPERSEDES, Never Edit

```sql
-- NEVER ALLOW
UPDATE graph_memories SET content = '...' WHERE id = ...;

-- ONLY ALLOW
INSERT INTO graph_memories (id, group_id, content, ...) VALUES ('mem_v2', ...);
INSERT INTO graph_supersedes (newer_id, superseded_id, group_id) VALUES ('mem_v2', 'mem_v1', ...);
UPDATE graph_memories SET deprecated = true WHERE id = 'mem_v1' AND group_id = ...;  -- flag only
```

### 3. group_id is Mandatory

```sql
-- Schema enforcement
CREATE TABLE events (
  ...
  group_id VARCHAR(255) NOT NULL CHECK (group_id ~ '^allura-'),
  ...
);

-- Missing group_id → database error
INSERT INTO events (group_id, ...) VALUES (NULL, ...);
-- Error: new row for relation "events" violates check constraint "group_id_format"
```

### 4. Soft-Deletes Only

```sql
-- Soft-delete: append an event
INSERT INTO events (event_type, metadata, ...)
VALUES ('memory_delete', '{"memory_id": "..."}', ...);

-- In graph_memories: mark deprecated / soft-deleted
UPDATE graph_memories SET deprecated = true, deleted_at = NOW() WHERE id = ... AND group_id = ...;
```

Deleted memories stay in PostgreSQL for audit. Query filters exclude them:

```sql
SELECT * FROM events
WHERE event_type = 'memory_add'
  AND metadata->>'memory_id' NOT IN (
    SELECT metadata->>'memory_id'
    FROM events
    WHERE event_type = 'memory_delete'
  )
```

---

## Request-Response Examples

### Example 1: Write + Auto-Promote

```
Agent: memory_add("Sabir prefers dark mode", "sabir", {"confidence": 0.92})

Memory Engine:
  1. Scores content → 0.92 (high confidence)
  2. PROMOTION_MODE = "auto" → eligible for immediate promotion
  3. Dedup check → no duplicate found
  4. INSERT into PostgreSQL (event_type: memory_add)
  5. INSERT into graph_memories
  6. INSERT into PostgreSQL (event_type: memory_promoted)

Response:
{
  "id": "mem_7f9e2c3a1b5d",
  "status": "promoted",
  "stored": "both",
  "score": 0.92
}
```

### Example 2: Write + Pending Review (SOC2)

```
Agent: memory_add("Borrower flagged for suspicious income", "officer-1", {"confidence": 0.88})

Memory Engine:
  1. Scores content → 0.88 (high confidence)
  2. PROMOTION_MODE = "soc2" → requires curator approval
  3. INSERT into PostgreSQL (event_type: memory_add)
  4. INSERT into proposals (status: pending, curator_id: NULL)

Response:
{
  "id": "mem_a1b2c3d4e5f6",
  "status": "pending_review",
  "stored": "episodic",
  "message": "Queued for curator review"
}

[Curator Dashboard]
Curator clicks APPROVE
  ↓
System:
  1. INSERT into graph_memories
  2. INSERT into PostgreSQL (event_type: memory_promoted)
  3. UPDATE proposals (status: approved, curator_id: "curator-1", approved_at: NOW())
```

### Example 3: Search (Hybrid)

```
Agent: memory_search("dark mode preferences", "sabir", limit=10)

Parallel queries:

PostgreSQL:
  SELECT metadata->>'content', (...) FROM events
  WHERE group_id = "allura-myproject"
    AND metadata->>'user_id' = "sabir"
    AND event_type = 'memory_add'
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 10

Semantic (graph_memories + RuVector):
  SELECT id, content, score
  FROM graph_memories
  WHERE group_id = "allura-myproject"
    AND deprecated = false
    AND deleted_at IS NULL
  ORDER BY (vector ANN + content_tsv rank, RRF fusion) DESC
  LIMIT 10

Merge results:
  [
    {"source": "semantic", "score": 0.96, "content": "Sabir prefers dark mode"},
    {"source": "episodic", "score": 0.87, "content": "IDE theme set to dark"}
  ]
```

---

## References

- [BLUEPRINT.md](../docs/allura/BLUEPRINT.md) — Core requirements & execution rules
- [DATA-DICTIONARY.md](../docs/allura/DATA-DICTIONARY.md) — Field-level reference
- [RISKS-AND-DECISIONS.md](../docs/allura/RISKS-AND-DECISIONS.md) — Architectural decisions
