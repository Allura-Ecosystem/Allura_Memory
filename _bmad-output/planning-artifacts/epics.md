---
title: "Allura Memory Original-Number Epic Plan and DEV Acceptance Crosswalk"
status: planning-candidate-awaiting-independent-review
created: 2026-10-25
updated: 2026-10-25
sourceRevision: fcf4a33f025f69a5bc3fd120e974dd079dc65c52
workflowCompletion: not-claimed
stepsCompleted: []
---

# Allura Memory — Original-Number Epic Plan Entrypoint

> [!IMPORTANT]
> The **original numbered epics are primary ownership**. E-DRAFT and DEV identifiers are supporting technical/acceptance aliases only: they do not renumber, supersede, close, implement, or create operational work. Allura status was not read; current owner/state/priority remain unknown. This candidate makes no code, schema, status, Notion, Brain, commit, push, deployment, or release claim.

## Primary numbered plans

- [Original Epic 1–31 register](../../.opencode/work-items/planning-artifacts/epics.md)
- [Epic 13 — Product Truth and Contract Reconciliation](../../.opencode/work-items/planning-artifacts/epic-13-product-truth-and-contract-reconciliation.md)
- [Epic 14 — Production Run Kernel](../../.opencode/work-items/planning-artifacts/epic-14-production-run-kernel.md)
- [Epic 15 — PostgreSQL Work Plane](../../.opencode/work-items/planning-artifacts/epic-15-postgresql-work-plane.md)
- [Epic 16 — Operator Workspace and Command Center](../../.opencode/work-items/planning-artifacts/epic-16-operator-workspace-and-command-center.md)
- [Epic 24 — Portfolio Readiness](../../.opencode/work-items/planning-artifacts/epic-24-portfolio-readiness.md)
- [Epic 29 — Desktop Device Pairing](../../.opencode/work-items/planning-artifacts/epic-29-desktop-device-pairing-and-persistent-authentication.md)
- [Epic 30 — Governed Digital Brain Workspace](../../.opencode/work-items/planning-artifacts/epic-30-governed-digital-brain-workspace.md)
- [Epic 31 — Proposal Record](../../.opencode/work-items/planning-artifacts/epic-31-governed-intelligence-and-connected-clients.md)

Original 13.1–13.4, 14.1–14.6, 15.1–15.6, and 16.1–16.6 come from [`docs/archive/allura/EPICS-13-17-GOVERNED-AI-OFFICE.md`](../../docs/archive/allura/EPICS-13-17-GOVERNED-AI-OFFICE.md). New 13.5, 14.7 and 24.13–24.15 are explicitly planned requirements, not historical or implementation-approved work.

## Complete supporting DEV → primary numbered owner map

| Supporting technical draft | Primary numbered owner | Draft relationship |
|---|---|---|
| [DEV-00 — Deployment, migration, and authority baseline](../implementation-artifacts/stories/DEV-00.md) | **13.5** | Preservation/source/deployment fact inventory and reconciliation acceptance. |
| [DEV-01 — Critical behavior and failure inventory](../implementation-artifacts/stories/DEV-01.md) | **13.1** | Route/authority behavior inventory and executable failure coverage. |
| [DEV-02 — Reproducible authoritative CI](../implementation-artifacts/stories/DEV-02.md) | **24.10** | CI/runtime/install/lint/typecheck/discovery/exact-head acceptance. |
| [DEV-03 — Retry-safe capture](../implementation-artifacts/stories/DEV-03.md) | **24.13** | New planned capture replay/conflict/unknown contract; AD-65 gated. |
| [DEV-04 — Workspace-authorized vector seam](../implementation-artifacts/stories/DEV-04.md) | **24.3** | Extends original isolation through vector/lexical/current/history; AD-66 gated. |
| [DEV-05A — Governed correction and current semantic head](../implementation-artifacts/stories/DEV-05A.md) | **24.14** | New planned immutable correction contract; AD-67 gated. |
| [DEV-05B — Reviewed proposal version binding](../implementation-artifacts/stories/DEV-05B.md) | **24.4** | DOC-06 specified; implementation/merge/runtime evidence still required. |
| [DEV-06 — Confirmed remote projection](../implementation-artifacts/stories/DEV-06.md) | **24.15** | New planned optional projection, only after source-collision check, destination/transfer authority, and AD-68 details. |
| [DEV-07 — Truthful outcome and safe correlation](../implementation-artifacts/stories/DEV-07.md) | **13.2** | Stage/freshness/partial/unknown truth; telemetry mutation gated. |
| [DEV-08 — Labeled retrieval baseline](../implementation-artifacts/stories/DEV-08.md) | **24.6** | Human labels, metrics, isolation, timeout/fallback acceptance. |
| [DEV-09 — Consumer compatibility and capability claims](../implementation-artifacts/stories/DEV-09.md) | **24.7** | Packed consumer/capability evidence. Repository retirement is a separate authorization/recovery gate. |
| [DEV-10 — Authenticated dashboard acceptance](../implementation-artifacts/stories/DEV-10.md) | **16.3** | Two-human governed UI journey and denial/degraded/design evidence. |

E-DRAFT-1–4 remain grouping aliases only; this entrypoint does not use them as epic ownership.

## Current forward plan

### Phase 1 — truth and preservation

- **13.1:** reconcile routes, callers, identity, authority, and executable failure cases.
- **13.2:** separate capture/index/promotion/projection outcomes and unknowns.
- **13.5:** classify the preserved source inventory—including 688 unresolved content paths—before any separately authorized cleanup.

### Phase 2 — governed memory core and evidence

- **24.10:** resolve the historical CI conflict with current required-context and exact-head evidence.
- **24.3:** carry server-derived workspace authority through database/vector/lexical/history paths; blocked on AD-66 and deployed role/RLS evidence.
- **24.4:** implement/verify DOC-06 reviewed-version binding. PR 181 is open, not merged proof.
- **24.13:** retry-safe capture; blocked on AD-65.
- **24.14:** immutable correction/one current head; blocked on AD-67, excluding DOC-03/DOC-05.
- **24.6:** labeled retrieval baseline; label authority and budgets remain open.
- **24.7:** packed consumer compatibility and truthful capability claims; no cleanup authorization.
- **24.15:** optional confirmed projection only if selected after source collision/ownership review; DOC-07 specified, AD-68/transfer/destination/runtime proof open.

### Phase 3 — supported work plane

Epic 15 owns DOC-09 and discovery/contract of a supported authenticated Allura status capability. The desired authority is Allura; the native status/sync adapter was not available/read here. No local tracker is created. 15.5/15.6 remain unavailable or explicitly nonauthoritative until DOC-09, API/state-machine, restricted-role, conflict, audit, and sync-read-back acceptance pass.

### Phase 4 — operator workspace

Epic 16 owns the Command Center. Current canon permits graph exploration; historical Epic 30.8 no-graph wording cannot override it. **DOC-02 still blocks exact design acceptance.** 16.3/DEV-10 additionally requires AD-69 Cloudflare identity, two distinct humans, denial/revocation/stale-review cases, accepted accessibility/responsive protocol, exact deployed revision, and independent review. DOC-09 gates work-item UI only, not the memory-only journey.

### Phase 5 — device and broader experience gates

- Epic 29 current identity acceptance uses AD-69/Cloudflare `CF-AC` evidence; old Clerk B1 is retained as historical provider evidence and Clerk restoration is not required. Real platform secure-store B2 remains.
- Epic 30 executes current canonical graph-capable workspace through preserved original numbering and separate exact-design/runtime gates.
- Epic 31 and the proposed 30/31 split remain proposal-only.

## Explicit run-provenance gap — Epic 14

FR-F3 (AD-35/BP-F49–52/MEM-UC13) remains an implementation-and-acceptance gap. **14.7** owns getting its row-level acceptance contract defined by the canon owner; it does not fabricate one or declare the feature accepted. After that decision, original **14.1–14.6** supply the numbered implementation and lifecycle-evidence boundaries. DEV-00/13.5 and DEV-09/24.7 are supporting inventory/compatibility only.

## Worktree and publication boundary

This scoped documentation snapshot links existing source-local DEV drafts, canonical amendments and archive assets that are not all included in its commit. Links are checked in the preserved working tree, not asserted portable to a clean checkout. Story 13.5 must reconcile those dependencies before publication. Existing PRD, architecture and DEV specifications remain supporting context; this rewrite does not approve or alter their requirements.

## Decision and evidence gates

| Gate | Current planning treatment |
|---|---|
| AD-65 | Required before 24.13 implementation; capture key/digest/storage/replay policy not decided here. |
| AD-66 | Required for 24.3 vector/authority implementation and deployed RLS/path evidence. |
| AD-67 | Required before 24.14 correction implementation. |
| AD-68 | Selected tooling subset may guide 24.10; telemetry/projection/budget/maintenance details remain owner decisions. |
| AD-69 | Approved current Cloudflare Access migration intent; source-local implementation is not merge/deployment acceptance by itself. |
| DOC-02 | Blocked exact UI/design acceptance for 13.3/16.3/30 screens; generic descriptions are insufficient. |
| DOC-06 | Approved exact-reviewed-version behavior; code/PR/CI/runtime acceptance remains separate. |
| DOC-07 | Approved confirmed-delivery projection behavior; remote adapter/read-back remains unverified. |
| DOC-09 | Epic 15 owner: decide work authority, sync direction, and conflicts; no substitute tracker. |
| DOC-04 | Current reviewed-revision/deployed journey evidence pending. |

## Verified October evidence boundary

- PR 180 merged 2026-10-24 as `97c5eef74d13fc3a71d4c50c18e29b8525474ddd`; bounded restricted-role development evidence only.
- PR 181 remains OPEN at `0c22703abe9169dd31d7bb4aaec5356c2666bcc0`; do not call reviewed-version binding merged.
- Source-local BMAD migration/reconciliation and preserved dirty work are evidence to classify, not implementation acceptance or cleanup permission.

## Readiness rule

A numbered story becomes implementation-ready only after its named decisions, authority, exact revision/diff, environment, executable positive/negative/failure/concurrency scenarios, rollback, evidence packet, and independent review are defined. `intended → specified → implemented → verified → released` remains the claim ladder. Planning completion, canonical prose approval, source presence, screenshots, test scaffolds, or historical `done` labels do not skip a state.