# Sprint Change Proposal: Governed AI Office Readiness Correction

**Date:** 2026-06-12
**Mode:** Batch
**Approval:** Ronin authorized preparation of the correction package on
2026-06-11.
**Classification:** Major planning correction; implementation remains gated.

## 1. Issue Summary

The June 11 implementation-readiness report declared Allura ready based on
requirement-to-story coverage. The June 12 product audit found that coverage was
not equivalent to verified behavior:

- Epic 11 planning and story files disagree.
- Epic 11 is marked done while route parity and permission enforcement fail.
- Epic 12 is marked done without individual story artifacts.
- Checkpoint approval is durable, but execution does not continue afterward.
- Projects, work items, command-center operations, workspace behavior, and a
  governed desktop shell are not represented as complete implementation scope.
- Dashboard runtime and current product-feel evidence are unavailable.

This is a planning-truth failure, not a reason to discard the working memory,
governance, replay, DAG, SDK, or harness foundations.

## 2. Impact Analysis

### Epic 11

Keep completed UX work closed, but reopen:

- `11-5-dashboard-route-parity`
- `11-8-permission-enforcement`

The Epic 11 summary document is historical and stale. It must not be used as the
active story inventory.

### Epic 12

Keep verified primitives, but reopen:

- `12-2-event-sourced-replay`

Resume is incomplete until it reloads the pinned process definition, continues
from the first incomplete step, preserves idempotency, and reaches a terminal
state.

### New Scope

Add five ordered epics:

1. Epic 13: Product Truth and Contract Reconciliation
2. Epic 14: Production Run Kernel
3. Epic 15: PostgreSQL Work Plane
4. Epic 16: Operator Workspace and Command Center
5. Epic 17: Desktop Product and UX Release Gates

### Canonical Artifacts

The following require correction or extension:

- `BLUEPRINT.md`
- `SOLUTION-ARCHITECTURE.md`
- `DESIGN-ALLURA.md`
- `REQUIREMENTS-MATRIX.md`
- `RISKS-AND-DECISIONS.md`
- `DATA-DICTIONARY.md`
- local BMAD sprint status
- Notion Work Board

The correction also resolves an ID collision: `F49` referred to Knowledge Graph
in the Blueprint but RunRecord in the Requirements Matrix and design spec.
Knowledge graph behavior remains covered by graph/structural-context
requirements; F49-F52 now consistently define run behavior, and F53-F55 define
the work plane, operator workspace, and desktop product.

## 3. Recommended Approach

Use a hybrid direct-adjustment and backlog-reorganization approach:

- Reopen only the failed or unproven existing contracts.
- Preserve verified implementation.
- Add missing product-layer epics without folding them into the memory engine.
- Complete Phase 0 before broad feature or visual development.

Rejected alternatives:

- **Treat current status as ready:** rejected because it converts known drift
  into implementation debt.
- **Rollback the process engine:** rejected because tests prove useful working
  primitives.
- **Build the desktop first:** rejected because it would package an untruthful
  and incomplete product surface.
- **Maintain both AionUi and a separate desktop shell:** rejected because it
  creates two product shells and permanent parity debt.

## 4. Delivery Sequence

### Phase 0: Reconcile Truth

- Fix route parity and permission semantics.
- Implement actual checkpoint continuation.
- Replace static operational claims with live, unknown, or degraded states.
- Prove auth and tenant propagation.
- Restore approved Allura assets.
- Start the dashboard and capture runtime evidence.

### Phase 1: Production Run Kernel

- Version and pin process definitions.
- Add doctor checks, idempotency, bounded retries, and quality targets.
- Add typed process/run/breakpoint APIs.
- Prove start, pause, approve, resume, complete, and replay.

### Phase 2: Work Plane

- Add PostgreSQL-backed projects, work items, lanes, dependencies, transitions,
  evidence packets, and handoffs.
- Link work items to runs and governed memory receipts.

### Phase 3: Operator Workspace

- Replace chat-home with Command Center.
- Add the left navigation, central work surface, and right evidence inspector.
- Add live runs, approvals, blocked work, handoffs, schedules, and health.

### Phase 4: Desktop Product

- Record one shell decision.
- Restore and pin upstream provenance.
- Add packaging, secure credentials, updates, runtime supervision, deep links,
  and reconnect behavior.

### Phase 5: Product Polish

- Complete accessibility, keyboard, loading, empty, error, degraded, and
  reduced-motion states.
- Obtain IRIS QA, IRIS CEO product-feel approval, and Captain release approval.

## 5. Implementation Handoff

- **Product/architecture:** maintain requirement, decision, data, and story
  traceability.
- **RAM:** implement deep repository, schema, and process changes.
- **TALON:** verify API, runtime, test, deployment, and ship readiness.
- **IRIS:** verify rendered UX, accessibility, copy, and product feel.
- **Durham:** approve brand-sensitive canon and asset use.
- **Captain:** approve desktop architecture and final release.

## Success Criteria

Allura becomes implementation-ready only when:

1. The two failing dashboard/auth tests pass.
2. A real run continues after approval and completes.
3. The active story inventory matches local and Notion status.
4. The dashboard runs against live contracts with no fabricated state.
5. A superseding readiness report records no critical planning gaps.
