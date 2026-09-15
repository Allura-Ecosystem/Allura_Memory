# Allura API Reference

Complete reference for Allura's MCP tools (agent interface) and REST endpoints (dashboard interface).

---

## Table of Contents

- [MCP Tools (Agent Interface)](#mcp-tools-agent-interface)
- [REST API (Dashboard Interface)](#rest-api-dashboard-interface)
- [Authentication](#authentication)
- [Error Handling](#error-handling)
- [Examples](#examples)

---

## MCP Tools (Agent Interface)

All tools use the Model Context Protocol (MCP) over stdio. Configure in your MCP client (Claude Desktop, VS Code Cursor, etc.):

```json
{
  "mcpServers": {
    "allura": {
      "command": "bun",
      "args": ["run", "src/mcp/memory-server.ts"]
    }
  }
}
```

---

### `memory_add`

Append an episodic memory. Eligible content is queued for human curator review;
`memory_add` never promotes a memory to canonical knowledge itself.

**Signature**
```typescript
memory_add({
  group_id?: string,
  user_id?: string,
  content: string,
  metadata?: {
    source?: "conversation" | "manual",
    context?: string,
    confidence?: number,
    [key: string]: any
  }
}): Promise<{
  id: string,
  stored: "episodic",
  pending_review?: boolean,
  score: number
}>
```

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | Yes | The memory content (1–10,000 chars) |
| `group_id` | string | No | Tenant selector. The authenticated transport principal supplies the effective group and rejects an unauthorized selector. |
| `user_id` | string | No | Caller identity assertion. If supplied, it must equal the authenticated principal; it cannot choose the persisted actor. |
| `metadata` | object | No | Additional context |
| `metadata.source` | string | No | How the memory was created (default: "conversation") |
| `metadata.context` | string | No | What conversation led to this memory |
| `metadata.confidence` | number | No | Agent's confidence (0–1; default: auto-scored) |

**Transport identity**

The authenticated MCP transport derives the effective `group_id`, `workspace_id`,
persisted `user_id`, and `agent_id`. Callers do not send a trusted `scope` object.
`group_id` and `user_id` are selectors/assertions only: a tenant or identity
mismatch is rejected rather than rebinding authority.

**Response**

```typescript
{
  id: "mem_7f9e2c3a1b5d",
  stored: "episodic",
  pending_review: true, // present when the scorer queued curator review
  score: 0.92
}
```

**Status Codes**

| Status | Meaning |
|--------|---------|
| `stored: "episodic"` | Append-only episodic evidence was stored. |
| `pending_review: true` | Eligible content was queued for human curator approval. |

**Examples**

```typescript
// The authenticated transport supplies group/workspace/user/agent identity.
const mem1 = await memory_add({
  content: "Sabir prefers dark mode",
  metadata: {
    source: "conversation",
    context: "IDE setup discussion",
    confidence: 0.92
  }
});
// { id: "mem_...", stored: "episodic", score: 0.92 }

// An identity assertion is allowed only when it matches the authenticated caller.
const mem2 = await memory_add({
  user_id: "authenticated-agent",
  content: "Borrower flagged for suspicious income source",
  metadata: {
    source: "conversation",
    context: "Application review for John Smith",
    confidence: 0.88
  }
});
// { id: "mem_...", stored: "episodic", pending_review: true, score: 0.88 }
```

---

### `memory_search`

Federated search across both PostgreSQL (episodic) and Neo4j (semantic). Semantic results take precedence.

**Signature**
```typescript
memory_search(
  query: string,
  userId: string,
  limit?: number
): Promise<Array<{
  id: string,
  content: string,
  source: "episodic" | "semantic",
  score: number,
  created: string,
  used_count: number
}>>
```

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Search query (e.g., "dark mode preferences") |
| `userId` | string | Yes | Limit results to this user |
| `limit` | number | No | Max results (default: 10, max: 100) |

**Response**

Array of memories, sorted by relevance (semantic > episodic):

```typescript
[
  {
    id: "mem_7f9e2c3a1b5d",
    content: "Sabir prefers dark mode",
    source: "semantic",      // queried from Neo4j
    score: 0.96,             // semantic relevance
    created: "2 hours ago",  // human-readable
    used_count: 3            // how many times agent has used this
  },
  {
    id: "evt_a1b2c3d4e5f6",
    content: "IDE theme set to dark (VS Code)",
    source: "episodic",      // from PostgreSQL
    score: 0.87,
    created: "2 weeks ago",
    used_count: 1
  }
]
```

**Examples**

```typescript
// Search for user preferences
const results = await memory_search(
  "dark mode preferences",
  "sabir",
  10
);

// Search for borrower info
const borrowers = await memory_search(
  "suspicious income",
  "loan-officer-1",
  5
);
```

---

### `memory_get`

Fetch a single memory by ID with full details and provenance.

**Signature**
```typescript
memory_get(memoryId: string): Promise<{
  id: string,
  content: string,
  userId: string,
  score: number,
  source: "episodic" | "semantic",
  created: string,
  context?: string,
  used_count: number,
  last_used?: string,
  deprecated?: boolean
}>
```

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `memoryId` | string | Yes | Memory ID (from `memory_add` or `memory_search`) |

**Response**

Full memory record with metadata:

```typescript
{
  id: "mem_7f9e2c3a1b5d",
  content: "Sabir prefers dark mode",
  userId: "sabir",
  score: 0.92,
  source: "semantic",
  created: "2026-04-07T06:30:00Z",
  context: "IDE setup discussion",
  used_count: 3,
  last_used: "2026-04-07T14:22:00Z",
  deprecated: false
}
```

**Examples**

```typescript
const memory = await memory_get("mem_7f9e2c3a1b5d");
console.log(`Last used: ${memory.last_used}`);
```

---

### `memory_list`

List all memories for a user (paginated).

**Signature**
```typescript
memory_list(
  userId: string,
  limit?: number,
  offset?: number
): Promise<{
  memories: Array<{
    id: string,
    content: string,
    created: string,
    score: number,
    source: "episodic" | "semantic"
  }>,
  total: number,
  limit: number,
  offset: number
}>
```

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `userId` | string | Yes | User ID |
| `limit` | number | No | Results per page (default: 25, max: 100) |
| `offset` | number | No | Pagination offset (default: 0) |

**Response**

```typescript
{
  memories: [
    { id: "mem_...", content: "...", created: "...", score: 0.92, source: "semantic" },
    { id: "evt_...", content: "...", created: "...", score: 0.87, source: "episodic" }
  ],
  total: 247,
  limit: 25,
  offset: 0
}
```

**Examples**

```typescript
// Page 1
const page1 = await memory_list("sabir", 25, 0);

// Page 2
const page2 = await memory_list("sabir", 25, 25);
```

---

### `memory_delete`

Soft-delete a memory. It's recoverable for 30 days (configurable).

**Signature**
```typescript
memory_delete(memoryId: string): Promise<{
  id: string,
  status: "deleted",
  recoverable_until: string
}>
```

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `memoryId` | string | Yes | Memory ID to delete |

**Response**

```typescript
{
  id: "mem_7f9e2c3a1b5d",
  status: "deleted",
  recoverable_until: "2026-05-08T06:30:00Z"
}
```

**Examples**

```typescript
const deleted = await memory_delete("mem_7f9e2c3a1b5d");
console.log(`Can restore until: ${deleted.recoverable_until}`);
```

---

## REST API (Dashboard Interface)

All REST endpoints require authentication (JWT token in `Authorization: Bearer <token>` header).

---

### `GET /api/health`

System health check. **No authentication required.**

**Response**

```json
{
  "status": "ok",
  "postgres": "connected",
  "neo4j": "connected",
  "uptime_seconds": 3600
}
```

---

### `POST /api/memory`

**Currently disabled for writes.** This endpoint deliberately returns **403**.
Use the canonical authenticated MCP `memory_add` tool (Streamable HTTP or stdio)
to write memory; its verified credential boundary derives tenant, workspace,
agent, and user identity.

---

### `GET /api/memory`

List memories for a user.

**Query Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `userId` | string | Yes | User ID |
| `groupId` | string | Yes | Tenant ID |
| `limit` | number | No | Results per page (default: 25, max: 100) |
| `offset` | number | No | Pagination offset (default: 0) |

**Request**

```
GET /api/memory?userId=sabir&groupId=allura-myproject&limit=25&offset=0
```

**Response**

```json
{
  "memories": [
    {
      "id": "mem_7f9e2c3a1b5d",
      "content": "Sabir prefers dark mode",
      "created": "2026-04-07T06:30:00Z",
      "score": 0.92,
      "source": "semantic"
    }
  ],
  "total": 247,
  "limit": 25,
  "offset": 0
}
```

---

### `GET /api/memory/[id]`

Fetch a single memory by ID.

**Request**

```
GET /api/memory/mem_7f9e2c3a1b5d?groupId=allura-myproject
```

**Response**

```json
{
  "id": "mem_7f9e2c3a1b5d",
  "content": "Sabir prefers dark mode",
  "userId": "sabir",
  "score": 0.92,
  "source": "semantic",
  "created": "2026-04-07T06:30:00Z",
  "context": "IDE setup discussion",
  "used_count": 3,
  "last_used": "2026-04-07T14:22:00Z"
}
```

---

### `DELETE /api/memory/[id]`

Soft-delete a memory.

**Request**

```
DELETE /api/memory/mem_7f9e2c3a1b5d?groupId=allura-myproject
```

**Response**

```json
{
  "id": "mem_7f9e2c3a1b5d",
  "status": "deleted",
  "recoverable_until": "2026-05-08T06:30:00Z"
}
```

---

### `GET /api/memory/search`

Federated search (MCP tool equivalent).

**Query Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `q` | string | Yes | Search query |
| `userId` | string | Yes | User ID |
| `groupId` | string | Yes | Tenant ID |
| `limit` | number | No | Max results (default: 10, max: 100) |

**Request**

```
GET /api/memory/search?q=dark+mode&userId=sabir&groupId=allura-myproject&limit=10
```

**Response**

```json
[
  {
    "id": "mem_7f9e2c3a1b5d",
    "content": "Sabir prefers dark mode",
    "source": "semantic",
    "score": 0.96,
    "created": "2 hours ago",
    "used_count": 3
  }
]
```

---

### `GET /api/memory/forgotten`

List recently deleted memories (recoverable for 30 days).

**Query Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `userId` | string | Yes | User ID |
| `groupId` | string | Yes | Tenant ID |

**Response**

```json
[
  {
    "id": "mem_7f9e2c3a1b5d",
    "content": "Sabir prefers dark mode",
    "deleted": "5 minutes ago",
    "recoverable_until": "2026-05-08T06:30:00Z"
  }
]
```

---

### `POST /api/memory/[id]/restore`

Restore a forgotten memory.

**Request**

```
POST /api/memory/mem_7f9e2c3a1b5d/restore?groupId=allura-myproject
```

**Response**

```json
{
  "id": "mem_7f9e2c3a1b5d",
  "status": "restored"
}
```

---

## Admin API (Enterprise)

### `GET /api/admin/audit`

Audit log (all events for a tenant).

**Query Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `groupId` | string | Yes | Tenant ID |
| `eventType` | string | No | Filter by event type |
| `limit` | number | No | Results per page (default: 100) |
| `offset` | number | No | Pagination offset (default: 0) |
| `format` | string | No | "json" or "csv" (default: json) |

**Request**

```
GET /api/admin/audit?groupId=allura-bank-lending&format=csv
```

**Response (CSV)**

```
id,created_at,event_type,agent_id,metadata
1,2026-04-07T06:30:00Z,memory_add,loan-officer-1,"{...}"
2,2026-04-07T06:31:00Z,memory_promoted,system,"{...}"
```

---

### `GET /api/admin/pending`

Pending approvals (curator queue).

**Request**

```
GET /api/admin/pending?groupId=allura-bank-lending
```

**Response**

```json
[
  {
    "id": "prop_abc123",
    "content": "Borrower flagged for suspicious income",
    "userId": "loan-officer-1",
    "score": 0.88,
    "created": "2 hours ago",
    "context": "Application review"
  }
]
```

---

### `POST /api/admin/approve/[id]`

Approve a pending memory.

**Request**

```
POST /api/admin/approve/prop_abc123
{
  "groupId": "allura-bank-lending",
  "notes": "Approved by risk team"
}
```

**Response**

```json
{
  "id": "prop_abc123",
  "status": "approved",
  "memory_id": "mem_xyz789",
  "promoted_at": "2026-04-07T06:31:00Z"
}
```

---

### `POST /api/admin/reject/[id]`

Reject a pending memory.

**Request**

```
POST /api/admin/reject/prop_abc123
{
  "groupId": "allura-bank-lending",
  "reason": "Insufficient evidence for this flag"
}
```

**Response**

```json
{
  "id": "prop_abc123",
  "status": "rejected",
  "rejected_at": "2026-04-07T06:31:00Z"
}
```

---

## Authentication

### JWT Bearer Token

All REST endpoints (except `/api/health`) require JWT authentication:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Claims**

```json
{
  "aud": "allura-api",
  "sub": "user-id",
  "groupId": "allura-myproject",
  "role": "user|curator|admin",
  "iat": 1712500800,
  "exp": 1712587200
}
```

### Generating Tokens

```bash
# Development (no auth required)
SKIP_AUTH=true npm run dev

# Production
# Use your auth provider (Auth0, Keycloak, etc.)
# Exchange credentials for JWT token
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "MEMORY_NOT_FOUND",
    "message": "Memory with ID 'mem_xyz' not found",
    "status": 404,
    "details": {
      "memoryId": "mem_xyz",
      "groupId": "allura-myproject"
    }
  }
}
```

### Common Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `MEMORY_NOT_FOUND` | 404 | Memory ID doesn't exist |
| `INVALID_GROUP_ID` | 400 | Missing or invalid tenant ID |
| `UNAUTHORIZED` | 401 | Missing or invalid JWT token |
| `FORBIDDEN` | 403 | User lacks permission (e.g., curator action by non-curator) |
| `CONTENT_TOO_LARGE` | 413 | Content > 10KB |
| `POSTGRES_ERROR` | 500 | Database error |
| `NEO4J_ERROR` | 500 | Graph database error |

---

## Examples

### Scenario 1: Add a Memory and Search It

```typescript
// 1. Agent writes a memory
const mem = await memory_add(
  "Borrower has 5-year stable employment history",
  "loan-officer-1",
  { context: "Application review", confidence: 0.93 }
);
// { id: "mem_abc123", status: "promoted", stored: "both", score: 0.93 }

// 2. Wait for curator approval (SOC2 mode)
// [Curator reviews dashboard, clicks APPROVE]

// 3. Later, search for similar borrowers
const results = await memory_search(
  "stable employment history",
  "loan-officer-1",
  5
);
// Returns memories mentioning employment stability

// 4. Get full details
const detail = await memory_get("mem_abc123");
// { id: "mem_abc123", content: "...", used_count: 2, ... }
```

### Scenario 2: Consumer Memory Viewer

```typescript
// 1. User opens memory viewer (dashboard)
// GET /api/memory?userId=sabir&groupId=allura-myproject

// 2. User searches
// GET /api/memory/search?q=dark+mode&userId=sabir&groupId=allura-myproject

// 3. User expands a memory to see provenance
// GET /api/memory/mem_7f9e2c3a1b5d?groupId=allura-myproject
// Shows: created when, context, how many times used

// 4. User deletes by mistake
// DELETE /api/memory/mem_7f9e2c3a1b5d?groupId=allura-myproject

// 5. User clicks Recently Forgotten
// GET /api/memory/forgotten?userId=sabir&groupId=allura-myproject
// Restores within 30 days
// POST /api/memory/mem_7f9e2c3a1b5d/restore?groupId=allura-myproject
```

---

## Rate Limiting

**Soft limit:** 100 requests/second per tenant  
**Hard limit:** 500 requests/second per tenant (circuit breaker trips)

If tripped, requests return `429 Too Many Requests` until the 1-minute window resets.

---

## Versioning

Current API version: **1.0.0**

Request/response format is stable. Breaking changes will increment major version number with 6-month deprecation notice.
