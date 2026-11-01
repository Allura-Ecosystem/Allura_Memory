---
title: '12.3 retained run and natural journal boundary witnesses'
type: 'chore'
created: '2026-11-01'
status: 'done'
parent_acceptance: 'Bounded retention/journal and canonical orchestration only. Parent final check:toolchain/check:all exit0; canonical SHA256 aedff01d5f3b6e6ce5197046cae4dcd88b8040bfeb5d49102a7e350aca8d93c1. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-12-3-retention-parent-02. Original wrapper failure preserved separately. Source/dependencies preserved,12 containers unchanged,scan0. Independent bounded review approved; parent runtime reproduced. Run-age/deferred-expiry probe and full Epic12 acceptance remain open.'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e34165cf49e5889bd39e5512d7b824e65503cb9f'
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/durable-runs-v1.md'
---

<frozen-after-approval reason="parent-adopted tests-only retention/journal packet">

## Intent

**Problem:** Revision-six retained-run and journal limits need naturally reached boundary evidence, distinct from synthetic exhaustion fixtures and already accepted lease/attempt witnesses.

**Approach:** Add exactly three native database witnesses using unchanged services and restricted guarded SQL. Demonstrate retained256 admission, reserved completion at journal128, and bounded denial plus explicit cancellation after an abandoned boundary claim.

## Boundaries & Constraints

**Always:** Woz is the sole writer. Preserve production source, definition revisions1–6, migrations001–030, dependencies, fixtures, existing specs and evidence, runner algorithms, eight preflights, and canonical order/boundary after runs. Append the new file at manifest end in batch two, executed once canonically. Focused development is separately bounded. Keep batches240s, DB600s and outer900s. Check active direct-build STOP before writes/gates. Retain first outcomes, native reports, full diff, source/dependency/container hashes, exact counts excluding repeated preflights, cleanup and scan evidence.

**Never:** Synthetic journal inserts or run-state rewrites, production revision/migration changes, hidden retries after a measured budget failure, timeout increases, dropped gates, staging/commit/refs, nested agents, network/MCP/secrets, other profiles, skills, story/Epic closure or release claims. A genuine production defect stops for parent disposition.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Retained final slot | 255 genuine sequential start→cancel runs; two restricted max-one connections at actual workspace admission lock | Distinct backend PIDs, both observed blocked before release; one accepted, one unavailable; retained256, no loser writes, original scoped history preserved |
| Terminal retention | Cancel winner, then another start | Still256 terminal records and new admission denied; no trimming; exact old start/cancel replay, changed envelope conflict, authorized inspection and foreign hiding |
| Scoped independence | Saturated workspace and separate populated workspace | Other workspace progresses without altering saturated history |
| Journal reservation | Genuine start/prepare/approval gives sequence5;120 separately committed guarded resume admissions reach125 | Next distinct admission unavailable, complete snapshot unchanged; committed receipt permits claim126 and genuine valid-lease finish127/128 |
| Completion integrity | Natural contiguous journal through128 | Exact preparation/approval/decision/handoff links, one handoff, succeeded and completionVerified; full pagination and exact historical replay add nothing |
| Abandoned boundary | Independent natural125→claim126; actual lease and due time expire | Recovery unavailable without attempts reset or mutation; explicit current-admin cancellation appends127/128, partial/cancelled, no handoff, late worker denied, replay exact and completionVerified false |

</frozen-after-approval>

## Code Map

- `foundation/tests/run-retention-journal.test.ts`: new three-case suite; local helpers reuse lifecycle fixture, services, scopedTransaction, runDefinition and finishHandoff. Owner access only creates synthetic workspace/grants and observes evidence/locks.
- `foundation/scripts/test-db.ts`: append exact file/names to canonical manifest only, leaving preflights and batching untouched.
- `foundation/tests/test-runner.test.ts`: exact55-file/369-case ownership, once-only execution and canonical omission/native ownership negative controls.
- `foundation/scripts/test.ts`: named unit registration only if new unit cases require it; floors/algorithm unchanged.
- `foundation/migrations/030-run-inspection.sql`: read-only resume admission251–281, claim283–321, finish323–350, cancellation353–391 and inspection397–504 references.

## Tasks & Acceptance

- [x] Add the three exact scoped behavioral witnesses.
- [x] Register native ownership and dependent runner regression expectations without weakening enforcement.
- [ ] Measure focused cost and run supported canonical gates under unchanged budgets.
- [ ] Freeze candidate bytes with verification and preservation receipts for parent review/rerun.

Given real restricted production paths, when the three cases execute, then their exact native names and complete assertions pass without synthetic exhaustion state. Given any observed production defect or canonical DB budget overrun, when it occurs, then preserve the failure and stop rather than edit production or rerun for timing luck. Given final frozen bytes, when handed back, then the parent can reproduce all reported commands and distinguish self-check from acceptance.

## Implementation Notes

The parent packet and exact Scout transcript supply bounded approval; the rendered BMAD workflow was read via the adapter. Missing legacy runtime pointers map to loaded Team RAM instructions; parent continuity replaces forbidden child MCP retrieval. No additional intent gaps or irreversible production changes are introduced. Test-first coverage may immediately pass against the existing implementation; report that honestly, never manufacture RED.

Boundary recovery is deliberately not seamless: at126 the next claim is unavailable even after real expiry; explicit cancellation is the adopted safe terminal path. No claim of automatic attempts_exhausted there. Definition16 saturation is structurally unreachable under literal revisions1–6, not a manufactured16/17 runtime witness. Independent run-age expiry and remaining Epic12 acceptance stay outside this packet.

## Verification

Exclusive evidence: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-retention-journal-evidence`.

- Separately owned loopback disposable focused execution, with native JUnit and exact cleanup; measure added runtime before canonical execution.
- `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, and focused native runner regressions.
- Supported `bun run test:db` under600s; if passing, `bun run check:all` under outer900s with independently enforced DB600s. Track long-running processes beyond transport limits; batches remain240s.
- Record actual first outcomes/failures, candidate hashes before/after final gates, exact changed-file baseline/final hashes, native counts once, preservation, diff and cleanup/scan results externally. No pass is preclaimed by this specification.

First focused command failed before test execution because the development wrapper misspelled Bun's reporter-outfile option; the owned container was removed. First behavioral execution immediately passed both journal cases against unchanged production, while the retained-run test incorrectly expected raw SQL `unavailable` rather than the service's `run_unavailable` message. Correcting that fixture expectation produced three passes/1628 assertions in24.80s native test time (26.53s including owned setup/cleanup). These are existing-behavior coverage passes, not feature RED. The first runner negative-control test incorrectly disallowed an unsuccessful native batch receipt for a child exit7; the real runner correctly refused aggregate success. The test now checks any emitted batch receipt is unsuccessful. The supported `bun run check` then passed unit/typecheck/lint. Raw initial failures remain in the exclusive evidence directory. No production defect was observed.

Candidate bytes are frozen before canonical gates. Full-gate outcomes, exact final counts and preservation receipts live in the evidence directory; unchecked final gate tasks are intentionally not a preclaim of acceptance. Parent final review/rerun and acceptance remain pending; no commit or closure by this worker.

### Parent disposition — canonical-only orchestration packet

The parent explicitly approved Bellard packet `deleg_7a5d587c` after the original supported DB gate timed out at600.009s. Its immutable failed receipt remains in `allura-12-3-retention-journal-evidence/final-receipt.json` (SHA256 `b0211d7e0760223fc618d40ca1d25cf9ce5db25acf04a444f5550c66431eff68`). This disposition supersedes only the earlier requirement to retain eight duplicated preflights and the two-batch partition, not the historical outcome.

Remove exactly the audited run-inspection, run-cancel, run-cancel-upgrade, run-resumes, run-resume-upgrades, run-decisions, runs and client-authority preflight blocks. Their ten files and all unique cases remain mandatory in the unchanged ordered55-file/369-case manifest. Partition once into sequential slices0:11,11:42,42:end (11files/86cases,31/235,13/48). Retention belongs to batch3, OAuth to batch2 and upgrade to batch1. Native ownership, exact case identity, no skips/failures, positive per-file assertions, floor40, sequential password-rotating fixtures, cleanup and batch240s/DB600s/outer900s bounds remain required. Canonical commands reject selectors; no focused bypass is added.

The parent consciously accepts loss of the eight separate watchdogs, earlier fail-fast points, module-cache isolation and second randomized executions. Incidental database population is not identical. Unique internal-mutation/restored-control, legacy-upgrade, fault, process and authority witnesses are preserved byte-for-byte. Historical revision1 export debt remains disclosed and unresolved; this is not new provenance evidence for that export.

New evidence is exclusive to `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-retention-orchestration-01`. The first real subprocess RED rejected the eight unwanted preflight receipts; canonical-only three-batch GREEN followed. Initial expanded regression registration mistakenly included three string-literal fragments; the native required runner rejected duplicate identities. The registration was corrected to literal top-level test declarations, with all prior negatives and floors1142/63 retained. All raw outcomes remain in the new directory. Final measured gates and frozen-byte preservation are reported there, not preclaimed here; no commit, story closure or independent-review claim is made.
