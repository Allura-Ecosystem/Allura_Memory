---
title: '13.2 bounded work-item create and immutable run definition nine'
type: 'feature'
created: '2026-11-01'
status: 'in-review'
verification_status: 'blocked-canonical-batch-budget; not accepted'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 502578872b72cabbe474ffcf74cef77d47a96f41
context: []
---

<frozen-after-approval reason="parent-adopted bounded engineering packet">

## Intent

Implement only signed-human POST `/api/work-items` in an already mapped owned project, returning immutable stored201 acceptance/replay with a server item ID. The serializer change crosses the existing source pin: adopt immutable definition9 through additive035 rather than changing historical8.

The controlling detailed design, exact35-file allowlist, required native identities and acceptance vectors are the parent-adopted packet `allura-epic13-scout-create-run9-packet-502578872b72-8e6c41.md`, SHA256 `3859492b3fb54db1e5372890f507746466bf1370fa97053953447e5bcdffd68f`. All339 lines were read; this spec incorporates its sections1–9 without changing any engineering choice. A retained copy and full baseline are in the private evidence directory `allura-13-2-create-evidence/woz-d16c33be75a8` under the active Troy workspace.

## Boundaries & Constraints

Always preserve exact original001–034 bytes, historical8 digest and genuine034-only executable8 witness. Use existing human/base/work admission, original principal binding, project map and shared workspace operation-key serializer. Copy/freeze bounded strict nested JSON before await; validate independently in SQL. Preserve transaction/deferred links, append-only receipts, current disclosure and honest unknown outcomes.

Never add provisioning, UI, roles/defaults, libraries, routes outside create, live grants, semantic effects, remote access or operational status. No commit, staging, refs, nested workers, credential access, other-profile writes or skills changes. Direct-build STOP checked before writes/gates. Only owned local disposable DB/HTTP fixtures. Budgets remain batch240/DB600/outer900 seconds. Existing cases, floors, original8 history and all historical exports remain intact.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior |
|---|---|---|
| Accepted creation | Current signed entitled human, exact scope, empty owned mapped project, valid key/title | Stored201, server UUID, backlog/medium/default nulls, one timestamp, linked item/event/receipt |
| Exact replay | Same key and canonical command after later real transition | Original201/raw backlog bytes; GET/list current state |
| Shared namespace | Actual create versus actual transition, same actor/scope/key | One winner, changed command409, attributable waits |
| Malformed data | Duplicate decoded keys, unsafe numbers, overrides, invalid Unicode/depth/bytes or DTO aliases |400, no mutation; typed unsupported owner/lane404 after admission |
| Authority loss | Missing/revoked original authority, work entitlement or owning map | Deny before private disclosure; no inferred rollback after uncertain commit |
| Fault/capacity | Insert/deferred faults or final retained slot contention | Atomic rollback or honest unknown; replay remains available at cap under current authority |
| Definition upgrade | Genuine populated8 source and claims then035 | Exact historical receipts; original valid8 executor fenced; full genuine9 tracer |

</frozen-after-approval>

## Code Map

- `foundation/src/work-plane-api.ts`: separate recursive parser and collection POST; preserve flat transition parser.
- `foundation/src/work-plane-contract.ts`: create DTO safe-copy validation; preserve existing graph/list/cursors.
- `foundation/src/work-plane.ts`: confirmed create transaction and fresh disclosure using existing helpers.
- `foundation/src/gateway.ts`: only trusted serialized200/201 support; existing budgets and admission remain.
- `foundation/migrations/035-work-plane-create.sql`: guarded create, exact additive pair constraints and nine run-revision replacements derived from033.
- `foundation/src/run-contract.ts`, `foundation/src/persistence.ts`: literal9/pin append and migration inventory append.
- Exact test/spec allowlist and dependent anchors are frozen in packet§8, also machine-enumerated as35 paths in baseline.json. No implicit wildcard permission.

## Tasks & Acceptance

- [x] Establish signed404-versus201 RED, independent serializer RED and revision9 parser RED before production edits.
- [x] Implement vertical create acceptance/replay; expand packet14 DB and5 unit cases without weakening old cases.
- [x] Preserve historical034 source isolation; build full genuine8→9 upgrade witness and source-export mutants/restored controls.
- [x] Update exact registries/dependent inventories, packed-server and populated recovery witnesses.
- [ ] Direct CR, bounded partial Retro and full frozen-byte canonical verification with native XML and cleanup.

Given signed entitled creation in a mapped project, when POST succeeds, then exactly one atomic201 envelope persists and exact retry remains immutable. Given current authority loss, when any entry/disclosure runs, then private response is denied. Given genuine8 history/valid claims, when035 is installed, then history remains exact while new execution is fenced and current9 succeeds. Every packet§6–7 acceptance obligation remains required, not merely a named test.

## Implementation Notes

Installed build renderer ran once successfully. Current adapter supersedes stale runtime mappings, MCP retrieval, nested review delegation, staging and status instructions. Team RAM/TDD loaded; Woz is this sole writer. Parent supplied settled design and continuation through ordinary checkpoints; no new product intent gap. Local migration fixtures only; no live migration. Initial admission verified clean exact502 and free new paths. Admission helper attempts that selected pin-table rows or assumed `.git` was a directory failed before source writes; corrected allowlist35 and `git --git-path index` admission succeeded. No test result is implied by admission.

## Spec Change Log

## Review Triage Log

Direct writer review only; independent review remains with the parent. Nested reviewers, status synchronization, staging/commit and Brain writes were expressly prohibited. Installed review/present steps were read, but their conflicting side effects were not performed.

- Fixed: the new coherence trigger needed SECURITY DEFINER with fixed search_path; the restricted role cannot read internal work tables. Failed and restored replay/concurrency logs remain intact.
- Fixed: additive registry indices initially selected work-plane cases instead of the original age negatives; corrected only the positional anchors. Names, native ownership, assertion floors and deadlines remain unchanged.
- Fixed: one current inspection query still selected revision8; it now selects9. Historical pins and genuine history selectors remain unchanged.
- Fixture correction: raw JSON text must bind through text before JSONB to avoid Bun JSON parameter double encoding. Retained the failed strict-number run.
- Fixture correction: machine delegation setup legitimately prevented a later identity-rebinding fault. Moved those authenticated device/worker/owner/selected controls after the independent drift fault; no production authorization change.
- Sensitivity: first guard removal only changed a missing-context error, so it is not credited as an authority-bypass witness. The retained guard2 mutant removes the write requirement while preserving read context; the restricted viewer unexpectedly creates, and the restored control denies. Atomicity mutant returns201 where the fault case requires500. Original valid8 prepare mutant produces approval_required instead of definition_drift. All restored controls pass; exact export hashes/diffs/raw reports are retained.
- Blocker: `db-candidate` exits1 after588.450s. Native batches1/2 pass in207.194s/139.336s; batch3 reaches the fixed240000ms child limit, ends during create coverage, and emits no batch3 XML. The runner then reports ENOENT for that native report. No native aggregate or full canonical success exists. Budgets240/600/900, batch cutoffs, floors and all cases remain unchanged. A bounded runtime remedy needs parent disposition; this is not permission to raise limits or drop coverage.

## Build → CR → bounded partial Retro

Actual signed404-versus201, serialized200-versus201 and rejected revision9 RED evidence precede the production changes. Final focused create+genuine8→9 execution returns0 across both native files; focused results are not added to canonical totals. Populated recovery and actual packed disabled404/enabled201/replayed201/transition200/current GET passed in `candidate-integration`, whose aggregate remained red because of the separately corrected machine-fixture ordering. Actual retained core packages contain136 inputs,3 dashboard assets and035; their measured manifests/hashes are in `packed-inventory.json`.

The final-byte handoff is **blocked**, not a verified candidate or story closure. Source and evidence freeze/preservation receipts document the exact reviewable bytes and failed budget gate. Earlier failed runs remain historical, including the overlong Unix-socket TMPDIR, positional registry regression and stale current inspection query. The short owned TMPDIR correction changes only the evidence wrapper, not any product/test deadline.

Partial retrospective: preserve historical execution with genuine pinned exports rather than relabelling old8 as9; distinguish a meaningful behavioral mutant from a changed error string; preserve native evidence rather than summing focused passes. The fixed canonical batch already had little headroom, and the additional mandatory coverage now exposes a concrete runtime limit. Parent independent CR and a bounded runtime remedy remain open. Full13.2/Epic13, deployed/human acceptance and all excluded work remain open.

## Parent-admitted snapshot transport remedy — frozen pending canonical receipt

The parent adopted only Bellard report section4 lines119–132, report SHA256 `91a3e0fe2e62e2f8b5a9079fa4e9a89673d30337ea514addb5056440b17e8a2e`. Resume evidence is `allura-13-2-create-evidence/woz-transport-933d912756ab` in the active Troy workspace; its final receipt, not this pre-run paragraph, records the forthcoming canonical result. Prior failures, exports, raw historical snapshots and executable8 provenance remain historical and untouched.

Only the list/create whole-table snapshot helpers and their equality-only callers change transport: fixed table-tagged UNION ALL, full `to_jsonb(t)::text`, SQL ordering, identical arrays of `{row:string}`, empty tables and duplicate multiplicity retained. No filters, limits, row hashes, column selection, JavaScript row reserialization, temporary-table comparator, export batching, parallelism, batch reordering or deadline changes. Comparison positions and explicit interleavings remain. This intentionally changes multiple statement observations to one consistent statement at existing quiescent boundaries; it is **not identical orchestration** and promises no saving. Setup/fetch/reconstruction-and-byte-measure/comparison timings are emitted in bounded test diagnostics, plus create capacity fill and historical export/migration/cleanup spans. The independent packet-required age-upgrade log label is corrected to `revisionNineTracer` only.

Measurement on real populated work/run fixture passed exact old/new arrays and deliberate foreign-workspace content-change/insert/delete detection with restored controls. An additional owned synthetic-schema fixture proved SQL ordering, empty tables and duplicate full-row multiplicity. Native `measure-v4`:2 tests/62 assertions/0 failures. Failed measurement fixture versions are retained: group-wide project-ID uniqueness, missing reviewer admin authority, then missing item timestamps; these were diagnostic-fixture errors, not product regressions or canonical attempts. Verbatim extracted candidate helpers and old-helper provenance accompany every receipt.

Actual small populated-fixture old/new spans were create5.303/5.194ms and list2.514/2.089ms, not a canonical-load speedup claim. The affected list/create diagnostic run passed24 cases/3487 assertions in36.905s native (38.696s including owned lifecycle). Its measured list setup1996.901ms, snapshot fetch103.401ms across30 fetches, comparison0.635ms; create setup2651.023ms, fetch949.481ms across69 fetches, comparison5.096ms. Create operation-capacity fill4393.103ms; historical export418.344ms, migration33.848ms, cleanup142.590ms. Reconstruction/byte measurement adds work (list1.275ms/create6.512ms); the same full scans and bytes remain. No attribution of historical overrun or guaranteed recovery follows these measurements.

The sole full frozen attempt will be unchanged `bun run check:all`, which includes complete units, typecheck, lint and `test:db` in the original order with batch240/DB600/outer900 bounds. It is not replaced by the diagnostic run. If it fails, stop with its concrete raw/native evidence; no lucky reruns or further optimization. Final source freeze follows tracked and untracked whitespace checks. Parent independent review/reproduction, complete local acceptance and all external/story/Epic gates remain open. No stage/commit/ref, external network/MCP/secret, other-profile or skill mutation is authorized. Installed build renderer succeeded once on resume; stale nested-review/status instructions are superseded by the explicit sole-writer scope and current adapter.

## Approved hold disposition — 2026-11-05

Sabir approved the [narrow Bahari Correct Course](../planning-artifacts/sprint-change-proposal-2026-11-05-bahari.md). The retained final receipt at the transport-remedy evidence directory records **BLOCKED_CANONICAL_BATCH3_BUDGET_REMEDY_INSUFFICIENT**, check:all exit 1: DB batch 3 was interrupted at its fixed bound with no native report. Passing unit/typecheck/lint/focused observations are not complete acceptance. The preceding future-tense remedy paragraph is historical and does not imply a pass.

Preserve the checkpointed create code, original failures, exact receipts and historical source witnesses. Do not resume repeated full-suite attempts, remove required coverage, weaken assertions or raise deadlines under this planning approval. Current controller may analyze retained timings read-only and propose one separately bounded verification remedy. No product/test source is changed here, no closure or actual live work status is written. Prioritize independent 4.5 contract/RED preparation; new canonical acceptance remains blocked until a genuine required lane passes. Remaining 13.2/13.3 scope is retained, not discarded or silently completed.

## Verification

Use pinned installed Bun1.3.14/Node24.19.0. Run focused native RED/GREEN, full `bun run test`, `bun run typecheck`, `bun run lint`, `bun run test:db`, then final `bun run check:all`. Every packed/canonical run explicitly sets `ALLURA_TEST_OFFLINE_PACKAGE_CACHE=/home/sabira/.hermes/profiles/troy/cache/scratch/allura-core-dependency-cache`; require offline prepared true/public false. Freeze source/deps/artifacts/native XML, inspect tracked and untracked whitespace before expensive final run, retain all failures/scanner exits, verify exact owned cleanup and unchanged HEAD/index/historical resources. No story/Epic closure or deployment acceptance follows this bounded slice.
