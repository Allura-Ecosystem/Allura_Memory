---
name: data-contracts
description: MCP tool signatures and data model contracts Bahari uses for memory operations
---

# Data Contracts

## Memory Tools (Governed — Write Path)

These are your primary tools. All operations go through the governed Allura Brain MCP interface.

### `allura-brain__memory_add`

Store a new memory. Writes to PostgreSQL first, scores it, routes based on confidence.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | Memory content text |
| `user_id` | string | Yes | User identifier within tenant |
| `group_id` | string | Yes | Tenant namespace (must match `^allura-`) |
| `metadata` | object | No | `{ source, conversation_id, agent_id }` |
| `threshold` | number | No | Override promotion threshold (default 0.85) |

**Returns:** `{ id, stored, score, created_at, meta }`

### `allura-brain__memory_search`

Federated search across PostgreSQL + Neo4j. Results merged by relevance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query |
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | No | Scope to specific user |
| `limit` | number | No | Max results (default 10) |
| `min_score` | number | No | Minimum confidence filter |

**Returns:** `{ results: [{ id, content, score, source, provenance, created_at }], count, latency_ms, meta }`

### `allura-brain__memory_get`

Fetch a single memory by ID from either store.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier |
| `group_id` | string | Yes | Tenant namespace |

### `allura-brain__memory_list`

Paginated list of all memories for a user.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | Yes | User identifier |
| `group_id` | string | Yes | Tenant namespace |
| `limit` | number | No | Max results |

### `allura-brain__memory_delete`

Soft-delete a memory. Appends a deletion event — never destroys data. 30-day recovery window.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier |
| `group_id` | string | Yes | Tenant namespace |

### `allura-brain__memory_restore`

Recover a soft-deleted memory within the 30-day window.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier |
| `group_id` | string | Yes | Tenant namespace |

## Diagnostic Tools (Read-Only)

For health checks and diagnostics only. SELECT queries only — never INSERT, UPDATE, or DELETE.

### `MCP_DOCKER__execute_sql`

Run read-only SQL against PostgreSQL.

| Parameter | Type | Description |
|-----------|------|-------------|
| `sql_query` | string | SELECT query only |

**Example — check event count:**
```sql
SELECT event_type, COUNT(*) FROM events WHERE group_id = $1 GROUP BY event_type
```

### `MCP_DOCKER__query_database`

Natural language query against PostgreSQL. Read-only.

### `MCP_DOCKER__read_graph`

Read Neo4j graph data. Read-only.

## Tools Bahari Does NOT Use

| Tool | Why Not |
|------|---------|
| `MCP_DOCKER__insert_data` | Direct DB writes bypass governance |
| `MCP_DOCKER__create_entities` | Direct Neo4j writes bypass curator pipeline |
| `docker exec` | Banned — all DB operations via MCP tools |

## Event Types (What Bahari Produces)

| event_type | When |
|-----------|------|
| `memory_add` | User stores a memory through Bahari |
| `memory_search` | User searches for memories |
| `memory_delete` | User soft-deletes a memory |
| `memory_restore` | User recovers a deleted memory |
| `health_check` | Bahari runs a health check |
| `session_start` | Bahari session begins |

## Response Contract

All MCP tools return a `meta` object:

```json
{
  "contract_version": "v1",
  "degraded": false,
  "stores_used": ["postgres", "graph"],
  "stores_attempted": ["postgres", "graph"],
  "warnings": []
}
```

When `degraded: true`, one or more stores are unavailable. Always communicate this honestly to the user.
