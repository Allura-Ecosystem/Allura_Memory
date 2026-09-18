> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

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

2026-09-17: canonical checkout is `main`. This story remains backlog; saved candidate implementation and historical test results are not evidence for this checkout. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md), [current readiness gates](../planning-artifacts/implementation-readiness-epic-30.md), and [bounded integration proposal](../planning-artifacts/sprint-change-proposal-2026-09-17.md). Dependencies above remain binding; no design, board, live-test or release approval is implied by this update.

## Historical Evidence — before repository consolidation
`src/lib/digital-brain/read-service.ts` provides the restricted app-role read entry point with server-derived scope, SQL candidate authorization and row rechecking. `/dashboard` invokes it only in explicitly enabled non-production local mode. Fresh frozen-candidate focused unit verification on 2026-09-17 passed 62 tests across 8 files; historical DB/HTTP evidence records 21 passing tests, not rerun here. Independent review now exists and identifies missing routine execution of the opt-in HTTP proof, CI port incompatibility, and a non-local dashboard-route regression requiring contract reconciliation. Full derivative/revocation/audit and role acceptance are not established. Status remains backlog; see reconciled readiness and review evidence.
