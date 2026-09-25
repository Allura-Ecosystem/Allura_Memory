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

2026-09-25: commit `f8934c9d` adds a provider-neutral durable messaging candidate without granting delivery or write authority. Migration 074 creates exact-workspace named contacts, trusted-source approval provenance, dual-approved invitations, explicit direct/channel messages and content-free receipts. Every table is force-RLS protected; no-argument SECURITY DEFINER helpers are owned by the asserted `allura_migration` BYPASSRLS role and require current provenance-bearing workspace membership; message reads are limited to sender/recipient and invitation/approval reads to the invitee or current exact-workspace admin. `allura_app` remains read-only. The production adapter reads only exact-scope contacts, trusted approvals, current dual-approved invitations and sender-owned messages; writes and provider delivery fail closed. Independent review found no remaining BLOCK/HIGH/MEDIUM issue. The exact lane passes typecheck with 355 tests and 3 intentional skips across 37 files; the full unit lane passes 2,917 tests with 165 skips across 197 files. Governed atomic writers, delivery provider, UI/accessibility, live RLS/read-back/revocation timing, human review and release evidence remain open.

2026-09-25: a provider-neutral, hermetic authorization kernel now covers exact tenant/workspace/principal/session/role/epoch scope; named owner/manager discovery; independently verified owner and membership-administrator approvals; exact-channel invitations; content-free acknowledged receipts; final rechecks; atomic authority-bound invitation/message commits; explicit scoped read-back; and denial of bots, attachments, mentions, history, broadcasts, wrong scope, replay, audit outage and revocation races. It exposes no route, provider, database, UI or Brain-read capability. The story remains backlog and locally partial: production approval provenance, durable receipt/message storage, delivery provider semantics, UI/accessibility, live revocation timing, independent human review and release evidence remain required. Fresh evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md).

## Historical Evidence — before repository consolidation
No messaging performed or implemented.
