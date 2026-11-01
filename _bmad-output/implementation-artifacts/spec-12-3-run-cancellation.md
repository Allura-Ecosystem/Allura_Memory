---
title: '12.3 durable run cancellation'
type: 'feature'
created: '2026-11-01'
status: 'done'
parent_acceptance: 'Bounded cancellation only, not Story12.3/Epic12 closure. Parent final check:toolchain/check:all exit0; canonical SHA256 dc08ecc446eeb14a8ad2b7293cbd8302206364ead99af0afd599c7ecc2596de4. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-12-3-cancel-repair-parent. Source/dependencies preserved,12 original containers unchanged,scan0. Pike security review approved; Fowler F1 re-review approved genuine4 post-stop replay. Reviews are source/log inspection; parent performed runtime reproduction. No deployment or actual-human acceptance implied.'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b4d6a908d8572ee3cdcbfc2e9d8ab97c744e9462'
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/durable-runs-v1.md'
---

<frozen-after-approval reason="parent-adopted Scout cancellation packet and bounded implementation authority">

## Intent

**Problem:** Durable preparation and handoff lack an authorized stop boundary.

**Approach:** A current scoped human administrator atomically cancels a supported nonterminal run, preserving immutable effects and receipts while fencing every outstanding worker. Historical reconciliation never authorizes new execution.

## Boundaries & Constraints

**Always:** New admissions use source-pinned literal revision5. Historical1–4 retain original stored digests and receipts under appropriate current authority. Preserve001–028, old rows, specs and evidence. Cancellation is independent of installed handler digest and original participant authority. Current canceller authority precedes exact replay; shared scoped actor/key namespace and admission lock bind the strict command envelope. One transaction increments revision once, all three fences once, sets cancel_requested, clears leases/invocations/due times and preserves completed steps. Known zero local committed effects means failed/cancelled; preparation means partial/cancelled. No timeout infers absence. Preserve STOP and all existing product/SQL/suite bounds.

**Never:** Terminal-success rewrite, resurrection, arbitrary executor, semantic/work-item effect, gateway/auth/executor/common-fixture rewrite, dependencies/vendor changes, runner algorithm changes, stage/commit/refs, nested agents, remote MCP/network/credentials/production/other profiles, or story/epic closure.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected behavior | Error |
|---|---|---|---|
| Stop | Current independent scoped admin; nonterminal | Immutable cancel receipt, terminal failed or partial, all fences advanced | None |
| Replay | Same actor/key/envelope | Original receipt after current canceller auth, no mutation | Changed envelope conflicts |
| Lost participants | Owner/reviewer revoked | Independent current admin can still stop | Revoked canceller denies |
| Race | Cancel versus prepare/handoff finish | Lock order preserves committed truth and fences late workers | Terminal success conflicts unchanged |
| Historical | Genuine pinned4 paused/approved/completed/admitted/live claims | Exact receipt replay; old4 claim returns NULL unchanged, no old finish | No new old admission/effect |
| Fault | Insert/update/deferred/backend loss | Full snapshot rollback; same-key authoritative reconciliation | Unknown acknowledgement |
| Isolation | Foreign scope, machine/client, malformed input | No effect or disclosure; strict SQL and HTTP | Invalid/forbidden/not found |

</frozen-after-approval>

## Code Map

- `foundation/migrations/029-run-cancel.sql`: additive cancellation constraints/function and revision5 execution guards;001–028 immutable.
- `foundation/src/run-contract.ts`, `runs.ts`, `runs-api.ts`: strict command parser, source pin, short cancellation transaction and human POST route.
- `foundation/src/persistence.ts`: append029 only; authority transaction unchanged.
- `foundation/tests/runs-http.test.ts`, `run-contract.test.ts`: signed first RED, revision/parser/pin transition.
- `foundation/tests/run-cancel.test.ts`, `run-cancel-upgrade.test.ts`, `run-process-fixture.ts`: restricted DB, attributable races/faults, fresh workers, genuine accepted4 export.
- Existing `runs`, `run-decision`, `run-resume`, `run-upgrade`, `run-resume-upgrade` tests: current admission literals/pins and necessary regressions only. Preserve Pike-1 and historical fixture versions.
- `foundation/scripts/test-db.ts`: required bounded preflight plus full discovery; no selection/cleanup/deadline algorithm edits.
- `foundation/tests/recovery.test.ts`, `core-release.test.ts`: exact29 inventory and restored cancellation evidence.

## Tasks & Acceptance

- [x] Observe registered HTTP404 before SQL and actual revision5 parser RED.
- [x] Append adopted revision5 amendment; implement029 and cancellation service/route.
- [x] Verify authority, strict envelopes, shared namespace, exact replay and all counters/fences.
- [x] Verify both attributable PID orders against prepare/handoff finish and late fresh workers.
- [x] Verify fault/deferred/backend full snapshots, lost committed HTTP response and parallel isolation.
- [x] Verify genuine accepted4 export/upgrade, original valid-lease workers, expired old replay and restored cancellation.
- [ ] Run canonical gates, direct self-check, preservation/cleanup/secret scan and freeze final bytes.

Given current scoped admin authority, when cancellation is accepted, then exactly one immutable receipt and one revision transition persist without executing a handler. Given participant loss, when an independent admin stops the run, then original participant checks do not prevent safe termination. Given both lock orders, when cancellation races completion, then only committed effects determine the outcome and stale workers cannot commit. Given genuine old code and migrations, when upgraded, then historical receipts and rows survive and no old claim executes new behavior. Given a failed or uncertain transaction, when reconciled, then no fabricated zero-effect conclusion replaces authoritative database evidence.

## Implementation Notes

Installed Build renderer and both resolvers executed successfully. Current adapter and explicit leaf scope override nested delegation, remote retrieval/write, staging and closure instructions. Missing historical runtime/architecture/dictionary inputs map to loaded Team RAM, current epic context and adopted contract. Scout live transcript abbreviates its final packet; full durable-runs-v1 contract and parent adoption were read directly, not reconstructed from omissions. Prior accepted resume specification loaded for continuity.

Evidence directory: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-cancel-evidence`. Admission hashes all1412 source files,14423 dependency files,12 containers and112 prior evidence files. Registered01-http-red exits1 at HTTP404/200;02-revision-red exits1 at actual revision5 parser run_invalid. No production code preceded those failures.

## Spec Change Log

## Review Triage Log

Woz direct self-check only; no independent developer-review claim. Compared each of029's nine replacement functions against accepted028: only current revision5 admission/guards, historical1–4 digest/replay membership and explicit historical handoff NULL-claim guard differ. Completion/authority/approval/expiry logic and existing privileges remain intact. New cancellation checks current caller separately, shares admission/key locking, takes the completion run lock before authoritative effect counting, prechecks all fences/revision/journal bounds and atomically retains scoped receipt/journal links.

Registered08-cancel-witnesses exits0: full restricted DB352 tests/9338 assertions, zero failed/skipped/missing, plus separately required preflights (not counted again). Both attributable PID orders for prepare and handoff, late fresh workers, current canceller loss, original owner/reviewer/both loss, full rollback snapshots, committed lost-response replay, genuine accepted4 export and original still-valid workers passed. Existing Pike-1 running-handoff advance replay remains required. Owned container removal is verified in the raw log.11-unit also exits0; final frozen canonical rerun remains the release-to-parent gate below.

Self-check strengthened the cancellation-specific negative control with populated foreign-tenant sentinels and actual cross-scope cancellation receipt/journal FK rejection plus app/owner mutation denials. These final test additions are exercised by the frozen canonical rerun; they do not change production pins. The initial test-only client fixture incorrectly expected kind=client; actual owner-linked clients remain service principals.05-typecheck failure is retained, corrected without touching authentication, and06-typecheck/07-lint pass. Registration-helper NameError before writes and contract trailing-blank whitespace diagnostic are retained in evidence working notes. No failed attempt is relabeled.

The final `FROZEN-RECEIPT.json` in the evidence directory is the completion receipt for the final verification checklist item; this specification stays in-review and is not rewritten after final-byte verification. Parent reproduction/review, inspection/doctor and full Epic12/all14 acceptance remain open. Installed Step04/05 nested reviewers, staging, done/commit and remote persistence are overridden by the explicit leaf scope and controlling adapter.

### F1 historical-after-cancellation evidence repair

Fowler F1 is an accepted coverage gap against durable-runs-v1 section14, not a demonstrated production defect. The same registered genuine accepted4 upgrade test now cancels each supported historical state with original owner/reviewer grants revoked, denies every available original command, restores the exact original scoped grant rows, and replays original start/advance/decision/resume inputs through current services. Exact receipt string/UTF-8 equality and complete ten-table equality follow every call. Direct historical prepare/handoff recovery returns NULL claims unchanged; each iteration restores participant revocation. Original export hashes, migration/history preservation, valid-worker/expired-claim controls, terminal-success cancellation refusal and owned cleanup remain intact. No runner, production or migration change was needed.

New exclusive evidence: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-cancel-repair-01`. Admission preserved the original frozen receipt SHA-256 `a23d32f3462d03861b4e111e970be730d705ccc674f355e39ca90619ba193e8b`, all source/dependencies,12 containers and prior evidence. The first registered `bun run test:db` passed immediately (exit0,352 full-DB tests,9517 assertions, no failure/skip/missing); this is honest coverage of existing behavior, not manufactured RED. Eight cancelled historical states exercise every available original command. A separately delivered TypeScript narrowing diagnostic in the new test callback was retained and corrected test-only after that run, before final canonical inputs were frozen. The repair receipt owns final `bun run check:all` results, exact21-file manifest, raw logs, first/final witnesses, diffs, preservation, cleanup and secret scan. Overlapping preflights are not counted twice. Original evidence remains immutable; parent reproduction/Fowler re-review and all status/closure gates remain open.

## Design Notes

Parent adopted ordinary technical decisions; no unresolved intent gap. Migration029 is applied only to owned disposable targets. Cancellation relies on the existing local atomic-effect contract: taking the run lock reconciles committed effects, not process liveness. It does not require handler availability. Existing receipt/journal scoped foreign keys and append-only guards remain mandatory.

## Verification

From foundation: `bun run check:toolchain`, registered `bun run test:db`, `bun test ./tests/run-contract.test.ts`, and final `bun run check:all`. Parent prospectively permits900 seconds only for outer orchestration; existing deadlines remain. Freeze all tracked/untracked final bytes before canonical execution and compare afterward. Count canonical unit plus full DB only, excluding overlapping preflights. Retain every failure, exact commands, raw witnesses, diff, manifests and cleanup receipts. Parent independently reproduces/reviews; no acceptance or closure is claimed here.
