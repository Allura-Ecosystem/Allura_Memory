---
title: '12.2 measured preparation and independent approval pause'
type: 'feature'
created: '2026-10-31'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2856bbd1143535782fc12d1193520a84aa070726'
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/durable-runs-v1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Committed admission stops at ready/prepare. It cannot measure an artifact or durably request independent human review.

**Approach:** An authenticated owner advances one admitted run through the built-in local artifact check, preserving measured evidence and a checkpoint with one exactly bound independent-human approval request. Stop at paused approval; never execute handoff.

## Boundaries & Constraints

**Always:** Preserve immutable definitions, original receipts, current owner/reviewer bindings and grants, existing scoped transactions and client ceilings. Measure raw UTF-8 bytes and SHA-256, not caller claims. Claim durably before execution; finish only under current lease/fence/authority and unchanged shipped implementation. Use forced RLS, private guarded SQL, finite attempt/deadline/lease/journal bounds and authoritative same-key reconciliation. Preserve migration001–025, compiler evidence, dependencies, original containers and active STOP.

**Never:** Add approval decision, resume, handoff or cancellation routes; arbitrary handlers, shell, agents or network effects; live status, remote MCP, credentials, grants, tunnel work, semantic promotion, commit, closure or deployment. A passing admission or pending approval is not successful completion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Prepare | Exact eligible run/revision, current independent humans | Original running admission receipt; one measured effect and approval pause checkpoint | No handoff |
| Failed gate | Actual digest mismatch | Typed measured failure; terminal failed; no successful effect/request | Never trust supplied outcome prose |
| Replay | Exact same operation after committed preparation | Original immutable receipt; reconcile existing effect | No repeated completed preparation |
| Conflict | Changed operation payload/revision | No new domain writes | Conflict |
| Drift | Pinned implementation differs from installed bytes | No handler execution or approval | Fail closed with definition drift |
| Authority loss | Owner/reviewer binding, grant or membership invalid | No new effect/disclosure | Deny, never manufacture revoked state from outage |
| Unconfirmed commit | Connection/process failure | Same-key authoritative reconciliation | Unknown is not rollback |

</frozen-after-approval>

## Parent technical resolution — applied

The two-revision transition is adopted under existing delegated engineering authority in `contracts/durable-runs-v1.md`, section “Adopted two-revision transition for preparation”. No product question remains on this boundary. Preserve revision1 immutable admission provenance and current-authorized original receipt replay; forbid new revision1 admissions and execution. Literal revision2 is the newly shipped preparation-capable definition with actual executor provenance. Validate against a real populated pre-upgrade production fixture, not fabricated legacy rows or only fresh scopes. Changed legacy input conflicts; original-participant revocation/binding loss denies; original receipt bytes remain unchanged. Revision1 advance records blocked/definition_drift under current authority with no effect or approval. Parent authorizes additive migration026 and exact DTO/SQL/test changes already scoped, plus a dedicated `foundation/tests/run-upgrade.test.ts` if necessary for the real upgrade witness. Prior migrations and accepted source remain preserved except the declared current runtime extension. No general registry, silent upgrade, weakening of hashes, or infrastructure work is authorized.

The following question/proposal is retained as historical investigation evidence and is resolved by that precise amendment. Continue from existing observed prepare RED, add the version-transition RED, then implement and verify. Routine build checkpoints use existing continuation authority; no commit or closure by the worker.

## Historical Open Question — resolved

1. **Definition revision contradiction blocks production implementation.** Adopted durable-runs-v1 lines181–184 require new behavior to use a new revision and forbid executing a run under changed handler bytes. Yet DefinitionRef, RunDefinitionV1 and StartRunV1 fix revision1. Committed revision1 hashes admission-only `run-contract.ts` and `runs.ts`; its digest is not proof of an executor. New preparation source must change the bundle identity. Migration025 fixes definition revision1, validates revision1 exactly and conflicts on changed definition bytes in a populated workspace. Keeping the old digest would omit the new executor; replacing revision1 would violate immutability; accepting changed bytes for old runs would bypass drift protection. Fresh empty test scopes alone would conceal this upgrade boundary.

   **Minimal proposed amendment, not applied:** reserve revision1 as immutable admission-only provenance; admit preparation-capable runs under literal revision2 with actual owned preparation implementation bytes pinned. Preserve authenticated original revision1 receipt reconciliation without executing it; old revision1 advance fails closed. Add only this explicit two-revision boundary, not an uploaded registry or general multi-version framework. New starts select the shipped revision2; no existing run/input/definition is rewritten. Parent must settle the exact revision1 replay semantics and authorize the narrow contract/DTO/validation changes before production implementation. Alternatively explicitly authorize changed revision1 bytes only in previously empty scopes; that relaxes the adopted “new behavior needs a new revision” rule and is not recommended. Neither option is silently assumed here.

## Code Map

- `foundation/src/run-contract.ts:20–44`: strict revision1 parser and source-derived admission-only definition. Do not mislabel this as executor provenance.
- `foundation/src/runs.ts:7–20`: existing current-auth start service; unchanged scopedTransaction, typed errors and original receipt return.
- `foundation/migrations/025-durable-runs.sql:3,69–85,114–131`: immutable scoped revision1 definition, strict validation, definition-bound start request digest and same-revision conflict. Never edit this migration.
- `foundation/src/runs-api.ts`: existing start route in core gateway; add advance here only after resolved definition semantics.
- `foundation/tests/runs-http.test.ts`: real signed HTTP tracer with existing lifecycle fixture and restricted login. HTTP status assertion precedes new-table queries.
- `foundation/scripts/test-db.ts`: shared runCases feeds focused and canonical required inventories. Preserve its algorithms and owned disposable target.

## Tasks & Acceptance

**Execution:**
- [x] `foundation/tests/runs-http.test.ts`, `foundation/scripts/test-db.ts` — add/register the exact first prepare test and observe route404 versus200 before new schema or source.
- [x] Parent resolved the definition revision amendment above; read its exact legacy replay and upgrade-test semantics before implementation.
- [x] `foundation/migrations/026-run-prepare.sql`, `foundation/src/persistence.ts` — additive private claim/finish/effect/request storage and migration registration;026 verified next.
- [x] `foundation/src/run-contract.ts`, `foundation/src/runs.ts`, `foundation/src/runs-api.ts`, `foundation/src/run-execution.ts` — strict advance DTO, actual pinned local measurement and bounded claim/finish coordination; preserve start.
- [x] `foundation/tests/run-contract.test.ts`, `foundation/tests/runs.test.ts`, `foundation/tests/runs-http.test.ts`, `foundation/tests/run-upgrade.test.ts` — observed RED→GREEN for the real two-revision upgrade, measurement, truthful gate failure, drift, exact replay/concurrency, authorization, private immutable SQL and atomic faults.
- [x] `foundation/tests/run-process-fixture.ts` — real owned interruption/fresh-process same-key recovery, no simulated process states.
- [x] Registration-only DB runner changes and exact recovery migration counts, populated paused-run restore assertions; final canonical checks passed. Parent reproduction/acceptance remains separate.

**Acceptance Criteria:**
- Given actual signed owner and current independent reviewer, when advance completes preparation, then exactly one raw-byte measured effect and bound approval request share a durable checkpoint and handoff remains absent.
- Given duplicate commands, lost acknowledgement or fresh-process reconciliation, when the same operation retries, then original receipts survive without repeating a committed preparation.
- Given current revocation, incompatible definition or stale lease/fence, when work is attempted, then no approval or success is manufactured.
- Given injected insert/commit faults, when the effect transaction fails, then no partial effect/request/checkpoint appears; unresolved acknowledgement remains unknown.

## Resume execution plan

Step02 resumed with the parent resolution; no intent gap remains. The additive026 migration is the scoped irreversible footprint, exercised only on owned disposable targets. Keep the full existing spec under supplied continuation authority. No rerender, context recompile, nested review or remote activation. Step03 proceeds test-first: genuine pinned-HEAD001–025 admission and revision2 RED, then additive upgrade/legacy reconciliation, measured prepare/pause, incremental denial/fault/concurrency/process witnesses, canonical checks. Evidence is exclusive `allura-12-2-prepare-evidence/resume-01/`; prior receipts remain frozen. Baseline1399 tracked files,14423 dependency files and12 containers captured; active STOP absent at admission.

## Implementation Notes

Historical checkpoint: Production implementation halted on the explicit revision boundary; no026 or production code written. The first tracer is intentionally RED, not an accepted partial feature. Existing prepare-request assertions after the HTTP status have not executed yet and do not constitute effect/binding evidence.

## Spec Change Log

## Review Triage Log

Direct investigation/self-check only; no independent developer reviewer or nested agent. Source and adopted contract establish the blocker above. Prior start spec and12.1 contract remain unchanged.

## Verification

Evidence: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-prepare-evidence/`.

`01-prepare-red.log`: actual `bun run test:db` exit1; named prepare case received404 versus expected200 after real start200. Existing12 cases passed;13 discovered,250 assertions total. The runner verified removal of its owned container. No absent-schema/module failure.

`02-unit.log`: existing contract suite3 pass/72 assertions. `03-typecheck.log` and `04-lint.log`: canonical commands exit0. `05-definition.log`: actual revision1 handlerBundleDigest `bfd83f599611b050e9eca2e54775eaf13aed86f8ed5076854755d8c2760aa5ac`. These are baseline/static checks, not preparation GREEN. Full unit and final check:all are not claimed; the known RED remains blocking.

Renderer invoked exactly once, exit0, snapshot `d2b8a19bcd1eb738c378`; workflow/steps01–02/template read. Epic12 context validated against all planning mtimes and reused unchanged. Missing runtime maps to current adapter/Team RAM; adopted contract supplies detailed run design. No remote retrieval under controlling override. Routine proceed authority does not resolve this explicitly protected versioning contradiction. No sprint/live-status write.

### Resumed implementation and direct self-check — bounded local GREEN

The preceding halt and baseline-only statements are historical; the parent resolution above controls. Step02 resumed without rerender/recompile, followed by actual step03 implementation and step04 direct self-check. Step05 was read; no-commit/no-closure/no-remote authority overrides its commit/done/Brain-write actions. This spec is in-review for parent reproduction, not a live status record or independent-review verdict. Frozen intent and the parent contract bytes are unchanged.

Migration026 is the sole additive migration. New starts require literal revision2; legacy revision1 accepts only current-authorized, exact original start reconciliation using its original stored definition digest and participants. The genuine pinned-HEAD export creates legacy rows using migrations001–025 and original production services, then applies026. It proves same-workspace revision2 preparation, immutable old record/definition/receipt retention, changed-input conflict, grant/membership/binding denial, new-revision1 refusal and old-run blocked/definition_drift with no effect/request. Export230 source files match the pinned commit before and after use; archive SHA-256 `32d4234ca623a00ba476c6ae840aaad2f4da2ce0f7e6b1f2ac7981cee64aa93d`. Scratch source exports are retained as provenance, not live targets; their owned databases are dropped and read-back checked.

Preparation commits a durable claim before the built-in PostgreSQL raw-UTF8 byte/SHA-256 measurement. Successful measurement, one immutable effect, exact independent-human evidence-bound approval request, journal links and paused checkpoint commit atomically. Mismatch records actual typed measurements with terminal failed and no success/request. Completion rechecks current participants, pinned implementation, lease/invocation/fence and time bounds. Actual executor/coordination/SQL bytes are hashed; missing bytes block rather than substitute a digest. Same-key replay returns the immutable admission receipt, never claims the whole run succeeded. Process capacity2/2000ms and workspace lease cap4 remain bounded; claims expire after10000ms with persisted retry delays and a maximum3 attempts.

Evidence directory: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-prepare-evidence/resume-01/`. All earlier evidence remains frozen; failed attempts are retained:

- `01-version-red.log`: actual revision2 request reached the revision1-only parser and failed `run_invalid`; prepare still404.12 pass/2 fail/256 assertions; owned target removed. This is behavioral RED, not missing import/schema.
- `02-version-green-attempt.log`:12 pass/2 fail; retained prepare404 and a changed-reviewer assertion that incorrectly expected forbidden rather than the adopted conflict. New-key invalid-reviewer denial remains separately asserted.
- `03-prepare-green-attempt.log`: focused14 pass/286 assertions; full289 pass/5 fail because recovery/release still expected25 migrations. Only authorized26 expectations changed, then populated paused-run recovery assertions were added.
- `06-missing-executor-red.log` and `07-bounds-and-missing-red.log`: missing installed executor was initially an unknown error rather than truthful drift. Fixed without a substitute hash.
- `10-state-constraint-red.log`: actual nullable ready-state acceptance. `15-isolated-null-red.log`:26 pass/1 fail/523 assertions, actual nullable artifactSha256 acceptance. SQL CHECK UNKNOWN required explicit `IS TRUE`; individual null-field witnesses prevent invalid fields masking each other.
- `12-canonical-unit.log` is empty because the launcher could not find Bun after environment recovery; `12-launch-failure.json` records that no tests ran. Existing pinned Bun/Node binaries were rediscovered and prepended to this shell PATH, with no install/dependency change. All retries have distinct evidence names.
- `16-final-db.log`: focused runs27 pass/526 assertions; canonical restricted PostgreSQL307 pass/4336 assertions, zero fail/skip/missing. `17-final-typecheck.log`, `18-final-lint.log`, `19-final-unit.log`: exit0; unit30 files/164 tests/3274 assertions, including run-contract3/88.
- `20-final-check-all.log`: final canonical check:all exit0 on final production/test bytes; repeats the same unit and DB counts, zero missing/skips/failures, and verifies owned-container removal. SHA-256 `df864ec75bde8aadb6c4830bf87725bbfcbf4ef6abbfa7d315868f52317b8d49`. Focused runs/OAuth/client preflights overlap canonical DB cases and must not be added to totals.

Runtime evidence includes exact decomposed Unicode/CRLF/emoji bytes; six concurrent advances; original receipt replay; strict DTO and guarded SQL denials; current owner/reviewer membership/grant/binding loss; FORCE RLS/private helpers and immutable effects/requests; insert/update/deferred constraint faults; real backend termination returning unknown; owned SIGKILL after durable claim, database-time expiry and fresh-process recovery; stale completion fencing; two fresh-process postcommit retries; actual HTTP response loss after commit; missing/changed source at both claim and completion; retry due/attempt exhaustion; aborted work retaining capacity until real rollback. Dedicated max-one pools and emitted distinct waiter/blocker PIDs establish both revocation orders for owner and reviewer. Backup/restore compares all run tables and replays exact start/advance receipts without duplicating the paused effect. Existing machine/client/authentication, gateway limits and shared transaction code are unchanged.

No handoff, decision, resume, cancellation or inspection/doctor API is implemented. Later R12-AC02/05/08/10/11 portions concerning approval decisions, post-review handoff, cancellation and inspection remain open; no12.2/12.3/epic/all14 closure. Retained-total256 saturation, full journal-exhaustion and24-hour expiry branches are not independently reached by this bounded slice. Next named feature RED after parent acceptance: `run exact approval replay never authorizes changed expired or rejected evidence`, with a separately resolved future definition/provenance increment before new behavior. No remote MCP, live status, semantic promotion, tunnel/network changes, credentials, push or deploy.

### Parent acceptance — bounded preparation slice only

Parent reproduced `bun run check:toolchain` and `bun run check:all` on the returned production/test bytes. Exclusive evidence: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-prepare-parent-02/`, including `execution.json`, `canonical.log`, `preservation.json`, `secret-scan-receipt.json` and `counts-and-reconciliation.json`. Canonical log SHA-256: `7bd72f221744e8053f367a3c9039a2fbcfa47e87a383617b93b8681f79941630`. Unit30 files/164 tests/3274 assertions plus canonical PostgreSQL307 tests/4336 assertions totals471 tests/7610 assertions, zero failures/skips/missing; overlapping preflights excluded. Typecheck/lint and both command exits are0. Preservation reports no mismatches and unchanged containers; candidate secret scan exits0 with zero findings.

Two parent wrapper failures remain retained, not relabeled successful: the first could not locate Bun; the second completed both canonical commands and preservation/scan, then failed metadata serialization from a Python exec namespace collision. A separate read-only reconciliation verifies raw execution receipts, exact lane counts and canonical log hash. No product failure was hidden, dependency installed, or frozen receipt overwritten.

Parent source/security/test self-check covers the adopted version boundary, actual executor/SQL pins, restricted scoped authority, atomic measurement/effect/pause, fresh-process fencing, failure rollback and upgrade/recovery witnesses. This is direct-build self-check under the controlling adapter, not an independent developer-review verdict. `done` applies only to this bounded local spec. The frozen no-commit/no-closure wording constrained the implementation worker; parent acceptance and local commit use the adapter's existing passing-owned-work authority. Full12.2/Epic12/all14 acceptance and every later lifecycle and unreached-bound limitation above remain open. No remote operational status or Brain persistence is claimed; no tunnel work, push or deployment.

### Final-byte reconciliation before local commit

The staged candidate check caught one trailing blank line in the new026 migration (`git diff --cached --check`, exit2). No commit occurred. Parent removed exactly that final newline; the original file is recoverable by appending one newline and matches the worker's recorded SHA-256. Because026 participates in the handler fingerprint, parent reran the complete canonical checks on the corrected bytes instead of reusing the earlier witness. Earlier worker and parent receipts remain unchanged.

Final evidence: `/home/sabira/.hermes/profiles/troy/workspace/allura-12-2-prepare-parent-03/`. `check:toolchain` and `check:all` exit0; canonical log SHA-256 `2ffedddb8be66e8ab73ca47eaf48a86ec8d8d85cca02426de4f651f44f2a82aa`; 471 tests/7610 assertions, zero fail/skip/missing, excluding overlapping preflights. Verification wrapper exits0 (`PARENT_VERIFICATION_PASS`); final-source/dependency hashes preserved, all12 existing containers unchanged, secret scan exit0/zero findings. `harness-adapter.json` binds the original helper, adapted helper, standalone script and exact delta. Isolated exec namespace avoids the prior post-check serialization collision. This supersedes earlier hashes solely for final-byte acceptance; all bounded-scope limitations remain unchanged.
