> Recovery note (2026-09-17): planning restored into the canonical checkout. Earlier code/demo/test statements describe the separate saved candidate, not this branch. No story readiness or acceptance is granted by recovery. See implementation-readiness-epic-30.md in planning-artifacts for current gates.

# Story 30.8 — Search, Links, and Backlinks

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Pike  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R08  
**Dependencies:** 30.6, 30.7

## User Story
As a reader, I want scoped search and text relationships so that I can find related permitted knowledge without revealing hidden records.

## Acceptance Criteria
- Search covers only permitted private/department records and uses the shared read path.
- Protected names/counts/snippets/facets/existence and pagination do not leak; test timing channels rather than assuming safety.
- Links/backlinks/focused lineage disclose only authorized endpoints and relationships; no graph canvas added.
- Revocation invalidates search pages/cursors/relationships and derivatives; stale or failed authority is non-disclosing.

## Required Evidence / Definition of Done
Search and relationship adversarial tests, browser/accessibility evidence on approved design, independent review and epic CI/publication/receipt gates.

## Historical Evidence — before repository consolidation
Not implemented or tested.