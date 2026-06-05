# Allura Memory — Cowork Plugin

Search, store, manage, and curate Allura Brain memories from Claude Cowork.

## Requirements

- A running Allura Brain instance at `http://localhost:5888/mcp`
- Docker Compose stack: PostgreSQL 16 (pgvector), Neo4j 5.26, Ollama (nomic-embed-text)

## Setup

1. Install this plugin in Cowork
2. Ensure your Allura stack is running: `docker compose up -d` in the allura-memory repo
3. The plugin connects to Allura Brain via the MCP config at `localhost:5888`

## Skills

### search-memory
Find memories using hybrid vector + BM25 search, or retrieve a specific memory by ID.

**Triggers:** "search memories", "find what we decided about", "look up", "recall", "what do we know about"

### remember
Store new memories with automatic scoring and curator pipeline routing.

**Triggers:** "remember this", "store this", "save to memory", "log this decision", "add to brain"

### manage-memories
Full lifecycle management: list, update (versioned), delete (soft, 30-day recovery), restore, export.

**Triggers:** "list my memories", "update memory", "delete memory", "restore memory", "export memories"

### curate
Promote memories from episodic traces to canonical knowledge via the HITL curator queue.

**Triggers:** "promote memory", "review pending", "approve memory", "curator queue", "what's pending review"

## MCP Configuration

The plugin includes an MCP server config for Allura Brain in `mcp-config.json`. After installation, rename it to `.mcp.json` at the plugin root for auto-discovery:

```bash
mv mcp-config.json .mcp.json
```

## Architecture

Allura uses a dual-database design:

- **Episodic layer (PostgreSQL):** Append-only raw traces, scored at write time
- **Semantic layer (Neo4j):** Curated knowledge graph with `SUPERSEDES` versioning
- **Vector layer (RuVector):** 768d embeddings via Ollama, hybrid ANN + BM25 search

All writes go through the governed memory pipeline. High-scoring memories are queued for human review before promotion to the knowledge graph.

## Key invariants

- `group_id` required on every operation (pattern: `^allura-[a-z0-9-]+$`)
- PostgreSQL traces are append-only — never mutated
- Neo4j updates via `SUPERSEDES` chains — never edit existing nodes
- HITL required for promotion — no autonomous writes to the knowledge graph
