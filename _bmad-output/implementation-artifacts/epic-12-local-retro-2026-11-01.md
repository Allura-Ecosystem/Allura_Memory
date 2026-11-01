---
epic: 12
date: '2026-11-01'
verdict: accepted-with-open-items
criteria: declared
headless: true
scope: declared-local-epic12-criterion-reconciliation
accepted_baseline: b6b34d9a10cf0b7985089b896e28afa387306805
parent_final_registration_gate: passed
acceptance_authority: parent-local-criterion-adoption
publication: frozen-documentation-candidate-for-parent-review
story_or_epic_status_mutated: false
runtime_exercised_by_retrospective: false
operational_status: unknown
---

# Epic 12 — local retrospective and criterion reconciliation

## Epic summary and acceptance verdict

**accepted-with-open-items for the declared local Epic 12 criteria.** The parent has adopted the reviewed criterion reconciliation and accepted the final gateway-registration repair at `b6b34d9a10cf0b7985089b896e28afa387306805`. This publishes that bounded technical disposition, not a new human product acceptance, full-story Done ledger, deployed release, or live work-status transition. Parent retains final document review and commit ownership.

The implemented local chain is authenticated start → measured artifact preparation → exact independent human approval pause/decision → fresh-process resume → one linked PostgreSQL handoff, plus independent current-authority cancellation, inspection/doctor, finite limits and populated recovery. Run success neither promotes semantic memory nor moves a work item. No arbitrary executor, external effect or parallel-step DAG is accepted.

The [partial retrospective](epic-12-retro-2026-10-31.md) remains immutable and correctly **rejected** its earlier incomplete scope through `5b3e8815adf5211e70beb7130ac31ffb7d4d363a`. Later evidence resolves those local implementation absences; it does not retroactively turn that earlier run into a pass. Likewise, historical pending paragraphs in bounded specs remain historical beneath their later parent acceptance entries.

## Evidence inventory and method

Repository references resolve from `/home/sabira/Allura_Memory-beta-local`; evidence directories below resolve from `/home/sabira/.hermes/profiles/troy/workspace`.

| Key | Source and limit |
|---|---|
| ADAPTER / CATALOG | [ALLURA-BMAD](../../guidelines/ALLURA-BMAD.md), [current catalog](../planning-artifacts/epics.md), all-14 amendment; ordinary engineering authority does not grant release or live-status authority. |
| CONTRACT | [durable-runs-v1](../planning-artifacts/contracts/durable-runs-v1.md), R12-C1–C4, R12-AC01–12 and additive revisions through 7. |
| SPECS | `spec-12-1-durable-run-contract.md`; `spec-12-2-run-{start-admission,prepare-approval-pause,approval-decision,resume-handoff}.md`; `spec-12-3-run-{cancellation,inspection,limits-recovery,retention-journal,age,export-cleanup}.md` in this directory. Bounded Done annotations are not a blanket story ledger. |
| AGE-P | `allura-12-3-run-age-parent/{execution.json,counts.json,canonical.log}`; accepted revision7/package repair at `2640ed7b1edefa4d159e24fd0840cb79eaf404eb`. Canonical SHA256 `8bb21fe68b7af95412d15dcaa3181a94aee0e286eb336b8d9736a0589d22da5f`. |
| CLEAN-P | `allura-12-3-export-cleanup-parent/{execution.json,counts.json,preservation.json,canonical.log}`; accepted new-export lifecycle at `c5a952b4675462b04439b5a9fdf38e86a97dc8a6`. Canonical SHA256 `196fe5738226359e7a46a4158c898dcfa7cb3b5eec6ed6685608c3486e64f802`. |
| REG-W / REG-P | `allura-gateway-inventory-evidence/{receipt.json,final.diff,sensitivity.json}` and final parent `allura-gateway-inventory-parent/{execution.json,counts.json,preservation.json,canonical.log}`. Final accepted log SHA256 `42da7bfcec54e2e7b1804b28964c44037f9948a16be69424cd20835101c141df`. |
| CLEAN-W | `allura-12-3-export-cleanup-evidence/{receipt.json,cleanup-readback.json}` and raw lifecycle RED/GREEN evidence; historical exports preserved. |
| PUBLICATION | `allura-epic12-close-13-adoption-evidence/`: exact allowlist, baseline/final hashes, full document diff, source anchors, resolver receipts and read-only validation. |

This is publication of the already-reviewed reconciliation, not another product implementation or exhaustive source review. Installed retrospective activation, acceptance, evidence, aggregate and document references were read. Workflow/config resolvers ran locally/offline; prepend/append/persistent-facts/on-complete are empty. Missing legacy runtime inputs use the adapter, not invented replacements. There is no `sprint-status.yaml`; the completeness check is unavailable, no `pending_stories` list or story-mode registry is fabricated, and no status updater ran. The rubric permits weighing available criteria without inferring acceptance or rejection from absent metadata. This local criterion verdict records the supplied parent's adoption; it is not an assertion that the installed workflow proved all tracked stories Done.

No fresh product tests, database access, behavior exercise, nested reviewer, network/MCP, credentials, deployment or live status lookup occurred. Prior behavior evidence belongs to its original runners. Aggregate analysis is narrowed to source/spec reconciliation and already-reviewed boundary findings; full dependency/complexity/duplication analysis and complete session transcripts were not repeated. Git history/source preservation is checked only for documentary provenance and scope.

## Behavior verification — accepted parent receipts, not new executions

| Accepted receipt | Unit cases / assertions | Restricted PostgreSQL cases / assertions | Counted once |
|---|---:|---:|---:|
| AGE-P (historical) | 205 / 5,069 | 374 / 14,735 | 579 / 19,804 |
| CLEAN-P (historical) | 205 / 5,077 | 375 / 18,093 | 580 / 23,170 |
| REG-P (final baseline) | 205 / 5,077 | 375 / 18,093 | **580 / 23,170** |

REG-P `check:toolchain` and `check:all` exited 0; full check 594.694 seconds, DB 477.228 seconds (rounded from recorded milliseconds). DB failures/skips/missing names are zero. Preservation reports no mismatches, 1,431 source entries, 14,423 dependency entries and 12 unchanged pre-existing containers. Those are the parent's observations, not a new container inspection here. Separate DB invocations, focused checks, mutants and older runs are not added to the total.

The formerly pending exact mandatory case is now required by `foundation/scripts/test.ts`: `gateway rejects mixed identity on human routes before authority body or handler work`. It already ran before the repair; count increases were never required. The one-name repair is committed and parent-verified. The rename witness demonstrates omission-enforcement sensitivity, not a product authentication bypass. Initial copied-export provenance failure remains a fixture failure, not the actual sensitivity RED.

## Declared acceptance reconciliation

All rows are bounded to the fixed local linear run, synthetic signed identities and disposable PostgreSQL evidence. The final registration qualification in the v2 workspace draft is superseded by REG-P, not silently omitted.

| Declared criterion | Accepted evidence | Disposition / boundary |
|---|---|---|
| R12-AC01 / C1 provenance | `run-contract.ts`; `run-inspection.test.ts`, `runs.test.ts`, genuine revision7 upgrade | Immutable definition/policy/input/source pin and old receipt replay; sourceRevision alone is not hosted build truth. |
| R12-AC02 / C2,C3 positive tracer | `runs-http.test.ts`, `run-resume.test.ts`, `run-age-upgrade.test.ts` | Complete pause/decision/fresh-process handoff chain with linked receipts; no external exactly-once claim. |
| R12-AC03 current authority | run start/decision/resume/cancel/inspection negatives and exact mixed-identity gateway case | Current human scope, participant rules and independent canceller/inspector checked; final name-enforcement gap resolved by REG-P. No deployed identity witness. |
| R12-AC04 restricted SQL | migrations025–031, scoped pool/privilege/FK/immutability cases in run suites | Restricted login, forced RLS/private helpers and scope negatives; GUCs remain trusted-server assertions, not protection against stolen DB credentials. |
| R12-AC05 exact approval | decision concurrency/drift/expiry/deferred finalguard and resume denial/replay cases | Exact independent designated reviewer, current authority, immutable evidence and no renewal; run approval is not semantic promotion. |
| R12-AC06 concurrent replay | concurrent starts/preparation, decision/resume/cancellation shared key tests | DB constraints and locks own one accepted result. Original service receipt bytes and HTTP parsed equality are distinct evidence. |
| R12-AC07 crash/commit | real backend termination, fresh processes, insert/update/deferred faults, lost HTTP responses; age barriers | Atomic rollback/reconciliation and031 drainage before final age/lease/time guard; no exhaustive catastrophic-loss guarantee. |
| R12-AC08 fencing/parallel failure | expired leases, both cancellation/finish orders, cross-run isolation, cross-process workspace lease contention | Fixed linear runs and independent concurrent runs; caller-selected parallel DAG rejected, not implemented. |
| R12-AC09 revocation ordering | owner/reviewer/inspector attributable waiter/blocker relationships, operation-first/revoke-first | Tested grant-order linearization and post-approval revocation; not every conceivable concurrent authority mutation. |
| R12-AC10 / C4 outcome honesty | measured failure, partial after preparation, unknown acknowledgement/inspection, doctor inconsistency | No failed/partial/unknown → Done; doctor observes without repair or promotion. Unknown is not evidence of rollback. |
| R12-AC11 bounds/redaction | actual retained256/journal128/attempt/lease witnesses; four age cases and final-age mutant; parser/inspection privacy | Accepted finite behavior; accelerated expiry is not a natural24h soak. Literal definitions1–7 structurally stay below16; no fabricated16th/17th admission. |
| R12-AC12 regression/recovery | final REG-P canonical lane; populated recovery001–031; genuine historical upgrades; package/tamper controls; repaired exports | Exact mandatory coverage now accepted. Hosted/deployed/platform/human release evidence remains open. |

Story12.1's use case, immutable records, actor matrix and detailed criteria have executable counterparts. Story12.2's formerly missing continuation chain now exists. Story12.3's cancellation/inspection/crash/replay/fences/limits/recovery have bounded local evidence. These are criterion reconciliations, **not worker-issued tracked-story closure**.

## Findings and dispositions

1. **Expiry during deferred preparation — fixed and accepted.** Unchanged001–030 demonstrably committed after expiry while lease and service budget remained valid. Additive031/revision7 drains constraints before the final real-time guard; four discriminating witnesses and the final-age-only mutant/restored control support the repair [AGE-P; age spec]. Accelerated INSERT-time historical timestamps preserve the incoming/stored24hour interval, not naturally elapsed24hours. Prevention: exercise the exact outer production call and keep unrelated guards valid.
2. **Finite capacity — accept as scoped.** Real retained256 admissions and natural journal128 boundaries are evidenced. An abandoned boundary claim cannot create unavailable journal rows; reserved cancellation preserves partial truth. No purge/archival or unlimited recovery. Literal fixed revisions1–7 are tighter than16; any expanded registry must revisit enforcement [CONTRACT; retention/journal spec].
3. **Package/orchestration tradeoffs — accept with limits.** Actual129 inputs now fit rebuilt finite160-input packages with duplicate-aware two-level parsing and producer use of the real consumer. Existing65536-byte manifest,2MiB input and32-asset limits remain. Theoretical hashing ceiling320MiB, pre-size-check manifest reading, symlink/TOCTOU limits, and lost separate preflight isolation/randomized repetition remain disclosed. No hostile-filesystem sandbox, signed-distribution authenticity or guaranteed Epic13/14 package fit. Old timing/fixture failures remain failures. No revision8 follows from package-only changes [age spec; AGE-P].
4. **New owned source exports — fixed and accepted.** `withRevisionOneSource` brackets allocation/setup/provenance/callback/cleanup, verifies extracted bytes before deletion, preserves primary Error and shared dependencies, and reads exact absence. Real deletion failure remains failure; test containment is not automatic product cleanup. CLEAN-W preserves **103 historical exports / 23,690 historical file hashes** untouched. They are not an ongoing new-export leak; broad cleanup is neither required nor authorized [cleanup spec; CLEAN-W/P].
5. **Gateway required-name enforcement — fixed and accepted.** Exact case registration plus rename sensitivity/restored controls and REG-P resolve the final local blocker. Do not confuse count floors with exact required identities, or this enforcement defect with an auth bypass [REG-W/P; accepted HEAD].
6. **Stale context — additive reconciliation applied.** The current [Epic12 context](epic-12-context.md) now points to this acceptance without altering frozen historical intent. No all14 completion, catalog rewrite or live status follows. Next local work uses [13.1](spec-13-1-work-plane-contract.md), preserving retained work-plane compatibility rather than inventing a second authority.

## Previous-retro follow-through

Historical Epic12 proposals A2 continuation, A3 cancellation/inspection, A4 limits/upgrades/age, A5 barriers/mutants/new owned export cleanup and exact gateway registration now have the evidence above. A6 current context is supplied additively. No live action selector or sprint status is changed. Epic11's historical intermittent restore failure is not assigned a fictional root cause by later passing restores; human/deployed/usability claims remain unclosed.

## Open items, owners and assumptions

- **Parent:** inspect/accept this five-document candidate and commit under its own authority; independently decide any tracked-story/status action. This writer does neither.
- **Release/product owner:** retain actual6.5/9.4, hosted exact-revision CI, deployed rollback, actual-human/visual/accessibility/installed-client/platform and authorized external destination/readback gates. This document neither executes nor closes them.
- **Brooks / next single Woz writer:** use the adopted [work-plane compatibility contract](../planning-artifacts/contracts/work-plane-compatibility-v1.md) and bounded13.2 packet in [Epic13 context](epic-13-context.md). No existing source capability is labeled deployed; actual workspace/cutover ownership must remain fail-closed when unsupported.
- Epic12/date/local acceptance and registration outcome are explicit parent inputs, corroborated by receipts and HEAD, not auto-detected from an invented tracker. Drafts `allura-epic12-final-local-retro-v2.md`, `allura-epic12-context-reconciliation-v2.md` and `allura-13-1-contract-adoption-packet-v2.md` remain unchanged historical preparation. Their pending gate is now resolved only by the later evidence recorded here.
- No unresolved product choice blocks this bounded local documentation adoption. Actual live ownership mapping, rollout and external acceptance require separately authorized evidence; they are not silently supplied by engineering defaults.
