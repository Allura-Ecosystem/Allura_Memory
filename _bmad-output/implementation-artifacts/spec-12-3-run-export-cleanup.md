---
title: 'Revision-one owned test-export lifecycle cleanup'
type: 'bugfix'
created: '2026-11-01'
status: 'done'
parent_acceptance: 'Bounded export cleanup accepted; parent check:toolchain/check:all exit0, canonical SHA256 196fe5738226359e7a46a4158c898dcfa7cb3b5eec6ed6685608c3486e64f802. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-12-3-export-cleanup-parent. Fowler approved source/log review; parent reproduced runtime. Source/dependencies preserved,12 containers unchanged,scan0. Historical exports intentionally untouched. No whole-epic or external release closure.'
route: 'oneshot'
review_loop_iteration: 0
context: ['guidelines/ALLURA-BMAD.md']
---

<frozen-after-approval reason="bounded parent-authorized test-only intent">

## Intent

Repair the historical revision-one test export leak in `foundation/tests/run-upgrade.test.ts`. Each invocation must remove only its newly allocated export across success, extraction failure, provenance failure and callback failure. Keep the genuine Git pin `2856bbd1143535782fc12d1193520a84aa070726`, archive SHA-256 and byte-for-byte source verification before use and again before cleanup wherever the source is available. Preserve the original error if final verification or deletion also fails. Never traverse the shared `node_modules` symlink or purge historical exports.

This is test-harness maintenance, not a new product definition or revision8. Only the named test, exact database-case registration in `foundation/scripts/test-db.ts`, exact dependent inventory in `foundation/tests/test-runner.test.ts`, and this new specification are expected to change. `foundation/scripts/test.ts` is permitted only if a named unit registration becomes necessary. Product, migrations001–031, historical specifications, fixtures, dependencies and runner algorithms remain unchanged. No staging, commit, refs, closure, remote access, secrets, production or nested agents. Parent accepts the frozen tested candidate later.

</frozen-after-approval>

## Implementation Notes

- Admission: clean HEAD `2640ed7b1edefa4d159e24fd0840cb79eaf404eb`; direct-build STOP absent. Evidence is exclusively `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-export-cleanup-evidence`.
- Loaded the current repository adapter, Team RAM and TDD. Rendered installed BMAD build offline through its actual `uv run --no-cache` entrypoint. Current bounded parent authority replaces stale missing-runtime/MCP/reviewer/closure instructions; no remote retrieval or nested review was performed. Existing Epic12 context and analyst retrospective are context only, not closure authority.
- Code map: the first upgrade test allocates before its database try/finally and never removes its export. The revision-two helper supplies the local fault-probe/logging pattern; it is not changed by this slice. The canonical registry owns the upgrade file once in batch1; exact inventory assertions must follow any added named case without modifying runner behavior or budgets.
- Acceptance: given each newly owned export, when success or a lifecycle failure returns, exact `lstat` must report ENOENT; callback entry is forbidden on extraction/provenance failure; original errors survive secondary failures. Shared dependency bytes and historical exports must remain unchanged. Genuine behavioral RED must observe existing newly owned directories before GREEN, not infer a leak from source matching.
- Verification plan: focused native tests, exact runner inventory, supported `check:toolchain`, `test:db` and `check:all`; outer900s, DB600s and native batch240s remain unchanged. Retain raw failure/success logs, native report ownership, source/dependency/prior-evidence hashes, exact cleanup readback and a final receipt. Count the final canonical unit and DB cases once; exclude focused runs and the separate DB reproduction.
- Observed RED (`red.log`): all four exact new export paths still existed after success, failed extraction, failed provenance and failed callback. The test's outer containment removed those exact paths only after recording the leak. GREEN (`green.log`) removed all four. Final lifecycle coverage (`lifecycle-green-03.log`) also passes allocation-observer failure, callback drift, successful-callback drift detection, real nonrecursive-rm failure and simultaneous callback/removal failure. Exact primary Error identity is preserved; a standalone deletion failure remains a failure. Denied deletion is repaired only by the regression test's own containment, with exact ENOENT readback, not claimed as automatic successful deletion.
- Failure records remain unmodified: initial fixture used ArrayBuffer instead of Buffer; a follow-up assumed Node's EISDIR while installed Bun returns EFAULT for nonrecursive rm on a directory; another captured the allocated path before the awaited allocation completed. The corrected assertion awaits the actual filesystem error and binds its exact owned path. These are fixture errors, distinct from the genuine four-path lifecycle RED. `denial-probe-red.log` records the real deletion-failure probe rejecting a missing fault implementation.
- Exact registry/inventory maintenance adds one required native case to the existing upgrade file (six cases), still owned once in batch1. Inventory RED observed375 against374; GREEN preserves57files and batches11/87,31/235,15/53. No unit registration or runner algorithm change was needed; no scope extension beyond the supplied conditional files.
- Direct self-check only: the helper brackets archive/extraction/symlink/verification/callback, re-verifies extracted source before deletion even on initial provenance failure, records secondary failures and throws the first. Shared dependencies are never traversed by cleanup. Focused lifecycle, all45runner tests, typecheck and lint passed before the final source freeze. Final supported gate outcomes and exact counts belong to this evidence root's machine-readable receipt, not an invented acceptance claim here. This specification remains in-progress pending parent acceptance; no story/epic/live-status closure follows.
