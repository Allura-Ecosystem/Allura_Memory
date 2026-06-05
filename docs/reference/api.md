# API Reference

> HTTP endpoints and response formats for Allura Memory.

## Base URL

```
http://localhost:3201
```

## MCP Streamable HTTP Endpoint

### POST /mcp

Primary integration path for MCP-compatible agents.

**Content-Type:** `application/json`

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      { "name": "memory_add", "description": "..." },
      { "name": "memory_search", "description": "..." }
    ]
  },
  "id": 1
}
```

## Health Endpoints

### GET /health

Service health status.

**Response:**
```json
{
  "status": "healthy",
  "interface": "mcp-http",
  "transports": ["streamable-http"],
  "version": "1.0.0"
}
```

### GET /live

Process liveness check.

**Response:**
```json
{
  "alive": true,
  "uptime": 123.45,
  "timestamp": "2026-06-04T12:00:00Z"
}
```

### GET /ready

Readiness check — verifies PostgreSQL, Neo4j, and MCP initialization.

**Response:**
```json
{
  "ready": true,
  "checks": {
    "postgres": true,
    "neo4j": true,
    "mcp": true
  }
}
```

## Memory API

### POST /api/memory

Store a new memory.

**Request:**
```json
{
  "group_id": "allura-myteam",
  "user_id": "alice",
  "content": "Alice prefers dark mode",
  "metadata": { "source": "conversation" },
  "threshold": 0.85
}
```

**Response:**
```json
{
  "id": "mem_7f9e2c3a1b5d",
  "content": "Alice prefers dark mode",
  "score": 0.92,
  "status": "queued",
  "group_id": "allura-myteam",
  "user_id": "alice",
  "created_at": "2026-06-04T12:00:00Z"
}
```

### GET /api/memory

Search memories.

**Query Parameters:**
- `q` — search query
- `group_id` — tenant namespace (required)
- `user_id` — user filter
- `limit` — max results (default: 10)
- `mode` — `"hybrid"`, `"vector"`, or `"text"`

**Response:**
```json
{
  "results": [...],
  "total": 42,
  "mode": "hybrid"
}
```

### GET /api/memory/:id

Retrieve a single memory.

**Response:**
```json
{
  "id": "mem_7f9e2c3a1b5d",
  "content": "Alice prefers dark mode",
  "score": 0.92,
  "source": "episodic",
  "group_id": "allura-myteam",
  "user_id": "alice"
}
```

### PUT /api/memory/:id

Update a memory (versioned — creates SUPERSEDES chain).

**Request:**
```json
{
  "content": "Alice prefers dark mode AND reduced motion",
  "group_id": "allura-myteam",
  "user_id": "alice"
}
```

### DELETE /api/memory/:id

Soft-delete a memory.

**Response:**
```json
{
  "id": "mem_7f9e2c3a1b5d",
  "status": "deleted",
  "deleted_at": "2026-06-04T12:00:00Z",
  "recoverable_until": "2026-07-04T12:00:00Z"
}
```

### POST /api/memory/:id/restore

Restore a soft-deleted memory.

**Response:**
```json
{
  "id": "mem_7f9e2c3a1b5d",
  "status": "restored",
  "restored_at": "2026-06-04T12:00:00Z"
}
```

### POST /api/memory/:id/promote

Request curator promotion.

**Request:**
```json
{
  "curator_approved": true,
  "group_id": "allura-myteam",
  "user_id": "alice"
}
```

## Curator API

### GET /api/curator/proposals

List pending promotion proposals.

**Query Parameters:**
- `group_id` — tenant namespace (required)
- `status` — `"pending"`, `"approved"`, `"rejected"`

### POST /api/curator/proposals/:id/approve

Approve a promotion proposal.

### POST /api/curator/proposals/:id/reject

Reject a promotion proposal.

## Graph API (Read-Only)

### GET /api/memory/graph

Read-only graph exploration — returns a capped display sample.

**Query Parameters:**
- `group_id` — tenant namespace (required)
- `limit` — max nodes (default: 100, max: 1000)

**Response:**
```json
{
  "nodes": [...],
  "edges": [...],
  "total_edges": 1523,
  "capped": true
}
```

> **Note:** This endpoint is read-only and tenant-scoped. No mutations are performed.

## Admin API

### POST /api/admin/reset-budget

Reset budget enforcer after a halt.

**Headers:** Requires admin JWT token.

## Error Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "parameter": "field_name",
    "status": 400
  }
}
```

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request — invalid parameters |
| 401 | Unauthorized — invalid or missing JWT |
| 403 | Forbidden — cross-tenant access or missing approval |
| 404 | Not found — memory or resource does not exist |
| 409 | Conflict — resource already exists or already deleted |
| 500 | Internal server error |

## Authentication

All API endpoints (except `/health`, `/live`, `/ready`) require a JWT token:

```
Authorization: Bearer <jwt-token>
```

Generate tokens using the `JWT_SECRET` from `.env`.

---

*For MCP tool semantics, see [mcp-tools.md](mcp-tools.md). For examples, see [`catalog/examples.md`](../../catalog/examples.md).*
