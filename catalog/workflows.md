# Workflow Catalog

> End-to-end memory flows from capture to curation to promotion.

## The Governed Memory Pipeline

Allura's core workflow is a **five-stage pipeline** with clear boundaries and approval gates:

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  CAPTURE │ → │   SCORE  │ → │  QUEUE   │ → │  CURATE  │ → │  PROMOTE │
│          │    │          │    │          │    │          │    │          │
│  Agent   │    │  Auto    │    │  Review  │    │  Human   │    │  Neo4j   │
│  writes  │    │  scoring │    │  queue   │    │  review  │    │  graph   │
│  memory  │    │  0–1     │    │          │    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     ↓               ↓                ↓                ↓                ↓
 PostgreSQL    Confidence      Threshold gate    Approve /      SUPERSEDES
 append-only   score           (soc2 vs auto)    Reject         lineage
```

## Stage 1: Capture

**What happens:** An agent writes a memory via `memory_add`.

**Where it goes:** PostgreSQL `events` table — append-only, immutable.

**Key invariant:** Every write is an event. Nothing is ever updated or deleted in PostgreSQL.

```typescript
memory_add({
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode for all UIs",
  metadata: { source: "conversation" },
  threshold: 0.85
})
```

## Stage 2: Score

**What happens:** Content is automatically scored for confidence (0.0–1.0).

**How it works:**
- Embedding-based semantic relevance
- Structural quality signals (completeness, specificity)
- Source trust tier (conversation < document < validated)

**Output:** A confidence score attached to the episodic event.

## Stage 3: Queue

**What happens:** Score is compared against threshold and promotion mode.

| Mode | Threshold Behavior |
|------|-------------------|
| `soc2` | Score ≥ threshold → enters curator review queue |
| `auto` | Score ≥ threshold → automatic promotion to Neo4j |

**Configuration:**
```bash
PROMOTION_MODE=soc2          # or "auto"
AUTO_APPROVAL_THRESHOLD=0.85 # minimum score for promotion eligibility
```

## Stage 4: Curate

**What happens:** Human reviewer approves or rejects queued memories.

**Tools:**
```bash
bun run curator:run       # Score and queue new proposals
bun run curator:approve   # Approve pending proposals
bun run curator:reject    # Reject pending proposals
```

**What curators see:**
- Memory content and source
- Confidence score and scoring rationale
- Duplicate detection results
- Tenant isolation verification (`group_id` match)

## Stage 5: Promote

**What happens:** Approved memories become canonical knowledge in Neo4j.

**Neo4j structure:**
- Memory node with `insight_id`, `content`, `confidence`, `group_id`
- `SUPERSEDES` relationship to previous versions (if updating)
- Old version marked `:deprecated` — never deleted

```cypher
// Versioning pattern
MATCH (v1:Insight {insight_id: $id})
CREATE (v2:Insight {
  insight_id: 'ins_' + randomUUID(),
  summary: $newSummary,
  group_id: $groupId
})
CREATE (v2)-[:SUPERSEDES]->(v1)
SET v1:deprecated
```

## Retrieval Workflow

When an agent searches memory:

```
Agent calls memory_search
  ↓
Hybrid query across both stores
  ↓
Vector pass: pgvector HNSW ANN (episodic layer)
Text pass: ts_rank on content_tsv (episodic layer)
Neo4j pass: semantic graph traversal (semantic layer)
  ↓
RRF fusion: score = 1/(60+rank_v) + 1/(60+rank_t)
  ↓
Ranked results returned with source attribution
```

## Update Workflow

Memories are never edited in place. Updates create a new version:

```typescript
memory_update({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode AND reduced motion"
})
// Creates new node, links SUPERSEDES, marks old deprecated
```

## Delete Workflow

Soft-delete only — recoverable within 30 days:

```typescript
memory_delete({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice"
})
// Status changed to 'deleted'; recoverable via memory_restore
```

## Approval Boundaries

These actions require explicit approval (per `AD-33`):

- Runtime/database changes
- MCP config mutation
- Cron mutation
- Live RAM/Durham hook installation
- RuVix enforcement changes
- Canonical semantic promotion
- Notion sync
- Done/Approved status moves

---

*For the canonical workflow design, see [`docs/allura/DESIGN-ALLURA.md`](../docs/allura/DESIGN-ALLURA.md). For the data model, see [`docs/allura/DATA-DICTIONARY.md`](../docs/allura/DATA-DICTIONARY.md).*
