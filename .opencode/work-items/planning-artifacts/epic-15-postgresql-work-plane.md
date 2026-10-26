# Epic 15 — PostgreSQL Work Plane

> [!NOTE]
> **Active original-number plan.** Original 15.1–15.6 are preserved from [`EPICS-13-17-GOVERNED-AI-OFFICE.md`](../../../docs/archive/allura/EPICS-13-17-GOVERNED-AI-OFFICE.md). This document owns discovery and contract of a supported Allura work-status capability under DOC-09; it does **not** create a local tracker or declare a native sync adapter implemented.

## Outcome

Give projects and work items a governed operational source of truth in Allura, with audited PostgreSQL mutations and evidence/run links, while keeping private planning documents and continuity records from masquerading as live work state.

## Known authority vs missing capability

- **Known product boundary:** operational work status must be served by an authenticated, supported Allura capability. This numbered plan, BMAD files, sprint YAML, Notion planning pages, and Brain memories are not that capability.
- **Known decision gap:** DOC-09 still requires the owner to decide authoritative board behavior, synchronization direction, and conflict rules.
- **Missing evidence/capability:** no native Allura BMAD/work-status adapter or supported status read/write capability was used in this reconstruction. Current owner, priority, and state remain unknown.
- **Consequence:** discover and specify the supported Allura interface first; do not create a replacement JSON/Markdown/YAML tracker.

## Original story register and forward acceptance

| Story | Original contract | Current remaining work / acceptance |
|---|---|---|
| 15.1 | **Project, lane, and work-item schema** | Specify canonical identities, tenant/workspace scope, legal states, versioning, and retention only after DOC-09 authority is resolved; schema approval and restricted-role/RLS evidence are separate. |
| 15.2 | **Dependencies and audited transitions** | Define server-authorized transition rules, conflict/replay semantics, immutable transition receipts, and negative cross-scope cases. |
| 15.3 | **Run, evidence, receipt, and handoff links** | Link—not copy—AD-35 RunRecord, evidence, approval receipt, and handoff identities. The existing FR-F3/RunRecord acceptance gap must be resolved rather than inferred. |
| 15.4 | **Typed project/work APIs** | Discover/define the supported Allura status capability; require authenticated server-derived scope, optimistic concurrency, idempotency, and audit. No native adapter is claimed present. |
| 15.5 | **Live project list and work board** | Remains unavailable or explicitly nonauthoritative until 15.1–15.4 and DOC-09 are accepted and verified. No local fixture may be presented as live. |
| 15.6 | **Optional board sync adapters** | After DOC-09, specify one direction/conflict contract per approved adapter. Sync is optional; delivery/read-back and conflict status are separate from canonical mutation receipts. |

## Current remaining work and next actions

1. **DOC-09 owner decision:** Sabir names the authoritative operational board behavior, whether Notion remains planning-only, permitted synchronization direction(s), conflict rules, and offline/degraded behavior.
2. **Capability discovery:** inventory authenticated Allura MCP/API tools for project/work reads and mutations. Record exact supported contracts or an explicit absence; do not infer from tables, UI, or old plans.
3. **Contract package:** define 15.1–15.4 types, state machine, authority, idempotency/concurrency, audit receipt, and RunRecord/evidence links. Route schema/API changes through normal owner approval.
4. **Executable acceptance:** use a separately authorized disposable restricted-role PostgreSQL target to prove scoped create/read/transition, dependency enforcement, replay/conflict, rollback, and cross-tenant denial.
5. **Surface/adapters last:** implement 15.5 only against the supported capability; implement 15.6 only for explicitly approved destinations with read-back and conflict evidence.

## Exit gate

A work item moves through governed lanes through a supported Allura API with audited PostgreSQL mutations, version/conflict protection, and links to run/evidence/receipt; unauthorized cross-scope access yields zero data/writes; UI shows source/freshness/degraded truth; and any optional sync reports delivery separately. DOC-09 prose, local files, a UI preview, or table existence is not closure.