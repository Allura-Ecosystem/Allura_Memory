---
name: search-memory
description: >
  Search and retrieve Allura Brain memories. Use when the user asks to
  "search memories", "find what we decided about", "look up", "recall",
  "what do we know about", "get memory", "find memory by ID", or any
  request to retrieve stored knowledge from Allura Brain. Also triggers
  on "search allura", "brain search", or "what's in memory about".
metadata:
  version: "0.1.0"
---

# Search Memory

Search and retrieve memories from Allura Brain using hybrid vector + BM25 ranking or direct ID lookup.

## Two operations

### 1. Hybrid search (`memory_search`)

Call `mcp__allura-brain__memory_search` with the user's query. This runs two-pass RRF fusion:

- Vector pass: cosine distance on 768d embeddings (nomic-embed-text via Ollama)
- Text pass: `ts_rank` on PostgreSQL `content_tsv` generated column
- Fusion score: `1/(60+rank_v) + 1/(60+rank_t)`

**Required parameters:**

| Param | Type | Notes |
|-------|------|-------|
| `query` | string | Natural language search query |

**Optional parameters:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `user_id` | string | — | Filter to a specific user's memories |
| `limit` | number | 10 | Max results (1–100) |
| `search_mode` | string | `"hybrid"` | `"hybrid"`, `"vector"`, or `"text"` |

**Interpreting results:**

Each result includes `score`, `content`, `metadata`, and `created_at`. Higher scores = better match. Present results in a scannable format: show the content summary, relevance score, and when it was stored. If metadata includes `agent_id` or `source`, mention the origin.

### 2. Get by ID (`memory_get`)

Call `mcp__allura-brain__memory_get` when the user provides a specific memory ID.

**Required parameters:**

| Param | Type | Notes |
|-------|------|-------|
| `memory_id` | string | The UUID of the memory |

## Workflow

1. Parse the user's intent — are they searching broadly or looking up a specific memory?
2. For broad queries: use `memory_search` with the most relevant keywords extracted from their request
3. For ID lookups: use `memory_get` directly
4. Present results clearly — summarize content, show scores for search results, and note provenance (episodic vs. semantic layer)
5. If no results found, suggest refining the query or trying a different search mode

## Group ID

Every query MUST include `group_id` matching the pattern `^allura-[a-z0-9-]+$`. Default to `allura-system` unless the user specifies otherwise. Missing `group_id` causes a CHECK constraint failure.

## Tips

- If a search returns too many results, narrow with `user_id` or reduce `limit`
- Switch to `"vector"` mode for semantic/conceptual queries
- Switch to `"text"` mode for exact keyword matching
- Memories from Neo4j (semantic layer) are canonical/promoted; PostgreSQL memories are episodic traces
