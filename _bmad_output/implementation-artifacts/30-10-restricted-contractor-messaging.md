> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

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

## Historical Evidence — before repository consolidation
No messaging performed or implemented.