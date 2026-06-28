# Agent Directory

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

This file defines the **live agent surface** for the Team RAM OpenCode Harness,
restored on the **OAC Core + Allura Overlay** architecture.

## Architecture Principle

> **OAC Core:** Context-first, plan-first, validation-first.
> **Allura Overlay:** Team RAM personas, Brain memory, governance, HITL, Brooks orchestration.
> **Memory supplements context; it does not replace it.**

## Canonical Rule

The nested files in `.opencode/agent/` are the only live agent definitions in this repo.
Structure follows the OAC Core pattern: `core/` for primary orchestrators, `subagents/` for
delegated specialists grouped by domain.

```text
.opencode/agent/
├── core/                          ← Primary orchestrators (mode: primary)
│   ├── brooks.md                  ← Architect + Orchestrator
│   └── jobs.md                    ← Intent Gate
│
└── subagents/                     ← Delegated specialists (mode: subagent)
    ├── code/                      ← Domain: coding & implementation
    │   ├── woz.md                 ← Primary builder
    │   ├── bellard.md             ← Diagnostics + perf
    │   └── carmack.md             ← Performance & optimization
    │
    ├── core/                      ← Domain: cross-cutting services
    │   └── scout.md               ← Recon + discovery (ContextScout)
    │
    ├── review/                    ← Domain: quality gates
    │   ├── pike.md                ← Interface review
    │   └── fowler.md              ← Refactor gate
    │
    └── infrastructure/            ← Domain: infra & data
        ├── knuth.md               ← Data architect
        └── hightower.md           ← DevOps
```

## ContextScout First Gate (MANDATORY)

Every implementation task must follow this execution sequence:

```
User task
  ↓
① Scout loads local .opencode/context files
  ↓
② Scout searches Allura Brain for prior decisions/blockers
  ↓
③ Skill resolver identifies required skills
  ↓
④ Builder executes with loaded context + skills
  ↓
⑤ Validation passes before done
```

**No agent may skip step ①.** Ralph, Woz, and all builders must have Scout context
loaded before writing implementation code.

## Context7 Gate (MANDATORY)

Before proposing or editing anything involving external tool behavior, runtime
configuration, provider/model syntax, library APIs, framework behavior, plugin
hooks, MCP configuration, or CLI semantics, load `context7` and retrieve current
documentation.

This gate applies to:

- OpenCode config, agents, permissions, plugins, commands, and model syntax
- MCP server config and tool semantics
- Provider/model syntax and gateway routing
- Next.js, React, Tailwind, Bun, Vitest, Playwright, and shadcn
- Database/client APIs, auth/security/cloud/infra tooling

Required receipt:

```text
Context7:
- required: <yes/no>
- library: <id or n/a>
- topic: <query or n/a>
- finding: <one-line evidence or skip reason>
```

No-skip rule: if touching `.opencode/config.json`, `opencode.json`,
`.opencode/agent/**`, `.codex/**`, `.claude/**`, MCP config, model routing,
provider strings, plugins, or command definitions, Context7 is mandatory before
proposing or editing.

## Ralph Skill Gate (MANDATORY)

Ralph may not execute unless this gate passes:

```json
{
  "context_loaded": true,
  "context_files": [],
  "brain_memories_checked": true,
  "required_skills": [],
  "skills_loaded": [],
  "validation_commands": []
}
```

**Failure conditions (Ralph MUST refuse):**

- No Scout context loaded
- Missing required skill
- Stale context without acknowledgment
- Missing validation command

## Team RAM

| Agent     | Persona                 | Role                               | Path                        |
| --------- | ----------------------- | ---------------------------------- | --------------------------- |
| Brooks    | Frederick P. Brooks Jr. | Architecture and orchestration     | `core/`                     |
| Jobs      | Steve Jobs              | Intent gate and scope owner        | `core/`                     |
| Woz       | Steve Wozniak           | Primary builder                    | `subagents/code/`           |
| Bellard   | Fabrice Bellard         | Deep diagnostics                   | `subagents/code/`           |
| Carmack   | John Carmack            | Performance                        | `subagents/code/`           |
| Scout     | Utility role            | Discovery and recon (ContextScout) | `subagents/core/`           |
| Pike      | Rob Pike                | Interface simplicity               | `subagents/review/`         |
| Fowler    | Martin Fowler           | Refactor safety                    | `subagents/review/`         |
| Knuth     | Donald Knuth            | Data and schema                    | `subagents/infrastructure/` |
| Hightower | Kelsey Hightower        | Infra and deployment               | `subagents/infrastructure/` |

## Team RAM as Overlay

Team RAM personas consume OAC context — they do not replace it.

- **Brooks** = architecture/orchestration (consumes context/system/, context/workflows/)
- **Scout** = ContextScout + Brain retrieval (consumes context/core/, Brain search)
- **Woz** = builder (consumes context/development/, standards/)
- **Pike** = interface review (consumes context/ui/, design-systems/)
- **Fowler** = refactor gate (consumes context/core/workflows/code-review/)
- **Knuth** = data/schema (consumes context/development/data/)
- **Hightower** = infra (consumes context/development/infrastructure/)
- **Bellard/Carmack** = diagnostics/performance (consumes context/core/standards/)

## Skill Assignment Matrix

| Owner / Path   | Required skills                                                                 | Optional / routed skills                        | Notes                                                |
| -------------- | ------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| All agents     | `allura-memory-skill`, `allura-team-ram`                                        | `systematic-debugging`, `code-review`           | Memory governance and Allura workflow core are mandatory. |
| Brooks         | `party-mode`, `skill-creator`, `mcp-harness`, `allura-architecture`             | `task-creator`, UI/design skills for routing    | Brooks orchestrates; he routes, doesn't hoard.       |
| Scout          | `allura-memory-skill`, `allura-team-ram`, `multi-search`, `mcp-docker` | `context7` via MCP Docker                       | Scout owns Brain/search recon and context discovery. |
| Woz            | `allura-dev-story`, `frontend-craft`, `shadcn`, `task-management`, `varlock`, `code-review` | `frontend-design` when implementing approved UI | Woz builds with Allura governance gates.              |
| Pike           | `allura-code-review`, `code-review`                                              | `allura-team-ram`                               | Pike reviews through Allura-gated review.             |
| Fowler         | `allura-code-review`, `code-review`                                              | `allura-team-ram`                               | Fowler reviews through Allura-gated review.           |
| Design/UI path | `frontend-design`, `frontend-craft`, `allura-design`, `huashu-design`, `shadcn` | `allura-memory-skill` for brand/context         | Applies to UI/design agents.                         |
| Hightower      | `mcp-docker`, `mcp-harness`, `varlock`                                          | —             | Hightower owns deployability and secrets.            |

## Execution Rule

**Scout before build. Skills before Ralph. Validate before done.**

## Allura Skill Routing

For Allura Memory repo work, use the `allura-*` skills — they enforce governance gates (Scout hydration, doc impact check, Team RAM owner, Brain outcome log).

| Task | Allura Skill | Notes |
|------|-------------|-------|
| Story implementation | `allura-dev-story` | Full governance gates |
| Code review | `allura-code-review` | Pike/Fowler review gates |
| Architecture decisions | `allura-architecture` | Brooks gate + ADR logging |
| PRD creation | `allura-product-intake` | Jobs intent gate |
| Retrospective | `allura-retrospective` | Brooks facilitation |
| Party/parallel work | `party-mode` / `team-ram-cowork` | Allura-native |
| Sprint status | Notion board | Notion source of truth |
| Quick dev | `allura-dev-story` or direct Woz route | Allura skill preferred |

## Codex Invocation Gate (MANDATORY)

Codex must run this gate before answering or routing when Ronin invokes Brooks,
Team RAM, Allura, Scout, Woz, Ralph, memory work, architecture work, debugging,
or project-status work.

Codex treats `.opencode/agent/core/brooks.md` as the canonical Brooks behavior.
`.codex/agents/brooks.toml` is only the Codex adapter for that behavior.

Required startup order:

```text
Brooks/Team RAM invoked
  ↓
Apply team-ram-cowork
  ↓
Apply allura-memory-skill
  ↓
Scout local context hydration
  ↓
Allura Brain search with group_id = allura-system
  ↓
RuVix governance receipt
  ↓
Brooks route / answer / build plan
```

Fast hydration target: first useful answer within 30 seconds.

That target is a budget, not permission to thin the context. Brooks startup must
still load local status, search Allura Brain with `group_id = allura-system`,
check active story/task scope when configured, and include recent blockers,
lessons, or reflections for project-status work. If a source is slow or
unavailable, say so and keep hydrating in the same turn.

Before Brooks answers, Codex must show this receipt shape:

```text
Brooks active.
Skills: team-ram-cowork, allura-memory-skill, <task skills>
Scout hydration:
- Local context: <files checked>
- Brain: <query, group_id, status>
Context7:
- required: <yes/no>
- library: <id or n/a>
- topic: <query or n/a>
- finding: <one-line evidence or skip reason>
RuVix:
- mutate: <intent/no mutation>
- attest: <evidence>
- verify: <validation path>
- isolate: <group_id/project boundary>
- sandbox: <safe tool path>
- audit: <logging plan>
Route:
- <Brooks decision>
```

RuVix is not optional. The receipt must explicitly cover `mutate`, `attest`,
`verify`, `isolate`, `sandbox`, and `audit`.

Memory claims require real MCP receipts. If Allura Brain tools are unavailable,
Codex must say that plainly and continue with local context only. Codex may say
"Brooks active" only as the repo role chair; it must not claim Scout, Woz,
OpenCode, OpenClaw, Claude, or any runtime subagent actually ran unless a real
tool or subagent invocation happened.

## Team RAM Runtime Bridge

Codex, OpenCode, and Claude do not load agents the same way. This repo bridges
them through `.agents/TEAM-RAM-RUNTIME.md`.

If the user invokes Brooks, Scout, Woz, Team RAM, Ralph, or Allura project work:

```text
Scout → Allura Brain → Skills → Brooks route → Build/review → Log outcome
```

Kanban team workflow:

```text
Backlog -> Ready -> In Progress -> Review -> Done
```

Finish-all-epics order:

```text
current review debt -> Epic 2 Frontend Tightening -> E1 Host Stability ->
E2 Dashboard Quality -> E3/E4 Hardening Deploy -> E4 Kernel Completion ->
E5 Infrastructure Polish
```

Allura Navigator workflow:

```text
Read board -> hydrate context -> route work -> build/review -> attest/remember
```

Use the Notion `Work Board` / `Allura stories Work Items` board as the
human/team source of truth for story state. Local sprint-status files support
reconciliation only; they must not replace the board. Each story moves through:
epic intake, story ready gate, `allura-dev-story`, `allura-code-review`, done gate,
and Allura outcome logging. Run `allura-retrospective` only after every story in
the epic is `Done`, unless Ronin explicitly asks for a partial retrospective.

Team RAM board ownership:

- Scout: first real background/recon agent for every epic or story batch. If a
  real Scout agent is not spawned, say `Scout-style hydration only`.
- Jobs: intent, scope, acceptance criteria before `Ready`.
- Brooks: architecture, contracts, and route approval.
- Woz: implementation through `allura-dev-story`.
- Pike + Fowler: review through `allura-code-review`.
- Ralph: validation after implementation/review evidence exists.
- Brooks + team: retrospective after all epic stories are `Done`.

Story 2.4 starts with `CARD-2.4-E — Add targeted role/SoD/audit tests`; Woz owns
the build, Pike and Fowler review, and the first acceptance target is
`bun test src/lib/memory/__tests__/approval-audit.test.ts` passing under Bun
without `vi.mocked`.

Current dashboard UI state:

- Status: **Blank slate reset**. The prior `/allura` and `/dashboard/memory-space`
  implementations were cleared so the dashboard can be rebuilt from scratch.
- Routes: `/dashboard`, `/dashboard/memory-space`, and `/allura` intentionally render
  neutral placeholders only.
- Prior evidence such as `artifacts/allura-after-3334.png`, 6420 parity claims, and
  `Governed memory command center` acceptance language is historical evidence only;
  do not use it as an active acceptance gate.
- Source of truth for future dashboard scope remains Notion `Allura stories Work Items`.
- Do not move any dashboard card to `Done` until a new approved design/spec,
  implementation evidence, review evidence, and validation evidence are attached.

Expected behavior:

- Say which role is active.
- Use `allura-memory-skill` for governed memory work.
- Scout loads local context and searches Allura Brain with `group_id: allura-system`.
- Brooks summarizes status and routes work.
- Woz builds only after Scout context and skills are loaded.
- Important outcomes are logged back to Allura Brain.

## Development Readiness

Before feature development, use `.opencode/DEVELOPMENT-READINESS.md`.

The short gate is:

```text
Brain running → MCP reachable → Scout context loaded → skills resolved → validation chosen
```

## Source of Truth

- `.opencode/manifest.json` — Machine-readable architecture manifest
- `.opencode/SKILL-OWNERSHIP.md` — Skill ownership matrix
- `.opencode/config.json` — Top-level OpenCode configuration
- `.opencode/DEVELOPMENT-READINESS.md` — Pre-development readiness checklist
- `.opencode/agent/` — Active Team RAM agent definitions
- `.opencode/command/` — Reusable workflow commands
- `.opencode/skills/` — Skill definitions and supporting assets
- `.opencode/config/` — Registry and harness metadata

---
<!-- Migrated from CLAUDE.md -->

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
bun run test:e2e                  # RUN_E2E_TESTS=true, requires live PG + Neo4j
bun run test:all                  # typecheck + lint + unit + e2e + mcp browser
bun run test:watch                # watch mode

# Single test
bun vitest run src/lib/postgres/connection.test.ts
bun vitest run -t "should build connection config"

# Brain stack (Docker)
bun run brain:up          # start PG + Neo4j + MCP containers
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

Allura is a **dual-database AI memory engine** exposed via MCP — a self-hosted, compliance-grade alternative to mem0.

### Data Layers

| Layer    | Store          | Port | Role |
|----------|----------------|------|------|
| Episodic | PostgreSQL 16  | 5432 | Append-only execution traces. **Never mutate historical rows.** |
| Semantic | Neo4j 5.26     | 7687 | Versioned knowledge graph. Updates via `SUPERSEDES` — never edit nodes. |
| Vector   | RuVector (PG)  | 5433 | 768d embeddings (nomic-embed-text). Hybrid search: vector ANN + BM25 RRF. |
| MCP      | Allura Brain   | 5888 | Streamable HTTP (SSE + JSON-RPC). `memory_search`, `memory_add`, `audit_*`, `governance_*`. |

### Dashboard (Next.js 16)

22 pages under `src/app/dashboard/`: search, governance, mission-control, graph, dreams, scheduled-tasks, kanban, work-board, approvals, execution, evidence, handoffs, projects, runs, settings, teams.

API routes under `src/app/api/`: agents, audit, curator, dreams, evidence, execution-overview, groups, handoffs, health, live.

### Key Subsystems

- **Curator** (`src/curator/`): HITL promotion pipeline — scores traces, queues proposals, requires human approval before Neo4j writes.
- **Kernel** (`src/kernel/`): RuVix proof-gated mutation layer.
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

- **`group_id` on every DB read/write** — pattern `^allura-[a-z0-9-]+$`. Missing it causes CHECK constraint failure.
- **PostgreSQL traces are append-only** — no UPDATE/DELETE on trace rows, ever.
- **Neo4j versioning via `SUPERSEDES`** — `(v2)-[:SUPERSEDES]->(v1:deprecated)`, never edit existing nodes.
- **HITL required for promotion** — agents cannot autonomously promote to Neo4j; route through `curator:approve`.
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

3000–3999 band is **banned**. UI: 4000+ · API: 6000+ · Tools: 7000+. Infra exempt (PG 5432, Neo4j 7687, Brain MCP 5888).

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
