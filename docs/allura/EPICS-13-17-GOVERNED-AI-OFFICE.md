# Epics 13-17: Governed AI Office

**Date:** 2026-06-12
**Status:** Approved planning sequence
**Source:** Product parity audit and sprint change proposal

## Epic 13: Product Truth and Contract Reconciliation

**Goal:** Make every route, authorization decision, operational claim, and
planning status match live behavior.

Stories:

- **13.1 Route and authorization contract reconciliation**
- **13.2 Live operational state and freshness contracts**
- **13.3 Approved brand assets and canonical navigation**
- **13.4 Dashboard runtime and tenant propagation proof**

Exit gate:

- Route and permission tests pass.
- No operational card presents a static claim as live truth.
- Every operational response declares tenant, source, freshness, and degraded
  state.
- Live dashboard evidence exists.

## Epic 14: Production Run Kernel

**Goal:** Turn the process-engine primitives into a durable, inspectable,
repairable workflow runtime.

Stories:

- **14.1 Versioned process-definition registry**
- **14.2 True checkpoint continuation and idempotency**
- **14.3 Run doctor and repair findings**
- **14.4 Bounded retries and measured quality gates**
- **14.5 Process, run, event, and breakpoint APIs**
- **14.6 End-to-end run lifecycle evidence**

Exit gate:

- One pinned process starts, blocks, resumes, completes, replays, and survives a
  restart without duplicate side effects.

## Epic 15: PostgreSQL Work Plane

**Goal:** Give projects and work items a real operational source of truth.

Stories:

- **15.1 Project, lane, and work-item schema**
- **15.2 Dependencies and audited transitions**
- **15.3 Run, evidence, receipt, and handoff links**
- **15.4 Typed project/work APIs**
- **15.5 Live project list and work board**
- **15.6 Optional board sync adapters**

Exit gate:

- A work item moves through governed lanes using audited PostgreSQL mutations
  and links to its run and evidence.

## Epic 16: Operator Workspace and Command Center

**Goal:** Present Allura as a working AI office rather than a collection of
memory screens.

Stories:

- **16.1 Mission-first navigation and workspace switcher**
- **16.2 Command Center landing surface**
- **16.3 Three-pane work surface and evidence inspector**
- **16.4 Runs, approvals, handoffs, schedules, and services**
- **16.5 Unified governed search**
- **16.6 Visible multi-agent execution**

Exit gate:

- The operator can answer what is running, blocked, awaiting approval, changed,
  and next from the landing surface.

## Epic 17: Desktop Product and UX Release Gates

**Goal:** Ship one governed desktop experience with honest runtime supervision
and release evidence.

Stories:

- **17.1 Desktop shell architecture decision and provenance**
- **17.2 Connection profiles and secure credential storage**
- **17.3 Runtime supervision, logs, and degraded diagnostics**
- **17.4 Packaging, signing, updates, and deep links**
- **17.5 Offline/read-only and reconnect recovery**
- **17.6 Accessibility, responsiveness, and reduced motion**
- **17.7 IRIS, Durham, TALON, and Captain release gates**

Exit gate:

- One supported desktop shell reconstructs a complete project/work/run state
  after restart and passes technical, UX, brand, and human approval gates.

## Dependency Order

`Epic 13 -> Epic 14 -> Epic 15 -> Epic 16 -> Epic 17`

Limited overlap is allowed only after upstream contracts are stable. Desktop
packaging must not begin against placeholder or fabricated operational state.

