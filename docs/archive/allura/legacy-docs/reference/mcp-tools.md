# MCP Tools Reference

> Complete reference for Allura Memory MCP tools.

## Tool Overview

Allura exposes 10 memory operations through the Model Context Protocol (MCP). All tools require `group_id` and appropriate `user_id` for multi-tenant isolation.

## memory_add

Store a new memory. Writes to PostgreSQL episodic layer, scores content, and queues for promotion if score ≥ threshold.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `group_id` | string | Yes | Tenant namespace (`^allura-[a-z0-9-]+$`) |
| `user_id` | string | Yes | User identifier |
| `content` | string | Yes | Memory content to store |
| `metadata` | object | No | Additional context (source, topic, etc.) |
| `threshold` | number | No | Minimum score for promotion eligibility (0.0–1.0) |

### Example

```typescript
memory_add({
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode for all UIs",
  metadata: {
    source: "conversation",
    topic: "user-preferences"
  },
  threshold: 0.85
})
```

### Response

```json
{
  "id": "mem_7f9e2c3a1b5d",
  "content": "Alice prefers dark mode for all UIs",
  "score": 0.92,
  "status": "queued",
  "group_id": "allura-myteam",
  "user_id": "alice",
  "created_at": "2026-06-04T12:00:00Z"
}
```

## memory_search

Hybrid semantic + fulltext search across both episodic and semantic stores.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search query text |
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | No | Filter by user (omit for tenant-wide search) |
| `limit` | number | No | Max results (default: 10) |
| `mode` | string | No | `"hybrid"` (default), `"vector"`, or `"text"` |

### Example

```typescript
memory_search({
  query: "dark mode preferences",
  group_id: "allura-myteam",
  user_id: "alice",
  limit: 10,
  mode: "hybrid"
})
```

### Response

```json
{
  "results": [
    {
      "id": "mem_7f9e2c3a1b5d",
      "content": "Alice prefers dark mode for all UIs",
      "score": 0.95,
      "source": "episodic",
      "group_id": "allura-myteam",
      "user_id": "alice"
    }
  ],
  "total": 1,
  "mode": "hybrid"
}
```

## memory_get

Retrieve a single memory by ID.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier |
| `group_id` | string | Yes | Tenant namespace |

### Example

```typescript
memory_get({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam"
})
```

## memory_list

List all memories for a user within a tenant.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | Yes | User identifier |
| `limit` | number | No | Max results (default: 50) |
| `offset` | number | No | Pagination offset |

### Example

```typescript
memory_list({
  group_id: "allura-myteam",
  user_id: "alice",
  limit: 50
})
```

## memory_update

Append-only versioned update. Creates new node, links SUPERSEDES, marks old deprecated.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier to update |
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | Yes | User identifier |
| `content` | string | Yes | New content |

### Example

```typescript
memory_update({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode AND reduced motion"
})
```

## memory_delete

Soft-delete with 30-day recovery window.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier |
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | Yes | User identifier |

### Example

```typescript
memory_delete({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice"
})
```

## memory_restore

Recover a soft-deleted memory within the 30-day window.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier |
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | Yes | User identifier |

### Example

```typescript
memory_restore({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice"
})
```

## memory_promote

Request curator promotion for an episodic memory.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Memory identifier |
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | Yes | User identifier |
| `curator_approved` | boolean | Yes | Must be `true` for promotion |

### Example

```typescript
memory_promote({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice",
  curator_approved: true
})
```

## memory_export

Export memories filtered by group and canonical status.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `group_id` | string | Yes | Tenant namespace |
| `canonical` | boolean | No | `true` for semantic only, `false` for episodic only |
| `format` | string | No | `"json"` (default) or `"csv"` |

### Example

```typescript
memory_export({
  group_id: "allura-myteam",
  canonical: true,
  format: "json"
})
```

## memory_list_deleted

List soft-deleted memories within recovery window.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `group_id` | string | Yes | Tenant namespace |
| `user_id` | string | No | Filter by user |
| `limit` | number | No | Max results (default: 50) |

### Example

```typescript
memory_list_deleted({
  group_id: "allura-myteam",
  user_id: "alice",
  limit: 50
})
```

## Error Responses

All tools return structured errors:

```json
{
  "error": {
    "code": "MISSING_GROUP_ID",
    "message": "group_id is required and must match ^allura-[a-z0-9-]+$",
    "parameter": "group_id"
  }
}
```

Common error codes:

| Code | Meaning | Fix |
|------|---------|-----|
| `MISSING_GROUP_ID` | `group_id` missing or invalid | Provide valid `allura-*` group_id |
| `MISSING_USER_ID` | `user_id` missing | Provide user identifier |
| `NOT_FOUND` | Memory ID does not exist | Check ID and group_id |
| `UNAUTHORIZED` | Cross-tenant access attempt | Use correct group_id |
| `CURATOR_REQUIRED` | Promotion without approval | Set `curator_approved: true` |
| `ALREADY_DELETED` | Memory already soft-deleted | Use `memory_restore` instead |

## Parameter Validation

- `group_id`: Must match regex `^allura-[a-z0-9-]+$`
- `user_id`: Non-empty string
- `content`: Non-empty string, max 64KB
- `threshold`: Number between 0.0 and 1.0
- `limit`: Integer between 1 and 1000

---

*For usage examples, see [`catalog/examples.md`](../../catalog/examples.md). For the HTTP API, see [api.md](api.md).*
