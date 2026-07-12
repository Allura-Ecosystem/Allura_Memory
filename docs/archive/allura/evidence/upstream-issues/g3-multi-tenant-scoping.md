# G3: No native multi-tenant scoping — `group_id` must be property-filtered

## Gap Description

The crate provides **no native tenant-scoped graph** (no CREATE GRAPH, no multi-tenant workspace, no schema-level isolation). All filtering must be done **adapter-side** on every query.

### Evidence

- `group_id` (`^allura-[a-z0-9-]+$`) must be stored as a node property.
- Every read (tenantNodes, searchMemories, listMemories, countMemories) must filter `WHERE (n.group_id = ?)`.
- Cypher queries have no `WHERE` clause support (only `MATCH`) — so **no property filter** inCypher.
- Adapter must fetch ALL nodes for the label, then filter on the TS side (O(n) scan).

In `ruvector-crate-adapter.ts`:

```ts
async tenantNodes(groupId: GroupId): Promise<GraphMemoryNode[]> {
  const res = await this.db.query(`MATCH (n:${NODE_LABEL}) RETURN n`);
  return (res.nodes ?? [])
    .map(nodeFromNative)
    .filter((n) => n.group_id === groupId && !n.deprecated);  // ← TS filter
}
```

## Use Case (Allura’s governed memory)

Allura enforces **tenant isolation at schema level**:

- Every memory belongs to a `group_id` (format: `allura-*`).
- Cross-tenant reads are security violations ( tenants cannot see each other’s data).
- PostgreSQL enforces this via CHECK constraint on every row.

The graph backend should provide the same guarantee:

## Proposed Fixes

### Option A — Document and enforce adapter-side filtering (short term)

Document thatAllura’s **adapter is the only scoping point** and add guardrails:

- **Write:** Reject any `createNode` where `group_id` doesn’t match the adapter’s group.
- **Read:** Filter every result by `group_id` before returning.
- **Edge:** Store `group_id` in edge metadata for auditing.

**Current enforcement in `ruvector-crate-adapter.ts`:**

```ts
static assertGroupId(groupId: string): void {
  if (!/^allura-[a-z0-9-]+$/.test(groupId)) {
    throw new GraphAdapterError("ruvector-crate", "guard", `invalid group_id: ${groupId}`);
  }
}
```

**Risk:** If an adapter bug omits the filter, tenant isolation is breached.

### Option B — Recommend `GRAPH_BACKEND=ruvector-crate` per-tenant (medium term)

If Allura runs multiple independent tenants, each can instantiate their own `GraphDatabase.open(path)` pointing to a **separate data directory**:

- `/data/tenants/allura-product/graph`
- `/data/tenants/allura-docs/graph`
- `/data/tenants/allura-dev/graph`

Adapter code would pass `storagePath` based on `tenantId` at runtime.

**Pros:** Native isolation, no cross-tenant leakage possible.
**Cons:** Operational overhead (file paths, backup, monitoring for N tenants).

### Option C — Add native graph/workspace scoping (preferred long term)

Add a **workspace API** to the crate:

```rust
// Proposed API in GraphDatabase
pub async fn create_workspace(&mut self, name: &str) -> Result<(), Error> {
    // Create a logical subgraph (Cypher graph or separate file)
}

pub async fn select_workspace(&mut self, name: &str) -> Result<(), Error> {
    // Set active workspace for subsequent operations
}

pub async fn delete_workspace(&mut self, name: &str) -> Result<(), Error> {
    // Drop workspace and its files
}
```

**Implementation sketch:**

- Each workspace is a separate `.db` file with its own `store`, `graph`, and `vector`.
- `open(path)` + `select_workspace("allura-product")` isolates tenants.
- `create_workspace("allura-*")` auto-migrates on first use.

## Can Allura contribute a PR?

**Yes** — Allura can:

- Add `workspace` API to `ruvector-graph` crate
- Implement workspace isolation (file-based or Cypher-scoped)
- Document multi-tenant deployment patterns

## Follow-up

- **Status:** Adapter-side filtering is currently implemented and tested
- **Workaround:** All `tenantNodes`, `searchMemories`, `listMemories` filter on `group_id`
- **Priority:** High — tenant isolation is a governance requirement

---

*Author: Brooks (Allura architect), Date: 2026-07-12*
*Related: AD-49 Path B, AD-029 (Graph Adapter Pattern)*
