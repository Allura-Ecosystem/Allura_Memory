# CLAUDE.md

> [!NOTE]
> **AI-Assisted Documentation** — this guidance file is maintained with AI assistance (Claude Code).
> Where it conflicts with the source code, schemas, or tests, defer to those.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime & Package Manager

**Bun only. npm/npx are banned** (zero-trust supply chain policy).

```bash
bun install
```

## Commands

```bash
# Dev / build
bun run dev               # Next.js dev server (port $ALLURA_DASHBOARD_PORT, default 3100)
bun run build             # production build
bun run start             # production server

# Type checking & lint
bun run typecheck         # tsc --noEmit
bun run lint              # alias for typecheck

# Tests (6 lane configs)
bun test                          # all unit tests (vitest run)
bun run test:unit                 # unit lane only (no DB)
bun run test:integration          # mocked services + contracts
bun run test:curator              # curator pipeline tests
bun run test:e2e                  # RUN_E2E_TESTS=true, requires live PostgreSQL
bun run test:all                  # typecheck + lint + unit + e2e + mcp browser
bun run test:watch                # watch mode

# Single test
bun vitest run src/lib/postgres/connection.test.ts
bun vitest run -t "should build connection config"

# Brain stack (Docker)
bun run brain:up          # start PostgreSQL + MCP containers
bun run brain:down        # stop stack
bun run brain:status      # health check
bun run brain:recover     # restart in dependency order

# Curator pipeline (HITL promotion)
bun run curator:run       # score and queue proposals
bun run curator:approve   # approve pending proposals
bun run curator:reject    # reject pending proposals
bun run curator:watchdog  # continuous watchdog

# Embedding backfill
bun run backfill:embeddings        # one-shot via Ollama
bun run backfill:embeddings:watch  # continuous polling (30s)

# Session bootstrap
bun run session:start     # brooks-session-start.ts (preferred)

# Brooks CLI
bun run brooks:start / brooks:status / brooks:end

# Validation
bun run validate:e2e              # full E2E validation gate
bun run validate:git-exec         # GIT-EXEC-001 choke point check
bun run validate:tokens           # token compliance
```

## Architecture

Allura is a **PostgreSQL-only AI memory engine** exposed via MCP — a self-hosted, compliance-grade alternative to mem0.

### Data Layers

| Layer    | Store          | Port | Role |
|----------|----------------|------|------|
| Episodic | PostgreSQL 16 | 5432 | Append-only execution traces. **Never mutate historical rows.** |
| Semantic | PostgreSQL 16 (`graph_memories`, `graph_supersedes`) | 5432 | Versioned canonical memory and supersession edges. Existing versions remain immutable. |
| Vector | RuVector (PostgreSQL) | 5432 | Same PostgreSQL instance — `RUVECTOR_PORT` defaults to 5432 (`src/lib/ruvector/connection.ts:70`, `docker-compose.yml:112`). Hybrid search: vector ANN + BM25 RRF. |
| MCP      | Allura Brain   | 5888 | Streamable HTTP (SSE + JSON-RPC). `memory_search`, `memory_add`, `audit_*`, `governance_*`. |

### Dashboard (Next.js 16)

22 pages under `src/app/dashboard/`: search, governance, mission-control, graph, dreams, scheduled-tasks, kanban, work-board, approvals, execution, evidence, handoffs, projects, runs, settings, teams.

API routes under `src/app/api/`: agents, audit, curator, dreams, evidence, execution-overview, groups, handoffs, health, live.

### Key Subsystems

- **Curator** (`src/curator/`): HITL promotion pipeline — scores traces, queues proposals, and requires human approval before canonical PostgreSQL writes.
- **Control Plane** (`src/control-plane/`): RuVix proof-gated mutation layer.
- **Process Engine** (`src/lib/process-engine/`): Workflow execution with checkpoint resume, revision pinning.
- **Budget / Circuit Breaker** (`src/lib/budget/`, `src/lib/circuit-breaker/`): Hard limits and automatic shutdown for agent runaway prevention.
- **Operational State** (`src/lib/operational-state/`): Ready/empty/stale/error/degraded contract for live surfaces.
- **Auth** (`src/lib/auth/`, `src/middleware.ts`): Clerk RBAC in production; `DevAuthProvider` fallback in dev. Role hierarchy: `admin > curator > viewer`.

### Hybrid Search (RuVector)

`retrieveMemories()` in `src/lib/ruvector/bridge.ts` runs two-pass RRF fusion:

- Vector: `ruvector_cosine_distance()` ANN
- Text: `ts_rank` on `content_tsv` generated column
- Fusion: `score = 1/(60+rank_v) + 1/(60+rank_t)`
- Modes: `"hybrid"` (default), `"vector"`, `"text"`

`ruvector_hybrid_search()` and other extension functions are **stubs** — do not call them.

## Non-Negotiable Invariants

- **`group_id` on every DB read/write** — pattern `^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$`. Missing or malformed values cause a CHECK constraint failure.
- **PostgreSQL traces are append-only** — no UPDATE/DELETE on trace rows, ever.
- **Semantic versioning uses `graph_supersedes`** — create a new `graph_memories` version and a supersession edge; never rewrite historical canonical rows.
- **HITL required for promotion** — agents cannot autonomously promote to the canonical store; route through `curator:approve`.
- **`allura-*` tenant namespace** — `roninclaw-*` group_ids are deprecated; flag any occurrence as drift.
- **Allura Brain is the memory surface** — all memories go to Brain (`allura-brain__memory_*`), never to local file banks.
- **Verify before presenting** — never claim code works without testing the endpoint and confirming real data returns.

## Code Conventions

**TypeScript:** `strict: true`; explicit return types on exported functions; `unknown` over `any`; `import type` for type-only imports; Zod validation at external boundaries.

**Import order:** external packages → `@/` aliases → relative imports.

**Naming:** files `kebab-case` · React components `PascalCase` · hooks `useCamelCase` · DB identifiers `snake_case` · constants `SCREAMING_SNAKE_CASE`

**Next.js:** Default to Server Components; `"use client"` only when needed; server actions for persistence (`src/server/`).

## Debugging Protocol

**Before proposing any fix, invoke the `systematic-debugging-memory` skill.** 5-phase process: Memory Hydration → Root Cause → Pattern Analysis → Hypothesis → Implementation. If 3+ fixes have failed, question the architecture.

## Documentation

**Canonical six** in `docs/allura/`: BLUEPRINT, SOLUTION-ARCHITECTURE, DESIGN-ALLURA, REQUIREMENTS-MATRIX, RISKS-AND-DECISIONS, DATA-DICTIONARY. Do not create net-new files there.

**Reference docs** in `docs/reference/`, `docs/user-guide/`, `docs/plugins/`.

**AI-GUIDELINES** in `guidelines/AI-GUIDELINES.md` — full documentation standards.

## Port Allocation (AD-45)

3000–3999 band is **banned**. UI: 4000+ · API: 6000+ · Tools: 7000+. Infra exempt (PostgreSQL 5432, Brain MCP 5888).

## MCP Integration

**DB operations via MCP_DOCKER tools only** — never `docker exec`. Brain MCP uses Streamable HTTP transport (SSE): requires `Accept: application/json, text/event-stream` header and `mcp-session-id` for session continuity.

## Team RAM — Agent Routing

| Agent | Persona | Use When |
|-------|---------|----------|
| **Brooks** | Frederick Brooks | Architecture, delegation |
| **Jobs** | Steve Jobs | Scope control, acceptance criteria |
| **Woz** | Steve Wozniak | Autonomous implementation |
| **Pike** | Rob Pike | Read-only architecture consultation |
| **Scout** | — | Fast codebase search |
| **Bellard** | Fabrice Bellard | Performance, measurement |
| **Fowler** | Martin Fowler | Refactoring, maintainability |
| **Knuth** | Donald Knuth | Schema design, query optimization |
| **Hightower** | Kelsey Hightower | CI/CD, infrastructure |
