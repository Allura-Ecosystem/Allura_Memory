---
title: '1.1 Review remediation: real required-test runner enforcement'
type: bugfix
created: '2026-10-31'
status: done
route: dispatch
baseline_commit: 3124b6f7b964f56f556392fbd70fb8ba8f5cb57c
review_loop_iteration: 1
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
---

<frozen-after-approval reason="bounded remediation under explicit story-development/review direction">

## Intent

Preserve the required unit lane's fail-closed discovery and per-suite assertion floors while accepting genuine passing Bun cases whose output omits the optional duration. Add durable behavioral coverage of the actual runner rather than relying on source-text inventory assertions. This is Epic1 tooling review remediation, not a new product feature or restart of completed epics.

## Boundaries & Constraints

Always preserve exact required files/case names, positive per-suite floors, all failure/skip/child-exit checks and refusal of selection overrides. Keep pinned runtimes and offline checks. Exercise real execution with disposable synthetic fixture files and distinguish fixture assertions from product tests.

Never weaken discovery to substring/prefix matches, add CLI/environment bypasses, disable canonical tests, change dependencies/migrations/authority/UI/production configuration, download a model implicitly, or mutate live services/data/credentials. No commits/push/deployment by worker. Only one source writer. Contract prose and cold-cache setup documentation are separate follow-ups, not this slice.

## I/O & Edge-Case Matrix

| Scenario | Expected behavior |
|---|---|
| Exact required pass line, with duration or without it | Count the exact case; optional timing cannot turn a pass into missing |
| Missing, renamed, prefix/suffix collision or non-pass line | Required case remains missing; lane fails |
| Second suite passes all names with positive assertions below its own floor | Actual runner exits nonzero and identifies that suite |
| Assertions equal or exceed each floor | Actual runner succeeds only when every other gate also passes |
| Child nonzero, fail, skip, empty file or zero assertions | Nonzero runner exit; never accept partial execution |
| Caller passes selection override | Reject without bypassing required inventory |

</frozen-after-approval>

## Code Map

- `foundation/scripts/test.ts:174–199`: actual sequential subprocess lane and faulty duration-dependent pass-name check. Existing manifest remains authoritative.
- `foundation/src/ci-contract.ts`: independent exact `UNIT_FILES` inventory and receipt aggregation; retain all existing entries.
- `foundation/tests/ci-contract.test.ts`: inventory/source checks supplement but do not replace behavior tests.
- `foundation/tests/test-runner.test.ts`: new registered real-runner regression suite.
- `foundation/src/test-runner.ts`: bounded structured-result reader/enforcement used by the actual script; no detached test-only replica. Do not infer identity by stripping human-readable timing.
- Parent diagnostic `reports/allura-story-review/epic1-runner-diagnostic/` under Troy: actual Bun pass lines without timing; timing-isolated run shows second-suite8 assertions rejected against183 floor and scratch-only removal admitted. These are diagnostics, not canonical acceptance.

## Tasks & Acceptance

- [x] Write the timing regression before production changes; reproduce against unmodified enforcement and retain actual RED. Prefer authentic captured Bun output plus a real process witness; do not add delays to hide the production defect.
- [x] Derive exact names from pinned Bun native JUnit metadata, separate from timing, through the actual runner. Preserve current receipt shape and guards. Use no new dependency or public override.
- [x] Add real-runner below/equal/above-floor cases, including a non-first suite, and negative discovery/skip/failure/override cases. Fixture construction may inspect the manifest, but assertions must execute production enforcement. Avoid recursive invocation of the canonical suite from its own test.
- [x] Demonstrate the new regression detects a scratch-only floor-check mutation; report this as mutation evidence, not a fabricated missing-feature RED for already-correct floor behavior.
- [x] Register every new named case and nonzero measured assertion floor in the actual runner and exact CI inventory. Preserve original required cases/floors.
- [x] Run all five canonical gates on final bytes; inspect output for nonzero children, no skips/missing cases and distinct unit/DB counts. Return hashes, logs, exact changed paths and any unresolved finding.

Given authentic successful test output, the corrected runner accepts absent optional timing without accepting an incomplete or misnamed suite. Given a weakened floor guard in an owned scratch copy, the new behavioral protection fails; the unmodified production guard passes. Given final canonical execution, existing database/browser/recovery behavior and every prior required lane still run.

## Exact Writer Allowlist

This spec (append evidence/status outside frozen block only); `foundation/scripts/test.ts`; `foundation/src/ci-contract.ts`; `foundation/tests/ci-contract.test.ts`; new `foundation/tests/test-runner.test.ts`; optional new `foundation/src/test-runner.ts`. No other repository writes. Request an exact narrow extension if a genuine dependency requires it; never relax a gate to avoid it.

## Implementation Notes

Parent adopted ordinary local engineering details under the user's continuous dev/review/fix direction. No unresolved product choice, live mutation or irreversible change. Separate independent final-byte review and parent canonical rerun remain required after worker delivery. All product human/deployed/installed-client gates remain open. Historical foundation acceptance is retained separately from the expanded current suite.

## Spec Change Log

### Review loop 1 — unambiguous native results, frozen intent unchanged

All four independent layers returned against diff c81302a1adfa9c76e56502bbde3e72509ac5328072a21b20d52214d07cf0e5be. Group1 (BH1/VG2/EH1/EH2/AA1) is medium/bad_spec: the first implementation plan did not distinguish a numeric suffix in a legal case name from console timing. Group2 (VG1) is medium/bad_spec: the deterministic test stopped at the helper instead of proving the actual caller. No product-intent decision is missing; the frozen exact-identity requirement already settles the expected behavior. This is the first loopback, not scope expansion or acceptance rewriting.

KEEP: the real pre-fix timing RED, real floor-guard mutation discrimination, every original28 suite/case/floor, independent CI inventory equality, all11 added negative/positive behaviors and fixture cleanup, all five canonical gates and original service/database preservation. The full rejected candidate and positive tests are preserved at Troy reports/allura-story-review/runner-remediation-parent/reviewed-iteration-0-source/. Restore/reuse the positive tests, not the ambiguous console parser; maintain or strengthen their meaningful assertions. The loop0 production delta was reverted only after verifying and preserving its exact hashes. All tracked source now matches baseline3124b6f7; the spec is the sole untracked input. An intermediate restore wrapper omitted trailing newlines; this was detected by Git and corrected with byte-preserving JSON transport before verified restoration. No committed product work was reverted.

Revised implementation plan: use Bun1.3.14 native `--reporter=junit --reporter-outfile=<unique-owned-path>` per child. Parent's actual reporter witness at reports/allura-story-review/runner-junit-diagnostic/ proves exact names, XML entity encoding, counts, skip and failure metadata. `--only-failures` was also exercised: all five case identities remain in JUnit while human pass lines are absent. Use that native flag in the actual child invocation and assert its absence of human pass lines in the real-process positive regression. This makes any restored console-name dependency fail deterministically without delays, retries, mock execution or a production bypass. Keep captured untimed-output provenance as supplementary evidence, not the sole caller proof.

Read each newly created report before cleanup; bound report size, validate the supported native structure and exact requested file/case identity, and fail closed on missing, malformed/truncated, ambiguous, conflicting or unexpected report data. Preserve numeric suffixes and decode XML names exactly once; reject external entities/DTD and unsupported malformed encoding. Count only actual passed cases, with child exit/fail/skip/assertion-floor checks still enforced. No console fallback may decide identity. Keep the existing strict stdout receipt consumed by CI. Temporary files belong under the environment's task scratch and must be removed in finally. No new dependency, runtime requirement, CLI/environment selection override or service/network change.

Woz re-enters the actual installed BMAD step03 with sequential RED→GREEN. First retain a failing exact-name/caller regression against the rejected iteration0 execution in an isolated copy; then rederive production from baseline using preserved positive tests. Add deterministic timing-suffix and XML-special-character cases through the actual runner plus report-failure cases, register every new case with a measured nonzero floor, and demonstrate both floor-guard and console-identity regressions are caught in scratch mutations. Run all five canonical gates on final bytes and return exact evidence. Parent performs independent review, verification and commit; no story closure by worker.

## Review Triage Log

- Verification-gap finding: actual runner rejects under-floor results but lacks durable regression; patch.
- Parent diagnostic: legitimate zero-duration Bun passes omit timing, yet current exact check requires ` [`; patch without loosening exact case identity.
- Initial review inventory correction:11 candidate files,6 changed diff files; fourth auditor separately inspected5 unchanged files. No broader coverage inferred.
- Loop1 BH1 — medium: the actual helper maps an untimed legal timing-suffixed case to a different required name. Native Bun witnesses establish legal names and optional timing; this is a demonstrated parser ambiguity, not yet a full-process bypass receipt. Group1/bad_spec.
- Loop1 VG1 — medium: deterministic captured input exercises only the helper; a restored duration-dependent caller could pass on all-timed execution. Actual caller-boundary protection is required. Group2/bad_spec.
- Loop1 VG2 — medium: independent verification-layer report confirms the same numeric terminal-suffix ambiguity and missing collision coverage. Group1/bad_spec; separate attribution retained.
- Loop1 EH1 — medium: exact renamed numeric-suffix trigger reaches the parser and can be misclassified when no separate duration is present. Group1/bad_spec.
- Loop1 EH2 claim check — medium: the resulting exact-name guarantee conflicts with the observed parser mapping and frozen suffix-rejection constraint. Group1/bad_spec; not separately counted as another root cause.
- Loop1 AA1 — medium: the same identity ambiguity violates exact-name and suffix-collision criteria despite all five canonical gates passing. Other matrix evidence was supported, but not closure. Group1/bad_spec.

### Iteration1 final-byte reviews — individually adjudicated after all four returned

- I1-BH1 — low / patch: the malformed-report fixture hardcoded second-suite totals8/183. Parent reproduced the actual existing registered test failing after a disposable manifest expansion to9cases/184assertions, despite all real child reports being valid. Derive corruption targets from the fixture manifest and reject no-op fault injection. This is a test-maintenance defect, not a current production discovery bypass. Evidence: `runner-iteration1-review-fixes/manifest-growth-red.{json,log}` under Troy reports/allura-story-review.
- I1-EH1 — low / rejected under the installed rare-low-complexity rule: a deliberately supplied FIFO can block the exported reader before fstat. Parent's bounded2-second isolated-helper probe confirmed that conditional behavior and killed/cleaned the probe. The actual caller instead allocates a new private mkdtemp directory and lets pinned Bun write its fresh report; no supported producer or ordinary path to a FIFO was identified. This tooling does not sandbox arbitrary same-user test processes, which can already hang the child itself. The proposed nonblocking/no-follow filesystem policy and FIFO-specific fixtures would add guards/platform handling for an unsupported object rather than correct ordinary native-report decoding. Do not claim FIFO-safe handling or a demonstrated end-to-end native-runner exploit. Exact diagnostic and limits: `runner-iteration1-review-fixes/fifo-helper-diagnostic.json`.
- I1-VG1 — medium / patch: the existing foreign-file fixture corrupts both suite and testcase identity, so it cannot independently protect the testcase check. Accept the verification layer's source/search evidence; add a testcase-only foreign-file mutation to the existing registered structure test. Parent then demonstrated that removing only `entry.attrs.file === file` makes this real-runner regression fail at its intended exit assertion; normal source passes. This is added coverage for an existing correct guard, not a fabricated missing-feature RED.
- I1-AA — no finding: the Acceptance Auditor supported the bounded criteria and verified exact source/registration/receipts, while explicitly withholding overall review, human/client/hosted acceptance and closure. This does not cancel the separately supported test issues above.

The two retained findings have separate roots and both route to patch: direct test corrections with no public surface or production permission change. No intent/spec-plan loopback or review_loop_iteration increment is needed. The completed native Woz cannot be resumed through the active-child-only steer interface; the installed step04 fallback permits the parent to apply these patches as the sole writer. Original production report reader, all28 prior manifest tuples and all17 registered regression names are preserved. Measured regression floor rises916→929, never decreases. No new dependency, runtime command or platform requirement was added.

Parent patch evidence: the exact disposable9case/184floor expansion is GREEN after deriving corruption totals; testcase-only guard removal is RED with expected nonzero test exit; focused final source passes17tests/929assertions. Report no-op detection remains test-only and aborts malformed fixture construction rather than providing another product bypass. Logs and hashes: `runner-iteration1-review-fixes/`. Final canonical rerun, corrected-byte scans and independent patch review remain required; these focused receipts do not close acceptance.

## Verification

From `foundation`, prepend the installed Bun1.3.14 and Node24.19.0 toolchain paths. Run focused RED/GREEN/mutation evidence, then `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:db`. Use existing disposable DB harness only, no selection overrides. Check final owned diff including new files, exact original-file preservation, no surviving owned test containers and unchanged unrelated source. Parent owns secret scan, review, governance and any local commit. Worker must not claim acceptance closure.

## Woz implementation evidence — local verification, review still open

Implementation followed the installed rendered `bmad-build` step03 handoff. The absent `.agents/TEAM-RAM-RUNTIME.md` maps only to `guidelines/ALLURA-BMAD.md` plus loaded Team RAM guidance. No nested workers, acceptance closure, staging, commit, remote write or legacy Brain outcome was performed. The frozen block, baseline and in-progress status are retained.

Local evidence directory: `/home/sabira/.hermes/profiles/troy/reports/allura-story-review/runner-remediation-woz/`. Disposable diagnostics used Troy's profile scratch, never the system temporary directory. The pinned toolchain prefix was `/home/sabira/.local/share/allura-toolchain/bun-linux-x64-baseline:/home/sabira/.local/share/allura-toolchain/node-v24.19.0-linux-x64/bin`.

Completed implementation tasks (append-only evidence; parent retains final checklist/review authority):

- [x] Timing behavioral RED before production edits: `02-timing-red-child-witness.log`, exit1, proves the unchanged runner rejected a real Bun child with9 passes,259 assertions, zero failures and child exit0 because three authentic pass lines omitted timing. Initial shorter RED remains in `01-timing-red.log`.
- [x] Minimal used parser: `foundation/src/test-runner.ts` extracts whole pass-line names with optional numeric timing; `foundation/scripts/test.ts` consumes the resulting exact-name set. Existing execution/failure/skip/assertion-floor guards are unchanged. Immediate GREEN: `03-timing-green.log`,1 test/115 assertions.
- [x] Complete matrix: `foundation/tests/test-runner.test.ts` contains11 named cases, including deterministic captured timed/untimed lines, real runner exact/above floors, positive under-floor second suite despite surplus first-suite assertions, missing files/cases, renamed/prefix/suffix cases, extra skip/failure, nonzero child exit after all names pass, empty files, zero assertions and caller selection overrides. Fixture tests copy the actual runner/helper and generate disposable synthetic tests for every manifest entry, including this suite, so they never recurse into canonical product tests. Fixture counts are not product-test receipts.
- [x] Scratch-only mutation: `09-floor-mutation-verified.log` / `.json`, exit1 as expected. Removing only ` || assertions < minAssertions` makes the actual runner accept the second suite's182 assertions against its183 floor; the new regression fails. The production runner remained unchanged. This is mutation evidence for an already-correct guard, not missing-feature RED.
- [x] Registration RED→GREEN: `05-registration-red.log` fails because CI lacks the new inventory entry; `06-registered-focused-green.log` passes16 tests/412 assertions after registration. Original required cases/floors remain intact; the new11-case suite has measured floor323 and is in both actual runner and independent exact CI inventory.
- [x] All five canonical gates passed on final source bytes: `10-check-toolchain`, `11-typecheck`, `12-lint`, `13-canonical-unit`, `15-canonical-db` logs and JSON receipts. Unit:29 suites,155 tests,2562 assertions, zero fail/skip/missing and every child exit0. Canonical DB:280 tests across43 files,3804 assertions, zero fail/skip/missing and exit0; its additional OAuth preflight passed40 tests/502 assertions and client-authority preflight passed12/160. These overlapping preflights are not added to the canonical DB count. Real browser, offline inference, recovery and packed-consumer/core paths ran.

The DB harness verified removal of `allura-direct-test-880ef176-5a47-4591-ac08-57093bfaa932`; label-filtered Docker inventories before and after are empty (`14-containers-before` and `16-containers-after`). `preservation-and-hashes.json` records final SHA256s, unchanged unrelated admission hashes, original-byte recovery after reversing only owned additions, frozen-block preservation and whitespace checks including new files; `candidate.diff` includes untracked files without staging.

Retained diagnostic limitations: the first mutation-report wrapper incorrectly expected Bun to print `Received: 0` for a negated matcher; Bun instead prints `Expected: not 0`. The actual mutation failure is preserved in `07-floor-mutation.log` and the corrected wrapper passes in `09-mutation-wrapper`. An initial new-file diff wrapper incorrectly required exit0 from `git diff --no-index --check`; exit1 with empty diagnostics means a differing new file, not a whitespace violation. That wrapper failure remains in `17-diff-wrapper-diagnostic.log`; the corrected check requires both the expected diff exit and empty diagnostics. Neither diagnostic changed product expectations or weakened runner gates.

Unperformed: independent final-byte review/retrospective, parent canonical rerun, parent secret scan/governance, commit/push/deployment, credentials/profile/live data changes, model downloads and product human/deployed/installed-client acceptance. These remain outside worker completion and are not claimed satisfied.

## Parent bounded remediation completion — local engineering only

Actual installed BMAD development, all four independent review layers, individual triage, direct patches and final independent Pike/Fowler review are complete for this bounded runner repair. Final native review batch deleg_d7839275 returned two APPROVE verdicts with no high/medium blockers on diff2cddda9c3bb5727b6a8bdab5d07c7d53fd6259b59245b9e4c3b9c89b1647cf40. Both independently verified all1383 snapshot hashes, original28 ordered manifest tuples,17 regression names, actual-caller mutation evidence and the narrow FIFO disposition. FIFO safety and sandboxing arbitrary same-user test code remain expressly unclaimed.

Parent independently reran check:toolchain, typecheck, lint, test and test:db on the final executable source; all exit0.29unit suites161tests/3174assertions plus canonical DB280tests/3804assertions =441tests/6978assertions, no failures/skips/missing cases and all floors satisfied.17runner regressions contribute929assertions. Overlapping preflights are not added. Actual local browser/recovery/package lanes ran; all1383 snapshot hashes remained unchanged across tests,1377 unrelated original files and12 original containers were preserved, and the disposable test DB was removed. Exact six-file secret/whitespace scans passed. Evidence: Troy reports/allura-story-review/runner-remediation-parent-iteration1-final/.

Fowler noted weaker retained-source provenance for the earlier growth GREEN. Parent reran that exact9case/184floor fixture and retained its full three-file source, before/after hashes, explicit original/expanded manifests and successful real-process log in runner-iteration1-review-fixes/manifest-growth-green-retained.{json,log} and manifest-growth-green-retained-fixture/. It passes1focused test/221assertions; these synthetic assertions are not added to product totals. Canonical source did not change.

This final edit changes only completion metadata/evidence, not executable source or frozen intent. The local commit remains subject to the actual proposed-action governance check and exact staged hashes/scans. This spec's done status is only the bounded tooling remediation, not Epic1 or project acceptance. Pending contract/prerequisite/historical-evidence reconciliation and the Epic1 retrospective remain; external6.5/9.4, real-client, hosted and authorized human acceptance remain open. No push/deployment/live access mutation or legacy outcome write. Outcome persistence is intentionally unperformed under the existing promotion-policy hold.

## Woz review-loop 1 evidence — source handoff, not acceptance

This section supersedes loop0 implementation claims above, which remain historical receipts for the rejected candidate. Re-entered the installed renderer exactly once from `/home/sabira`; it returned `_bmad/render/bmad-build/allura-memory-beta-local-23f1eb6ffe12/d2b8a19bcd1eb738c378/workflow.md`. Read that workflow and its full step03 implementation handoff, this full spec and its context. The missing Team RAM runtime maps only to the adapter plus loaded Team RAM guidance. Loaded TDD and real-enforcement evidence guidance. No nested agents, staging, commit, operational status update, Brain access/write, configuration change or live-service mutation occurred.

Evidence root: `/home/sabira/.hermes/profiles/troy/reports/allura-story-review/runner-remediation-woz-iteration1/`. Commands, exit codes and log hashes are paired `.json`/`.log` files. All test commands used the previously recorded pinned toolchain prefix and profile scratch.

- Sequential RED/GREEN: `01-rejected-caller-red` demonstrates the rejected loop0 caller failing despite a real successful child when its invocation uses native `--only-failures`; `02-rejected-numeric-identity-red` separately reproduces the rejected parser's numeric-suffix ambiguity. These are isolated-copy regressions, not claims that loop0 had an installed native-report fix. `03-baseline-caller-red` then fails against the untouched baseline caller before production edits; `04-caller-green` passes after native report integration. The original authentic untimed-output RED and loop0 positive sources remain untouched in their original evidence directories.
- `foundation/scripts/test.ts` now invokes pinned Bun with `--only-failures`, native JUnit and a fresh owned report path. `foundation/src/test-runner.ts` reads a bounded one-MiB report, validates the supported flat native structure, exact file identity, duplicate identities, metadata totals and passed/failed/skipped outcomes. It decodes the native named XML entities once; unsupported XML forms, malformed UTF-8, DTD/external entities and malformed/conflicting reports fail closed. The normal stdout receipt shape, all original floors and all child-exit/fail/skip/missing-case guards remain. Reports are removed in finally; no console text decides identity or assertion totals.
- Preserved all11 loop0 behaviors, replacing the detached console-parser test with real-process captured-console spoof rejection. Added numeric-suffix/XML-special identity, malformed/ambiguous/conflicting reports, malformed encoding, byte ceiling, actual required skip/fail/duplicate identities and non-XML-whitespace coverage. `07/08-structure`, `09/10-encoding`, `11/12-size`, and `16/17-xml-whitespace` retain each sequential RED then GREEN. `05-preserved-matrix-diagnostic` caught a missing empty-child receipt; fixed without changing that test's expected receipt, then `06-preserved-matrix-green` passed.
- Registration RED/GREEN is `14-registration-red` and `15-registration-green`. All17 named regression cases are registered in the real lane and independent exact CI inventory, with measured assertion floor916 (`18-measured-suite` and final canonical output). All six frozen matrix rows run through the actual subprocess caller; synthetic fixture children never recurse into product suites and their assertions are not aggregated as product results.
- `21-floor-mutation` and `22-console-mutation` both exit1 as required. Removing only the floor guard admits the second fixture suite's182 assertions against183, causing its regression to fail. Restoring duration-dependent console identity makes the positive caller regression fail on runner exit1 despite child9/259/exit0 and no human pass lines. The first console-mutation witness (`20-console-mutation`) failed earlier because a thrown-error source excerpt contained `(pass)`; the assertion now checks actual line-anchored human pass output, and the rerun reaches the intended exit assertion. That diagnostic and the failed wrapper output were retained rather than overwritten.
- All five canonical gates passed on the final source bytes: `23-check-toolchain`, `24-typecheck`, `25-lint`, `26-canonical-unit`, `28-canonical-db`. Unit:29 suites,161 tests,3161 assertions, zero failures/skips/missing cases, every child exit0. The runner regression suite contributes17 tests/916 assertions to that unit total. Canonical database:280 tests across43 files,3804 assertions, zero failures/skips/missing cases and exit0. Additional overlapping OAuth40/502 and client-authority12/160 preflights are reported separately, not added to the DB total. The unchanged browser, offline inference, recovery, packaged-consumer and core lanes ran.
- The harness verified removal of `allura-direct-test-a368754e-7da7-4515-9653-4794f5563e7b`; `27-containers-before` and `29-containers-after` are both empty. Every fixture run checks its report scratch directory is empty on success or failure, and fixture roots are removed in finally.

`preservation-and-hashes.json` and `candidate.diff` record the exact six allowed changed paths, final hashes and complete unstaged/untracked diff. All1380 original tracked files were checked: only the three allowed tracked tooling files changed, and all1377 other original files match admission hashes. Original28 suites retain their exact ordered file/case/floor tuples, every original CI entry remains, and the frozen intent hash remains `7531edfb7b2376d1915a949085c623c62776a515517bc8d73587a343c4809788`. No dependency extension was needed. Whitespace checks include all new files. Parent retains independent final-byte review, canonical rerun, secret scan/governance and any authorized commit. In-progress status and acceptance checklist remain unclosed.
