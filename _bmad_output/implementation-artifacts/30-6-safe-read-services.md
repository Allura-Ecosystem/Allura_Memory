> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.6 — Safe Read Services

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Pike  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R06  
**Dependencies:** 30.5

## User Story

As a reader, I want a single authorized read path so that navigation, retrieval and citations disclose only permitted content.

## Acceptance Criteria

- Brain tree, memories, relationships, search candidates, citations and Ask context share 30.3 authorization decisions.
- Authorize candidates before scoring where possible and reauthorize before all returned disclosures; protected existence, counts, names and snippets do not leak.
- Links require both endpoints and relationship authority. Derivatives retain source restrictions.
- Revoked, missing, stale or degraded authority fails closed across pagination and caches.

## Required Evidence / Definition of Done

Cross-tenant/workspace/private/department tests, admin-without-private-access denial, relationship/derivative/cursor/revocation tests, review and epic CI/publication/receipt gates.

## Current Preparation State

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation

`src/lib/digital-brain/read-service.ts` provides the restricted app-role read entry point with server-derived scope, SQL candidate authorization and row rechecking. `/dashboard` invokes it only in explicitly enabled non-production local mode. The reviewed ordinary-route regression and CI port incompatibility are repaired: the governed overview remains active outside explicit synthetic mode, while the dedicated Epic 30 workflow uses the required loopback 5444 lane. On 2026-09-17 the maintained focused lane passed 78 tests across 9 files at `61205626`; historical DB/HTTP evidence records 21 passing tests, not rerun here. Routine live HTTP execution still requires approved disposable credentials, and full derivative/revocation/audit and role acceptance are not established. Status remains backlog; see reconciled readiness and review evidence.
