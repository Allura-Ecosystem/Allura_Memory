# Epic 3 Retrospective: Memory Provenance and Review

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD retrospective artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, validation output, canonical docs in `docs/allura/`, and team consensus.

## Epic Reviewed

- Epic: `3 — Memory Provenance and Review`
- Local story completion: `4/4` stories marked `done` in `_bmad/bmm/stories/sprint-status.yaml`.
- Canonical board caveat: Notion Work Board update is pending because authorized Notion tooling is unavailable in this runtime.
- Brain query: `Epic 3 retrospective Memory Provenance and Review blockers decisions outcomes`.
- Drift classification: `none` for retrospective readiness; known board reconciliation remains pending.

## Completed Stories

1. `3-1-provide-scoped-memory-search-and-listing`
   - Aligned scoped search/list wrapper behavior with canonical retrieval metadata and kept invalid `group_id` calls from reaching canonical tools.
2. `3-2-show-memory-detail-and-evidence-chain`
   - Added read-only memory detail provenance and evidence-chain rendering without approval or mutation actions.
3. `3-3-preserve-provenance-on-copy-and-export`
   - Added provenance-preserving copy/export formatting and resolved actor/user, SDK/schema, evidence-chain, and curator requester-linkage drift.
4. `3-4-validate-provenance-drift-against-schema-baseline`
   - Added an executable read-only baseline proving exported provenance labels map to Data Dictionary fields or documented derived labels.

## What Went Well

- Epic 3 preserved the read-only boundary: search, list, detail, copy, export, and drift checks did not add approval, promotion, deletion, restore, direct PostgreSQL mutation, or Neo4j mutation behavior.
- TDD caught real contract drift before implementation, including federated `graph`/`ruvector` metadata, stripped detail provenance fields, missing export evidence wiring, and absent provenance drift baselines.
- Combined targeted validation became a useful safeguard for shared API/schema/UI surfaces, especially after separate file runs missed cross-surface drift.
- The Data Dictionary became executable evidence through Story 3.4 instead of remaining only prose.

## What Did Not Go Smoothly

- Review repeatedly found source/runtime/SDK-dist drift after initial green tests, especially around SDK declaration/runtime artifacts and provenance fields.
- Read-only UI stories inherited legacy mutation affordances until review forced explicit removal.
- Knuth subagent invocations returned empty output in this runtime, requiring Brooks to perform and document gate-equivalent data/schema review.
- Notion status remains pending because this runtime lacks authorized board tooling.

## Lessons Learned

- Provenance is a contract across source, generated/dist SDK artifacts, UI labels, and export text. Passing only source tests is not enough when published artifacts are part of the repo surface.
- Read-side stories must explicitly assert negative capabilities: no edit, delete, restore, approve, reject, promote, or store mutation paths.
- Evidence-chain builders should preserve canonical evidence first, then add explicit unavailable markers for missing legacy references; they must not synthesize convenient proof.
- Operator-facing labels need a Data Dictionary or derived-label baseline, otherwise copy/export UX can drift from stored evidence semantics.

## Action Items

| Priority | Owner | Action | Success Criteria |
| --- | --- | --- | --- |
| P0 | Brooks/Knuth | Before Epic 4 starts, run the drift gate for curator proposal queue and verify write-path authority, role/SoD, audit receipt, and HITL constraints against Brain and local schemas. | Story 4.1 does not move out of backlog without drift evidence and validation targets. |
| P0 | Woz/Knuth | Treat Epic 4 as governed write-path work, not an extension of Epic 3 read-only UI. | Tests prove approval/rejection/request-changes paths are scoped, audited, and do not auto-promote semantic truth. |
| P1 | Pike/Fowler | Keep combined targeted validation for any story touching SDK dist, API schemas, UI rendering, and curator routes together. | Review evidence includes combined commands when source and dist/runtime contracts can drift. |
| P1 | Brooks/Hightower | Restore or provide authorized Notion board tooling before relying on board updates as Done evidence. | Local BMAD statuses can be reconciled with actual Notion board receipts. |

## Next Epic Preparation

Epic 4 is `Kernel Hardening and HITL Promotion`. It depends on Epic 3 work and must preserve these constraints:

- Curator proposal surfaces may inspect provenance, but approval/rejection/request-changes are governed write-path operations with audit receipts.
- No raw trace becomes semantic truth without HITL/SOC2 promotion policy.
- Every curator action must carry `group_id=allura-system`, actor identity, role/SoD evidence, decision status, and append-only audit metadata.
- UI copy must distinguish pending proposals, approved insights, rejected proposals, and unavailable evidence without fabricating receipts.
- Notion remains the canonical board; local BMAD status is reconciliation only.

## Closeout Decision

Epic 3 is locally complete and ready to proceed to Epic 4 with caveats:

- Notion board update remains pending.
- SDK dist artifacts remain a known drift risk when package build tooling is unavailable; future stories must validate both source and dist surfaces when dist is touched.
- Knuth gate-equivalent review was required because the real Knuth subagent returned empty output in this runtime.
- Brain outcome memory: `4ea4a3c5-a307-4254-bf5b-6ece31dc0e7b`.
