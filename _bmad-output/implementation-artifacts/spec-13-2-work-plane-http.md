---
title: '13.2 bounded work-plane HTTP and run revision8'
type: feature
created: '2026-11-01'
status: in-progress
baseline_commit: 74dea11bf26721c2ca567d099c4469393fc962f9
route: dispatch
review_loop_iteration: 0
---

<frozen-after-approval reason="parent-adopted complete HTTP implementation packet">

## Intent

Expose existing-item current reads and atomic transitions through the shared authenticated gateway. Preserve opaque IDs, exact microsecond tokens and stored receipt bytes. Reconcile the gateway fingerprint through additive run definition8 without rewriting historical evidence.

## Boundaries & Constraints

Always use the adopted work-plane-compatibility-v1 contract and complete parent packet at `/home/sabira/.hermes/profiles/troy/workspace/allura-13-http-complete-packet.md`. Baseline and genuine7 fixture source are `74dea11bf26721c2ca567d099c4469393fc962f9`. One writer; exact packet allowlist; existing admission/body/response/time and canonical runner budgets remain.

Never add provisioning, list/create/project/lane/evidence/handoff/run-link routes, role expansion, UI, a second gateway, automatic Done, Notion writes or live grants. No external network, secrets, MCP, nested agents, staging, commit, refs or story closure. Only owned synthetic loopback HTTP/DB resources. Preserve migrations001–032, historical pins/receipts and other profiles.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Current read | Enabled exact v1, currently authorized human and mapped item | 200 current work_item | Missing/foreign/inactive map404 |
| Transition | Exact query/body scope, actor, token and key | 200 unchanged stored envelope; one event/receipt | Invalid400; forbidden403; stale/key409 |
| Replay | Same key and exact command after progress | Original accepted bytes; GET differs | Current authority still required |
| Unsupported surface | Disabled or machine-only capability | 404, no fallback | No provisioning |
| Bad ingress | Duplicate decoded keys, malformed UTF8/encoding, unknown selectors | No effects or private disclosure | 400; existing413/414/429 |
| Service failure | Confirmed rollback / uncertain commit / capacity | Redacted outcome only | 500 failed / 503 unknown / 503 capacity |
| Historical runs | Genuine1–7 receipt replay | Stored definition digest, exact receipt, null claims | Current auth; old execution refused |

</frozen-after-approval>

## Code Map

- `foundation/src/gateway.ts`: exact static routing and one counter; add opt-in segment matching, raw body parser hook, scoped admission/disclosure hooks and serialized JSON envelope. Keep default behavior.
- `foundation/src/work-plane-api.ts`: two human routes, strict flat parser and literal header/query/body/actor binding.
- `foundation/src/work-plane.ts`: narrow reusable current-scope work authorization helper; retain accepted transaction semantics.
- `foundation/src/core-api.ts`, `core-config.ts`, `core-server.ts`: disabled-by-default exact-v1 composition.
- `foundation/migrations/031-run-prepare-expiry.sql`: read-only source of nine revision-sensitive functions. Add033 only.
- `foundation/src/run-contract.ts`, `persistence.ts`: literal8, preserve fingerprint inputs and append033.
- New HTTP/contract/upgrade tests and exact registration/security/recovery/current-revision dependencies are limited to the complete packet allowlist.

## Tasks & Acceptance

- [x] Register and observe signed HTTP transition feature RED with restricted DB, successful static control, denied control and template404.
- [x] Implement bounded two-route surface and strict parser, then verify exact first/replay/current bytes.
- [x] Exercise ingress, identity, original binding, current authority, both attributable revocation lock orders, concurrency, faults, capacity, real post-commit HTTP loss and fresh-process reconciliation.
- [x] Add033 and genuine7 upgrade evidence including valid and expired claims, original executors, complete history snapshots and new8 tracer in the same workspace.
- [x] Update exact inventories/current definition fixtures, preserve runtime revisions and all historical evidence.
- [ ] Verify populated restore, full canonical toolchain/unit/typecheck/lint/DB/packing/integrity gates; freeze hashes and cleanup receipts for parent reproduction.

Given synthetic existing mapped work, when an exact signed transition commits, then HTTP returns stored body/status, one event/receipt and six-digit token. Given changed current state, when original authorized command replays, then the original bytes remain unchanged. Given binding/permission loss, when admission/service/disclosure occurs, then original-principal authorization fails closed. Given genuine revision7 history, when033 applies, then migration rewrites no history and cannot execute old claims, while new8 completes its local tracer.

## Implementation Notes

Installed build renderer executed successfully; current adapter maps retired runtime/architecture/schema pointers to adopted context. MCP and nested workers omitted under controlling packet. Parent already supplied continuation approval; no operational status or human acceptance inferred. Initial toolchain verified Bun1.3.14/Node24.19.0; repository clean at accepted baseline and033 free. Admission fingerprints retained outside repository.

## Spec Change Log

## Review Triage Log

Blocked at canonical verification, not frozen/accepted: mandated filename `033-work-plane-http-run8.sql` contains a digit in its slug. Existing production filename matchers in `foundation/src/recovery.ts:18`, `foundation/scripts/pack-core.ts:14`, and `foundation/src/core-release.ts:40` allow only `[a-z-]+`. Recovery and packing discover only32 migrations; packed core initialization fails and populated backup raises `recovery_schema`. All three files are outside the exact packet allowlist and remain untouched. Request a precise extension for their migration-name matchers only (retain three-digit prefix, strict path containment and all integrity checks). No filename substitution, historical migration rewrite, weakened assertion, budget change or runner bypass is permitted. Existing allowed recovery/core-release tests provide real RED; add exact033 package assertions there when extension is approved, then rerun complete frozen gates. Parent review/reproduction remains pending.

## Parent acceptance addendum — bounded HTTP/revision8

Subsequent parent verification supersedes historical pending/blocker entries below and above for this bounded candidate only; those entries remain preserved. Parent explicitly extended scope to exact `033-work-plane-http-run8.sql` alternatives in recovery.ts, pack-core.ts and core-release.ts, without general digit-slug expansion or weakened path/integrity checks. Fixture-only cache-backed installation in core-release.test.ts was separately authorized.

Independent parent evidence: `/home/sabira/.hermes/profiles/troy/workspace/allura-13-2-http-parent-offline-02/`. Toolchain and check:all exit0; check:all 635.229 seconds. Unit:33 files,213 passes,5275 assertions. DB:60 files,403 passes,20331 assertions; zero failures/skips/missing. Batches87/235/81 passed in207.041620834/115.974353663/189.709053013 seconds; DB lifecycle514.331586797 seconds. Retained batch240/DB600/outer900 budgets satisfied. Parent canonical SHA256 `b57c9e767736851ce7a04c5e03b123340cd480ccd63f6e8d8ea1b8d25ce3684b`; execution.json SHA256 `db31bed13a229455a766de827a510883ea6ae71d02e569198db5fba189ebb123`.

Parent XML was not retained (reportPath:null). Counts and exact source-owned case identities are reconciled from retained logs and native-report enforcement in the runner, not reread parent XML or substituted worker XML. Worker frozen receipt SHA256 `f6ee43095ea4be1035b72c588a47ea9e1955471d2ae4ea3d4fbce7d55be6792a`. Pike/Fowler review `deleg_8febfce1` approved; final offline evidence reconciliation `deleg_45ef6c79` approved. No source mismatches across1447 source and14423 dependency entries;12 original containers preserved and owned DB removed. Acceptance edits are metadata-only after frozen verification.

Final parent packed fixture records cleanInstall:true, offlineModelPrepared:true, publicModelPrepared:false and downloadCoverage:false: actual frozen installation from private cache plus real pinned-model preparation/inference, isolated network namespace and fetch denial. This does not prove public/cache-miss downloading. Previous parent run `allura-13-2-http-parent/` accidentally selected download-capable setup; preserved as such and not relabeled offline.

Scanner and wrapper exit1 remain preserved. Both generic-api-key findings at core-release.test.ts48–49 are independently verified model-input SHA256 pins: tokenizer_config.json `9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3`, tokenizer.json `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0`, under model revision751bff37182d3f1213fa05d7196b954e230abad9. Two classified noncredentials, zero unclassified; not a scanner exit0 claim.

Verdict: locally accepted bounded two-route HTTP/revision8 slice. No full13.2/13.3/Epic13 closure, public release, live grants/mapping/cutover, deployment or human acceptance implied.

## Verification

Use installed toolchain PATH. Supported canonical gates: `bun run check:toolchain`, `bun run test:db`, `bun run check:all`; batch240/DB600/outer900 unchanged. Retain actual native logs/counts, failures, diffs, baseline/final per-file hashes, unchanged historical/dependency/index/HEAD receipts and exact owned-resource cleanup in `/home/sabira/.hermes/profiles/troy/workspace/allura-13-2-http-evidence/woz-complete-20261101T103753`. No passing or frozen-candidate claim until every packet acceptance criterion is verified.
