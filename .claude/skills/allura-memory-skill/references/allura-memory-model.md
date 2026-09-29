# Allura Memory Model

## Dual-layer architecture

### Episodic layer (PostgreSQL)
- Table: `allura_memories`
- Append-only event traces with vector embeddings (4096d, qwen3-embedding:8b)
- Fields: id, group_id, user_id, content, metadata, embedding, score, created_at
- Every `memory_add` writes here first
- RuVector hybrid search (vector + BM25) for retrieval
- 237 rows in `allura-system` as of 2026-04-22

### Semantic layer (PostgreSQL `graph_memories` / `graph_supersedes`)
- Table `graph_memories`: versioned canonical memory rows (same Postgres instance, RuVector hybrid search)
- Table `graph_supersedes`: supersession edges between versions (SUPERSEDES)
- Provenance (author agent, project scope) is carried in row metadata
- Only populated via curator promotion pipeline
- This is the canonical truth layer

## Memory types

| Type | Stored in | Description |
|------|-----------|-------------|
| Event | `allura_memories` (episodic) | Raw session trace, observation |
| Outcome | `graph_memories` | Result of a task or process |
| Insight | `graph_memories` | Learned pattern, distilled knowledge |
| ADR | `graph_memories` | Architecture Decision Record |
| Entity | `graph_memories` | Fact about a system, person, or thing |

## Relationship patterns

```
graph_supersedes: (new_version_id) SUPERSEDES (old_version_id)   -- versioned replacement
graph_memories.metadata: author agent, project scope              -- provenance
```

All rows carry `group_id` for tenant isolation.

## Status guidance

Prefer explicit version/status edges over in-place mutation:
- `active` — current canonical truth
- `deprecated` — superseded by newer version
- `disputed` — conflicting evidence exists
- `revoked` — removed with cause

## Versioning model

`memory_update` creates a new `graph_memories` version with a `graph_supersedes` edge to the old one.
The old version is marked deprecated. Both rows remain in the table.
This preserves full lineage and audit trail.

Never overwrite in place. Always version forward.