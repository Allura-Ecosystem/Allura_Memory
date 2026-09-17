> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

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

## Historical Evidence — before repository consolidation
No implementation, migration or tests in this increment.