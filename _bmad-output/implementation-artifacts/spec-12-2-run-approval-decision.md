---
title: '12.2 exact independent-human run approval decisions'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e11891c5de928c655b03b2e3439736dc821bcf76'
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/durable-runs-v1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Prepared runs stop at independent review without a durable reviewer decision or authoritative decision replay.

**Approach:** Let the designated independent current human approve/reject the exact unexpired pending request and evidence at the current run revision. Atomically persist immutable decision, journal and operation receipt. Approve readies handoff without executing it; reject is terminal partial with approval_rejected.

## Boundaries & Constraints

**Always:** Apply the parent's three-revision amendment: new starts use literal revision3, preserving original revisions1/2 and migrations001–026. Historical receipt replay checks original current participants and exact bindings without executing changed code. Pin actual coordination/executor/API/SQL bytes. Enforce strict finite DTOs, existing scoped transactions, original owner/reviewer authority, reviewer audit permission, FORCE RLS, private helpers, immutable scoped evidence and cross-command replay namespace. Preserve measured preparation, fences, drift denial, dependencies, existing containers and active STOP.

**Never:** Implement resume, handoff execution, cancellation, inspection, arbitrary handlers or policy; caller-selected actors/outcomes; old-request approval for new code; semantic promotion; live status, remote MCP, credentials, tunnel, infrastructure, deployment, commits or closure. Build self-check does not replace the parent's separately requested Code Review.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Approve/reject | Exact current unexpired pending revision3 evidence, designated reviewer | One immutable decision/journal/receipt; ready handoff or terminal partial | Never execute handoff |
| Exact replay | Same actor/scope/key and full decision envelope | Original receipt bytes despite stale runtime revision or later expiry | Current original participants still required |
| Changed/reused payload | Different evidence/request/run/revision/rationale/decision or command | No mutation | Conflict |
| Ineligible | Expired, rejected, unsupported old revision or source drift | No new decision/effect | Conflict |
| Authority loss | Original binding/grant/membership invalid, wrong reviewer, machine or foreign scope | No disclosure or mutation | Deny before protected work |
| Interrupted acknowledgement | SQL/socket/process/HTTP failure | Same-key reconciliation from PostgreSQL | Unknown is not rollback |

</frozen-after-approval>

## Code Map

- `foundation/src/run-contract.ts`: strict DTOs and actual source fingerprint; add exact decision parser and revision3.
- `foundation/src/runs.ts`, `runs-api.ts`: existing human service/route boundary; add decide without execution.
- `foundation/src/run-execution.ts`: existing measured executor; preserve behavior and pin it.
- `foundation/migrations/025-durable-runs.sql`, `026-run-prepare.sql`: immutable existing schema, participant locks, admission/claim/finish, normalized digests; extend only through027.
- `foundation/src/persistence.ts`: append migration only; scopedTransaction unchanged.
- `foundation/tests/runs-http.test.ts`, `runs.test.ts`, `run-upgrade.test.ts`, `run-process-fixture.ts`: signed gateway, real restricted DB, pinned source export and process/fault witnesses.
- `foundation/scripts/test-db.ts`: exact shared runCases and focused/full inventories; preserve algorithms and target guard.

## Tasks & Acceptance

**Execution:**
- [x] `foundation/tests/runs-http.test.ts`, `scripts/test-db.ts` — register named decision HTTP RED before schema queries.
- [x] `foundation/tests/run-upgrade.test.ts` — add genuine pinned-HEAD revision2 paused fixture, retain revision1 witness; observe revision3 RED.
- [x] `foundation/migrations/027-run-decision.sql`, `src/persistence.ts` — additive decision storage/guards/transition and revision boundary.
- [x] `foundation/src/run-contract.ts`, `runs.ts`, `runs-api.ts` — strict human decision service and route; pin final implementation bytes.
- [x] `foundation/tests/run-contract.test.ts`, `runs-http.test.ts`, new focused decision tests/helpers, `run-process-fixture.ts` — exact replay, denials, isolation, concurrency, immutable SQL, deferred rollback, attributable revocation orders, lost response/restart, expiry and drift.
- [x] `foundation/tests/recovery.test.ts`, `core-release.test.ts`, `scripts/test-db.ts` — exact inventory27 and retained evidence recovery; canonical gates.

**Acceptance Criteria:**
- Given current independent humans and exact pending evidence, when a decision commits, then one atomic receipt/journal/decision exists and no handoff or semantic mutation occurs.
- Given concurrent identical or competing commands, when PostgreSQL serializes them, then exact duplicates reconcile and changed/stale requests cannot create another decision.
- Given a populated genuine legacy workspace, when upgraded, then immutable old values and authorized receipt bytes survive, unsupported old execution is safe, and revision3 prepares/decides in that same workspace.
- Given faults, expiry, drift or either revocation ordering, when the real production boundary executes, then no partial or stale approval is accepted and acknowledgement uncertainty stays truthful.

## Implementation Notes

Additive migration027 preserves old definition and receipt rows, permits exact authorized historical reconciliation, and makes only literal revision3 eligible for new preparation/decision. The decision function locks current original participants before its shared operation namespace, validates exact request/prepared-receipt/current-revision provenance, and atomically writes the decision, journal and operation receipt. It forces deferred constraints and checks database expiry again before return. Existing executor bytes are unchanged and included in the new source fingerprint.

Local canonical `14-final-check-all` passed: 164 unit tests / 3296 assertions plus 319 restricted-PostgreSQL tests / 4617 assertions; 483 tests / 7913 assertions without overlapping preflight counts. Typecheck and lint passed within that command (exit0). Raw failures remain in the evidence directory: initial HTTP404 RED; genuine paused-revision2 upgrade rejected revision3; initial upgrade comparison included the newly added nullable journal field; launcher PATH failure; SQL-array TypeScript comparison error; whitespace wrapper treated expected no-index exit1 as failure. Corrected tests preserve every original column/value and constraints; no production gate was weakened.

## Spec Change Log

- Build evidence-only update: checked locally verified tasks and set in-review for parent reproduction and the separately requested installed Code Review. Frozen intent is unchanged; this is not story/epic closure or live operational status.

## Review Triage Log

### Review Findings — parent separate Code Review

All configured layers completed; Pike's empty findings were explicitly confirmed deliberate. Parent final-byte rerun passed483 tests/7913 assertions before remediation; no acceptance is inferred over these findings. Individual verdicts, source references, deduplication and scope rationale are retained in `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-decision-parent/review-triage.md`. No decision-needed, deferred or rejected findings. Existing authorized continuation supplies apply-patches authority; latest user explicitly requested separate review then retrospective.

- [x] [Review][Patch] R1: Reject a concurrent start/decide cross-command operation-key collision before owner-specific lookup; synchronized real RED/GREEN [foundation/migrations/027-run-decision.sql:190–195].
- [x] [Review][Patch] R2: Prove in-flight expiry reaches an attributable deferred boundary before expiry; exercise final-guard sensitivity rather than an early rejection [foundation/tests/run-decision.test.ts:250–265].
- [x] [Review][Patch] R3: Genuine revision2 expired running-claim replay preserves exact receipt and complete runtime/evidence snapshots; isolated early-return guard sensitivity [foundation/migrations/027-run-decision.sql:229–235].
- [x] [Review][Patch] R4: Original matching revision2 worker with still-valid claim cannot finish after migration; isolated revision guard sensitivity, no effect/request/decision [foundation/migrations/027-run-decision.sql:275–281].
- [x] [Review][Patch] R5: Bound new owned source-export lifecycle across success/failure after provenance verification; preserve historical exports and shared dependencies [foundation/tests/run-upgrade.test.ts:100–111,171].
- [x] [Review][Patch] R6: Reject malformed raw UTF8 before JSON parsing without rejecting valid replacement-character/Unicode content; real decision HTTP RED/no-write and authentication-order regression coverage [foundation/src/gateway.ts:53]. Parent extends scope narrowly to gateway decoder and its existing gateway tests/registration plus actual source pinning as needed.

Retrospective remains outstanding; full12.2/Epic12/all14 are not accepted. Frozen original evidence remains unchanged; remediation gets fresh receipts. Source/security authority is unchanged. No sprint-status created or live work-status write.

Rejected appendix: none.

- Woz direct self-check only: read the full tracked/untracked candidate diff, traced participant locking, normalized command namespace, exact approval/effect bindings, migration compatibility and rollback boundaries, and audited the matrix below against real passing case names. No independent review verdict is claimed. Step04 child review layers are not spawned by this scoped worker; parent owns the separately requested Code Review. Step05 automatic done/commit/remote outcome actions are withheld by the explicit handoff boundary.

| Frozen matrix row | Executed covering cases in final canonical evidence |
|---|---|
| Approve/reject | `run decision approve is atomic ready handoff without execution or semantic promotion`; `run exact approval replay never authorizes changed expired or rejected evidence` |
| Exact replay | `run decision concurrent duplicates and competing choices produce one authoritative transition`; `run decision database expiry rejects pending and in-flight approval without renewing historical replay` |
| Changed/reused payload | `run decision exact selectors strict SQL payloads and namespace conflicts write nothing` |
| Ineligible | `run decision source drift denies new approval while exact committed replay stays historical`; `run revision three upgrade preserves genuine paused revision two evidence and refuses old execution`; expiry and rejection cases above |
| Authority loss | `run decision current original participants bindings and foreign scopes cannot be substituted`; `run decision private SQL immutable rows scoped links and pooled contexts enforce isolation`; `run decision owner and reviewer revocation serialize both attributable database orders` |
| Interrupted acknowledgement | `run decision insert update deferred faults and backend termination leave no partial approval`; `run decision HTTP authenticates before body and lost committed response reconciles after restart`; populated backup/restore test |

Limits: expiry uses real PostgreSQL time with a shortened newly inserted owned request and an injected deferred delay, not a naturally elapsed 24-hour witness. Attributable concurrent revocation ordering covers owner/reviewer workspace grants; other principal/membership/binding losses are sequential denial tests, not every possible concurrent authority mutation. No exhaustive stress/failover, wall-clock reversal or catastrophic storage-loss claim. HTTP listener restart and fresh process replay are covered; no new resume, handoff executor, cancellation or inspection capability is claimed. Hosted/deployed/actual-human acceptance, full Story12.2/Epic12/all14, parent reproduction, separate review and retrospective remain open. No remote Brain or work-status writes occurred.

## Design Notes

No intent gap remains: the parent's ordinary technical resolution supplies the immutable three-revision boundary. Additive027 is an irreversible schema footprint only on owned disposable test targets. No runtime claims follow from contract adoption. Existing continuation supplies routine checkpoint approval; no nested agents. Missing runtime maps to the adapter/loaded Team RAM; missing architecture/dictionary map to retained current planning and adopted detailed contract. No remote retrieval is retried. Epic context was stale against durable-runs-v1 and refreshed inline after planning review; previous bounded specifications remain untouched. No sprint-status exists or is fabricated.

## Verification

### Parent final acceptance — bounded decision slice

Parent independently reproduced final candidate: `bun run check:toolchain` and `bun run check:all` both exit0. Evidence `/home/sabira/.hermes/profiles/troy/workspace/allura-decision-remediation-parent/`: `execution.json`, `counts.json`, `preservation.json`, `secret-scan-receipt.json`. Unit165/3336 assertions plus restricted PostgreSQL325/7225 totals490 tests/10561 assertions; zero fail/skip/missing, overlapping preflights excluded. Canonical log SHA256 `9bc57ca2746ba78051cc9c6b9bd570a887860460ad7ef0917fcc26fa2dd42dd8`. No source/dependency mismatch; original12 containers unchanged; secret scan exit0/zero findings.

Separate independent re-review `deleg_240930b4`: Pike APPROVE R1/R6, Fowler APPROVE R2–R5, no remaining bounded code/regression-evidence blockers. Their review was source/hash-bound log inspection, not independent runtime execution. Parent owns the actual rerun. The original four-layer review and individual triage remain retained. Additive correction in `allura-decision-remediation-parent/review-acceptance-and-correction.md`: old `03-r2-restored` failure was unexpected fixture startup, not an intentional negative; original receipt remains immutable and final valid mutant/restored pairs are separate.

`done` applies only to this bounded approval-decision specification, not full Story12.2/Epic12/all14 or deployment/actual-human acceptance. Parent local commit uses existing adapter authority; worker no-commit scope remains historical. No remote status or Brain persistence claimed. Requested partial retrospective is separately underway. Frozen intent and final tested production bytes are unchanged by this acceptance note.

From `foundation`: `bun run check:toolchain`, named real owned-DB REDs via `bun run test:db`, then `bun run check:all` (unit/typecheck/lint/full owned DB). Preserve all raw failures and final counts/exits; exclude overlapping preflights. Validate tracked and untracked whitespace before final source-hash-sensitive checks. Fingerprint dependencies, nonallowed files and original containers before/after. Freeze final file hashes and evidence for parent reproduction and separate Code Review. Hosted/deployed/human release and full12.2/12.3/Epic12/all14 acceptance remain open.

Evidence directory: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-decision-evidence/`.

### Review remediation evidence — resumed bounded writer

The checked R1–R6 boxes record builder behavioral evidence, **not** parent acceptance. Original Build and parent483/7913 counts remain pre-remediation only. New immutable receipts are in `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-decision-remediation-01/resume-01/`; `REMEDIATION-RECEIPT.json` binds the final candidate, canonical counts (excluding overlapping preflights), all command/log hashes and preserved failures. Parent must reproduce those exact final bytes and conduct the separate re-review. No commit or retrospective in this writer task.

- R1 retains original `01-r1-red`/`02-r1-green` with distinct observed decision/start/gate PIDs; the canonical registry now requires the collision case.
- R2 prior `03-r2-mutant` failed on improper acceptance, but `03-r2-restored` also failed in fixture startup (`Connection closed`): the pair was not a valid sensitivity pass. Resume diagnostic readiness uses TCP rather than the transient initialization Unix socket. `01-r2` proves valid deferred entry, attributable lock, database expiry before release, guard-deleted acceptance failure and restored rollback success. The owned request TTL is1500ms; no production timeout was extended.
- R3 `04-r3` uses verified pinned revision2 source and a genuine committed outstanding claim. It waits for the original10s lease AND retry due time, migrates, and checks byte-exact receipt plus all legacy definition/record/state/step/journal/receipt/evidence values. Deleting only the historical early return changes running state to blocked; restoration preserves history.
- R4 `05-r4` uses a separate genuine claim and the original pinned executor/definition/identity, with its original lease valid both before and after completion. Deleting only the revision predicate creates paused approval; restoration blocks with definition_drift, with no effect/request/decision. Original10s lease and2s execution budget are unchanged.
- R5 `02-r5-red` records the formerly leaked newly owned export. `03-r5-green` exercises success plus real corrupt-archive extraction, source verification and callback failures. Archive/source hashes are emitted before cleanup; only newly allocated revision2 exports are removed, without following dependency symlinks. Historical revision1 exports/lifecycle remain untouched.
- R6 `06-r6-http-red` and `07-r6-gateway-red` observed200 rather than400 for malformed raw UTF8. `08-r6-green` and `09-gateway-green` verify fatal decoding, zero protected mutation, valid U+FFFD and Unicode fidelity, split multibyte streams, existing BOM rejection, and auth/CSRF-before-body. Gateway bytes now enter the revision3 source fingerprint; no historical definition is rewritten.

Final-byte repeated sensitivity receipts and full canonical results are authoritative only when present with successful restored/canonical exits in the final receipt. The first resumed full check (`15-final-check-all`) passed all five upgrade tests but exhausted the combined60s runs preflight during existing run tests; its failure is retained. Upgrade tests now have their own required30s preflight, the existing runs preflight remains60s, and all case names remain mandatory in the unchanged full DB suite. No individual test, production lease/deadline or existing runner timeout was increased. The `v2-frozen-*` snapshot and `17-final-check-all` bind this registry correction, but the foreground tool killed that command at its420s transport limit; there is no successful17 exit receipt. The interrupted command's exact new test/recovery containers, labeled volume and network were identified and removed, preserving the original12 containers. The `v3-frozen-*` snapshot and `19-final-check-all` use a tracked background command with the same540s command budget to avoid the foreground transport cutoff. No suite or product budget changed. New tests are required by the existing unit/DB registries; CI file inventory is unchanged because no suite file was added. Local self-check only: hosted/deployed/actual-human acceptance, complete12.2/Epic12/all14, parent reproduction and re-review remain open. No remote/status/credential/infra changes.
