> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.10 — Restricted Contractor Messaging

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Brooks  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R10  
**Dependencies:** 30.3, 30.5, 30.7

## User Story
As a project contractor, I want controlled contact with approved people/channels so that collaboration does not grant broader knowledge access.

## Acceptance Criteria
- Direct contact requires approved project-owner/project-manager role; channel access requires current invitation approved by project owner and workspace membership administrator.
- Server-side checks cover recipient discovery, mentions, direct messages, channels, bots, attachments and history; non-disclosing denials fail closed.
- Revocation removes future channel/contact access within the approved bound. Invitation never grants project Brain browsing.
- Sending is explicit, approved as required, audited, and verified with a correctly scoped read-back receipt; no silent messaging.

## Required Evidence / Definition of Done
Positive/negative contractor and revocation tests, replay/wrong-scope/audit-outage proof, approved-design browser/accessibility evidence, independent review and epic CI/publication/receipt gates.

## Current Preparation State

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
No messaging performed or implemented.
