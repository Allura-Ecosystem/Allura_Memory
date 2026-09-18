> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

# Story 30.4 — Knowledge Schema, RLS, and Audit Foundation

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Knuth / Woz  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R04  
**Dependencies:** 30.3

## User Story
As an owner, I want database-enforced authority so that application mistakes do not expose protected knowledge.

## Acceptance Criteria
- Model authority-bearing knowledge, memberships, scoped roles/grants, derivatives and immutable decisions from the approved contract.
- Restricted app role, NOBYPASSRLS, forced RLS, tenant/workspace scope and transaction-local context are tested, including owner/view/function bypass and pool reuse.
- Audit cannot be silently omitted or mutated; wrong-scope/replayed receipts and audit outage follow the approved fail-closed contract.
- Fresh migration, legacy quarantine interface and ordered rollback preserve append-only evidence. No production migration or existing historical-row rewrite.

## Required Evidence / Definition of Done
TDD, independent data/security review, fresh synthetic local PostgreSQL restricted-role isolation and rollback proof, exact-SHA CI and verified receipts under epic gates. Migration IDs and commands must be discovered, not invented during planning.

## Current Preparation State

2026-09-17: canonical checkout is `main`. This story remains backlog; saved candidate implementation and historical test results are not evidence for this checkout. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md), [current readiness gates](../planning-artifacts/implementation-readiness-epic-30.md), and [bounded integration proposal](../planning-artifacts/sprint-change-proposal-2026-09-17.md). Dependencies above remain binding; no design, board, live-test or release approval is implied by this update.

## Historical Evidence — before repository consolidation
A bounded local-only foundation exists: migration `docker/postgres-init/71-digital-brain-read-foundation.sql`, guarded synthetic fixtures, machine inventory and disposable-database tests. Historical remediation evidence records 21 passing DB/HTTP tests; this review did not rerun that lane. Fresh focused unit verification passed 62 tests. Independent review on 2026-09-17 found that the department visibility CHECK accepts NULL department_id; an explicit non-null guard and regression proof are required. Review also found the current CI port configuration incompatible with the suite's 5444 confinement requirement. No production migration or story approval occurred; status remains backlog. See the reconciled readiness document for evidence and remaining gates.
