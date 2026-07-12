# RuVector Graph Adapter — Context for Agent Hydration

> **AI-Assisted Documentation** — maintained with AI assistance. Defer to code, schemas, and tests when in doubt.

## Status: Production Default (AD-49 Cutover Complete 2026-07-12)

The semantic/knowledge-graph layer runs on PostgreSQL tables behind the `IGraphAdapter` seam. Neo4j 5.26 is the read-only fallback for one release.

## Key Facts

- **`GRAPH_BACKEND=ruvector`** is the production default
- **`GRAPH_BACKEND=neo4j`** is the fallback (still works)
- **`GRAPH_BACKEND=ruvector-crate`** is an opt-in spike (Path B, 13/16 methods)
- **`GRAPH_DUAL_READ=true`** wraps both backends, compares results, logs divergence
- **Runtime label:** `ruvector_graph` (upgraded from `pgvector_bridge` per RK-21 Stage 1)

## Tables (PG, port 5432)

| Table | Purpose |
|-------|---------|
| `graph_memories` | Memory nodes (replaces Neo4j Memory label) |
| `graph_supersedes` | SUPERSEDES relationships (adjacency table) |
| `graph_structural_nodes` | Agent/Project/Task/Decision nodes (JSONB) |
| `graph_structural_edges` | Directed relationships between structural nodes |

## Factory

`src/lib/graph-adapter/factory.ts`:
- `getGraphBackend()` returns `ruvector` by default
- `createGraphAdapter()` returns the appropriate adapter

## Tests

| Test | Count | Gate |
|------|-------|------|
| `adapter-parity.test.ts` | 14/14 | Always |
| `adapter-live-db-e2e.test.ts` | 14/14 | `RUN_E2E_TESTS=true` |
| `dual-read.test.ts` | 7/7 | `RUN_E2E_TESTS=true` + `GRAPH_DUAL_READ=true` |
| `ruvector-crate-adapter.subset.test.ts` | 20/20 | Always |

## Key Docs

- `docs/allura/RISKS-AND-DECISIONS.md` — AD-49 (Decided), RK-32 (Resolved), RK-21 (Stage 1 graduated)
- `docs/allura/SOLUTION-ARCHITECTURE.md` §3.4.0.2 — Graph Backend Cutover Path
- `docs/allura/DATA-DICTIONARY.md` — Graph Adapter Tables section
- `docs/allura/REQUIREMENTS-MATRIX.md` — Section 6C, REQ-RV-001..005

## Boundary

**RuVector executes, Allura governs.** The adapter is a PG-table implementation named after the concept, NOT a binding to the ruvnet Rust crate.

## Upstream Issues (ruvnet/RuVector)

- [#666](https://github.com/ruvnet/RuVector/issues/666) — G1: No `updateNode` method
- [#667](https://github.com/ruvnet/RuVector/issues/667) — G2: No keyword/BM25 fulltext search
- [#668](https://github.com/ruvnet/RuVector/issues/668) — G3: No native multi-tenant scoping
- [PR #670](https://github.com/ruvnet/RuVector/pull/670) — `update_node` + `keyword_search` fixes (open, mergeable)