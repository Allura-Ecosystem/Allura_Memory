---
title: '12.3 authenticated read-only run inspection'
type: 'feature'
created: '2026-11-01'
status: 'done'
parent_acceptance: 'Bounded inspection/doctor only; Epic12 remains open for limits/recovery evidence. Parent check:toolchain/check:all exit0; canonical SHA256 56933e1987fce59c6edd8c8bec59f6a5c0de276c4520d18407e71f2c34fd5508. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-12-3-inspection-doctor-parent. DB568.314s under600; batches179.384s/218.918s under240. Source/dependencies preserved,12 containers unchanged,scan0. Fowler runner review and Pike repaired-doctor re-review approve bounded source/log evidence; parent independently executed final suite. No deployment or human acceptance claimed.'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '939cfd8577d5e1cff2293f5d7b7a90f1d1754afb'
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/durable-runs-v1.md'
---

<frozen-after-approval reason="parent-adopted bounded inspection packet">

## Intent

**Problem:** Operators cannot read authoritative pinned run evidence or distinguish persisted outcomes from observed integrity and expiry problems.

**Approach:** Add authenticated GET /api/runs/inspect with a bounded journal page and complete-run observational doctor. Preserve historical runs while new admission moves to literal revision6.

## Boundaries & Constraints

**Always:** Current human audit:read at gateway/service/SQL; independent inspector authority, not original participants. Lock/recheck current authority without transaction-readonly bypass. One coherent database snapshot, explicit DTO, exact stored definition/policy/hash and evidence links. Strict one-each group/workspace/run selectors, no duplicate/unknown parameters; safe decimal after_seq>=0; limit1–100/default20; ascending extra-row pagination with explicit cursor. Complete bounded-run doctor is independent of page, uses database time and distinguishes persisted state from observations. Missing installed source permits historical read with drift, never fake hashes. Preserve old source pins,001–029 and full immutable history. Revision1–5 exact commands remain historical under appropriate current authority; no old claims/finish. Cancellation stays independent current-canceller control.

**Never:** Domain writes, receipts, claims, reconciliation, repair, UI, executor/status plane, gateway/auth/common-fixture/dependency/vendor/old-migration edits; identity bindings, lease/invocation IDs, raw input or credentials in DTO; goal/rationale logs; raw DB errors. No stage/commit/refs, nested agents, network/MCP/secrets/production/other-profile changes, or Epic closure.

## I/O & Edge-Case Matrix

| Scenario | Input/state | Expected result | Error |
|---|---|---|---|
| Inspection | Current independent scoped human | Pinned evidence, persisted runtime, bounded journal, observational doctor | No mutation |
| Authority | Revoked inspector, wrong role, forged, machine/device/client | No disclosure | Forbidden/unauthenticated |
| Hidden run | Authorized scope, absent or populated foreign ID | Identical response | Not found |
| History | Genuine accepted5 ready/paused/approved/completed/cancelled/admitted/live/expired | Exact stored evidence; drift; replay never executes | Unsupported new old work conflicts |
| Integrity | Missing required success link or inconsistent evidence | Integrity finding, completion unverified | Never repair |
| Outage | Query failure after authority | No fabricated empty run | Unavailable/unknown; authority-store failure remains forbidden |

</frozen-after-approval>

## Code Map

- `foundation/src/run-contract.ts`: strict selectors, DTO types and revision6 actual source pin.
- `foundation/src/runs.ts`, `runs-api.ts`: human service and GET route using unchanged scopedTransaction/gateway ceilings.
- `foundation/migrations/030-run-inspection.sql`: additive revision6 guards and bounded guarded snapshot function. Existing cancellation/participant/executor contracts remain.
- `foundation/src/persistence.ts`: append030 registration only.
- `foundation/tests/run-inspection.test.ts`, `run-inspection-upgrade.test.ts`: authority, pagination/snapshot, doctor, historical provenance and unchanged ten-table witnesses.
- Existing allowed run tests: current admission/pin inventory and necessary regressions only; preserve historical pins and F1/Pike1 controls.
- `foundation/scripts/test-db.ts`: registration only, existing deadlines unchanged. Recovery/core-release tests: exact migration inventory.

## Tasks & Acceptance

- [x] Register signed HTTP tracer and observe actual404 before SQL.
- [x] Append revision6 amendment before GREEN; implement minimal snapshot path.
- [x] Verify strict selectors, explicit projection, complete doctor and unchanged evidence.
- [x] Verify independent inspection after participant loss, inspector revocation both attributable PID orders, foreign sentinels, forged/machine/device/client denial.
- [x] Verify genuine accepted5 export/replay and valid/expired historical worker guards.
- [x] Verify missing/changed source, inconsistent links, query/authority outages, coherent concurrent snapshot.
- [ ] Freeze source manifest/diff; canonical checks, cleanup/preservation and scan; no commit.

Given a successful GET, then all ten run tables and unrelated semantic evidence remain byte-identical. Given terminal success lacking required links, then persisted success stays visible but doctor cannot verify completion. Given pagination excluding relevant events, then doctor still evaluates the complete bounded run. Given inspector revocation, then operation-first finishes before revocation and revoke-first denies after a measured wait. Given an accepted5 source export, then real historical evidence survives migration and no changed-code execution occurs.

## Implementation Notes

Installed Build renderer and both resolvers executed. Explicit leaf scope/current adapter supersede nested workers, remote retrieval/write and commit/closure. Missing runtime/architecture/dictionary inputs use the adapter's mappings to Team RAM/current epic context/adopted contract. Parent Scout packet and adoption read; cancellation spec supplies continuity. Operational status and remote persistence remain unknown/unperformed.

Admission evidence: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-inspection-evidence/admission.json`. Source1416/dependency14423/historical84/container12 hashes/identities captured. `00-toolchain.log` exit0. Registered `01-http-red.log` exit1: signed GET expected200 received404, other runs29 pass; owned container removal verified. No production implementation preceded RED.

## Spec Change Log

## Review Triage Log

Woz direct self-check only; nested developer reviewers and remote persistence are excluded by the leaf packet/current adapter. No independent-review claim. Revision6 replacement command functions were derived from accepted029 with only literal admission/revision/history guards changed; cancellation extends supported revisions to6. Original025–029 remain byte-identical. Inspection is the only new entrypoint, explicit human audit:read with current inspector authority locks and a single evidence SELECT. No original-participant helper, domain writes or read-only-transaction workaround.

Registered RED01 observed signed GET404; RED03 observed revision6 parser rejection. RED08 reached missing evidence fields after the first tracer passed. RED13 exposed missing handoff journal approval-link integrity: persisted success incorrectly verified; the added full-chain predicate fixes it. Focused14 passed the inspection/history/HTTP suites, typecheck15 and lint16 passed. These are preflights, not final canonical acceptance. Genuine5 export binds the accepted commit and hashes every exported source file; original valid leases are checked before/after old workers, expired claims wait for actual DB lease/backoff expiry, and historical full-ten-table replay/independent inspection remain unchanged. Current inspector both-order PID witnesses, concurrent cancellation snapshot, altered-source/missing-source exports, outages and an isolated integrity-predicate mutant/restored control passed.

Failures retained:02 inherited PATH command-not-found (rerun03 with explicit installed PATH);05 stale exact migration count29→30 corrected only in allowed tests;06 foreground400s transport termination (not a suite exit). Its sole newly owned container35ae2d677e0f794bf038095ab9ada2eaf57aecd7cf2fe31592469578e939c6e3 was label/name verified, descendants checked absent, removed by exact ID, then absence verified.07 wrong fixture table name was corrected to actual proposal tables;09 used created_at rather than committed_at in the effect integrity query;11 exposed a test-harness matcher waiting before its barrier release, fixed by attaching an ordinary rejection observer. Raw failed logs remain. The execution-code read dedup KeyError occurred before writes; the approved source transformation was rerun through the actual file bytes.

Final frozen canonical receipt, hashes, counts and preservation/scan results are external evidence in this task's directory, not a later rewrite of tested spec bytes. Full bounds/retry/expiry acceptance and all release/human/status gates remain open.

## Pike HIGH corruption-diagnosis repair

Accepted review found unchecked approval/decision JSON projection fields. Owned fixture corruption through the real signed inspection endpoint reproduced `completionVerified=true` despite independently changed decision digest/reviewer, including an empty journal page. This is evidence corruption diagnosis, not an ordinary-client write exploit. Every mutation is restored, full snapshots are unchanged by inspection, and restored controls verify completion again. Raw failing and passing receipts remain in `/home/sabira/.hermes/profiles/troy/workspace/allura-12-3-inspection-doctor-repair-01`.

Migration030 now compares the complete approval and decision JSON to authoritative columns and dependencies, without casting untrusted projected values. The pause revision is derived from the immutable approval event sequence, not the request JSON; decision admission cross-checks that revision. The same-class effect projection gap also checks all non-link fields against columns, measured artifact bytes and immutable effect-event attempt/fence; existing exact handoff links remain independently checked. Historical inspection, current authority and all immutable write rules are unchanged. Named regression registration is the only runner edit. No DTO source or migrations001–029 changed. Final canonical execution and preservation receipts bind the frozen bytes separately; parent reproduction/re-review and story/release acceptance remain pending.

## Design Notes

One SECURITY DEFINER entry checks human/current audit authority, locks that authority, then returns a single SQL-statement snapshot. No original-participant helper and no read-only transaction mode; authority share locks remain possible. Explicit projections exclude raw storage rows. Doctor does not call mutation/execution helpers. Migration is applied only to owned disposable targets.

## Verification

Foundation `bun run check:toolchain`, registered `bun run test:db`, unit/parser tests, final `bun run check:all`. Outer900s orchestration is approved; product/SQL/suite deadlines unchanged. Retain raw RED/GREEN/failures, exact export hashes, frozen tracked/untracked manifest, diff and receipts. Count canonical suites once, excluding preflights. Parent reproduction and remaining Epic12 bounds/retry/expiry plus13/14 and external/human gates remain separate.
