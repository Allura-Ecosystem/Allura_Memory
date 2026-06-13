---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-06-12'
inputDocuments:
  - docs/allura/BLUEPRINT.md
  - docs/allura/REQUIREMENTS-MATRIX.md
  - docs/allura/DESIGN-ALLURA.md
  - docs/allura/DATA-DICTIONARY.md
  - docs/allura/RISKS-AND-DECISIONS.md
  - docs/allura/SOLUTION-ARCHITECTURE.md
  - docs/allura/SPRINT-CHANGE-PROPOSAL-2026-06-12.md
  - docs/allura/EPICS-13-17-GOVERNED-AI-OFFICE.md
  - docs/reviews/ALLURA-BABYSITTER-HERMES-AION-AUDIT-2026-06-12.md
  - ralph/goals/goal-20260612-1800.md
  - project-context.md
  - src/lib/process-engine/types.ts
workflowType: 'architecture'
project_name: 'Allura Memory — Phase 1: Production Run Kernel'
user_name: 'Sabir'
date: '2026-06-12'
---

# Architecture Decision Document — Phase 1: Production Run Kernel

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- F41-F52 (process engine family): versioned definitions, durable runs, checkpoints,
  gates, quality metrics, resume, replay, doctor, run/breakpoint APIs
- Existing: ProcessDefinition/State types, DAG, replay, checkpoint blocking, revision drift error
- Missing: PG-backed definition registry, real resume continuation, run REST APIs,
  doctor checks, quality gate scoring, bounded retries

**Non-Functional Requirements:**
- Append-only event persistence (structural invariant)
- Multi-tenant isolation via group_id CHECK constraint
- HITL promotion gate — no autonomous writes to Neo4j
- SOC2-class audit trail (witness hashes, provenance)
- Definition revision pinning (no silent drift)

**Scale & Complexity:**
- Primary domain: Full-stack (PG + engine + API + dashboard)
- Complexity level: Enterprise
- Estimated architectural components: 8 (definition registry, run manager,
  doctor, quality gates, breakpoint manager, evidence collector, 6 API routes, dashboard surface)

### Technical Constraints & Dependencies

- ProcessEngine class exists with execute/resume/replay — extend, don't rewrite
- ProcessState already tracks definitionId + definitionRevision — PG table mirrors this
- Events table is append-only — run state reconstructed from event replay
- Existing DAG validator handles parallel step groups
- Circuit breaker already integrated at engine level

### Cross-Cutting Concerns Identified

- Tenant isolation: every run, definition, and API response must carry group_id
- Auditability: every state transition emits an append-only event
- Versioning: definitions pinned at run start, SUPERSEDES for updates
- Idempotency: step re-execution must be safe (crash recovery)
- Evidence: every gate/checkpoint decision links to evidence

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Next.js application with Bun runtime — extending an existing production codebase.

### Existing Stack (No Starter Needed)

This is a brownfield architecture extension, not a greenfield project.

**Language & Runtime:**
- TypeScript (strict mode), Bun runtime
- Next.js App Router (Server Components default)

**Databases:**
- PostgreSQL 16 (episodic events, append-only)
- Neo4j 5.26 (semantic knowledge graph, SUPERSEDES versioning)
- RuVector PG extension (768d embeddings via Ollama)

**Styling:**
- Tailwind CSS + shadcn/ui components

**Testing:**
- Vitest (2,251 tests passing), E2E gated behind RUN_E2E_TESTS

**Build Tooling:**
- Bun (package manager + runtime), tsc --noEmit for typecheck

**Code Organization:**
- src/lib/ for domain modules, src/app/ for Next.js routes
- src/lib/process-engine/ is the extension point for Phase 1

**Process Engine Foundation (already built):**
- ProcessDefinition, ProcessState, StepDefinition types
- DAG validator, parallel step groups
- Checkpoint blocking (SOC2/auto modes)
- Replay with event diffing
- DefinitionRevisionError for drift detection
- Circuit breaker integration

### Phase 1 Extension Points

No new starter needed. Extend:
1. `src/lib/process-engine/` — definition registry, real resume, doctor, quality gates
2. `src/app/api/runs/` — new REST API routes
3. PG schema — `process_definitions` + `process_runs` tables
4. `src/app/dashboard/runs/` — new dashboard surface

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. AD-P1-01: Process definitions stored in PostgreSQL (versioned, tenant-scoped)
2. AD-P1-02: Run state as snapshot + event-sourced verification
3. AD-P1-03: Quality gates scored with evidence packets

**Important Decisions (Shape Architecture):**
4. AD-P1-04: Doctor detects all 6 run health conditions
5. AD-P1-05: API auth follows Clerk RBAC (viewer/curator/admin)

**Deferred Decisions:**
- WebSocket live updates for run timeline (Phase 3)
- Definition authoring UI (Phase 3)
- Cross-tenant run federation (not in scope)

### Data Architecture

**AD-P1-01: Process Definitions in PostgreSQL**

| Field | Value |
|-------|-------|
| Decision | Store process definitions as JSON in a `process_definitions` PG table |
| Rationale | Operators create/version processes via API; tenant-scoped; auditable |
| Table | `process_definitions(id, revision, group_id, name, definition_json, created_at)` |
| Versioning | New revision = new row. Runs pin definition_id + revision at start |
| Constraint | `group_id` CHECK, unique on (id, revision, group_id) |
| Affects | Run creation, resume validation, doctor drift check |

**AD-P1-02: Snapshot + Event Replay Verification**

| Field | Value |
|-------|-------|
| Decision | `process_runs` snapshot table for fast reads; events are audit trail |
| Rationale | Sub-100ms API reads; event replay for SOC2 audit; doctor verifies consistency |
| Table | `process_runs(id, definition_id, definition_revision, group_id, status, state_json, started_at, updated_at, completed_at)` |
| Invariant | Snapshot is a read optimization — events are the source of truth |
| Doctor | Replays events and compares to snapshot; flags divergence |

### Quality & Governance

**AD-P1-03: Scored Quality Gates with Evidence**

| Field | Value |
|-------|-------|
| Decision | Gates return score (0-1) + evidence; threshold per gate; bounded retries |
| Rationale | Babysitter-class quality convergence, not boolean CI |
| Schema | `{ score: number, threshold: number, passed: boolean, evidence: EvidencePacket, attempt: number, max_attempts: number }` |
| Retry | Bounded by `max_attempts`; each attempt logged as event with score + evidence |
| Affects | Step execution, evidence collection, run completion criteria |

**AD-P1-04: Doctor — Full 6-Condition Detection**

| Condition | Detection | Action |
|-----------|-----------|--------|
| Stale | No event in configurable window | Flag + optional notification |
| Abandoned | Started, never completed/failed | Flag for operator review |
| Approval-blocked | Checkpoint waiting > threshold | Escalation event |
| Revision-drifted | Definition changed since run start | Block resume + flag |
| Partially persisted | Snapshot ≠ event replay | Repair or flag |
| Unrecoverable | Failed, no retry path | Terminal state + evidence |

### API & Auth

**AD-P1-05: Clerk RBAC for Run Operations**

| Role | Runs | Breakpoints | Doctor | Cancel |
|------|------|-------------|--------|--------|
| viewer | read | read | read results | — |
| curator | read | resume/approve | read results | — |
| admin | start, read | resume/approve | run + repair | cancel |

Every mutation carries `actor_id` + `actor_type` in the append-only event.

### Implementation Sequence

1. PG migration: `process_definitions` + `process_runs` tables
2. Definition registry module (CRUD + version pinning)
3. Engine extension: real resume continuation
4. Quality gate scoring + evidence packets
5. Doctor module (6 conditions)
6. API routes: `/api/runs/*`
7. Dashboard surface: `/dashboard/runs`

### Cross-Component Dependencies

- Definition registry → used by engine (run creation pins revision)
- Snapshot table → used by API routes (fast reads) + doctor (verification)
- Quality gates → used by engine (step execution) + evidence collector
- Doctor → uses snapshot table + event replay + definition registry
- API auth → wraps all routes with Clerk RBAC middleware

## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database (Phase 1 tables):**
- Tables: `snake_case` plural — `process_definitions`, `process_runs`
- Columns: `snake_case` — `definition_id`, `group_id`, `state_json`, `deleted_at`
- Indexes: `idx_{table}_{columns}` — `idx_process_runs_group_id`
- Revision: auto-increment within tenant — `MAX(revision) + 1`

**API Endpoints:**
- REST plural nouns — `/api/runs`, `/api/runs/:id/events`
- Actions as sub-paths — `/api/runs/:id/resume`, `/api/runs/:id/cancel`, `/api/runs/:id/doctor`
- Feature-flagged: `PROCESS_ENGINE_ENABLED=true` gates all new routes

**Process Engine Code:**
- Modules: `src/lib/process-engine/{module}.ts`
- Tests: co-located `{module}.test.ts`
- Types: extend `src/lib/process-engine/types.ts`

### Format Patterns

**Run Events (append-only):**

```
event_type: "process_started" | "step_started" | "step_completed" | "step_failed"
          | "checkpoint_blocked" | "checkpoint_resumed" | "gate_scored" | "gate_error"
          | "process_completed" | "process_failed" | "doctor_check" | "step_retried"
agent_id:   actor who triggered the event
group_id:   tenant scope
metadata:   { process_id, definition_id, definition_revision, step_id?, score?,
              evidence_id?, approved_by?, attempt? }
```

**Quality Gate Result:**

```typescript
interface GateResult {
  score: number
  threshold: number        // Zod: min 0.01, max 1.0
  passed: boolean
  attempt: number
  maxAttempts: number      // Zod: min 1, max 100
  evidenceId: string       // MANDATORY — no gate passes without this
  reasoning: string
}
```

- Low score → retry (up to maxAttempts)
- Error → fail immediately (`gate_error` event, no retry)

**Step Result:**

```typescript
interface StepResult {
  output: unknown
  artifactRefs?: string[]  // optional evidence artifacts
}
```

**Doctor Finding:**

```typescript
interface DoctorFinding {
  runId: string
  condition: "stale" | "revision_drifted" | "partially_persisted"  // 3 at launch
  severity: "info" | "warning" | "critical"
  detail: string
  recommendedAction: "flag" | "escalate" | "repair_with_approval"
  detectedAt: string
}
```

Deferred conditions (Phase 2-3): `abandoned`, `approval_blocked`, `evidence_gap`, `definition_orphan`, `unrecoverable`

### Process Patterns

**Run Lifecycle (canonical state machine):**

```
pending → running → completed
                  → failed
                  → paused (checkpoint blocked)
paused  → running (resumed after approval)
        → failed  (cancelled)
```

**Write Order Invariant:** `event INSERT → snapshot UPDATE`, never reversed.

**Resume Contract:**
1. Load definition by `definition_id` + `definition_revision` (soft-delete aware)
2. If revision mismatch → throw `DefinitionRevisionError`
3. Replay events to reconstruct state
4. Mark checkpoint as approved (`checkpoint_resumed` event with `approved_by`)
5. Execute from DAG successor resolution (not index + 1)
6. Update snapshot after each step (optimistic lock on `updated_at`)

**Concurrency:** All snapshot mutations use `WHERE updated_at = $expected`. API returns 409 on stale writes.

**Idempotency:** Steps MUST be idempotent. PG writes use `ON CONFLICT` or existence guard. No attempt-aware branching.

**Definition Soft-Delete:** `deleted_at` column. Listings filter `deleted_at IS NULL`. Run-pinned lookups ignore `deleted_at`. No hard delete.

**No Definition Cache:** Direct PG reads at launch. Cache is Phase 3 optimization.

### Operator Contract (Runs Dashboard)

```
States:    running | paused | completed | failed | degraded
Actions:   start (admin) | resume (curator+) | cancel (admin) | doctor (admin)
Shows:     run list → run detail → step timeline → evidence links
List:      status badge, definition name, started_at, last event, actor
Detail:    step timeline (completed/running/blocked), evidence panel, doctor findings
Empty:     "No runs yet. Start one from a process definition."
Error:     "Cannot load runs. Check PostgreSQL connectivity."
Degraded:  "Showing cached state. Last sync: {timestamp}"
```

### Migration Contract

- Additive only — new tables, new indexes, new event types
- No DROP, no ALTER on existing tables
- Feature flag: `PROCESS_ENGINE_ENABLED=true`
- Rollback: disable flag, new tables become inert

### Doctor Isolation

- Own watchdog cycle (`runDoctorCycle`), separate from curator watchdog
- Separate interval (configurable, default 5 min)
- Own error handling — doctor crash doesn't affect curator

### Parallel Dispatch Lanes

```
Lane A: PG migration → definition registry → engine resume → quality gates
Lane B: doctor module (independent — reads existing events table)
Lane C: API routes + dashboard (after PG migration, parallel with Lane A)
```

### Mandatory Test Cases

- Diamond DAG resume: A→B, A→C, B→D, C→D — checkpoint at B, resume executes C then D
- Optimistic lock conflict: concurrent resume + cancel on same run → 409
- Gate error vs low score: error terminates, low score retries
- Events-first: crash between event INSERT and snapshot UPDATE → doctor detects and reconciles

### Enforcement

**All agents MUST:**
- `group_id` in every PG query
- Append-only events for every state transition
- Canonical event_type names only
- `ApiResult<T>` from all API routes
- Zod validation at API boundaries
- Definition revision pinned at run start
- `approved_by` on checkpoint resume events
- Events-first write order

**Anti-Patterns:**
- ❌ Snapshot UPDATE without preceding event INSERT
- ❌ Gate pass without evidenceId
- ❌ Resume without definition revision check
- ❌ Hard-delete on definitions
- ❌ Doctor piggybacked on curator watchdog
- ❌ Retry on gate errors (only retry low scores)

## Project Structure & Boundaries

### Phase 1 Additions to Existing Tree

```
src/lib/process-engine/           # EXISTING — extend
├── types.ts                      # EXTEND: GateResult, StepResult, DoctorFinding
├── engine.ts                     # EXTEND: events-first writes, DAG resume, quality gates
├── dag.ts                        # EXISTING — no changes
├── dag.test.ts                   # EXISTING — no changes
├── replay.ts                     # EXISTING — no changes
├── replay.test.ts                # EXISTING — no changes
├── state-manager.ts              # EXISTING — no changes
├── helpers.ts                    # EXISTING — no changes
├── index.ts                      # EXTEND: re-export new modules
├── definition-registry.ts        # NEW: CRUD + version pinning + soft-delete
├── definition-registry.test.ts   # NEW
├── doctor.ts                     # NEW: 3 conditions, own watchdog cycle
├── doctor.test.ts                # NEW
├── quality-gate.ts               # NEW: scored gates, evidence, retry logic
├── quality-gate.test.ts          # NEW
├── run-manager.ts                # NEW: snapshot CRUD, optimistic lock, events-first
├── run-manager.test.ts           # NEW
└── checkpoint-continuation.integration.test.ts  # EXISTING — extend with diamond DAG

src/app/api/runs/                 # NEW — entire directory
├── route.ts                      # GET (list), POST (start) — admin for start
├── [id]/
│   ├── route.ts                  # GET (detail) — viewer+
│   ├── events/route.ts           # GET (event timeline) — viewer+
│   ├── resume/route.ts           # POST (approve checkpoint) — curator+
│   ├── cancel/route.ts           # POST (cancel run) — admin
│   ├── doctor/route.ts           # GET (findings), POST (run check) — admin
│   └── breakpoints/route.ts      # GET (active breakpoints) — viewer+

src/app/dashboard/runs/           # NEW — dashboard surface
├── page.tsx                      # Run list (Server Component, force-dynamic)
└── [id]/
    └── page.tsx                  # Run detail with step timeline

src/lib/operational-state/sources/
├── runs-source.ts                # NEW: reads process_runs snapshot table
└── runs-source.test.ts           # NEW

docker/postgres-init/
└── 20-process-engine.sql         # NEW: process_definitions + process_runs tables
```

### Architectural Boundaries

**API Boundaries:**
- `/api/runs/*` — all routes behind `PROCESS_ENGINE_ENABLED` feature flag
- Auth: Clerk RBAC per route (viewer/curator/admin)
- Every response: `ApiResult<T>` with group_id, degraded state, warnings
- Every mutation: append-only event before snapshot update

**Component Boundaries:**
- `definition-registry` — owns `process_definitions` table. Only module that reads/writes definitions
- `run-manager` — owns `process_runs` table. Only module that reads/writes snapshots
- `doctor` — read-only consumer of both tables + events. Never writes to snapshots directly
- `quality-gate` — called by engine during step execution. Returns `GateResult`, engine handles persistence
- `engine.ts` — orchestrator. Calls registry, run-manager, quality-gate. Owns the execution loop

**Data Boundaries:**
- `process_definitions` — written by registry, read by engine + doctor
- `process_runs` — written by run-manager, read by API routes + doctor
- `events` — written by engine (append-only), read by everyone
- No direct cross-table joins between process tables and existing tables
- Link to existing system: events share the same `events` table via `event_type` prefix

### Requirements to Structure Mapping

| Requirement | Module | Files |
|-------------|--------|-------|
| Versioned definitions (AD-P1-01) | definition-registry | definition-registry.ts, 20-process-engine.sql |
| Snapshot + events (AD-P1-02) | run-manager | run-manager.ts, 20-process-engine.sql |
| Quality gates (AD-P1-03) | quality-gate | quality-gate.ts, types.ts (GateResult) |
| Doctor (AD-P1-04) | doctor | doctor.ts |
| API auth (AD-P1-05) | API routes | src/app/api/runs/**/*.ts |
| Resume continuation | engine | engine.ts (DAG resume) |
| Dashboard surface | operational-state | runs-source.ts, dashboard/runs/ |

### Data Flow

```
Operator → API route (auth check) → run-manager (snapshot) → engine (execute)
                                                                  ↓
                                                          events table (append-only)
                                                                  ↓
                                                          snapshot update (optimistic lock)
                                                                  ↓
Doctor watchdog ← reads events + snapshots ← flags findings → events table
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** PG tables align with existing patterns. Engine extended, not rewritten. Feature flag isolates new code. Event types extend existing events table.

**Pattern Consistency:** Naming follows existing conventions. API routes follow existing pattern. Operational-state source pattern reused. `ApiResult<T>` consistent.

**Structure Alignment:** New modules in existing `src/lib/process-engine/`. Tests co-located. Dashboard under existing `src/app/dashboard/`. Migration in existing `docker/postgres-init/`.

### Requirements Coverage ✅

| Goal Task | Architecture Support | Status |
|-----------|---------------------|--------|
| Run Kernel contracts | AD-P1-01 through AD-P1-05 + types.ts | ✅ |
| Versioned definitions | definition-registry + PG table | ✅ |
| Real checkpoint continuation | Engine DAG resume + events-first | ✅ |
| Doctor + quality gates | doctor.ts (3 conditions) + quality-gate.ts | ✅ |
| Run/breakpoint APIs | 7 API routes defined | ✅ |
| Idempotency + failure recovery | ON CONFLICT + events-first write order | ✅ |

### Implementation Readiness ✅

- 5 ADRs with rationale, schemas, trade-offs
- 8 new files + 4 tests + 1 migration + 7 API routes + 2 pages
- Component ownership boundaries defined
- 3 parallel dispatch lanes
- 12 canonical event types, run lifecycle state machine
- 4 mandatory test cases specified

### Gap Analysis

**Critical Gaps:** None

**Important (implementation-level):**
- Zod schemas for API validation — created during stories
- `approved_by` extraction from Clerk — API route implementation detail

**Deferred to Phase 2-3:**
- WebSocket live updates, definition authoring UI, 5 doctor conditions, definition cache, run migration

### Architecture Completeness Checklist

- [x] Project context analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped
- [x] Critical decisions documented with versions
- [x] Technology stack specified
- [x] Integration patterns defined
- [x] Performance considerations addressed
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented
- [x] Directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

**Overall Status:** READY FOR IMPLEMENTATION
**Confidence Level:** High

### Implementation Handoff

**Parallel Dispatch Lanes:**
- **Lane A:** PG migration → definition registry → engine resume → quality gates
- **Lane B:** doctor module (independent)
- **Lane C:** API routes + dashboard (after migration)

**First Priority:** PG migration (`20-process-engine.sql`) — unblocks Lane A and Lane C
