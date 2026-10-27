---
title: '6.3 Exact-revision, single-attempt CI'
status: done
created: 2026-10-27
baseline_commit: 3b05b4d83e4c9ac3929f6715454c6db65ef712b7
---

# Local authorized contract

Brooks/direct build. Use actual native BMAD build route; no independent development review. Implement one authoritative workflow and reusable local runner, not stale cross-run job aggregation. Source SHA must be explicit full lowercase40-character revision and equal a clean checkout before and after execution. Bind every receipt to source SHA, lock SHA256, unique invocation, run/attempt and local-vs-GitHub mode. Receipts cannot be supplied/reused by callers. Independent frozen-install, typecheck, lint, required unit-file/assertion, pinned-model preparation and restricted PostgreSQL/native/packed-consumer lanes. Any failed/missing/duplicate/skipped/empty/mixed attempt invalidates final acceptance. Raw logs get content hashes; all output lives outside source.

GitHub workflow configuration may be authored locally, with read-only contents, no secrets, no pull_request_target, exact checked-out github.sha, pinned action revisions/runtime versions and one bounded job. Remote push, branch-protection changes, hosted execution, credentials and deployment are NOT authorized. Local same-revision execution is useful evidence, not proof the hosted workflow or protected status checks have run. Fresh hosted acceptance remains unverified until separately authorized publication/execution.

Tests first: malformed/mismatched SHA; stale attempt/run/lock/source; duplicate/missing/failed lanes; nonzero tests/assertions and complete unit discovery. Exercise the actual runner on an owned clean local beta commit and retain attempt/log manifest. Frozen install/model/cache changes must not modify tracked source. Failure cases must fail closed. Preserve original test runner's no-selection-override and required case discovery, never lower existing gates to green a lane.

## Local acceptance — 2026-10-27

Implemented in1f57ea1f0e091e187ebe42e244b3b9bab58545b6. Actual clean exact-SHA runner passed all six lanes,135tests/1038assertions (unit32/236, restricted DB103/802), frozen install, independent lint/typecheck, actual pinned-model preparation. Manifest Operations/direct-build-20261026/admission9-ci-attempts/allura-ci-3Vty1V/attempt.json; all six raw log hashes verified on admission10. No source dirt before/after. Required negative unit tests reject malformed revision, missing/duplicate/failed/empty/skipped/stale/mixed evidence; actual dirty checkout invocation exits1.

Admission10 exercised a real child-only Node executable fault, without changing global PATH or source: current runner exits1, creates a fresh failed attempt with only install(exit1), and never imports the earlier green receipt. Manifest admission10-ci-fault/allura-ci-xa5bu7/attempt.json and raw admission10-ci-fault.log. This is explicit failure injection, not simulated passing telemetry.

Local implementation/runner acceptance complete. Authored hosted workflow remains unpushed and unexecuted; protected required-check configuration is unchanged and unverified for this workflow. No claim of hosted/production acceptance. Story6.5 must bind hosted exact-SHA evidence and deployed authority independently; local6.3 does not grant either. Proceed6.4 isolated release/recovery under current disposable-resource authority, not the historical shared AD-71 trial.
