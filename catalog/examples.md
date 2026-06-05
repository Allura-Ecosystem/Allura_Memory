# Examples

> Integration examples and verification snippets for Allura Memory.

## Quick Verification

After starting Allura with `docker compose up -d`, verify the system is healthy:

```bash
# 1. Health check
curl http://localhost:3201/health
# → { "status": "healthy", "interface": "mcp-http", "transports": ["streamable-http"] }

# 2. Liveness check
curl http://localhost:3201/live
# → { "alive": true, "uptime": 123.45 }

# 3. Readiness check (PostgreSQL + Neo4j + MCP initialized)
curl http://localhost:3201/ready
# → { "ready": true }

# 4. List available MCP tools
curl -X POST http://localhost:3201/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Store a Memory

```typescript
// Via MCP tool call
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

## Search Memories

```typescript
// Hybrid search across episodic + semantic layers
memory_search({
  query: "dark mode preferences",
  group_id: "allura-myteam",
  user_id: "alice",
  limit: 10
})
```

## Update a Memory (Versioned)

```typescript
// Creates new node, links SUPERSEDES, marks old deprecated
memory_update({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode AND reduced motion"
})
```

## Soft-Delete and Restore

```typescript
// Delete (recoverable within 30 days)
memory_delete({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice"
})

// Restore within window
memory_restore({
  id: "mem_7f9e2c3a1b5d",
  group_id: "allura-myteam",
  user_id: "alice"
})
```

## Curator Workflow

```bash
# 1. Run curator scoring and queue
bun run curator:run

# 2. Review pending proposals (human step)
#    → Approve or reject each proposal

# 3. Approve pending proposals
bun run curator:approve

# 4. Reject pending proposals
bun run curator:reject
```

## Plugin Validation

```bash
# Validate allura-cowork plugin
python3 plugins/allura-cowork/scripts/validate_plugin.py plugins/allura-cowork

# Validate allura-governance plugin
python3 plugins/allura-governance/scripts/validate_plugin.py plugins/allura-governance
```

## Docker Compose Verification

```bash
# Check all services are running
docker compose ps

# Check PostgreSQL is ready
docker exec knowledge-postgres pg_isready -U $POSTGRES_USER -d memory

# Check Neo4j version
curl -s http://localhost:7474 | jq .neo4j_version

# Test Neo4j Cypher
docker exec knowledge-neo4j cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "RETURN 1 AS test"
```

## Multi-Tenant Example

```typescript
// Team A memories
memory_add({ group_id: "allura-team-a", user_id: "bob", content: "Bob likes TypeScript" })

// Team B memories — completely isolated
memory_add({ group_id: "allura-team-b", user_id: "bob", content: "Bob likes Python" })

// Search only returns Team A results
memory_search({ query: "Bob likes", group_id: "allura-team-a", user_id: "bob" })
// → Only "Bob likes TypeScript"
```

## Embedding Backfill

```bash
# One-shot: embed all NULL rows via Ollama
bun run backfill:embeddings

# Continuous polling (30s interval)
bun run backfill:embeddings:watch
```

## Benchmark

```bash
# Run performance benchmark
bun run benchmark
```

---

*For the full API reference, see [`docs/reference/mcp-tools.md`](../docs/reference/mcp-tools.md). For getting started, see [`docs/user-guide/getting-started.md`](../docs/user-guide/getting-started.md).*
