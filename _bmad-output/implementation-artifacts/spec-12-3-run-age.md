---
title: '12.3 independent run-age deferred preparation witness'
type: 'chore'
status: 'done'
route: 'dispatch'
baseline_commit: '2741aea93b27c29b12822070f448cb8610a4f9be'
parent_acceptance: 'Bounded revision7 run-age and package repair accepted locally. Parent final check:toolchain/check:all exit0; canonical SHA256 8bb21fe68b7af95412d15dcaa3181a94aee0e286eb336b8d9736a0589d22da5f. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-12-3-run-age-parent. Source/dependencies preserved,12 containers unchanged,scan0. Pike/Fowler bounded reviews approved; parent independently reproduced. Accelerated expiry is not naturally elapsed24h. Epic reconciliation and historical export cleanup debt remain separate; no external acceptance implied.'
---

# Additive031 repair — local verification candidate

The historical RED below is preserved, not superseded as evidence. Parent approved the exact additive revision7 packet under ordinary engineering authority. This candidate adds only `031-run-prepare-expiry.sql`, literal7/source fingerprint changes in `run-contract.ts`, and migration registration in `persistence.ts`. Accepted001–030, executor, API, authority and inspection implementations remain untouched. No commit, closure or external acceptance follows.

## Repair contract and witnesses

- Migration031 explicitly replaces nine functions: `validate_run_start`, `start_run`, `claim_run_prepare`, `finish_run_prepare`, `decide_run`, `handoff_approval`, `resume_run`, `claim_run_handoff`, `cancel_run`. New work requires7; historical1–6 reconcile exact stored receipts under current authority without claims or effects. Current independent cancellation/inspection remain available after original participant revocation.
- Preparation drains `SET CONSTRAINTS ALL IMMEDIATE` after successful/failed measurement writes and before the final age/original-lease/2second guard. Early age checks, original `began`, lease, fences, authorization, journal bounds and rollback remain unchanged.
- Actual7 parser/service-admission RED:3pass/2fail/119assertions (`revision-seven-red.*`). First repaired deferred witness and parser suite:5pass/0fail/192assertions (`deferred-green.*`). The guarded query is now the exact outer `SELECT allura.finish_run_prepare(...)`, not standalone SET CONSTRAINTS; exact deferred trigger, advisory waiter/blocker, valid entry, real DB expiry, live original lease and <2000ms remain mandatory.
- Four independently registered age cases cover fresh expired claim→deadline, finish entered expired with a valid lease→unchanged rollback, and nondeferred/deferred valid-entry→expiry barriers. Each retains normal24hour controls, foreign ten-table evidence, semantic isolation and exact fixture cleanup. The INSERT-time timestamp fixture is accelerated historical admission, **not naturally elapsed24hours**; the incoming24hour assertion and stored24hour CHECK remain enforced, with no clock override or immutable-row rewrite.
- `run-age-upgrade.test.ts` verifies a genuine source export at `2741aea93b27c29b12822070f448cb8610a4f9be` (revision6). Migration alone preserves all ten tables; original start/advance/decision/resume/cancel receipts, changed-request and revoked denials, old NULL claims after actual lease/due expiry, original executors with leases valid before/after, complete historical success with drift, current7 full tracer in the same workspace, and independent cancel/inspect after revocation are exercised. Earlier1–5 pins remain intact. Exact export/database cleanup is asserted. Focused age/upgrade result:5pass/0fail/1410assertions.
- Isolated copied-source final-age mutant removes **only** `clock_timestamp()>=r.expires_at` from the final preparation guard. Normal controls still commit and early-expiry cases still pass. Deferred and nondeferred expired barriers both incorrectly commit and fail their conflict expectations (2pass/2fail/234assertions). Original control and restored copy both pass4/0/236. All copies/owned containers removed; canonical source unchanged. Full raw native evidence is retained.
- Canonical registry appends age after retention, then age-upgrade, in batch3:57files/374cases; partitions11/86,31/235,15/53. Exact native omission/file/skip/failure/zero-assertion/exit/signal/malformed/misowned-report controls are registered in the unit runner. No duplicate preflight or runner algorithm/budget/dependency changes.

Evidence root: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-run-age-repair-01`. `receipt.json` is the authoritative final frozen-source/gate disposition; focused results above do not imply canonical success. Raw prior RED/failures remain immutable in the original evidence directory. Native suite totals exclude overlapping focused checks and mutants. Full canonical `test:db` and `check:all` retain batch240s/DB600s/outer900s, statement5000ms/lock2000ms/execution2000ms/lease10000ms. Any budget failure is a blocker, not permission for a lucky rerun.

## Historical bounded outcome: production expiry defect reproduced

The first required case, `run age expiry during deferred preparation constraints cannot commit expired effects`, fails against unchanged production 001–030 and the current executor. No production repair, revision7, commit, story/epic closure or remaining run-age cases were attempted.

## Scope and fixture

- New `foundation/tests/run-age.test.ts`; one exact case appended after retention in `foundation/scripts/test-db.ts`, without selectors, duplicate preflights or runner algorithm changes.
- Real signed fixture identities and restricted `allura_app` connections drive unchanged `startRun`, `scopedTransaction`/`claim_run_prepare`, and `finishPreparation`.
- Owner-installed `BEFORE INSERT` trigger affects only one exact synthetic workspace. It asserts the incoming production interval is24hours, then sets `expires_at = original created_at +1500ms` and `created_at = expires_at -24hours`. The exact schema CHECK remains enforced. Production admission/receipt time is not rewritten. This is accelerated insertion-time historical timestamp evidence, **not naturally elapsed24hours**.
- The normal control is admitted while that trigger is installed but outside its scoped workspace; it retains ordinary24hour timestamps.
- The deferred `AFTER INSERT` constraint trigger on the exact run's effect receipt compares real database time with the exact immutable expiry read by the owner fixture, then waits on an advisory lock. It grants no table access, changes no production function, and neither overrides a clock nor alters stored immutable rows. The barrier is observed at `SET CONSTRAINTS ALL IMMEDIATE` using distinct waiter/blocker PIDs.
- There is no preexisting approval request/decision before preparation. Approval TTL cannot mask the tested run-age boundary.

## Actual result

Evidence root: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-run-age-evidence`.

`production-probe.json`, `.stdout.log`, `.stderr.log`, `.xml`, and `production-probe-freeze.json` preserve the command, raw native result, complete ten-table before/after snapshots, timing and candidate hashes. Native Bun result: **0pass,1fail,67assertions**, test exit1; wrapper completed cleanup and exited0. `check:toolchain` exited0.

| Witness | Observed result |
|---|---|
| Normal24hour control | Deferred waiter107/blocker108; ordinary admission/expiry interval; committed in1547.426422ms while valid; one prepare effect and approval request, paused_approval. |
| Accelerated preparation | Deferred waiter109/blocker110 observed while age/lease valid. Run `48501b23-9ca8-424a-9260-6e350ad197e9`. |
| Real expiry before release | Expiry `2026-11-01 11:45:04.337791+00`; observed release `2026-11-01 11:45:04.344125+00`; `age_valid=false`, `lease_valid=true`. |
| Real completion | Service returned `committed` in1462.534762ms, below2000ms. Post-settlement DB read `11:45:04.357896+00` confirms expired with original lease still valid until`11:45:12.869079+00`. |
| Incorrect durable change | `run_state`, `run_steps`, `run_journal`, `run_effect_receipts`, `run_approval_requests` changed. Expected `conflict`/complete rollback; actual committed prepare effect and approval checkpoint. |
| Isolation/cleanup | Foreign workspace ten-table snapshot, original foreign start receipt and semantic snapshots preserved. Both exact trigger/functions removed; all preexisting Allura function and noninternal trigger definitions/enabled states compare equal. Exact owned container removed and absence read back. |

Root boundary: `foundation/migrations/030-run-inspection.sql:226` checks age/lease/time before returning. `foundation/src/run-execution.ts:32–35` then drains deferred constraints and checks only the AbortSignal, not run age. The genuine deferred barrier crosses age expiry after the SQL guard but before transaction commit, inside the live lease and service budget.

## Preserved fixture failures (not production RED)

1. `first-probe.*`: erroneous fixture reference to operation receipt `created_at`; actual column is`accepted_at`. Failed before execution barrier, cleaned up.
2. `corrected-probe.*`: barrier not observed; insufficient first diagnostics, cleaned up.
3. `barrier-diagnostic.*`: same failure traced to `permission denied for table run_records` inside deferred trigger under the restricted caller. Replaced only the fixture read with its already owner-observed immutable expiry literal; no grant/security-definer widening. Cleaned up.
4. `production-probe.*`: successful normal control and attributable accelerated production failure above. All failures remain retained; none count as passing acceptance.

## Stop disposition and remaining work

- Parent must decide the technical repair scope. Do not rewrite accepted030 or silently introduce a new definition in this tests-only packet.
- The other three proposed independent run-age cases and guard mutant/restored pair are **unperformed** because this first real defect blocks continuation. No mutant was installed.
- The partial registry is now56files/370cases, not the proposed complete56/373. Existing runner exact-count/end-placement tests still reflect the accepted55/369 baseline; their updates and named negative-control registration were deliberately not built after the defect. Full `test:db`, `check:all`, typecheck/lint and parent final acceptance were not run for this blocked candidate.
- No claim of naturally elapsed24hours, HTTP/platform/deployment acceptance, completed Epic12 or all14 completion.
- Definition retention16 remains a structural disposition: supported literal revisions1–6 are tighter than16; no fabricated16th/17th revision test. Revision1 export cleanup debt remains separate and unchanged.
- Evidence `receipt.json` binds final candidate paths/hashes, baseline hashes, preserved dependencies/containers and raw evidence artifact hashes. This document records local evidence, not operational work status.

## Approved bounded package repair disposition

Parent approved the finite160 input cap and duplicate-aware, fixed-two-level manifest parser under the existing all14 local-engineering authority. The otherwise frozen25-file revision7 age candidate is preserved, except this append-only disposition and the additive named unit registration. Additional changes are confined to `src/core-release.ts`, `scripts/pack-core.ts`, new `tests/core-release-integrity.test.ts`, `src/ci-contract.ts`, `tests/ci-contract.test.ts`, and `core-package/README.md` inside `foundation`. No new shipped module or duplicated producer limits were introduced. The producer now invokes the actual consumer verifier on its completed stage before archive/receipt emission.

Observed package RED→GREEN evidence lives exclusively in `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-run-age-package-repair-01`: valid129 filesystem package rejected by128; duplicate manifest and extra-envelope accepted by the old parser; overlimit source export incorrectly archived by the old producer; missing new suite rejected by CI inventory. Raw native RED and GREEN logs/reports are retained. The adversarial suite has10 named cases and264 observed assertions, enforced at that floor, covering literal128/129/160 acceptance and161 denial,65536/65537 manifest bytes with legal whitespace,2MiB/+1,32/33 assets, exact required/hash/path/file controls, decoded duplicate keys, exact envelope shape, actual pack/embedded consumer and preartifact producer rejection. Errors assert only `core_release_integrity`, with no synthetic private-marker echoes.

The deliberately expanded theoretical hashing ceiling is320MiB instead of256MiB. Manifest reads still precede the size check and intermediate symlink/TOCTOU protection remains limited; no broad resource-isolation or future13/14-fit claim is made. Above128 inputs require a complete rebuilt package: old embedded verifiers are incompatible, not hot-patch targets. `runDefinition()` explicitly hashes only its existing coordination/API/executor/migration bundle, excluding these package files; revision7 and those bundle bytes remain unchanged. No revision8 is warranted.

The new evidence directory's `receipt.json` owns the final merged-candidate hash freeze, canonical gate disposition, native counts, package hashes, full diff, preservation/cleanup and scan results. Canonical toolchain, `test:db` and `check:all` retain independently timed batch240s/DB600s/outer900s budgets, with tracked background execution beyond the transport ceiling. Final totals count unit and DB once, not focused preflights or the repeated DB gate. Existing actual age RED, current7 GREEN, genuine revision6 export/upgrade, deferred-age and single-final-guard mutant/restored evidence remain immutable in the prior directories and are bound by preservation hashes. Their final canonical coverage is required, not inferred from focused passes. Parent reproduction/review follows a verified frozen result; no commit, closure, live status, hosted/deployed or human acceptance is claimed here.
