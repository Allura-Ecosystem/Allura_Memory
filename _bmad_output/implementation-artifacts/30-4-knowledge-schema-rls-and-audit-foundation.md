> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.4 — Knowledge Schema, RLS, and Audit Foundation

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** done
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

2026-09-25: Story evidence is complete on the approved disposable path. `bun run test:epic30-live` ran against a uniquely named `pgvector/pgvector:pg16` container bound only to `127.0.0.1:5444` with tmpfs-only storage. All 29 tests passed. The run applied the ordered migrations to fresh owned databases and proved the restricted NOBYPASSRLS application role, exact tenant/workspace/document isolation, immutable content-free receipts, receipt-outage fail-closed behavior, tenant/department/workspace/epoch revocation denial, rollback on unauthorized fixture replay and conflicting authority, exact HTTP content, and owned database cleanup. The container was removed and port 5444 was closed after the run; no production database was contacted. Evidence: [live database receipt](./evidence/epic30-live-db-2026-09-25.json). Hosted exact-SHA and release gates remain Epic-level gates under Stories 30.11 and 30.13; they do not reopen this story's completed schema/RLS/audit foundation.

2026-09-22: the broader unit lane found the provisioning cleanup test still mocked only three pools after the per-run receipt writer introduced a fourth. The test now verifies receipt-pool cleanup as well. Targeted provisioning tests pass 5/5 and the full unit lane passes 2,719 tests with 165 skipped. No live PostgreSQL schema, RLS, migration or rollback proof follows; status remains backlog.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation

A bounded local-only foundation exists: migration `docker/postgres-init/71-digital-brain-read-foundation.sql`, guarded synthetic fixtures, machine inventory and disposable-database tests. Historical remediation evidence records 21 passing DB/HTTP tests; the current session did not rerun that live lane. The reviewed nullable-department defect is repaired by an explicit `department_id IS NOT NULL` guard with a migration-contract regression test, and the dedicated workflow now binds PostgreSQL to the required loopback port 5444. On 2026-09-17 the maintained focused lane passed 78 tests across 9 files at `61205626`. This is hermetic local evidence, not live restricted-role or hosted-CI proof. No production migration or story approval occurred; status remains backlog. See the reconciled readiness document for remaining gates.
