# Epic 12 — Process Engine & SDK

> **Correction notice (2026-06-12):** Working primitives exist, but this epic
> is not complete. Story 12.2 is reopened because checkpoint approval does not
> yet continue remaining execution. Active correction artifacts live under
> `docs/allura/stories/`.

> **Status:** Backlog
> **Date:** 2026-06-11
> **Roadmap Step:** 9 (Babysitter parity + beyond)
> **Prerequisite:** Epics 9-11 complete — governance, dashboard, and polish layers stable before process engine ships.
> **FRs covered:** FR42-FR48 (new), Blueprint B14 (@allura/sdk), B31 (evidence-gated orchestration)
> **Gap source:** Babysitter (github.com/a5c-ai/babysitter) feature parity analysis, 2026-06-11

---

## Context

Allura is already stronger than Babysitter on memory, search, tenant isolation, knowledge management, and HITL curation. But Babysitter has 3 capabilities Allura lacks: **Process-as-Code** (executable workflow definitions), **Replay/Resumption** (checkpoint recovery), and a **published SDK**. This epic closes those gaps while preserving Allura's governance advantages.

### What We Already Have (Allura advantages to preserve)

- Schema-enforced tenant isolation (group_id CHECK constraints)
- Dual-store memory (PostgreSQL episodic + Neo4j semantic)
- HITL curator pipeline with scoring
- 27+ event types in append-only journal
- 14 MCP governance/audit tools
- Vector/hybrid search (RuVector bridge)
- Dashboard / Memory Command Center

### What We're Adding

| Capability | Babysitter Has | Allura Will Have |
|---|---|---|
| Process-as-Code | JS workflow definitions | TS workflow definitions with Allura governance baked in |
| Replay/Resumption | Journal checkpoint replay | Event-sourced replay from PostgreSQL append-only events |
| SDK | @a5c-ai/babysitter-sdk | @allura/sdk (governed memory + process engine) |
| Token compression | 4-layer context compression | Context windowing with Brain-backed summarization |
| Headless harness | CI/CD without agents | `bun run process:run` — headless governed execution |
| DAG dependencies | Parallel dispatch with deps | Declarative DAG with Brain-persisted state |
| Multi-harness | 6 harnesses | Harness adapter interface (Claude Code, Codex, Cursor) |

---

## Story 12.1 — Process-as-Code Engine

**Title:** Implement governed workflow engine with TypeScript process definitions
**Priority:** P1-High | **Complexity:** Large | **Agent:** Woz + Brooks
**Traceability:** Epic 12 → FR42 (new), B31 → process engine + validation → `bun test src/lib/process-engine/`

**Description:**
Build a process engine that executes TypeScript workflow definitions with mandatory checkpoints, quality gates, and Allura governance. Workflows are defined as code, not markdown. Every step produces an append-only event in PostgreSQL. The engine enforces `group_id`, HITL gates where configured, and budget limits.

**Acceptance Criteria:**

**Given** a TypeScript process definition with steps, checkpoints, and gates,
**When** the engine executes it,
**Then** each step produces an append-only event (`process_step_started`, `process_step_completed`, `process_step_failed`).
**And** checkpoint steps block until human approval (when `PROMOTION_MODE=soc2`).
**And** quality gate steps evaluate a condition function and block on failure.
**And** all events carry `group_id`, `agent_id`, `process_id`, `step_id`, and timestamp.
**And** budget limits are enforced per-process via the existing circuit breaker.
**And** the process state is persisted to PostgreSQL (enabling replay).

**Process Definition Shape:**
```typescript
import { defineProcess, step, checkpoint, gate } from '@allura/process-engine';

export default defineProcess('curator-review', {
  group_id: 'allura-system',
  steps: [
    step('score', async (ctx) => {
      const result = await ctx.brain.search(ctx.input.query);
      return { score: result.score, memories: result.results };
    }),
    gate('quality-check', (ctx) => ctx.prev.score >= 0.6),
    checkpoint('human-review', { required: ctx => ctx.promotionMode === 'soc2' }),
    step('promote', async (ctx) => {
      await ctx.brain.add({ content: ctx.input.content, group_id: ctx.group_id });
    }),
  ],
});
```

---

## Story 12.2 — Event-Sourced Replay Engine

**Title:** Build replay and resumption from PostgreSQL event journal
**Priority:** P1-High | **Complexity:** Medium | **Agent:** Woz + Knuth
**Traceability:** Epic 12 → FR43 (new) → replay tests → `bun test src/lib/process-engine/replay.test.ts`

**Description:**
Given Allura's append-only PostgreSQL events, build a replay engine that can reconstruct process state from the journal and resume from any checkpoint. This enables crash recovery, debugging, and audit replay.

**Acceptance Criteria:**

**Given** a process that was interrupted (crash, timeout, manual stop),
**When** `processEngine.resume(processId)` is called,
**Then** the engine reads all events for that `process_id` from PostgreSQL.
**And** reconstructs state by replaying completed steps (without re-executing side effects).
**And** resumes execution from the last incomplete step.
**And** checkpoint steps that were already approved are skipped (approval is durable).
**And** the resumed process produces new events that link to the original `process_id`.

**Given** an auditor wants to inspect a completed process,
**When** `processEngine.replay(processId, { dryRun: true })` is called,
**Then** it reconstructs the full execution timeline with step inputs, outputs, durations, and gate results.
**And** the replay is read-only (no new events, no side effects).

---

## Story 12.3 — @allura/sdk NPM Package

**Title:** Extract and publish governed memory SDK as @allura/sdk
**Priority:** P1-High | **Complexity:** Large | **Agent:** Woz + Hightower
**Traceability:** Epic 12 → B14 (@allura/sdk), FR44 (new) → package tests → `bun test packages/sdk/`

**Description:**
Extract Allura's core governed memory operations into a standalone TypeScript SDK published to npm as `@allura/sdk`. The SDK provides: memory CRUD, governed search, process engine, tenant-scoped operations, and type-safe contracts. It connects to Allura Brain via HTTP (MCP gateway).

**Acceptance Criteria:**

**Given** an external TypeScript project,
**When** a developer runs `bun add @allura/sdk`,
**Then** they can import `AlluraClient` and connect to their Allura Brain instance.
**And** `client.memory.add({ content, userId, groupId })` writes through the governed path.
**And** `client.memory.search({ query, userId, groupId })` returns typed `MemoryResult[]`.
**And** `client.process.run(processDefinition)` executes a governed workflow.
**And** all operations enforce `group_id` validation client-side before network call.
**And** TypeScript types are exported for `Memory`, `MemoryResult`, `ProcessDefinition`, `ProcessStep`.
**And** README includes quickstart with 5-line example.

**Package Structure:**
```
packages/sdk/
  src/
    client.ts          # AlluraClient main entry
    memory.ts          # Memory CRUD operations
    search.ts          # Governed search
    process.ts         # Process engine (from 12.1)
    types.ts           # Exported types
  package.json         # @allura/sdk
  tsconfig.json
  README.md
```

---

## Story 12.4 — Token Compression Layer

**Title:** Implement 3-layer context compression with Brain-backed summarization
**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Bellard + Woz
**Traceability:** Epic 12 → FR45 (new) → compression benchmarks → `bun test src/lib/compression/`

**Description:**
Build a context compression layer that reduces token usage for agent interactions. Three layers: (1) structural pruning of redundant context, (2) Brain-backed summarization of long histories, (3) semantic deduplication of repeated information.

**Acceptance Criteria:**

**Given** an agent context exceeding 50K tokens,
**When** the compression layer processes it,
**Then** Layer 1 (structural) removes duplicate system prompts, stale tool results, and repeated instructions.
**And** Layer 2 (summarization) replaces conversation history older than N turns with a Brain-stored summary.
**And** Layer 3 (dedup) identifies semantically similar memories and collapses them with a "and N similar" reference.
**And** the compressed context preserves all active decisions, blockers, and recent tool results.
**And** compression ratio is ≥40% on a benchmark of 10 real agent sessions.
**And** summaries are stored as Brain memories with `event_type: context_summary` for replay.

---

## Story 12.5 — Headless Process Runner (CI/CD Mode)

**Title:** Enable headless execution of governed processes without interactive agents
**Priority:** P2-Medium | **Complexity:** Small | **Agent:** Hightower + Woz
**Traceability:** Epic 12 → FR46 (new) → CI integration → `bun run process:run --help`

**Description:**
Build a CLI runner that executes process definitions headlessly — no agent harness required. This enables CI/CD pipelines, scheduled governance checks, and automated curation.

**Acceptance Criteria:**

**Given** a process definition file,
**When** `bun run process:run ./processes/nightly-curator.ts` is executed,
**Then** the process engine runs all steps sequentially.
**And** checkpoint steps are auto-approved if `--auto-approve` flag is set (for CI), or block for stdin approval.
**And** all events are written to PostgreSQL with `agent_id: headless-runner`.
**And** exit code is 0 on success, 1 on gate failure, 2 on error.
**And** stdout logs step progression in structured JSON for CI parsing.
**And** `--dry-run` flag replays without side effects for validation.

**CLI Interface:**
```bash
bun run process:run ./processes/curator-review.ts --group-id allura-system
bun run process:run ./processes/nightly-audit.ts --auto-approve --dry-run
bun run process:resume <process-id>
bun run process:replay <process-id> --format json
```

---

## Story 12.6 — DAG Dependency Resolver

**Title:** Add declarative dependency graph for parallel process step execution
**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Woz
**Traceability:** Epic 12 → FR47 (new) → DAG tests → `bun test src/lib/process-engine/dag.test.ts`

**Description:**
Extend the process engine to support declarative DAG dependencies. Steps that don't depend on each other execute in parallel. Steps with dependencies wait for their parents to complete.

**Acceptance Criteria:**

**Given** a process definition with `dependsOn` declarations,
**When** the engine executes it,
**Then** independent steps run in parallel (Promise.all).
**And** dependent steps wait for all parents to complete before starting.
**And** if a parent fails, dependent steps are skipped with `status: skipped_dependency`.
**And** cycle detection rejects circular dependencies at definition time.
**And** the execution graph is persisted as events for replay/visualization.

**DAG Definition:**
```typescript
defineProcess('parallel-review', {
  steps: [
    step('score-memory', async (ctx) => { /* ... */ }),
    step('check-dups', async (ctx) => { /* ... */ }),
    step('validate-schema', async (ctx) => { /* ... */ }),
    gate('all-checks', (ctx) => ctx.all(['score-memory', 'check-dups', 'validate-schema'])),
    checkpoint('human-review'),
    step('promote'),
  ],
  dependencies: {
    'all-checks': ['score-memory', 'check-dups', 'validate-schema'],
    'human-review': ['all-checks'],
    'promote': ['human-review'],
  },
});
```

---

## Story 12.7 — Multi-Harness Adapter Interface

**Title:** Define harness adapter contract for Claude Code, Codex, and Cursor integration
**Priority:** P3-Low | **Complexity:** Small | **Agent:** Pike + Woz
**Traceability:** Epic 12 → FR48 (new) → adapter tests → `bun test src/lib/harness-adapter/`

**Description:**
Define a `HarnessAdapter` interface that allows the process engine and SDK to work across different AI agent harnesses. Ship adapters for Claude Code (primary), with stubs for Codex and Cursor.

**Acceptance Criteria:**

**Given** a process running in Claude Code,
**When** the harness adapter is configured,
**Then** tool calls route through the Claude Code MCP interface.
**And** the adapter interface is documented with `HarnessAdapter` TypeScript type.
**And** a Codex stub adapter exists (maps Codex tool names to Allura tool names).
**And** a Cursor stub adapter exists.
**And** the SDK auto-detects the active harness from environment variables.
**And** the adapter contract is extensible without modifying core process engine code.

---

## Epic 12 Summary

| Story | Title | Priority | Complexity | Agent | Depends On |
|---|---|---|---|---|---|
| 12.1 | Process-as-Code Engine | P1-High | Large | Woz+Brooks | Epic 9 (governance MCP) |
| 12.2 | Event-Sourced Replay | P1-High | Medium | Woz+Knuth | Story 12.1 |
| 12.3 | @allura/sdk Package | P1-High | Large | Woz+Hightower | Stories 12.1, 12.2 |
| 12.4 | Token Compression | P2-Medium | Medium | Bellard+Woz | — |
| 12.5 | Headless Process Runner | P2-Medium | Small | Hightower+Woz | Story 12.1 |
| 12.6 | DAG Dependency Resolver | P2-Medium | Medium | Woz | Story 12.1 |
| 12.7 | Multi-Harness Adapters | P3-Low | Small | Pike+Woz | Story 12.3 |

**Definition of Done (per story):** Tests passing, TypeScript strict, append-only events for all mutations, group_id enforced, documentation updated, review by Pike/Fowler.

**Babysitter Parity Achieved:** Stories 12.1-12.3 close the 3 critical gaps. Stories 12.4-12.7 go beyond parity.

---

> **Provenance:** Created 2026-06-11 from Babysitter gap analysis. Extends ecosystem vision (AD 2026-06-08: composable @allura/* packages). Links to Blueprint B14, B31.
