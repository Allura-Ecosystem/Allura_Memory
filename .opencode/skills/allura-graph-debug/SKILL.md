# Allura Graph Debug (Read-Only)

## Trigger
"show me the graph for X", "debug graph connections", "what does the memory graph look like", "trace relationships for X"

## Required Inputs
| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `group_id` | string | **YES** | Tenant namespace (must match `^allura-*`). No calls without it. |
| `query` | string | yes | Memory topic or search term to find in the semantic layer |
| `depth` | number | no | Supersession chain depth to traverse (default: 2, max: 4) |

## MCP Tool Allowlist
- `allura-brain__memory_search` — hybrid (RuVector vector ANN + text) search over the semantic layer
- `allura-brain__memory_get` — read a single memory by ID
- `allura-brain__memory_list` — list memories filtered by user/group
- `MCP_DOCKER__execute_sql` — read-only `SELECT` diagnostics against `graph_memories` and `graph_supersedes` (always filtered by `group_id`)

## Output Contract
```json
{
  "nodes": "number — count of graph_memories versions found",
  "edges": "number — count of graph_supersedes edges",
  "depth": "number — actual supersession depth traversed",
  "entities": [{ "id": "string", "version": "number", "content": "string", "status": "string" }],
  "relations": [{ "source": "string", "target": "string", "relationType": "SUPERSEDES" }]
}
```

## Diagnostics
- **Supersession chains:** join `graph_supersedes` to `graph_memories` on both endpoints, filtered by `group_id`, capped at `depth`.
- **RuVector health:** confirm embeddings are populated for the versions found (`embedding IS NOT NULL`) and that hybrid retrieval (`memory_search`) returns the same rows as the direct `graph_memories` lookup.
- **Orphans:** flag `graph_supersedes` edges whose endpoint is missing from `graph_memories`, and versions with no embedding.

## Guardrails
- **READ-ONLY.** This skill must NEVER create, update, or delete any memory version or supersession edge.
- **group_id required.** Every call and every SQL statement must include group_id. Reject if missing.
- **SELECT only.** `execute_sql` must only run parameterized `SELECT` statements. Reject any mutation.
- **Depth cap.** Never traverse beyond depth 4 — risk of runaway result sets on large chains.
- **No exfiltration.** Never return data from a group_id the caller doesn't belong to.
