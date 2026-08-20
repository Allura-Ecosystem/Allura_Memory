<!-- Context: core/architecture | Priority: critical | Version: 1.0 | Updated: 2026-05-03 -->

---
owner: scout
last_verified: 2026-05-03
source_files:
  - src/control-plane/RuVixControlPlane.ts
  - src/curator/
  - src/mcp/
  - src/app/
  - docker/docker-compose.yml
  - .opencode/context/allura/ALLURA-BRAIN-PROMPT.md
max_age_days: 30
---

# Allura Memory — Architecture

## Stack
- **Framework:** Next.js 15 + TypeScript + Bun
- **Database:** PostgreSQL (pgvector 0.8.2, HNSW index, 1024d qwen3-embedding:8b)
- **Graph:** Neo4j 5.26 (semantic/canonical store)
- **Embeddings:** qwen3-embedding:8b (1024d Matryoshka, Ollama)
- **Runtime:** Docker Compose (6 containers: app, postgres, neo4j, ollama, knowledge, mcp)

## 5-Layer Architecture
1. **RuVix Control Plane** (`src/control-plane/`) — Enforcement gate, policy engine, direct-access blocker
2. **PostgreSQL** — Episodic store (all memory_add events), vector search via pgvector
3. **Neo4j** — Semantic/canonical store (promoted memories, Agent/Team/Project nodes)
4. **Agent Runtime** (`src/agents/`, `src/team-ram/`) — Team RAM + Durham personas
5. **Workflow/DAGs** (`src/curator/`, `ralph/`) — Promotion pipeline, HITL approval

## Key Patterns
- **Dual-store write:** memory_add → PG (always) → Neo4j (on promotion only)
- **Scout-first:** ContextScout loads local .opencode/context before any build task
- **Brain supplements context:** Allura Brain search provides historical decisions/blockers, never replaces deterministic project context
- **RuVix POL-004:** Rejects non-canonical agent IDs in trace calls — tracing gracefully degrades
- **BudgetEnforcer:** Prevents unbounded memory storage

## Directory Map
| Path | Purpose |
|------|---------|
| `src/control-plane/` | RuVix enforcement control plane |
| `src/curator/` | Promotion pipeline, HITL workflow |
| `src/mcp/` | MCP server (allura-memory-mcp) |
| `src/app/` | Next.js App Router pages |
| `src/agents/` | Agent definitions |
| `src/team-ram/` | Team RAM orchestrations |
| `src/data/` | Database schemas, migrations |
| `src/shared/` | Shared utilities |
| `docker/` | Docker Compose + init scripts |

## Invariants
1. Scout before build
2. Context before code
3. Skills before Ralph
4. Validation before done
5. Memory supplements context; it does not replace it
6. No decorative architecture