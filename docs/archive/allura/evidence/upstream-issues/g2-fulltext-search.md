# G2: No keyword/BM25 fulltext search — `searchSimilar` not available as standalone

## Gap Description

The crate offers **vector search only for edges**, not nodes. There is **no standalone `searchSimilar`** or text-index method for memory-like nodes.

### Evidence

- `searchHyperedges` exists and returns edge vector matches (not node matches).
- Cypher `query`/`querySync` supports node retrieval but **has no WHERE clause, no property filter, no vector in Cypher**.
- Node-level vector search is not exposed as a top-level API (only as a side-effect of traversals or Cypher manual filtering).
- The README mentions `searchSimilar`, but the live binding only exposes `searchHyperedges` — and it only works on edges.

## Use Case (Allura’s hybrid search)

Allura’s `memory_search` uses a **two-pass RRF fusion**:

1. **Vector pass:** `ruvector_cosine_distance()` ANN (k-NN on embedding)
2. **Text pass:** pgvector `ts_rank` on `content_tsv` generated column
3. **Fusion:** `score = 1/(60+rank_v) + 1/(60+rank_t)` — Reciprocal Rank Fusion

The adapter must support both:

- **Vector similarity search** on nodes (currently unsupported — only edges)
- **Keyword search** on node content (not available in Cypher — no WHERE or fulltext index)

## Proposed Fixes

### Option A — Recommend Cypher-based workaround (short term)

Document that allura’s `searchMemories` routes through **adapter-side filtering**:

```ts
async searchMemories({ query, group_id, limit }) {
  // 1. Embed query text (required for forward-compat)
  const embedding = await this.embed(query);

  // 2. Fetch all tenant nodes (no vector in Cypher)
  const res = await this.db.query(`MATCH (n:${NODE_LABEL}) RETURN n`);

  // 3. Filter + rank on the TS side
  const nodes = (res.nodes ?? [])
    .map(nodeFromNative)
    .filter(n => n.group_id === groupId && keywordScore(n.content, query) > 0);

  // 4. Sort by keyword relevance, limit
  return nodes
    .map(n => ({ n, relevance: keywordScore(n.content, query) }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}
```

**Drawback:** Full scan on every search (O(n) on tenant memory count), no vector influence.

### Option B — Add text index + `searchSimilar` (preferred long term)

Add:

1. A **text index** on node properties (`content` + `tags`) using `to_tsvector('english', content || ' ' || tags)`.
2. A **top-level `searchSimilar`** method with both vector and keyword args:

```rust
// Proposed API
pub async fn search_nodes(
    &mut self,
    embedding: &[f32],
    keyword: &str,
    k: usize
) -> Result<Vec<GraphNode>, Error> {
    // 1. Hybrid search: vector ANN + BM25 text re-ranking
    // 2. Cypher: MATCH (n) WHERE n.group_id = $gid RETURN n, vector_distance(...), ts_rank(...)
    // 3. Combine scores and return top-k
}
```

**Implementation sketch:**

- `search_nodes(embedding, keyword, k)` runs a Cypher query that:
  - Computes `ts_rank(to_tsvector(content), plainto_tsquery(keyword))` as `text_score`
  - Computes `vector_distance(embedding, n.embedding)` as `vec_score`
  - RRF fusion: `1/(60+rank_vec) + 1/(60+rank_text)`
  - Returns top-k

## Can Allura contribute a PR?

**Yes** — Allura can:

- Add `search_nodes` to `ruvector-graph` Rust crate
- Implement hybrid search with BM25 fusion
- Update `ruvector-graph-node` bindings
- Add tests against real text+vector queries

## Follow-up

- **Status:** Workaround viable but performs O(n) on large tenants
- **Workaround:** Keyword-only filtering in `ruvector-crate-adapter.ts` (tested and committed)
- **Priority:** High — hybrid search is core to Allura’s product

---

*Author: Brooks (Allura architect), Date: 2026-07-12*
*Related: AD-49 Path B,Story 19.5 (upstream gaps)*
