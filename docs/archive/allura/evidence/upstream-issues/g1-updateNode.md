# G1: No `updateNode` method — SUPERSEDES versioning requires property updates

## Gap Description

The crate provides no `updateNode` method at all. A node's properties cannot be changed after creation via `createNode({id, embedding, labels, properties})`.

### Evidence

- Path B spike (2026-06-24, Brooks) verified: `GraphDatabase` supports `createNode`, `createEdge`, `query`, `kHopNeighbors`, `searchHyperedges`, `stats`, `isPersistent`, `getStoragePath`, and lifecycle (`open`, `begin`, `commit`, `rollback`). **No `updateNode` method exists.**
- `rollback()` is **non-atomic** (B1): nodes created inside a transaction survive rollback, so atomic `createNode + createEdge + mark-deprecated` in a single transaction is impossible.
- `createNode` is immutable — there is no way to set `deprecated: true` after the fact.

## Use Case (Allura’s governed memory)

Allura requires **immutable versioning with SUPERSEDES**:

- Every update → create new node, create `SUPERSEDES` edge (`new → prev`), mark prior node `deprecated`.
- Soft-delete → `createNode(tombstone) + createEdge(DELETED, tombstone → mem)`.
- Restore → delete the tombstone edge (not node mutation).
- Canonical check → node exists and has no incoming `SUPERSEDES` or `DELETED`.

The current crate binding cannot support an immutableSUPERSEDES chain because the adapter cannot:

1. Roll back a write if part of the transaction fails.
2. Mark the prior version `deprecated` without an `updateNode` or native label update.

## Proposed Fixes

### Option A — Recommend pattern (short term)

Document thatAllura’s `GRAPH_BACKEND=ruvector-crate` users should use a **dual-adapter strategy**:

- **Immutable writes (create only):** `GRAPH_BACKEND=ruvector-crate`
- **Versioned/promotional writes (SUPERSEDES):** `GRAPH_BACKEND=neo4j`

This lets the adapter fallback to Neo4j for calls like `supersedesMemory`, `softDeleteMemory`, `restoreMemory`.

**Current behavior** (in `ruvector-crate-adapter.ts`):

```ts
async supersedesMemory(_params): Promise<GraphSupersedesResult> {
  return RuvectorCrateGraphAdapter.unsupported(
    "supersedesMemory",
    "atomic versioned promotion requires real transactions (B1: rollback is a no-op) and deprecating the prior node requires updateNode (B3: absent in ruvector-graph). Use GRAPH_BACKEND=neo4j for SUPERSEDES versioning."
  );
}
```

### Option B — Add native `updateNode` (preferred long term)

Add a native `updateNode({id, newProperties})` method to the `GraphDatabase` API in the Rust crate, with the same semantics as Neo4j’s `SET` clause.

**Proposed API:**

```rust
// In GraphDatabase impl
pub async fn update_node(&mut self, id: &str, properties: HashMap<String, String>) -> Result<(), Error> {
    // Cypher: MATCH (n {id: $id}) SET n += $properties RETURN n
    // Ensure $properties keys match existing node’s property keys or extend new ones
}
```

**Why this matters:** Allura’s governance invariant is **append-only historical traces** — we never mutate rows in PostgreSQL. The graph backend should support the same principle by allowing immutable SuperSede chains.

## Can Allura contribute a PR?

**Yes** — the crate is MIT, and Allura can:

- Add `updateNode` implementation in the Rust crate
- Implement `update_node` Cypher generation (`MATCH (n) SET n += $props`)
- Update `ruvector-graph-node` exports
- Add tests for property updates on existing nodes

## Follow-up

- **Status:** Blocked on upstream or recommended fallback pattern
- **Workaround:** Route `supersedesMemory`, `softDeleteMemory`, `restoreMemory` to Neo4j for `RuvectorCrateGraphAdapter`
- **Priority:** Medium — SUPERSEDES versioning is core to Allura’s governance model

---

*Author: Brooks (Allura architect), Date: 2026-07-12*
*Related: AD-49 Path B, AD-50 (vendoring governanc*e)
