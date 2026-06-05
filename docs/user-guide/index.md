# User Guide

> Getting started with Allura Memory — installation, configuration, and first memory operations.

## What You Need

- **Docker** + Docker Compose
- **Bun** 1.0+
- **Ollama** (for local embeddings — pull `qwen3-embedding:8b`)

## Quick Start (5 Minutes)

### 1. Clone & Install

```bash
git clone https://github.com/Charitablebusinessronin/Allura_Memory.git
cd Allura_Memory
bun install

cp .env.example .env
# Edit .env with your database credentials and JWT secret
```

### 2. Start Infrastructure

```bash
docker compose up -d
```

Services started:
- `postgres` — PostgreSQL 16 + pgvector (port 5432)
- `neo4j` — Neo4j 5.26 knowledge graph (ports 7474, 7687)
- `neo4j-init` — Schema initializer (runs once)
- `mcp` — MCP HTTP gateway (port 3201 mapped to 5888)

### 3. Verify

```bash
# Health check
curl http://localhost:3201/health

# List MCP tools
curl -X POST http://localhost:3201/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### 4. Connect Your Agent

See runtime-specific guides:
- [Claude Code](claude.md)
- [Codex](codex.md)
- [Claude + Codex together](cowork.md)

## First Memory

Once connected, store your first memory:

```typescript
memory_add({
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode for all UIs",
  metadata: { source: "conversation" },
  threshold: 0.85
})
```

Then search it:

```typescript
memory_search({
  query: "dark mode preferences",
  group_id: "allura-myteam",
  user_id: "alice"
})
```

## Next Steps

| I want to… | Read |
|------------|------|
| Understand the full workflow | [`catalog/workflows.md`](../../catalog/workflows.md) |
| Browse plugins | [`catalog/plugins.md`](../../catalog/plugins.md) |
| See integration examples | [`catalog/examples.md`](../../catalog/examples.md) |
| Understand governance | [`catalog/gates.md`](../../catalog/gates.md) |
| Read the architecture | [`docs/allura/BLUEPRINT.md`](../allura/BLUEPRINT.md) |

---

*For troubleshooting, see [troubleshooting.md](troubleshooting.md). For the full API reference, see [`docs/reference/`](../reference/).*
