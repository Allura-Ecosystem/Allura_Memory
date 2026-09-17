> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

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

## Historical Evidence — before repository consolidation
2026-09-17: the bounded synthetic My Work reader is implemented at `f6c94f6`, with owner/department navigation, primary reading, one comparison pane, and honest Ask-unavailable disclosure. Fresh browser capture returned HTTP 200 with zero page errors; unit verification passed 62 tests. Review reproduced comparison overflow at 320px (347px page width) and keyboard focus falling to BODY on close. No tab controls exist, and tree-selection regression coverage is missing. Exact artifacts and variances: `/mnt/projects/git/Allura-Ecosystem/.dev-readiness/epic30-review-20260917/`. No approved design hash, full role/a11y acceptance or human study; status remains backlog. Historical unrelated dashboard evidence is still excluded.
