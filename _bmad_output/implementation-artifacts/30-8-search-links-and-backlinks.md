> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

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

## Current Preparation State

2026-09-25: a bounded synthetic citation-authority helper now resolves explicit IDs only from the shared receipt-gated authorized document snapshot. Owner and approved-department citations are returned as minimal `{documentId,title}` entries in deterministic deduplicated input order; missing, unauthorized and revoked records are omitted identically, while malformed/overlong/control/alias IDs fail before reading. No excerpts, content, counts, title lookup, alias lookup, graph inference or cache is used. The exact Epic 30 gate passes typecheck with 232 tests and 3 intentional skips across 27 files; the full unit lane passes 2,798 tests with 165 skips across 188 files. Independent AI review found no BLOCK/HIGH/MEDIUM issue. This is not an approved citation/relationship policy, production endpoint, timing proof, live PostgreSQL proof, independent human review or story acceptance; the Notion board remains Not Started.

2026-09-22: a synthetic one-hop `[[document-id]]` link/backlink candidate now derives edges only from the receipt-gated authorized document reader. Unit and integrated tests omit hidden targets and hidden backlink sources, and make missing versus unauthorized focus non-disclosing. The exact hermetic gate passed typecheck with 133 passing tests and 3 intentionally skipped live-client tests across 13 files. This is not an approved relationship policy, production route, cursor/timing proof, live PostgreSQL proof, or story acceptance. The Notion board remains Not Started.

2026-09-22: commits `5e82e5c1`, `cd8c4f52`, and `c67c708a` add a receipt-gated search candidate over the shared restricted reader, a content-free keyed query digest, a final authority/result recheck, synthetic-only API wiring, and a hidden-match denial test. The exact hermetic gate passed typecheck with 127 passing tests and 3 intentionally skipped live-client tests. Production still returns a generic 503. Links/backlinks, timing and cursor/revocation proof, approved live PostgreSQL, independent review, and story acceptance remain open.

2026-09-22: the older `/api/brain/search` content route is temporarily quarantined with an authenticated, generic 503 response because its tenant-only/client-selected filter cannot enforce Epic 30 workspace, lineage and receipt rules. This is a denial, not an authorized search implementation. The My Work search affordance remains disabled; Story 30.8 stays backlog.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation
Not implemented or tested.
