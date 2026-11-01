---
title: '12.3 bounded run limits and recovery witnesses'
type: 'chore'
created: '2026-11-01'
status: 'done'
parent_acceptance: 'Bounded handoff exhaustion/workspace quota evidence only. Parent check:toolchain/check:all exit0; canonical SHA256 2a2638385fb8611858b10bc9cb96f6724e11eec50e4a66895162d7509ae21bfe. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-12-3-limits-parent. Independent bounded review approved; parent runtime reproduced. Source/dependencies preserved,12 containers unchanged,scan0. Retention/journal/run-age and full Epic12 acceptance remain open; no release or human acceptance implied.'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3b1804352eed5cc61ae7af29f29239690d580955'
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/durable-runs-v1.md'
---

<frozen-after-approval reason="parent-adopted tests-only limits packet">

## Intent

**Problem:** The accepted revision-six engine has handoff attempt and workspace lease limits, but lacked complete behavioral witnesses for exhausted handoff recovery and independently authenticated process contention.

**Approach:** Add two native database cases against unchanged current production services and SQL. Observe genuine lease/backoff expiry, immutable evidence, attributable database waiters, exact replay, and scope isolation. This is coverage of existing behavior, not a new definition or executor.

## Boundaries & Constraints

**Always:** Preserve production source, migrations001–030, old specs/evidence, dependencies, common fixture, authentication, runner algorithms, exact native case ownership and fail-closed aggregation. Keep all eight remaining required preflights unchanged under the explicit parent consolidation disposition below (the original frozen packet required nine). Admit the limits file once in canonical batch one, with a separate supported focused development execution, not a tenth duplicated preflight. Keep database600s, batches240s, outer900s unchanged. A measured full database overrun stops this packet for parent orchestration disposition; no lucky rerun, case dropping, or silent budget increase.

**Never:** Revision7 without an observed defect and separate parent disposition; live services, credentials, network/MCP access, staging, commits, refs, deployment, nested agents, other profiles, skills, story or Epic closure. Honor the direct-build STOP before writes and gates. Remaining retained256, journal reservation, run age and definition reachability are distinct later packets.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Handoff crash recovery | Current start → prepare → independent approval, separate resume admission, three abandoned genuine claims | Persist attempts1–3, fences1–3, ten-second leases and backoffs1/2/2; live replay cannot claim; expired-but-not-due recovery conflicts without writes |
| Attempt reset attempt | New operation key before lease expiry, during backoff, after due, and after exhaustion | Cannot reset attempts or journal; original immutable receipts and approval remain byte exact |
| Exhausted handoff | Third lease and due time elapsed, next claim | Terminal/partial/attempts_exhausted; attempts3/fence4; one prepare effect, no handoff link/effect; inspection cannot verify completion |
| Historical workers | Fresh-process resume and advance replay, saved handoff workers | Exact historical receipts, unchanged complete history, all late completion rejected |
| Cross-process quota | Three valid workspace leases, independent prepare and handoff processes queued at real workspace admission lock | Distinct process/backend PIDs, observed waiter/blocker pairs, exactly one fourth claim, loser unavailable with no receipt/attempt/journal mutation; both ordering directions tested |
| Capacity and isolation | Full workspace, independent foreign workspace, then production cancellation of one holder | Foreign workspace claims independently; cancelled holder releases capacity; refused process can retry with its first attempt, total local live leases remains four |

</frozen-after-approval>

## Code Map

- `foundation/tests/run-limits.test.ts`: owns exactly the two new canonical names; scoped synthetic workspaces, service setup, genuine DB expiry and complete history snapshots.
- `foundation/tests/run-process-fixture.ts`: adds only bounded quota prepare/handoff child modes. Each authenticates its signed assertion independently and reports its own process and max-one-connection backend PID before invoking the real restricted claim.
- `foundation/scripts/test-db.ts`: exact required file/case registration, first canonical batch; remove only the duplicate `run-upgrades` preflight under the disposition below. All other preflights, timeouts, batching algorithm and aggregation unchanged.
- `foundation/tests/test-runner.test.ts`: exact54-file/366-case inventory, limits ownership, single upgrade execution and real-subprocess canonical upgrade rejection regressions; preserve existing negative controls.
- `foundation/scripts/test.ts`: register the renamed ownership test and three new upgrade rejection tests only; retain all assertion floors and runner algorithms.
- `foundation/migrations/030-run-inspection.sql`: read-only production reference, including handoff claims283–320; no source changes.

## Tasks & Acceptance

- [x] Add the two named limits cases, preserving all prior cases.
- [x] Add bounded attributable child modes without changing existing modes.
- [x] Register exact native ownership and update dependent inventory assertions.
- [x] Exercise focused behavior and retain initial errors honestly.
- [ ] Parent accepts final frozen canonical evidence and any budget disposition.

Given existing revision-six services, when the focused and complete canonical gates execute, then both new cases must pass under their real native file ownership, with no lost old case and no fabricated RED. Given any production defect or full database budget overrun, when observed, then stop and return precise evidence rather than modifying the engine or retrying for timing luck.

## Implementation Notes

Woz is the sole delegated writer. The parent packet and Scout transcript supplied the approved bounded plan; this spec records that plan, not invented human quotations. Rendered BMAD instructions were read through the local adapter; obsolete runtime pointers use loaded Team RAM guidance, parent-provided continuity replaces forbidden child MCP retrieval, and no nested delegation, staging or status synchronization occurs.

Initial typecheck found missing non-null annotations on indexed snapshot expectations. First behavioral execution passed all exhaustion/late-worker assertions but failed the inspection call because the test omitted required group/workspace selectors; the quota witness passed. Corrected the test selector, not production validation. Extended quota coverage to both actual advisory queue orders, so both prepare and handoff quota guards are exercised as the refused child. The first corrected focused run passed two cases/157 assertions. Subsequent lint found two missing braces in child-output parsing; corrected test-only formatting. Final snapshots additionally cover the pinned definition. These were fixture errors, not feature RED or production defects. No isolated production mutant was needed or installed.

## Verification

Evidence directory: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-limits-evidence` (exclusive local receipts, not an operational board).

- Focused development: the evidence `focused.ts` owns one loopback disposable pinned PostgreSQL container, checks TCP readiness, runs `bun test ./tests/run-limits.test.ts`, and verifies exact owned-container removal. This does not replace canonical coverage.
- `bun run check:toolchain`, `bun run typecheck`, `bun run lint`: corrected static checks pass; retain raw failures separately.
- `bun run test:db`: canonical exact native coverage; enforced600s with batches240s unchanged. Capture the first full-run outcome, all native reports and timings.
- `bun run check:all`: outer900s with independently enforced DB600s, only after no blocking full-run outcome. No additional duplicated limits preflight.
- Freeze candidate hashes before the final gates; compare afterward; preserve source/migration/dependency hashes, exact case totals excluding overlapping preflights, full diff and manifest, scoped secret scan and cleanup receipts. Gate completion and exact totals are recorded externally so this frozen spec does not preclaim a pass.

## Parent disposition: single upgrade-preflight consolidation

The parent explicitly authorized removing only the duplicate `run-upgrades` preflight after Bellard's read-only comparison of the frozen candidate. Preserve the prior receipt at `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-limits-evidence/final-receipt.json` (SHA256 `2d7f2c5ec7d5e2a38fe60c5056a9a191ccdcaaa02fa9688720ab6f7fb8d39464`), including its actual600.009s timeout and incomplete full gate. The new exclusive evidence directory is `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-limits-consolidation-01`.

This is coverage-preserving consolidation, **not an established timing fix**. The parent accepts loss of the upgrade file's dedicated30s whole-file watchdog, single-file process isolation, earlier fail-fast and second execution. Preserve the unchanged five native canonical upgrade cases, genuine pinned source fixtures, real lease and due-time waits, still-valid original worker, cleanup-failure witnesses and per-case15s bounds. Their prior native2609 assertions are the comparison target, not a substitute for new execution. Canonical batch240s, DB600s and outer900s remain unchanged. The other eight preflights retain their original code and bounds. Counts must remain54 canonical files/366 cases without double-counting preflights.

The regression uses the real orchestration and native parser in disposable subprocess fixtures: single upgrade execution; each of five omitted cases; missing file; native skip/failure; zero suite assertions; nonzero exit/signal; malformed and misowned native reports; and forged console coverage must reject before a success aggregate. Rejections are credited only after all eight unrelated preflights finish, never because an unrelated preflight failed. Existing OAuth and runner negative controls remain intact. Named unit registration is the only permitted `scripts/test.ts` change.

Run the supported `test:db` with enforced600s, then `check:all` with outer900s and independent DB600s only if the first full gate passes. Use tracked background execution beyond transport limits; no lucky retry, timeout increase, dropped coverage, parser/batching change or production edit. Actual complete gates, candidate hashes, native counts, preservation and cleanup receipts determine the result; subtracting the old preflight duration from a truncated600s run is not a completed-runtime prediction. Historical revision-one export cleanup debt is explicitly retained; do not claim all source exports were removed.

No independent review, parent acceptance, commit, Epic completion, hosted operation or production readiness is claimed here.
