# Agent Directory

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

| Agent | Persona | Role | Path |
| --- | --- | --- | --- |
| Brooks | Frederick P. Brooks Jr. | Architecture and orchestration | `core/` |
| Jobs | Steve Jobs | Intent gate and scope owner | `core/` |
| Woz | Steve Wozniak | Primary builder | `subagents/code/` |
| Bellard | Fabrice Bellard | Deep diagnostics | `subagents/code/` |
| Carmack | John Carmack | Performance | `subagents/code/` |
| Scout | Utility role | Discovery and recon (ContextScout) | `subagents/core/` |
| Pike | Rob Pike | Interface simplicity | `subagents/review/` |
| Fowler | Martin Fowler | Refactor safety | `subagents/review/` |
| Knuth | Donald Knuth | Data and schema | `subagents/infrastructure/` |
| Hightower | Kelsey Hightower | Infra and deployment | `subagents/infrastructure/` |

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

| Owner / Path | Required skills | Optional / routed skills | Notes |
| --- | --- | --- | --- |
| All agents | `allura-memory-skill` | `systematic-debugging`, `code-review` | Memory governance is mandatory. |
| Brooks | `party-mode`, `skill-creator`, `mcp-harness` | `task-creator`, UI/design skills for routing | Brooks orchestrates; he routes, doesn't hoard. |
| Scout | `allura-memory-skill`, `multi-search`, `perplexica-mcp`, `mcp-docker` | `context7` via MCP Docker | Scout owns Brain/search recon and context discovery. |
| Woz | `frontend-craft`, `shadcn`, `task-management`, `varlock`, `code-review` | `frontend-design` when implementing approved UI | Woz builds with loaded context. |
| Design/UI path | `frontend-design`, `frontend-craft`, `allura-design`, `huashu-design`, `shadcn` | `allura-memory-skill` for brand/context | Applies to UI/design agents. |
| Hightower | `mcp-docker`, `mcp-harness`, `varlock` | `perplexica-mcp` for infra research | Hightower owns deployability and secrets. |

## Execution Rule

**Scout before build. Skills before Ralph. Validate before done.**

## Source of Truth

- `.opencode/manifest.json` — Machine-readable architecture manifest
- `.opencode/SKILL-OWNERSHIP.md` — Skill ownership matrix
- `.opencode/config.json` — Top-level OpenCode configuration
- `.opencode/agent/` — Active Team RAM agent definitions
- `.opencode/command/` — Reusable workflow commands
- `.opencode/skills/` — Skill definitions and supporting assets
- `.opencode/config/` — Registry and harness metadata

## RuVector Graph Adapter (AD-49 Cutover Complete 2026-07-12)

The semantic/knowledge-graph layer runs on PostgreSQL tables behind the `IGraphAdapter` seam.

- **`GRAPH_BACKEND=ruvector` is the production default** — PG tables (`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`)
- **Neo4j 5.26 is fallback** — `GRAPH_BACKEND=neo4j` still works, read-only for one release
- **Runtime label:** `ruvector_graph` (upgraded from `pgvector_bridge` per RK-21 Stage 1)
- **Dual-read mode:** `GRAPH_DUAL_READ=true` wraps both backends, compares results, logs divergence
- **Factory:** `src/lib/graph-adapter/factory.ts` — `getGraphBackend()` returns `ruvector`
- **Tests:** 14/14 live-DB E2E pass, 14/14 parity pass, 7/7 dual-read pass, 20/20 crate adapter pass
- **Crate adapter (Path B):** `GRAPH_BACKEND=ruvector-crate` — 13/16 methods, 3 throw unsupported (G1/B3). Upstream issues: [ruvnet/RuVector#666](https://github.com/ruvnet/RuVector/issues/666), [#667](https://github.com/ruvnet/RuVector/issues/667), [#668](https://github.com/ruvnet/RuVector/issues/668)

**Key docs:** `docs/allura/RISKS-AND-DECISIONS.md` (AD-49 Decided, RK-32 Resolved, RK-21 Stage 1 graduated), `docs/allura/SOLUTION-ARCHITECTURE.md` §3.4.0.2, `docs/allura/DATA-DICTIONARY.md` (graph adapter tables).

**Boundary:** RuVector executes, Allura governs. The adapter is a PG-table implementation named after the concept, NOT a binding to the ruvnet Rust crate.