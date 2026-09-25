> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.7 — My Work Reading Shell

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Design  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R07  
**Dependencies:** 30.2, 30.6

## User Story
As a reader, I want one calm My Work front door so that I can navigate permitted Brains and compare memories without clutter.

## Acceptance Criteria
- `/dashboard` implements the approved design hash: private/department tree, memory tabs, one primary pane and at most one optional comparison pane.
- No organization/project Brain browsing, full graph canvas, arbitrary layouts or historical mock accepted as proof.
- Loading/empty/forbidden/stale/degraded/conflict/error/complete states reflect service truth without leaking existence.
- Keyboard focus, screen-reader semantics, 320px layout and 200% zoom are verified.

## Required Evidence / Definition of Done
Hash-bound browser comparisons and accepted variances, accessibility tests, owner/other-user/admin/department/contractor synthetic journeys, independent review and epic CI/publication/receipt gates. Simulations are not human study evidence.

## Current Preparation State

2026-09-25: the synthetic My Work component now has an explicit, content-free truth-state contract for `loading`, `empty`, `forbidden`, `stale`, `degraded`, `conflict`, `error`, `complete`, and the existing generic `unavailable` fallback. Non-content states render before any document material and are covered against title, body, count, identifier, ownership, department, and timestamp disclosure. The earlier `ready` compatibility state was removed so the prop contract has one unambiguous successful state. The synthetic server branch maps authorized zero/nonzero reads to `empty`/`complete` and maps its current undifferentiated failure boundary to `unavailable`; the other typed states are component contracts and are not represented as wired production-service distinctions. The exact Epic 30 gate passes typecheck with 212 tests and 3 intentional skips across 26 files; the full unit lane passes 2,778 tests with 165 skips across 187 files. This closes a bounded local truth-state rendering gap only. Production service mapping, screen-reader and actual 200% zoom proof, live restricted-database browser evidence, independent human review, and Story 30.7 acceptance remain open.

2026-09-22: the two visible pane labels are keyboard-operable focus controls in the synthetic My Work shell. The document and context/comparison panes can be reached directly; the hidden mobile context map is not offered as a focus target. The component lane passed 19/19 tests and typecheck passed. This is a bounded accessibility improvement, not full tabs, state coverage, screen-reader/200% zoom evidence, or Story 30.7 acceptance.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
2026-09-17: the bounded synthetic My Work reader is implemented at `f6c94f6`, with owner/department navigation, primary reading, one comparison pane, and honest Ask-unavailable disclosure. Fresh browser capture returned HTTP 200 with zero page errors; unit verification passed 62 tests. Review reproduced comparison overflow at 320px (347px page width) and keyboard focus falling to BODY on close. No tab controls exist, and tree-selection regression coverage is missing. Exact artifacts and variances: `/mnt/projects/git/Allura-Ecosystem/.dev-readiness/epic30-review-20260917/`. No approved design hash, full role/a11y acceptance or human study; status remains backlog. Historical unrelated dashboard evidence is still excluded.
