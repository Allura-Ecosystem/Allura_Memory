> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.13 — Release Evidence, Receipts, and Retrospective

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Brooks / team  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R13  
**Dependencies:** 30.11, 30.12 and all preceding story delivery gates

## User Story
As the sponsor, I want a reconciled release packet so that done means approved, tested, merged and traceable.

## Acceptance Criteria
- Reconcile approved design hash/variances, contracts, code/migrations/tests, exact-SHA CI, controlled red, local DB/browser/accessibility proof and five-human results.
- Verify story/approval/CI/user-test/release receipts by ID, exact origin-main contents and rollback records after explicitly authorized publication.
- Reconcile Notion human story authority and local evidence; only sanctioned scripts change sprint tracking.
- Prepare retrospective evidence without prematurely running an epic-completion retrospective. Once all story delivery gates are met, obtain accepted retrospective and owned follow-ups before marking epic/retrospective done.

## Required Evidence / Definition of Done
One evidence index with real IDs/hashes/paths and no unresolved blocking findings; verified publication, release receipt and retrospective acceptance under epic close gates. Never infer completion from a commit message or local status.

## Current Preparation State

2026-09-25: canonical checkout is `main`. The [machine-checkable completion checklist](../planning-artifacts/epic-30-completion-checklist.json) reconciles all 13 stories and fails closed against unresolved gates, malformed evidence and contradictory BMAD status. Its validation is currently valid but incomplete: 24 gates remain, with every story classified locally as prepared or partial rather than complete. The exact hermetic lane passes typecheck with 327 tests and 3 intentional skips across 34 files; the full unit lane passes 2,889 tests with 165 skips across 194 files; the exact-HEAD controlled-red runner proves disclosure, receipt, revocation, unknown-surface and prompt-injection mutation detection and restores canonical state. `bun run gate:epic30-completion` exits 1 by design. Fresh evidence and every remaining gate are recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: no live-database, hosted-CI, human-study, release, rollback or retrospective approval is implied.

## Historical Evidence — before repository consolidation
No release, publication authorization, human study or retrospective complete.
