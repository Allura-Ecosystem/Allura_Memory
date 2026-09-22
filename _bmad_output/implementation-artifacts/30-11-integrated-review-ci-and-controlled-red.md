> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.11 — Integrated Review, CI, and Controlled Red

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Pike / Fowler / Knuth / Hightower  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R11  
**Dependencies:** 30.4 through 30.10

## User Story
As a release owner, I want independent integrated proof so that a privacy regression cannot silently reach a protected branch.

## Acceptance Criteria
- Freeze the candidate SHA; independent security, maintainability, accessibility, migration and deployment reviews have no unresolved BLOCK/HIGH.
- Cover every controlled-red family in the epic, including unknown surfaces, bypass, leakage, prompt injection, revocation and audit failure.
- In an isolated candidate, deliberately introduce a privacy regression and prove required CI fails and merge is blocked; remove it and verify exact-SHA green checks.
- No production data, protected-branch bypass or unapproved publication. At most two remediation cycles per finding, then halt.

## Required Evidence / Definition of Done
Real check/run IDs, frozen SHAs, review verdicts, clean regression removal, local DB/browser/accessibility results and read-back receipts. A screenshot or fabricated CI output is not evidence; epic publication gates apply.

## Current Preparation State

2026-09-22: the Epic 30 workflow now runs on every pull request and has a separate exact-inventory hermetic authorization/UI job (typecheck plus 108 tests across 10 files) alongside the confined PostgreSQL/HTTP job. A contract test checks the trigger, both jobs, scripts and fail-on-empty inventory. The local hermetic command passed. No hosted run, protected-branch required-check setting, frozen-SHA evidence, controlled-red test, or independent review has been verified; this story remains backlog.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
No implementation, CI, controlled-red or independent review executed.
