---
title: '12.2 bounded durable HTTP run-start admission'
type: 'feature'
created: '2026-10-31'
status: 'done'
baseline_commit: 'db12d3b123a512a5b126e96fc19745ed40f08616'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/durable-runs-v1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The adopted run contract has no authenticated durable start endpoint. A caller cannot obtain a scoped immutable admission or reconcile its original receipt.

**Approach:** Implement only POST /api/runs/start through current authority and restricted PostgreSQL. Pin the shipped definition and exact input; persist one ready run, started journal event and immutable operation receipt atomically. Reconcile same-key input under current participant authority.

## Boundaries & Constraints

**Always:** Follow adopted durable-runs-v1 start rules, current identity issuance, scopedTransaction, CSRF, human owner and distinct current bound same-workspace admin reviewer. Observe named HTTP404→200 RED before feature code. Preserve protected source, dependencies, vendor and compiler evidence. Use disposable synthetic DB only and direct self-checks.

**Never:** Commit, close a task, mutate live status, contact remote MCP, change tunnel/credentials/infrastructure, widen Action/client ceilings, add executors or lifecycle stubs. Preparation, approval, resume, cancel and inspection acceptance remain open; admission is not execution or semantic promotion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Start | Exact built-in definition, strict bounded input, authorized humans | Immutable original operation receipt; ready/prepare; no effects | HTTP200 admission only |
| Replay | Same scoped actor/key/input and original bindings current | Original receipt bytes, no new rows | Changed input/definition conflicts409 |
| Authority | Foreign/self/machine/unauthorized/revoked participant | No writes or private disclosure | 401/403, hidden reference404 |
| Invalid | Extra keys, executable/policy/outcome overrides, malformed UTF-8 or bounds | No writes | 400 invalid |
| DB failure | Insert/commit failure or unavailable confirmation | No false success; same-key reconciliation | 503 unknown |

</frozen-after-approval>

## Code Map

- `foundation/src/core-api.ts` composes the existing gateway; add route composition only.
- `foundation/src/gateway.ts` already authenticates before body, rejects mixed identity, enforces CSRF and rechecks disclosure; typed error mapping only.
- `foundation/src/persistence.ts` owns unchanged scopedTransaction and migration registry; append025 only (001–024 verified).
- `foundation/tests/lifecycle-fixture.ts` supplies actual signed identities and restricted app; import unchanged, promote synthetic reviewer locally in new tests.
- `foundation/scripts/test-db.ts` owns fresh target/cleanup and exact discovery; insert focused start child before OAuth and register exact cases, no runner redesign.

## Tasks & Acceptance

**Execution:**
- [x] `foundation/tests/runs-http.test.ts`, `foundation/scripts/test-db.ts` — named authenticated start RED and registrations before production changes.
- [x] `foundation/migrations/025-durable-runs.sql` — additive scoped start tables, immutable constraints/FORCE RLS, narrow private SQL and atomic admission/replay.
- [x] `foundation/src/run-contract.ts`, `foundation/src/runs.ts`, `foundation/src/runs-api.ts` — strict start DTO, shipped definition/hash and current-authority service/route; no future lifecycle handlers.
- [x] `foundation/src/persistence.ts`, `foundation/src/core-api.ts`, `foundation/src/gateway.ts` — migration, composition and error wiring only.
- [x] `foundation/tests/run-contract.test.ts`, `foundation/tests/runs.test.ts` — incremental parser, denial, current binding, restricted SQL, replay and rollback evidence.
- [x] `foundation/scripts/test.ts`, `foundation/src/ci-contract.ts`, `foundation/tests/ci-contract.test.ts` — exact implemented unit inventory and meaningful assertion floor only.
- [x] `foundation/tests/recovery.test.ts`, `foundation/tests/core-release.test.ts` — exact24→25 migration assertions only.

**Acceptance Criteria:**
- Given actual signed owner/reviewer, when start reaches production HTTP, then200 precedes observation of one immutable scoped record/journal/receipt, ready state and pinned normalized digests.
- Given six same-key concurrent starts, when committed, then one original receipt/run exists; changed input conflicts without writes and later exact retry matches bytes.
- Given current authority or exact binding loss, foreign scope, self review or machine caller, when start/replay runs, then denial exposes no private data and creates no domain rows.
- Given restricted login or accidental owner mutation, when private access/update/delete/truncate is attempted, then SQL privilege/RLS/immutability rules hold.
- Given strict malformed input or injected insert/commit failure, when admitted through real service, then no partial durable admission or false success occurs.
- Given canonical checks, when run on final bytes, then new required cases are discovered with zero skipped/missing cases and owned target cleanup is verified.

## Implementation Notes

Bounded start implemented and locally checked, not Story12.2 closure. Only the start route exists. Migration025 stores scoped immutable definitions, records, journal and original receipts; current owner/reviewer locks and exact original identity bindings gate replay. Runtime begins ready/prepare with three pending steps and no effects. SQL owns normalized hashes and atomic capacity/key admission. Source-derived handler provenance currently pins admission source, not a claimed implemented executor.

Observed behavioral REDs: `02-start-red.log` (HTTP404 vs200, 0 pass/1 fail/1 assertion), `04-replay-red.log` (only one of six starts accepted), `07-binding-red.log` (replacement binding wrongly replayed), `09-sql-input-red.log` (SQL override accepted), `11-unit-red.log` (exact nonempty whitespace rejected), `13-capacity-red.log` (both final-slot competitors admitted). Each retained alongside its succeeding GREEN. `03`, `05`, `15`, `17`, `18`, `19` retain fixture/inventory/lint failures; none is relabelled passing. Dedicated max-one test SQL pools fixed reserved-connection reuse in revocation witnesses; no production auth change or timeout increase.

Final `24-check-all.log` exit0 includes 3 parser cases/72 assertions, 12 run DB/HTTP cases/248 assertions, and canonical restricted-PostgreSQL 292 cases/4052 assertions with zero fail/skip/missing and owned-container removal. Focused DB cases overlap the full DB suite; do not add those counts. Unit/typecheck/lint/DB all ran through their existing package scripts. Full unit aggregate and source/preservation hashes are recorded in the external final receipt.

Security evidence covers signed humans, pre-body anonymous/forged/mixed/CSRF denial, machine-only absence, pre-abort, strict selectors/DTO/SQL overrides, nonempty foreign tenant/workspace sentinels, self/wrong-role/service denial, both participants' current grant/binding/membership/principal loss, tenant/workspace loss, immutable owner DML denial, restricted rights/FORCE RLS, pooled contexts, original binding replacement, changed payload/definition conflicts, six-way same-key replay, insert/deferred-commit faults, and attributable owner/reviewer revocation blocking in both orders. Lost-response test drops an owned loopback HTTP connection after gateway200/commit, then reconciles field-equal receipt over a new listener; this is not external TLS/Access deployment acceptance. Service replay separately asserts receipt-byte equality.

Open later AC: executor/preparation measurements, effect/approval storage and decisions, pause/resume/cancel, leases/fencing/retry/deadlines, inspection/doctor, fresh-process execution recovery and retained run evidence backup/restore. The actual quota witness proves32 nonterminal admissions and exact replay under saturation; the256 total-retained branch is implemented but not independently reached in this start-only state model. No claim that all R12-AC01–12 or12.3 pass. Next feature RED: `run prepare persists measured artifact evidence and pauses for independent approval`, using the existing admitted run and asserting durable pause/one measured receipt/handoff absent before implementing advance.


## Spec Change Log

## Review Triage Log

Direct self-check under current repository adapter replaces all three child review ceremonies; no nested agents or independent-review claim. Inspected full new source/tests, adopted contract and exact shared-file wiring/registration diffs. Preserved protected authentication/action/client ceilings. Added explicit ready/pending state assertions and same-revision changed-definition conflict assertions; final canonical check covers them. No unresolved blocking start defect observed. Later lifecycle and recovery coverage above is intentionally open, not a passing skipped test.

Step04 continued from the parent's rendered snapshot without rerender. Step05 read: task-specific no-commit/no-closure/no-remote authority overrides its done/commit/Brain-write actions. Leave this bounded spec in-review for parent reproduction; no live status, commit, remote check or persistence claim.

### Parent bounded acceptance

Parent completed source/security/test self-checks under the current direct-build adapter; no independent reviewer ceremony or verdict is claimed. Inspected the complete new runtime modules, SQL migration and three test suites, actual shared wiring/registration/inventory diff, and the original HTTP404-versus200 RED. Rehashed every returned changed file and raw log against the worker receipt. No blocking defect in the bounded start acceptance was found. The later lifecycle/retention/restore gaps above remain explicitly open.

Fresh parent `bun run check:toolchain` and `bun run check:all` exited0 on the exact returned code. Canonical unit30 files/164 tests/3258 assertions; restricted PostgreSQL292 tests/4052 assertions; combined456 tests/7310 assertions, zero failed/skipped/missing. Overlapping runs/OAuth/client-authority preflights are excluded from the total. Typecheck/lint passed. Preserved1399 admitted source files,14423 dependency files and12 original containers, no extra containers or source/dependency mismatches. Owned target removal was observed. Exact logs/admission/counts/preservation are in `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-start-parent/`; `canonical.log` SHA-256 `10835c6cc0728dc01ee9b16144bb695e28d37beece41cbc0e0162c3baf04b874`. Parent literal-secret scan of all18 candidate files exited0 with no findings; final staged metadata/hygiene remain checked before the parent-owned local commit.

The done header accepts only this bounded HTTP start/admission slice after parent reproduction, not all of Story12.2, Epic12 or the all14 goal. Worker no-commit instruction above remains historical to its assignment; parent local commit is authorized by the controlling repository adapter. Frozen intent unchanged. No tunnel/network configuration, production data, live grants/credentials, remote status/persistence, semantic promotion, push or deployment is performed. Next slice: persisted measured preparation and exact independent approval pause; it must preserve this committed start/replay behavior and add real failure/concurrency/recovery evidence.


## Design Notes

No intent gaps: accepted12.1 contract fixes behavior. Additive migration is the irreversible footprint, exercised only on runner-owned synthetic targets. Start requires definition/run/state/steps/journal/operation storage; effect/approval storage waits for its RED. Public output is receipt only, no private input/binding disclosure.

## Verification

From `foundation/`: `bun run check:toolchain`, canonical `bun run test:db` for initial RED and subsequent GREEN, focused `bun test ./tests/run-contract.test.ts`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run check:all`. Preserve each actual exit/log separately; overlapping executions are not additive test counts. Evidence resides in `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-start-evidence/`.

## Workflow authority

Continue parent's rendered snapshot `d2b8a19bcd1eb738c378`; no rerender.12.1 is an unformatted intent handoff, not a ready spec. Epic context compiled inline because nested agents are forbidden. Missing runtime maps to current adapter/Team RAM; missing architecture maps to current architecture/PRD; missing dictionary uses adopted durable-runs-v1 plus authority/persistence contracts, not restored files. Remote activation retrieval is superseded by no-retry/local-outage authority; unavailable, no remote pass/status. Routine checkpoints use supplied proceed authority, direct self-check replaces reviewer spawning. No sprint-status/live status write.
