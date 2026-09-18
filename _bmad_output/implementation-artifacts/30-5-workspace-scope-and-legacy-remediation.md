> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.5 — Workspace Scope and Legacy Remediation

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Knuth  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R05  
**Dependencies:** 30.4

## User Story
As a tenant member, I want server-owned workspace scope so that forged selectors and unclear legacy records cannot cross boundaries.

## Acceptance Criteria
- Tenant, workspace, principal and delegation are server-derived on every protected path; runs carry verified workspace identity.
- Remove permissive client-selected scope and anonymous/hard-coded authority fallbacks without inventing upstream dependencies.
- Quarantine unclear ownership/visibility records; never automatically classify them or widen derived data.
- Membership/session/delegation revocation blocks future reads and runs according to 30.3, including pooled-connection reuse.

## Required Evidence / Definition of Done
Forged ID/header/query/body/local-state tests, missing scope and pool-leak tests, quarantine/rollback proof, independent review and epic CI/publication/receipt gates. Local synthetic fixtures only.

## Current Preparation State

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
No implementation, migration or tests in this increment.
