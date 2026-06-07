# Story 8.7 — Graph Traversal MCP Surface

## Story

As the Allura Mission Control Graph tab (and any future graph-aware surface), I want a dedicated MCP tool that returns real `SUPERSEDES` / `RELATES` edges from Neo4j so the Graph tab can render actual node-to-node relationships rather than treating nodes as flat. The current `memory_search` MCP returns flat nodes only, which is why Story 8-3 AC7 was honestly deferred.

## Acceptance Criteria

- [ ] AC1: A new MCP tool `graph_query` is exposed by the Brain server with documented parameters: `group_id` (required, `^allura-[a-z0-9-]+$`), `root_id` (optional, single node to traverse from), `depth` (optional, default 1, max 3), `limit` (optional, default 50, max 200), `relation_types` (optional, default `["SUPERSEDES", "RELATES"]`).
- [ ] AC2: The tool returns a normalized response shape: `{ nodes: Array<{id, label, type, group_id, score}>, edges: Array<{from, to, type, properties}>, root_id, depth }`. `nodes` and `edges` are guaranteed non-null arrays (empty when no data).
- [ ] AC3: `group_id` is enforced via the same canonical validator used by `memory_search` (`src/lib/validation/group-id.ts`); cross-tenant traversal returns `POL-001: Tenant Isolation` error and writes an append-only audit row.
- [ ] AC4: Loading / empty / error / ready states are surfaced by callers. The tool itself returns `success: false, error: { code, message }` for the error case; empty result is `success: true, data: { nodes: [], edges: [] }`.
- [ ] AC5: Append-only audit: every successful call writes one row to the `events` table with `event_type: "graph_query.executed"`, `group_id`, `actor`, `result_count`, and `root_id` (nullable) in the `metadata` field. No UPDATE, no DELETE.
- [ ] AC6: 200-record bulk test in `src/lib/neo4j/__tests__/graph-query.test.ts` covering: 1-hop traversal, 2-hop traversal, empty result, cross-tenant rejection, depth limit, relation_types filter, and append-only audit row count.
- [ ] AC7: README updated to list `graph_query` in the MCP server's tool catalogue with a usage example.
- [ ] AC8: No mock/placeholder data. All tests run against a live Neo4j service container (matches existing `integration-test` pattern).

## Tasks/Subtasks

- [ ] Task 1: Add `graph_query` handler in `src/lib/neo4j/connection.ts` (or a new `src/lib/neo4j/graph-query.ts`).
  - [ ] Subtask 1.1: Build Cypher query: `MATCH (n {group_id: $group_id})-[r:RELATES|SUPERSEDES*1..$depth]-(m {group_id: $group_id}) RETURN n, r, m LIMIT $limit`. Apply `relation_types` filter by replacing the inline type list at query-build time (validated against the existing label allowlist).
  - [ ] Subtask 1.2: Map Neo4j records to the normalized response shape; do not expose internal types.
  - [ ] Subtask 1.3: Use `readTransaction` (not write) — graph_query is read-only.
- [ ] Task 2: Wire handler into the MCP server.
  - [ ] Subtask 2.1: Register `graph_query` in the tool list with the documented parameter schema.
  - [ ] Subtask 2.2: Reject calls with invalid `group_id` using `validateGroupId`; write a `POL-001` audit row and return `success: false`.
- [ ] Task 3: Append-only audit.
  - [ ] Subtask 3.1: After a successful call, write a `graph_query.executed` event with metadata (`result_count`, `root_id`, `depth`) via the existing `insertEvent` helper.
- [ ] Task 4: Tests.
  - [ ] Subtask 4.1: 200-record bulk test fixture that seeds a small graph and runs each AC scenario.
  - [ ] Subtask 4.2: `bun test src/lib/neo4j/__tests__/graph-query.test.ts` must pass under the same `RUN_DB_INTEGRATION=true` flag used by `integration-test`.
- [ ] Task 5: Documentation.
  - [ ] Subtask 5.1: Update `.opencode/context/allura/ALLURA-BRAIN-PROMPT.md` (or the canonical tool-catalog doc) with a `graph_query` usage example.

## Dev Notes

### Architecture
- The Brain MCP server is exposed by `src/mcp/memory-server-canonical.ts`. New tool registration follows the same shape as `memory_search`.
- All graph operations must route through the kernel (POL-005). Use the kernel's `syscall_query` with a `neo4j:Query` target, not direct Neo4j connections.
- Read-only `graph_query` calls do not need proof-of-intent beyond the existing kernel policy gates.

### Relationship to Story 8-3
- Story 8-3 wired the Graph tab to flat nodes from `memory_search`. AC7 (real edges) was honestly deferred.
- Story 8-7 is the dedicated home for that deferred work. Story 8-3 AC7 should be cross-referenced from 8-7's Dev Notes and marked "satisfied by 8-7" once 8-7 lands.

### MCP Tool Catalogue (post-8.7)
- `memory_search` (existing) — flat node retrieval.
- `memory_add` (existing) — append a new memory.
- `graph_query` (new) — node + edge traversal, read-only.

### Test Pattern
- Follow `src/lib/postgres/queries/insert-trace.test.ts` style: 200-record bulk seed, then per-AC tests.
- Cross-tenant isolation test mirrors `mutate-events.test.ts` POL-001.

## Dev Agent Record

### Implementation Plan
1. Add `src/lib/neo4j/graph-query.ts` with `graphQuery({ group_id, root_id?, depth?, limit?, relation_types? })`.
2. Build Cypher with parameterized values only; validate `relation_types` against a fixed allowlist `["SUPERSEDES", "RELATES"]`.
3. Map records to `{ nodes, edges, root_id, depth }`. Use `readTransaction` from existing `src/lib/neo4j/connection.ts`.
4. Register the tool in `src/mcp/memory-server-canonical.ts` with input schema mirroring the existing `memory_search` tool definition.
5. After a successful call, write the `graph_query.executed` event via `insertEvent` (canonical append-only path).
6. Tests: 200-record bulk in `src/lib/neo4j/__tests__/graph-query.test.ts`. Run under `RUN_DB_INTEGRATION=true`.
7. Update the MCP tool catalogue doc with a usage example.

### Debug Log
No blockers. Reuses the kernel `syscall_query` path established by Story 9.1 and the append-only event path established by Stories 1.1 and 8.x.
