> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

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

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
A bounded local-only foundation exists: migration `docker/postgres-init/71-digital-brain-read-foundation.sql`, guarded synthetic fixtures, machine inventory and disposable-database tests. Historical remediation evidence records 21 passing DB/HTTP tests; this review did not rerun that lane. Fresh focused unit verification passed 62 tests. Independent review on 2026-09-17 found that the department visibility CHECK accepts NULL department_id; an explicit non-null guard and regression proof are required. Review also found the current CI port configuration incompatible with the suite's 5444 confinement requirement. No production migration or story approval occurred; status remains backlog. See the reconciled readiness document for evidence and remaining gates.
