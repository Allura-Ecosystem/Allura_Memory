---
title: Story11.3 governed experiment proposal handoff and bounded crew workflows
type: feature
created: 2026-10-28
status: done
route: dispatch
baseline_commit: b41548732a94e533d33ce35b5af6b51702a92596
context: []
---
<frozen-after-approval>
## Intent
Turn a selected hypothetical memory change into a real pending correction with bound experiment evidence, then independently review it through existing curator controls. Prove bounded RAM/Durham synthetic workflows without importing experiment state as canonical knowledge. Local implementation/tests are authorized; actual human/deployed acceptance remains a release gate.

## Boundaries & Constraints
PostgreSQL sole durable authority, exact scope/current grant/credential checks, immutable provenance and independent human decisions. No new grants/upstream adoption, arbitrary callbacks from requests, auto promotion, canonical rollback/delete, real-data transfer or production/deployment. Engine is host-owned bounded process-local workflow, not a new public general execution service. Machine worker with explicit memory:read,review:read,memory:capture,proposal:write is required for submission; role labels do not grant these. Human curator reads and decides separately under existing controls.

## I/O & Edge-Case Matrix
| Given / when | Then |
|---|---|
| Explicit bounded IDs of visible current semantic versions | Restricted SQL snapshot includes exact immutable content/version and authorized evidence IDs; no raw events |
| Fork/checkpoint/edits/selected replacement | Bind verified frozen issued candidate, actual actor and scoped source/diff digest to captured evidence; one atomic pending correction/receipt, no head/semantic/outbox mutation |
| Tombstone/multi-change submission | Tombstone stays hypothetical; one explicitly selected replacement per call, independently receipted, never implied batch approval |
| Foreign/forged/revoked/expired/source drift/stale head/changed operation key | Fail closed and no partial durable mutation; no foreign evidence |
| Deferred receipt/transaction failure or lost acknowledgement | Roll back evidence+proposal atomically; unknown commit never success; identical scoped operation reconciles durable receipt |
| Independent curator requests evidence/rejects/approves exact version | Only authorized fresh human decision can append semantic version/lineage; same producer/evidence actor/role-switched person/machine/org-only denied |
| Bounded synthetic RAM technical and Durham wording workflow | Inspect exact diff/evidence, pending submission/read-back, destroy engine; no asset publication/self-reward |
| Real browser pending experiment proposal | Existing scoped curator review/evidence controls exercise keyboard, deny/stale and truthful receipts; retain graph |
</frozen-after-approval>

## Code Map
- `memory-experiment.ts`: return verified immutable issued candidate to trusted handoff, not caller-mutable packet after await; preserve boolean verifier compatibility.
- New `memory-experiment-workflow.ts`: trusted restricted SQL snapshot and bounded host workflow/proposal bridge; no registered public route at this slice.
- `capture.ts`, `corrections.ts`: extract existing transactional inner operations without changing public semantics, allowing one scoped transaction for evidence+pending correction; reuse SQL submit_correction current-head/actor/audit/idempotency.
- `persistence.ts`: scopedTransaction/DatabaseStore authority lock and bounded statement/lock timeout; no schema changes needed.
- New `tests/memory-experiment-workflow.test.ts`, `scripts/test-db.ts`: actual isolated restricted PostgreSQL negatives/atomicity/independence.
- Existing review-api/dashboard browser fixture and curator surface: actual subsequent browser witness, not count-card or scaffold substitution.

## Tasks & Acceptance
- [x] Restricted snapshot and immutable candidate resolution, finite trusted workflow/current-authority/expiry behavior.
- [x] Transactional captured experiment evidence+selected pending correction and exact durable replay; malformed/foreign/revoked/stale/expiry/rollback/independence tests.
- [x] Bounded RAM/Durham workflows plus actual curator browser flow; all named negative cases exercised, no human witness inferred.
- [x] Full registered checks, exact-source local CI/package evidence, direct self-check and concise Epic11 retrospective; list external release gates honestly.

## Design Notes
One selected replacement/call, at most16 branch changes but <=30 original evidence IDs for submission so experiment capture plus correction provenance remain within existing32 total evidence ceiling. Explicit capture permission additional to proposal permission. Atomically capture with stable derived operation key and submitCorrection under same restricted SQL transaction; no partial event on failed proposal. Original captured content contains only selected change and bound candidate identity/digests, not unrelated branch contents. Issued immutable return resolves caller-mutation race. Exact receipt reconciliation after process death must use existing actor-scoped durable correction receipt; no digest-only branch re-import. No new upstream. Initial snapshot IDs must be current; retained immutable versions may outlive advancing head, while final SQL still locks/checks current head. Trusted DB adapter timeout is inherited from scopedTransaction; wrapper admits one submission at a time and checks deadline before committing, never claims hostile-code isolation.

## Implementation Notes
Actual Brooks/Woz/native build used;11.2 exact-source accepted150780e4a83183c8ee7953edda9053f1ac5bdb8b, documentationb41548732a94e533d33ce35b5af6b51702a92596. Ordinary local design delegated; no independent reviewer or production authority. This cohesive cross-layer story remains open until real integration/browser acceptance.

Admission41 repaired proven same-scope foreign-identity reader borrowing: every engine operation binds the exact authenticated owner/scope and current review:read authority. Registered negative failed before the fix and passed after. Snapshot SQL uses Bun's typed TEXT array binding, cast to UUID[], verified against restricted disposable PostgreSQL; no production migration.

The trusted host factory now owns capacity, deadlines and cancellation through existing WorkBudget; default two active workflows/two seconds, maximum inherited eight/two seconds. Timeout/cancellation invalidates engine access immediately, retains occupied admission until underlying work settles, and cannot claim cancelled writes rolled back without receipt reconciliation. Precommit cancellation and deferred receipt failure both prove actual rollback. Low-level constructor remains trusted/lifetime-owned, not a general transport or hostile-code sandbox. No callback/code supplied by an HTTP/MCP request is accepted. Original engine per-branch limits remain unchanged. Exact issuance-return test mutates caller packet after asynchronous verification and proves only frozen original content/producer persisted.

Two bounded RAM/Durham synthetic flows run through the host factory, checkpoint/edit/compare/export/submit/dispose, then the real HTTPS curator UI requests evidence/rejects one, rejects a revoked approval, restores the fixture grant, and independently approves the other. SQL witnesses prove only the approved version changes semantic lineage; base content remains immutable. These are separately signed synthetic identities, not actual human acceptance. The browser exposed long digest/JSON overflow in the existing inspector; scoped wrapping fixes the actual class without hiding evidence or altering retained graph/shell. Desktop/phone screenshots inspected; raw captured experiment JSON is truthful but verbose, not a polished specialist editor.

## Verification
Test-first missing-module/red then restricted disposable DB and full `bun run check:all`. Preserve existing capture/correction/decision/engine tests and no-skip required-case discovery; inject deferred failure and verify all relevant counts/head/receipt binding. Browser fixtures are automated local evidence only. No claim of actual human tasks or deployment.

Admission41 logs under Operations/direct-build-20261026: preflight-full EXIT0; identity-red EXIT1 (unexpected successful foreign-owner create), identity-green EXIT0; browser-first EXIT1 (actual horizontal overflow), browser-green EXIT0; host-red missing export EXIT1, host-first EXIT1 (test used nonexistent stale code and unscoped witness count), existing DecisionError contract and exact candidate query corrected. workflow-full EXIT0 with744 browser assertions/13scenarios, typecheck/lint/nonzero discovery; added cancellation regression then cancel-green EXIT0, final-typecheck/final-lint EXIT0. Eight workflow tests and one browser journey are required by the registered DB runner, alongside accepted contract/engine and independent-decision/security regressions. Exact committed-source final totals and acceptance follow below when verified.

## Admission42 final LOCAL acceptance / original matrix traceability
Final tested runtime `1a7545ca86d404e1f9f82e9acddb8cbb0c499b81`, incorporating original11.3 runtime `47dcbb43c41e1664814302ea92da31a4b3d047e4`. All27 experiment cases were programmatically matched to actual passing unit/database log entries, not merely discovered: three contract,14 engine,nine restricted workflow,one actual browser journey. Sources: [workflow cases](../../foundation/tests/memory-experiment-workflow.test.ts), [engine cases](../../foundation/tests/memory-experiment.test.ts), [browser witness](../../foundation/tests/memory-experiment-browser.test.ts).

| Original matrix obligation | Exercised evidence |
|---|---|
| Visible exact-scope immutable snapshot | contract strict-parser suite; workflow exact-owner/current provenance authority; foreign/unknown source denial |
| Fork/checkpoint/edit and selected immutable packet | engine lifecycle/fork/checkpoint/rollback suite; frozen-issued-packet mutation regression; pending handoff preserves semantic counts |
| Tombstone/multi-change selected-only handoff | tombstone rejected; new two-change SQL test captures only selected content/ID, changed selection on same key conflicts, separate receipt required, independent reject/approve affects only selected knowledge |
| Forged/revoked/expired/source drift/stale/key conflict | registered engine poisoning/quarantine and source-failure tests; workflow identity/provenance revoke, stale current head, expiry and durable replay tests |
| Deferred failure/lost acknowledgement | deferred receipt fault and precommit cancellation roll back actual rows; actor-scoped durable receipt read survives engine destroy; no automatic retry or unknown-as-success |
| Independent exact human review | workflow machine/org/unentitled human denial and proposal-version conflict; existing decision evidence-actor/role-switch regressions; actual curator request-evidence/reject/revoked-approve/fresh-approve controls |
| Bounded RAM/Durham workflows | real host-factory checkpoint/edit/diff/candidate/submit/dispose in browser fixture; busy/timeout/cancel/retained-admission and terminal disposal tests |
| Browser/keyboard/receipts/retained graph | real HTTPS signed synthetic human controls, focus containment and phone overflow assertion; existing interactive graph and full surface regressions remain registered |

Exact `bun run ci 1a7545ca86d404e1f9f82e9acddb8cbb0c499b81` in clean plain archive/private index: all six lanes EXIT0,291tests/3345assertions,0fail/skip,744browser assertions/13scenarios. Receipt `releases/1a7545ca86d404e1f9f82e9acddb8cbb0c499b81/allura-ci-uEuskh/attempt.json`, raw lane logs alongside; `admission42-exact-ci.log`, `admission42-export.json`. Pack verifies101input hashes/clean source binding and SHA2562930749e2e5a4245a3cfa965301b088233bc06d0e49cba7d1f3e1f423abcd3bc; archive `allura-core-artifact-VpuzKz/allura-core-0.1.0-dev.1.tar.gz` under that release root. Canonical full before final diagnostic-only assertions:291/3343, EXIT0; final typecheck/lint and focused diagnostics passed. Direct staged diff self-check, no independent developer review. [Epic11 retrospective](epic-11-local-retro-2026-10-28.md) records declared local accepted-with-open-items and disposition **EXPERIMENT**, not adoption.

Recovery authority also required investigating retained admission42 preflight failure. Historical restore child exit/stderr were discarded; underlying cause remains unverified despite unchanged-source parent rerun and current successful restores. Added bounded allowlisted diagnostics and real malformed-archive child regression, not a fabricated root-cause repair. See retrospective riskR1. This known reliability risk plus hosted/deployed/human/operational/real-transfer and manual-accessibility gates remain OPEN; no whole-product readiness, upstream adoption or production use follows from this local story acceptance.
