---
title: '4.4 Governed deletion, history, restore and duplicate policy'
status: done
created: 2026-10-26
baseline_commit: 8d3739de1a2068d40eebf59f60ced1b1a5c31a97
---

# Delegated policy and acceptance

No in-place semantic content edit or hard deletion. Exact current memoryId + expectedHeadRevision + nonblank reason + stable operationKey; current memory:delete. Atomically append deletion event/immutable receipt and deprecate the mutable head, incrementing revision. Same-key/digest returns exact receipt after current authorization; differing payload conflicts. Old/superseded or stale head conflicts; hidden/missing ID is uniform not_found. Current reads must exclude deprecated; explicit history retains immutable content, receipt and supersedes. History requires current memory:read and is bounded; raw evidence/audit remains separately guarded.

DOC-05 delegated default: intentional distinct human-approved proposals retain separate knowledge identities and provenance. Exact byte-equal active root content receives an immutable `exact_text` equivalence link to the oldest visible active matching semantic root; no automatic merge, fuzzy similarity claim, evidence rewrite or cross-scope link. Serialize exact-content root insertions so concurrent approvals cannot evade linking. The link is historical exact-text evidence, not a claim two independently evolving heads remain equivalent. No universal semantic uniqueness is promised. Existing human review and capture operation dedup remain distinct.

DOC-03 delegated restore design: restore creates a NEW pending proposal of exact selected historical content bound to current deprecated head ID/revision. Independent human approval creates a NEW semantic version and supersedes current head; never reactivate/mutate an old version or delete lineage edges. Original deletion evidence remains. Changed head/deletion revision conflicts; no auto-rebase or undo bypass. Generic corrections remain forbidden on deprecated heads. A direct lifecycle flag toggle is not acceptable restore. Restoration proposals are not editable through generic proposal/correction routes; changed evidence/base requires a fresh pending restoration and renewed independent review. Original source proposal requester/producer and capture authors cannot approve their own restored content, even if they did not request restoration.

## Implemented acceptance and evidence

Fresh migrations007/008; lifecycle.ts, restoration.ts; human review gateway deletion/history/restoration routes; enriched exact-base review context. No accepted migration001–006 edited. History helper is current-authorized, explicit historical semantic content only, capped50 rows; full get/list/search/current filtering and graph derivatives remain Story5.2, not claimed here.

- [x] Given current delete authority and exact current head/revision, deletion atomically persists immutable evidence/receipt and deprecates; same-key concurrent replay has one effect; changed-key payload and stale heads conflict.
- [x] Given denied/revoked/foreign authority or identifiers, deletion/history/restoration disclose no foreign semantic content or derivative equivalence. Real second-workspace semantic fixture, not only random UUID.
- [x] Given selected historical ancestor and exact deprecated head, pending restoration preserves deleted state until independent human approval; approval appends a fresh version and supersedes the current head, including restoring version1 after corrected/deleted version2. Original source-producer/self/machine approval rejects.
- [x] Given competing restoration decisions, one wins; receipt reconciliation is exact; late intent failure rolls back semantic version/head/lineage/decision receipt and allows same-key retry.
- [x] Given byte-equal independently approved roots, append immutable same-scope historical equivalence while preserving separate provenance; simultaneous first roots cannot both evade linking.
- [x] Real signed HTTP exercises CSRF/role denials, delete, historical state, pending restore, exact context review and fresh-version approval.

`bun run check:all` exit0: Operations/direct-build-20261026/admission4-epic4-final.log,81 tests/602 assertions, zero fail/skip, TypeScript/ESLint; restricted PostgreSQL63/468, container cleanup verified. Initial lifecycle/restoration missing-module red logs retained. Intermediate foreign fixture attempted human use of machine-only capture and correctly failed; fixture changed to existing authorized appendEvent, not weakening capture transport identity. No production mutation, UI/browser, deployment, remote status or independent developer-review claim.
