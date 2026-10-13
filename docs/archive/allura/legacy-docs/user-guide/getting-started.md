# Getting Started with Allura

> Complete installation and first-run guide for Allura Memory.

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Docker | 20.10+ | PostgreSQL + Neo4j containers |
| Docker Compose | 2.0+ | Orchestrate multi-container setup |
| Bun | 1.0+ | Runtime and package manager |
| Ollama | latest | Local embeddings (pull `qwen3-embedding:8b`) |

## Step-by-Step Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Charitablebusinessronin/Allura_Memory.git
cd Allura_Memory
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# ── Core (all required in production) ───────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=allura
POSTGRES_USER=allura
POSTGRES_PASSWORD=<generate with: openssl rand -base64 32>
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<generate with: openssl rand -base64 32>

# ── Governance ────────────────────────
PROMOTION_MODE=soc2          # "soc2" (review-gated) or "auto" (auto-promote)
AUTO_APPROVAL_THRESHOLD=0.85 # minimum score for promotion eligibility

# ── Security ──────────────────────────
JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# ── Embeddings ────────────────────────
RUVECTOR_EMBEDDING_BASE_URL=http://localhost:11434
EMBEDDING_MODEL=qwen3-embedding:8b
```

> **Security note:** Never commit `.env` to version control. It is already in `.gitignore`.

### 4. Pull Ollama Embedding Model

```bash
ollama pull qwen3-embedding:8b
```

### 5. Start Infrastructure

```bash
docker compose up -d
```

Verify services:

```bash
docker compose ps
```

Expected output:
- `postgres` — healthy
- `neo4j` — healthy
- `neo4j-init` — exited (0) — one-time schema setup
- `mcp` — healthy

### 6. Verify Allura is Ready

```bash
# Health check
curl http://localhost:3201/health
# → { "status": "healthy", "interface": "mcp-http", ... }

# Liveness check
curl http://localhost:3201/live
# → { "alive": true, ... }

# Readiness check
curl http://localhost:3201/ready
# → { "ready": true, ... }

# MCP tools list
curl -X POST http://localhost:3201/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### 7. Connect Your Agent

Choose your runtime:

- **Claude Desktop** — see [claude.md](claude.md)
- **Codex** — see [codex.md](codex.md)
- **Claude + Codex together** — see [cowork.md](cowork.md)
- **Cursor / VS Code** — use stdio transport, same as Claude Desktop
- **OpenCode** — add to `.opencode/mcp-client-config.json`

### 8. Store Your First Memory

```typescript
memory_add({
  group_id: "allura-myteam",
  user_id: "alice",
  content: "Alice prefers dark mode for all UIs",
  metadata: { source: "conversation" },
  threshold: 0.85
})
```

### 9. Verify It Works

```typescript
memory_search({
  query: "dark mode preferences",
  group_id: "allura-myteam",
  user_id: "alice"
})
```

You should see your memory returned with:
- `id` — unique memory identifier
- `content` — the stored text
- `score` — confidence score (0.0–1.0)
- `source` — which store returned it (`episodic` or `semantic`)

## Configuration Reference

### Promotion Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| `soc2` | Score ≥ threshold → curator review queue | Production, audit-conscious teams |
| `auto` | Score ≥ threshold → automatic promotion | Development, experimentation |

### Required Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `POSTGRES_HOST` | `localhost` | Yes | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | Yes | PostgreSQL port |
| `POSTGRES_DB` | `allura` | Yes | Database name |
| `POSTGRES_USER` | `allura` | Yes | Database user |
| `POSTGRES_PASSWORD` | — | Yes | Database password |
| `NEO4J_URI` | `neo4j://localhost:7687` | Yes | Neo4j bolt URI |
| `NEO4J_USER` | `neo4j` | Yes | Neo4j user |
| `NEO4J_PASSWORD` | — | Yes | Neo4j password |
| `JWT_SECRET` | — | Yes | JWT signing secret |
| `PROMOTION_MODE` | `soc2` | No | `soc2` or `auto` |
| `AUTO_APPROVAL_THRESHOLD` | `0.85` | No | Score threshold for auto-promotion |

## Troubleshooting First Run

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Connection refused` on port 3201 | MCP gateway not started | `docker compose up -d` |
| `tools/list` returns empty | MCP server not registered | Check `src/mcp/memory-server-canonical.ts` exists |
| PostgreSQL auth fails | Wrong credentials | Verify `.env` matches `docker-compose.yml` |
| Neo4j connection fails | Neo4j still initializing | Wait 30s after `docker compose up` |
| Embedding errors | Ollama not running | `ollama serve` or check `RUVECTOR_EMBEDDING_BASE_URL` |

See [troubleshooting.md](troubleshooting.md) for extended diagnostics.

---

*For the canonical architecture, see [`docs/allura/BLUEPRINT.md`](../allura/BLUEPRINT.md). For plugin installation, see [`catalog/plugins.md`](../../catalog/plugins.md).*
