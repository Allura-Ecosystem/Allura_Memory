# Adapter Catalog

> MCP adapters and client configurations for connecting Allura to agent runtimes.

## MCP Transport Options

Allura exposes memory operations through the **Model Context Protocol (MCP)**. Two transport options are supported:

| Transport | Use Case | Configuration |
|-----------|----------|---------------|
| **Stdio** | Local CLI agents, Claude Desktop, Cursor | `command: bun src/mcp/memory-server-canonical.ts` |
| **Streamable HTTP** | Remote agents, web services, multi-tenant setups | `url: http://localhost:3201/mcp` |

## Client Configurations

### Claude Desktop

```json
{
  "mcpServers": {
    "allura": {
      "command": "bun",
      "args": ["src/mcp/memory-server-canonical.ts"]
    }
  }
}
```

### Cursor / VS Code

```json
{
  "mcpServers": {
    "allura": {
      "command": "bun",
      "args": ["src/mcp/memory-server-canonical.ts"]
    }
  }
}
```

### OpenCode

Add to `.opencode/mcp-client-config.json`:

```json
{
  "mcpServers": {
    "allura": {
      "command": "bun",
      "args": ["src/mcp/memory-server-canonical.ts"]
    }
  }
}
```

### HTTP Gateway (for remote clients)

```json
{
  "mcpServers": {
    "allura": {
      "url": "http://localhost:3201/mcp"
    }
  }
}
```

## Available Tools

Once connected, your agent can call these memory tools:

| Tool | Description |
|------|-------------|
| `memory_add` | Store a new memory (episodic → score → promote/queue) |
| `memory_search` | Hybrid semantic + fulltext search across both stores |
| `memory_get` | Retrieve a single memory by ID |
| `memory_list` | List all memories for a user within a tenant |
| `memory_update` | Append-only versioned update (creates SUPERSEDES chain) |
| `memory_delete` | Soft-delete with 30-day recovery window |
| `memory_restore` | Recover a soft-deleted memory |
| `memory_promote` | Request curator promotion for an episodic memory |
| `memory_export` | Export memories filtered by group and canonical status |
| `memory_list_deleted` | List soft-deleted memories within recovery window |

## Required Parameters

Every memory operation requires:

- **`group_id`** — tenant namespace (pattern: `^allura-[a-z0-9-]+$`)
- **`user_id`** — user identifier within the tenant

Example:
```typescript
memory_add({
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode for all UIs",
  metadata: { source: "conversation" },
  threshold: 0.85
})
```

## Verification

After configuring your client, verify connectivity:

```bash
# MCP Streamable HTTP endpoint
curl -X POST http://localhost:3201/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Health check
curl http://localhost:3201/health

# Liveness check
curl http://localhost:3201/live

# Readiness check
curl http://localhost:3201/ready
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `Connection refused` | Is the MCP HTTP gateway running? `docker compose ps` |
| `tools/list` returns empty | Is `src/mcp/memory-server-canonical.ts` present? |
| `group_id` errors | Ensure `group_id` matches `^allura-[a-z0-9-]+$` |
| Auth failures | Check `JWT_SECRET` and `ENCRYPTION_KEY` in `.env` |

See [`docs/reference/troubleshooting.md`](../docs/reference/troubleshooting.md) for extended diagnostics.

---

*For the full API contract, see [`docs/reference/mcp-tools.md`](../docs/reference/mcp-tools.md). For canonical architecture, see [`docs/allura/DESIGN-ALLURA.md`](../docs/allura/DESIGN-ALLURA.md).*
