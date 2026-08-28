# Allura Product Parity Audit

> [!NOTE]
> **AI-Assisted Documentation** — this file is maintained with AI assistance.
> Where it conflicts with the source code, schemas, or tests, defer to those.


**Date:** 2026-06-12  
**Scope:** Workflow strength, dashboard layout, navigation, projects/tasks,
command-center behavior, backend wiring, desktop readiness, and UX polish.

## Executive Finding

Allura has the strongest memory and governance core of the compared products,
but it does not yet expose that strength as a coherent work environment.

The target should be:

> **Allura is a governed AI office where projects create work, work launches
> resumable runs, agents execute through enforced gates, and every outcome
> carries evidence into memory.**

Do not clone the three reference products:

- Adopt Babysitter's durable run behavior and enforcement discipline.
- Adopt Hermes Workspace's practical operator surfaces.
- Adopt AionUi's desktop coworking shell and multi-agent visibility.
- Keep Allura's memory, evidence, approval, and tenant model as the governing
  center.

Current readiness by product layer:

| Layer | Assessment |
| --- | --- |
| Memory/governance engine | Strong |
| Process-engine primitives | Partial |
| Enforced workflow product | Weak |
| Projects and task management | Mostly absent |
| Command center | Placeholder |
| Backend truthfulness | Mixed; several static or stale claims |
| Desktop workspace | Extension only, not an Allura desktop |
| UX/product cohesion | Early shell, not an office workspace |

## What Already Exists

Allura is not starting from zero.

- Append-only PostgreSQL events, Neo4j knowledge, governed promotion, audit
  routes, retrieval, circuit breakers, and tenant scope are real.
- `src/lib/process-engine/` provides definitions, steps, gates, checkpoints,
  DAG validation, parallel groups, event persistence, replay, and diffing.
- `scripts/process-run.ts` provides headless run, resume, and replay commands.
- Curator proposals, approve/reject routes, memory routes, graph routes, audit
  routes, health routes, and agent inventory routes exist.
- The dashboard has a command palette, responsive shell, graph integration,
  theme support, and approved Allura brand assets.
- Canonical requirements already define the correct direction in F41-F52 and
  AD-35.

These are foundations. They are not yet one finished workflow.

## Critical Gaps

### P0 — Product Truth And Contract Drift

1. **Canonical docs and code disagree about orchestration maturity.**
   `DATA-DICTIONARY.md` calls RunRecord unimplemented, while a process engine,
   CLI, replay layer, and tests now exist. The implementation also uses
   `ProcessState` rather than the canonical RunRecord/RunPolicy/RunRuntimeState
   separation.

2. **The dashboard presents static claims as operational state.**
   Examples:
   - Governance hardcodes `0 proposals pending`.
   - Scheduled Tasks says no tasks are active despite configured cron jobs.
   - Dreams says background work is suspended.
   - Settings reports `nomic-embed-text` at 768 dimensions, while the deployed
     system uses Qwen3 Matryoshka at 1024 dimensions.
   - Teams is a hardcoded product roster rather than `/api/agents` and project
     data.

3. **Authentication and tenant propagation are in an unverified transition.**
   `src/middleware.ts` is deleted in the current dirty worktree. Until its
   replacement is proven, dashboard and API tenant context cannot be called
   desktop-ready or multi-tenant-ready.

4. **Route and authorization tests confirm contract drift.**
   Mission Control route parity still expects the previous `/command`,
   `/memory`, `/agents`, and `/system` cutover tree, while the current product
   uses `/dashboard/*`. A permission-profile mutation test also returns `401`
   where the contract expects `403`.

5. **The current sidebar invents an SVG logo.**
   This conflicts with the approved real-asset-only brand rule. Use the tracked
   wordmark or lettermark assets under `public/brand/`.

### P1 — Babysitter-Class Workflow Enforcement

Allura has useful primitives but not equivalent workflow guarantees.

1. **Resume does not resume execution.**
   `ProcessEngine.resume()` records the approval and marks the blocked step
   complete, but it does not reload the process definition and execute the
   remaining steps.

2. **No doctor command or health model exists for runs.**
   There is no first-class detection for stale, abandoned, approval-blocked,
   revision-drifted, partially persisted, or unrecoverable runs.

3. **No durable process-definition registry exists.**
   Resume and replay need a pinned definition ID and revision. A run must not
   silently continue against changed code.

4. **The CLI tenant override is misleading.**
   `--group-id` is placed in metadata, but execution uses
   `definition.group_id`. This can create operator confusion and tenant risk.

5. **Engine execution coverage is insufficient.**
   Focused tests cover DAG and replay well, but direct engine execution,
   checkpoint continuation, failure recovery, idempotency, and database-backed
   integration need stronger proof.

6. **No workflow product surface exists.**
   There are no `/api/runs`, `/api/processes`, `/api/breakpoints`, or
   `/dashboard/runs` contracts. Operators cannot start, pause, approve, resume,
   inspect, compare, or repair runs from the product.

7. **Quality convergence is not modeled.**
   Gates are boolean. Babysitter-class strength requires bounded retry loops,
   measured quality targets, attempt history, explicit stop conditions, and
   evidence attached to each decision.

### P1 — Projects And Task Management

The Kanban page is a visual skeleton, and `/api/projects` returns an empty list.
The page also says cards will load from the memory graph, which violates the
documented architecture: operational board state belongs in PostgreSQL; memory
stores durable evidence and decisions.

Required domain contracts:

- `Project`
- `WorkItem`
- `Lane`
- `WorkItemDependency`
- `RunRecord`
- `Breakpoint`
- `EvidencePacket`
- `Handoff`

Each work item should carry project, tenant, owner/team, status, priority,
dependencies, acceptance criteria, required gates, linked run, latest receipt,
blocker, and freshness. A board move is an audited mutation, not a visual-only
drag event.

### P1 — Command Center Behavior

`/dashboard/mission-control` is six empty cards. The actual home surface should
answer five questions immediately:

1. What is running?
2. What is blocked or degraded?
3. What needs my approval?
4. What changed since I last looked?
5. What should happen next?

The landing screen should show active runs, pending breakpoints, blocked work,
handoffs, recent receipts, scheduled jobs, and subsystem health. Chat is a tool
inside the workspace, not the product home.

### P2 — Hermes-Class Workspace

Hermes Workspace's advantage is practical consolidation: chat, sessions, files,
terminal, memory, skills, jobs, profiles, usage, and operations are accessible
without switching products.

Allura needs a workspace shell with:

- Workspace/project switcher.
- Persistent session and run history.
- File/evidence browser with conflict-aware editing where writes are allowed.
- Skills, agents, MCP services, schedules, and resource health.
- Run inspector with event timeline and artifacts.
- Optional terminal/runtime console behind explicit permissions.
- Search across projects, work items, runs, evidence, and approved memory.
- Profile/tenant awareness in every surface.

Allura should not expose raw machine internals by default. The operator should
see governed capabilities, declared sources, and permission boundaries.

### P2 — AionUi-Class Office Experience

AionUi's useful pattern is a shared desktop where agents work visibly in
parallel against one workspace.

Recommended layout:

- **Left rail:** workspace switcher, Inbox, Command Center, Projects, Work,
  Runs, Memory, Crew, Schedules, Operations, Settings.
- **Center:** the selected working surface: project board, run timeline,
  conversation, document, graph, or operations view.
- **Right inspector:** context, owner, approvals, evidence, provenance,
  freshness, activity, and related memory.
- **Top bar:** active tenant/workspace, global search/command palette,
  connection state, pending approvals, and current identity.

Multi-agent execution should show leader, teammates, assigned tasks,
dependencies, status, pending permission requests, and handoffs. Allura's
distinctive addition is that every completion links to evidence and memory
writeback candidacy.

### P2 — Desktop Readiness

The current `desktop-extension/` is a Claude Desktop/Cowork MCP bridge. It is not
an Allura desktop application.

Desktop readiness requires an explicit architecture decision:

- Pin and maintain an AionUi-based desktop shell, or
- Build a separate Electron/Tauri shell around the governed web/API product.

Do not maintain both.

Minimum desktop gates:

- macOS, Windows, and Linux packaging.
- Signed/versioned releases and updater strategy.
- First-run backend discovery and setup.
- Local/remote Brain connection profiles.
- Secure credential storage.
- Workspace and installed-agent detection.
- Permission prompts per runtime/agent.
- Process supervision, restart, logs, and degraded diagnostics.
- Deep links to project, work item, run, memory, and approval.
- Offline/read-only behavior and reconnect recovery.

The previous local Aion source path referenced by planning documents is absent
from the current machine, so desktop fork provenance must be restored before
implementation resumes.

## Navigation Recommendation

Use mission-first language and reduce duplicate concepts.

**Work**

- Command Center
- Inbox
- Projects
- Work Board
- Runs
- Approvals

**Knowledge**

- Search
- What We Know
- Evidence Trail
- Knowledge Graph
- Dreams

**Crew**

- Teams
- Agents
- Skills
- Handoffs

**Operations**

- Schedules
- Services
- Models
- Health
- Audit Log

**Settings**

- Workspace and tenant
- Permissions
- Memory policy
- Connections
- Appearance

Remove `New Chat` as the home route. Use a global `New` action for conversation,
project, work item, run, memory, or schedule.

## Required Backend Route Set

Build typed routes over existing engine services:

- `/api/projects`
- `/api/work-items`
- `/api/work-items/:id/transitions`
- `/api/runs`
- `/api/runs/:id`
- `/api/runs/:id/events`
- `/api/runs/:id/doctor`
- `/api/runs/:id/resume`
- `/api/runs/:id/cancel`
- `/api/runs/:id/breakpoints`
- `/api/handoffs`
- `/api/schedules`
- `/api/resources`
- `/api/runtime/profiles`

Reuse existing memory, curator, audit, graph, health, agents, skills, and MCP
catalog routes. Do not create parallel memory or governance services.

Every response should include tenant scope, source, freshness, degraded state,
and receipt/provenance pointers where applicable.

## Recommended Delivery Order

### Phase 0 — Reconcile Truth

- Update F49-F52 contracts to match actual process-engine state.
- Decide the canonical route taxonomy.
- Replace all static operational claims with live, unknown, or degraded states.
- Resolve auth/middleware and tenant propagation.
- Restore approved logo assets.

### Phase 1 — Finish The Run Control Plane

- Persist versioned process definitions.
- Implement real continuation after checkpoints.
- Add doctor checks, idempotency rules, bounded retries, and quality metrics.
- Add run/breakpoint APIs.
- Prove start → gate → pause → approve → resume → complete → replay.

### Phase 2 — Build The Work Plane

- Implement PostgreSQL-backed projects, work items, lanes, dependencies, and
  transitions.
- Link work items to runs, handoffs, evidence packets, and memory receipts.
- Replace hardcoded Teams and empty Projects/Kanban surfaces.

### Phase 3 — Build The Operator Workspace

- Replace chat-home with Command Center.
- Implement the three-pane workspace and mission-first navigation.
- Add run timeline, approvals, project board, resource inspector, and unified
  search.

### Phase 4 — Desktop Product

- Make and record the single desktop-shell decision.
- Restore/pin upstream provenance.
- Package, supervise runtimes, store credentials, handle updates, and test on
  all supported operating systems.

### Phase 5 — Product Polish

- Loading, empty, error, degraded, and reconnect states for every route.
- Keyboard-first navigation and accessible approval dialogs.
- Resizable panels, density controls, saved views, notifications, and
  reduced-motion support.
- Fresh desktop screenshots and IRIS/CEO product-feel approval.

## Acceptance Gate

Do not call this direction complete until one real project can:

1. Create a work item.
2. Start a versioned governed run.
3. Dispatch parallel agent tasks.
4. Block at a human breakpoint.
5. Resume after approval.
6. Pass measured quality gates.
7. Produce an evidence packet.
8. Close the work item through an audited transition.
9. Write the approved outcome to Allura memory.
10. Reopen the desktop and reconstruct the complete state.

## Evidence And Sources

Repository evidence:

- `src/lib/process-engine/`
- `scripts/process-run.ts`
- `src/app/dashboard/`
- `src/app/api/`
- `desktop-extension/`
- `docs/allura/`

Primary external references:

- Babysitter: <https://github.com/a5c-ai/babysitter>
- Hermes Workspace: <https://github.com/outsourc-e/hermes-workspace>
- AionUi: <https://github.com/iOfficeAI/AionUi>

Verification:

- `bun test src/lib/process-engine/*.test.ts` — 41 passed, 0 failed.
- `bun run typecheck` — passed.
- Focused dashboard/auth suite — 46 passed, 2 failed:
  route-parity drift and permission-profile `401`/`403` mismatch.
- Dashboard runtime was not running during the audit; fresh visual/runtime
  approval remains required.
