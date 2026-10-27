---
title: '6.3 Exact-revision, single-attempt CI'
status: in-progress
created: 2026-10-27
baseline_commit: 3b05b4d83e4c9ac3929f6715454c6db65ef712b7
---

# Local authorized contract

Brooks/direct build. Use actual native BMAD build route; no independent development review. Implement one authoritative workflow and reusable local runner, not stale cross-run job aggregation. Source SHA must be explicit full lowercase40-character revision and equal a clean checkout before and after execution. Bind every receipt to source SHA, lock SHA256, unique invocation, run/attempt and local-vs-GitHub mode. Receipts cannot be supplied/reused by callers. Independent frozen-install, typecheck, lint, required unit-file/assertion, pinned-model preparation and restricted PostgreSQL/native/packed-consumer lanes. Any failed/missing/duplicate/skipped/empty/mixed attempt invalidates final acceptance. Raw logs get content hashes; all output lives outside source.

GitHub workflow configuration may be authored locally, with read-only contents, no secrets, no pull_request_target, exact checked-out github.sha, pinned action revisions/runtime versions and one bounded job. Remote push, branch-protection changes, hosted execution, credentials and deployment are NOT authorized. Local same-revision execution is useful evidence, not proof the hosted workflow or protected status checks have run. Fresh hosted acceptance remains unverified until separately authorized publication/execution.

Tests first: malformed/mismatched SHA; stale attempt/run/lock/source; duplicate/missing/failed lanes; nonzero tests/assertions and complete unit discovery. Exercise the actual runner on an owned clean local beta commit and retain attempt/log manifest. Frozen install/model/cache changes must not modify tracked source. Failure cases must fail closed. Preserve original test runner's no-selection-override and required case discovery, never lower existing gates to green a lane.
