> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

# Story 30.2 — Approved Workspace Design and User-Test Plan

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Design / Jobs / Sabir  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R02  
**Dependencies:** 30.1

## User Story
As a workspace user, I want an approved readable design so that private and department work is clear without excess controls.

## Acceptance Criteria
- A concrete browser design covers tree, tabs, primary and optional right pane, search, text relationships, collapsed Ask and restricted messaging.
- Covers all eight truth states, keyboard/focus, screen readers, 320px and 200% zoom.
- Sabir approves the exact artifact hash, routes, scope and variances; historical screenshots cannot satisfy this gate.
- Hash-bound test protocol specifies five distinct people, tasks, uncoached success, at least four successes per task, no critical error and no unauthorized disclosure.

## Required Evidence / Definition of Done
Artifact/hash, human approval receipt, task protocol and accessibility review; apply epic publication and receipt gates. Browser simulations may preflight owner/other-user/admin/department-member/contractor flows but cannot close the human gate.

## Historical Evidence — before repository consolidation
2026-09-17: a provisional synthetic reader exists and has a browser artifact with exact screenshot/source hashes and a proposed five-person task protocol. The candidate has no tabs, live search, verified relationships or real Ask; mobile comparison overflow and keyboard close-focus defects were reproduced. Evidence is in `/mnt/projects/git/Allura-Ecosystem/.dev-readiness/epic30-review-20260917/design-candidate.md`. No design hash, variance or human-test protocol has been approved; no human study is complete. Repair and re-review precede design acceptance. Status remains backlog.
