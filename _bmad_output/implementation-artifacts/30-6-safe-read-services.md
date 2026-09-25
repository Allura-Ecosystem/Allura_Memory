> Reconciliation note (2026-09-17): the bounded candidate and interrupted repairs were integrated into canonical `main`. Earlier test/demo statements remain historical unless repeated in the current readiness record. Integration does not grant story acceptance.

# Story 30.6 — Safe Read Services

**Epic:** 30 — Governed Digital Brain Workspace  
**Status:** backlog  
**Owner:** Woz / Pike  
**Planning authority:** [Epic 30](../planning-artifacts/epic-30-governed-digital-brain-workspace.md)  
**Requirement:** E30-R06  
**Dependencies:** 30.5

## User Story

As a reader, I want a single authorized read path so that navigation, retrieval and citations disclose only permitted content.

## Acceptance Criteria

- Brain tree, memories, relationships, search candidates, citations and Ask context share 30.3 authorization decisions.
- Authorize candidates before scoring where possible and reauthorize before all returned disclosures; protected existence, counts, names and snippets do not leak.
- Links require both endpoints and relationship authority. Derivatives retain source restrictions.
- Revoked, missing, stale or degraded authority fails closed across pagination and caches.

## Required Evidence / Definition of Done

Cross-tenant/workspace/private/department tests, admin-without-private-access denial, relationship/derivative/cursor/revocation tests, review and epic CI/publication/receipt gates.

## Current Preparation State

2026-09-22: commit `427959ef` exposes the receipt-gated authorized list reader only for the exact disposable synthetic fixture target. The production API remains a generic authenticated 503, and caller-supplied scope selectors are ignored. A receipt-outage route test stays content-free; the exact hermetic gate passed typecheck, 129 tests and 3 intentionally skipped live-client tests. Live restricted-role proof, approved production policy, derivative/citation/caching/pagination authority and independent review remain open; status stays backlog.

2026-09-25: the synthetic reader adds bounded receipt-chained keyset pages for authorized reads and search. Cursors are opaque authenticated envelopes bound to tenant, workspace, principal, hashed session, role, policy epoch, operation, page size and `(updated_at DESC, id)` boundary; each continued page chains the authenticated prior witness into its candidate/final receipt comparison. Malformed, oversized, tampered, cross-scope, stale and operation-mismatched cursors fail closed before protected rows are returned. The production `/api/brain/memories` and `/api/brain/search` routes remain generic quarantined 503 outside the exact disposable target. The exact Epic 30 gate passes typecheck with 218 tests and 3 intentional skips across 26 files; the full unit lane passes 2,784 tests with 165 skips across 187 files. An independent AI review found no remaining BLOCK/HIGH/MEDIUM issue after the receipt-chain repair. This remains a local implementation slice, not pagination policy approval, live revocation proof, independent human review or story acceptance.

2026-09-25: the bounded synthetic citation slice adds `resolveSyntheticCitations(scope, citationIds)` over the shared authorized reader. It validates a nonempty canonical ID (maximum 200 characters), rejects controls, aliases and markup before reading, allows an empty list without a read, preserves first-seen input order with deduplication, and returns only `{documentId,title}` for IDs present in the current authorized snapshot. Missing and unauthorized IDs are identical omissions; reader failures propagate without content substitution, and successive calls re-read to reflect revocation. The exact Epic 30 gate passes typecheck with 232 tests and 3 intentional skips across 27 files; the full unit lane passes 2,798 tests with 165 skips across 188 files. Independent AI review found no BLOCK/HIGH/MEDIUM issue in this slice. This is synthetic-only evidence; production citation policy, live revocation timing, independent human review and story acceptance remain open, and status stays backlog.

2026-09-22: removed the low-level mapper's optional caller-supplied department-ID override. Department disclosure now requires the database-reported `authorized_department === true` alongside exact tenant/workspace checks; the regression fixture asserts true and false database decisions. Typecheck and the exact hermetic gate passed (118 tests, 3 intentionally skipped live-client contract tests). This closes one bypass-shaped extension point, not Story 30.6 acceptance or live RLS proof.

2026-09-17: canonical checkout is `main`. The bounded synthetic reader foundation and interrupted repair set are now integrated without the unrelated Epic 29 branch changes. Fresh local evidence is recorded in [current readiness](../planning-artifacts/implementation-readiness-epic-30.md). This story remains backlog: the integrated slice does not implement the full requirement, and no design, authorization-policy, board, live-database, hosted-CI, human-study or release approval is implied. Follow the [consolidated requirements](../planning-artifacts/epic-30-prd.md) and [completed course correction](../planning-artifacts/sprint-change-proposal-2026-09-17.md).

## Historical Evidence — before repository consolidation

`src/lib/digital-brain/read-service.ts` provides the restricted app-role read entry point with server-derived scope, SQL candidate authorization and row rechecking. `/dashboard` invokes it only in explicitly enabled non-production local mode. The reviewed ordinary-route regression and CI port incompatibility are repaired: the governed overview remains active outside explicit synthetic mode, while the dedicated Epic 30 workflow uses the required loopback 5444 lane. On 2026-09-17 the maintained focused lane passed 78 tests across 9 files at `61205626`; historical DB/HTTP evidence records 21 passing tests, not rerun here. Routine live HTTP execution still requires approved disposable credentials, and full derivative/revocation/audit and role acceptance are not established. Status remains backlog; see reconciled readiness and review evidence.
