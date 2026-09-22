> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

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

## Current Preparation State

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

The independently reviewed candidate at `4370cac3` now has source-bound 1440 px and 320 px ready/comparison captures, real-browser modal/focus checks, zero automated WCAG A/AA violations for those four rendered states, a variance register, and a five-person protocol in the [design approval packet](../planning-artifacts/epic-30-design-approval-packet.md). Sabir Asheed self-attested approval of the exact design baseline, listed variances and protocol in the current Codex task on 2026-09-21; the matching [human-board record](https://app.notion.com/p/3df1d9be65b381d1ad21fd045deb777e) was updated and read back under Sabir's connected Notion account without changing `Not Started`. One mobile-overlay contrast check remains manual because automated overlap geometry was indeterminate. Screen-reader and actual 200% zoom evidence, live restricted-database browser proof, and the five-person study remain open. This story stays backlog; design approval is not Story 30.2 acceptance.

## Historical Evidence — before repository consolidation

2026-09-17: a provisional synthetic reader exists and has a browser artifact with exact screenshot/source hashes and a proposed five-person task protocol. The candidate has no tabs, live search, verified relationships or real Ask; mobile comparison overflow and keyboard close-focus defects were reproduced. Evidence is in `/mnt/projects/git/Allura-Ecosystem/.dev-readiness/epic30-review-20260917/design-candidate.md`. No design hash, variance or human-test protocol has been approved; no human study is complete. Repair and re-review precede design acceptance. Status remains backlog.

## Auto Run Result

Status: blocked
Blocking condition: The governed `bmad-build-auto` activation for Story 30.2 requires `audit_health_report`, filtered `audit_query_events`, and outcome write/readback as `sabir-superadmin`. The active Allura principal is `chatgpt-desktop`: both audit calls returned `SCOPE_INSUFFICIENT`, and the required `sabir-superadmin` memory search returned `ACTOR_MISMATCH`. A scoped `chatgpt-desktop` memory-list fallback succeeded without degradation and recovered the current repair receipts, but it cannot satisfy or bypass the workflow's explicit identity and `audit:read` gate. No implementation, status advancement, approval, or promotion was performed by this auto-run.
