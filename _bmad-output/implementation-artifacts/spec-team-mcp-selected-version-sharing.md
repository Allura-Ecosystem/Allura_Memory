---
title: 'Team MCP: selected-version human sharing boundary'
type: feature
created: '2026-10-30'
status: done
baseline_commit: ace4f3fcf8c772cf8705944ba17bd8d36316a83a
route: dispatch
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/selected-version-sharing-v1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Sabir approved reviewed-version-only sharing: separately approved recipients receive only the selected immutable version; future versions require new approval. Implement the smallest signed-human approval/revocation/exact-read boundary before admitting members to MCP. This is an Epic6 dependency, not completed Gabe/Sam client support.

## Boundaries & Constraints

Preserve Sabir's legitimate owner access, tenant isolation and actual independent human semantic approval. Never create viewer grants, widen memory:read, change existing memory_get/default history, add a sixth tool, relax OAuth, promote automatically or mutate live services/data. New additive migration023 runs only on owned disposable synthetic databases. The adopted linked contract defines all DTO, revision, replay, disclosure and current-authority rules. Real installed-client/deployed/human acceptance stays open; no SSH, remote push or deferred-epic adoption.

## I/O & Edge-Case Matrix

| Given | When | Then |
|---|---|---|
| Reviewed immutable version and current human admin | Approve for A | A alone gets exact content; B and neighboring records remain denied |
| Selected-only recipient | Read exact approved ID | Only id/content/created_at; no provenance, lineage or head metadata |
| Successor exists | Default old read / explicit history | Default denies; history returns only old approved ID; successor denied |
| Revoked grant | Replay original approval / new explicit approval | Historical receipt never reactivates; current-revision new approval may |
| Stale revision/key conflict/audit failure | Command | No partial mutation or content disclosure |
| Removed issuer/recipient authority or locked workspace | Read | Current checks deny; no cached grant bypass |
| Machine/forged/cross-scope/CSRF caller | Request | Deny safely without protected effects |

</frozen-after-approval>

## Code Map

Under foundation: `access.ts`, `access-api.ts` provide human command conventions; `authentication.ts`/`gateway.ts` enforce identity and CSRF. `persistence.ts:48–62` documents trusted server assertions but scopedTransaction prelocks one actor: do not reuse blindly for multiparty locks. SQL005 immutable semantic versions and SQL010 memory_projection differ; read a narrow version DTO, never mutable head metadata. SQL011/020 federation helpers require explicit negative coverage. SQL021 is workspace/action authority; SQL022 consent is admin-only and stays unchanged. `client-authority.test.ts` supplies observed blocking patterns. Core release test has an exact22-migration packed-recovery assertion.

## Tasks & Acceptance

Execution, sequential RED→GREEN:
- [x] `foundation/tests/memory-shares.test.ts` — first real gateway/DB failing A-only share/read tracer, then minimum implementation; expand one contract behavior at a time.
- [x] `foundation/migrations/023-selected-version-sharing.sql` — private exact-version state, immutable receipts/audit and guarded locked helpers, after observed behavioral RED.
- [x] `foundation/src/memory-shares.ts`, `foundation/src/memory-shares-api.ts` — strict human commands/read and dedicated multiparty transaction; no broad authority changes.
- [x] `foundation/src/core-api.ts`, `foundation/src/persistence.ts` — route and migration registration only.
- [x] `foundation/src/gateway.ts`, `foundation/tests/gateway.test.ts` — narrowly preserve the parent-tested early human/Authorization rejection; permit typed sharing-domain error mapping using the existing safe outcome/status conventions. No general gateway refactor, authorization weakening or arbitrary error disclosure.
- [x] `foundation/scripts/test-db.ts` — exact named nonzero DB registration; `foundation/tests/core-release.test.ts` — exact migration inventory23 only. `foundation/src/ci-contract.ts` may change only if its strict inventory demonstrably requires registering this new suite; never weaken it.
- [x] Run all canonical gates and return final changed paths, test counts and RED/GREEN receipts. Append implementation evidence below; parent owns review/commit/status.

Acceptance:
- Given two distinct recipients without workspace grants, when one version is shared with A, then only A reads exactly approved content and neither gets successor, neighbor, evidence, proposal, graph, history enumeration or metadata.
- Given selected-only access, when existing text/vector/hybrid/federated/status=all search, list/get, dashboard/audit/health, writes/reviews/admin or OAuth is attempted, then existing authority denial remains, including direct restricted-role SQL helpers.
- Given current authority loss or revocation, when sequential and genuinely blocked concurrent reads execute, then ordering is proven and revoke-first never discloses; audit failure rolls back.
- Given old receipts, stale revisions, repeated/new operation keys and later reapproval, when commands run, then byte-exact historical replay and explicit revision transitions preserve current state without resurrection.
- Given baseline owner/client/device/retrieval/browser/recovery behavior, when canonical suites run, then all registered cases pass with no skips, filters or relaxed inventories.

## Implementation Notes

### Parent scope extension and ingress fix

Woz's initial run exposed a real missing dependency rather than a product choice. Parent inspected gateway.ts and diagnostic receipts, added a registered gateway regression, independently observed RED8 pass/1 fail/43 assertions (mixed request200 vs expected401), then added one early Authorization-header rejection in the human branch. Focused GREEN9 pass/0 fail/97 assertions; typecheck and lint exit0. Receipt directory: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-sharing-ingress/`. Covers assertion/cookie identities, GET/POST, valid/malformed JSON, bearer/unsupported/empty Authorization, untouched bodies and zero authority/machine/handler calls; ordinary signed-human controls pass. This is not full canonical or sharing acceptance.

Scope now explicitly includes gateway.ts and gateway.test.ts for this guard and typed sharing error mapping only. Preserve parent guard/test; resume existing observed sharing RED without restarting discovery or weakening the contract. Initial Woz completed, so parent made these changes with no concurrent source writer. Frozen intent and contract remain unchanged. Next writer must register sharing tests and run all canonical gates on final bytes.

### Resumed Woz — local implementation in progress

- Reused the observed real-gateway positive RED. Added migration023 private exact-version state/receipts/audit, dedicated multiparty SQL/service and route registration; preserved parent early mixed-identity guard byte-for-byte apart from allowed typed error import/mapping. Positive GREEN:1 pass/0 fail/11 assertions, inner exit0 (`sharing-resume/01-positive-green.log`).
- Locking inspected against SQL001/002/021/022: use the existing tenant access-command advisory key **before** row locks (shared reads, exclusive commands), deterministic involved principal/membership/binding locks, tenant, shared-read/exclusive-command workspace, grants and exact share/head. This serializes candidate replacement/absent creation and avoids remove_member's later membership upgrade; no workspace lock upgrade.
- Revoke/replay tracer RED:1 pass/1 fail/16 assertions, missing revoke404 vs200, inner exit1 (`02-revoke-red.log`); GREEN after explicit revoke transition:2 pass/0 fail/28 assertions, inner exit0 (`03-revoke-green.log`). Historical approval and revocation response bytes replay without resurrecting or undoing current state; stale/new-key no-op conflicts and revision3 explicit reapproval observed.
- All receipts/logs in `/home/sabira/.hermes/profiles/troy/cache/scratch/sharing-resume/`. Each diagnostic owns/removes one exact synthetic container; unrelated container inventory preserved. Diagnostic wrapper exit0 reports child exit separately; not canonical evidence. Next gate: restricted SQL exact-input validation RED→GREEN, then security/history/concurrency and canonical registration/gates. No acceptance/commit/external writes.

### Resumed Woz — implemented sharing; canonical blocked by two test allowlist dependencies

This entry supersedes the earlier pre-implementation/next-gate statements, without changing frozen intent, task scope or acceptance status. No commit or acceptance closure.

- Implemented migration023 plus `memory-shares.ts`/`memory-shares-api.ts`, route/migration registration and typed safe gateway errors. Parent early mixed-identity guard and regression remain intact. Current exact-version reads disclose only the contracted DTO; current multiparty authority and history eligibility are checked under locks through audit/commit. State/receipts/audit are private; receipt/audit immutability and rollback are tested. No existing RLS/action role, MCP tool, OAuth implementation, UI or migrations001–022 changed.
- Sequential diagnostic receipts (child Bun exits, not outer Python exits): SQL validation `04b-sql-validation-red.log` 2 pass/1 fail/29 assertions, exit1 → `05-sql-validation-green.log` 3/0/38, exit0; removed-recipient revoke `09-revoke-removed-recipient-red.log` 5/1/118, exit1 → `10-revoke-removed-recipient-green.log` 6/0/119, exit0; absent revoke `18-absent-revoke-red.log` 14/1/424, exit1 → `19-absent-revoke-green.log` 15/0/427, exit0. History and own-capture intermediate failures were fixture/API corrections, not claimed production behavioral REDs. Initial SQL diagnostic timeout was cleaned up and rerun; it is not a valid RED receipt.
- Security/history/current-authority/private-SQL/rollback/concurrency expansion culminated in `20-concurrent-command-binding.log`: **17 pass/0 fail/439 assertions, child exit0**. Genuine lock waiters were observed using `pg_blocking_pids`, with controlled release, for share revoke, issuer demotion and recipient binding loss in both orderings. Recipient-loss read-first uses the real service commit result because the gateway may conservatively suppress an already committed read at its final admission recheck; revoke-first and subsequent HTTP denial remain covered. No claim of retroactive withdrawal of delivered bytes.
- Registered **17 exact unique sharing names** in `scripts/test-db.ts`, alongside the new suite path; strict full inventory is **250 unique cases**, sharing missing[]. Updated only core-release's exact migration inventory22→23; did not weaken runner thresholds/skip checks or modify `ci-contract.ts`.
- Canonical commands ran with the specified local toolchain PATH: `bun run check:toolchain` exit0; `bun run typecheck` exit0; `bun run lint` final exit0 (initial unused callback parameter lint exit1 corrected in sharing test helpers); `bun run test` exit0, **135 pass/0 fail/1952 assertions across27 registered files**, including parent gateway **9/0/97**. `bun run test:db` **exit1**, stopped at mandatory OAuth lane **26 pass/1 fail/427 assertions across3 files**; full canonical DB inventory was therefore **unreached**, not passed. `gate-*.log`, `gates-check-toolchain.json`, `gates-typecheck.json` retain results; the final lint log replaced its first failing log, while the first structured exit remains recorded.
- **Concrete essential test allowlist dependency1:** `foundation/tests/oauth-contract.test.ts:100` expects400 for mixed signed-human plus Authorization, but the preserved parent-tested early guard correctly returns401. Canonical failure is `OAuth consent binds the signed display session exact scope and one use nonce without implicit member grants`. Do not revert/move/relax the parent ingress guard. This test file is outside the current source allowlist and was left unchanged.
- Ran an additional **unfiltered full registered inventory diagnostic**, extracted from the actual canonical runner, in a separate owned disposable container: `python /home/sabira/.hermes/profiles/troy/cache/scratch/sharing-resume/run.py 21-full-registered-diagnostic --full-inventory`. Inner command **exit1, 245 pass/5 fail/3035 assertions, 250 tests across41 files** (`21-full-registered-diagnostic.log` and `.json`); all17 sharing cases passed. Outer Python exit0 merely reports/cleans up; it is not a passing test result. This diagnostic does not replace the failed canonical gate or its later unreached inventory checks.
- **Concrete essential test allowlist dependency2:** `foundation/tests/recovery.test.ts:35` hardcodes `manifest.migrations` length22, receives23 with the required additive migration. This aborts setup of the second backup manifest and produces three downstream recovery failures (undefined manifest path, `recovery_manifest` instead of target-not-empty, and zero successful concurrent restores). That file is also outside the allowlist and was left unchanged. Full diagnostic failures comprise this primary recovery count, its three downstream failures, and the OAuth assertion above. Packed core/recovery cases passed diagnostically, but that is not full recovery acceptance.
- Required parent action: authorize only the two stale expectation updates (`oauth-contract.test.ts` mixed400→401 and `recovery.test.ts` inventory22→23), then rerun all canonical gates and inspect subsequent results. Do not infer that these updates necessarily make every remaining gate green. No implementation scope/locking dependency beyond these test maintenance dependencies was found during direct source self-check.
- Preservation verified programmatically against parent baseline: only admitted docs/ingress and allowlisted tracked implementation files differ; contract and parent client-auth document match dispatch hashes; old migrations and unrelated baseline source hashes unchanged. `git diff --check` exit0; HEAD remains `ace4f3fcf8c772cf8705944ba17bd8d36316a83a`. Canonical runner verified exact removal of `allura-direct-test-955b5a69-5591-4555-b9bc-a49f691a4047`; full diagnostic verified removal of `allura-sharing-resume-fa941f4c-95b5-458d-be1f-a0e49a0d63f9` and unchanged unrelated container inventory. Final label query found no sharing-resume containers. No installed DB, remote, secret/profile, budget, live grants or external outcome mutation.
- Remaining: the two narrowly scoped test updates require parent authorization; successful full canonical DB gate/inventory, parent independent source/security/governance review and reruns, and genuine product/client/hosted/human acceptance remain open. Task checkboxes/status intentionally not closed. New workflow lesson: an early authentication tightening can legitimately invalidate an older downstream400 expectation; additive migration count updates must cover both packed-core and standalone recovery manifests, not only the initially discovered test.

## Spec Change Log

## Review Triage Log

### Parent final-byte review and independent canonical verification

Inspected the complete023 SQL, sharing service/API, all17 security tests and every tracked implementation/harness diff. Private tables grant no runtime/PUBLIC access; the only entrypoint uses exact composite version identity, deterministic multiparty row locks and the existing access-command tenant advisory key (shared reads, exclusive commands) to avoid lock upgrades. Current grant_admin includes active human/tenant/membership, active workspace-admin grant and unlocked workspace; that role already includes memory read. Binding checks are exact. No broad role/action/RLS, old migration, MCP inventory or OAuth issuance change. Dedicated audit/commit and immutable replay preserve the specified semantics. Direct self-check replaces developer-review ceremonies; no independent-human acceptance claimed.

Parent reran all five canonical commands on unchanged final source: toolchain/typecheck/lint/unit/DB exit0. Unit135 tests/1952 assertions; full restricted PostgreSQL250 tests/3081 assertions, fail0/skip0/missing[]. Unique385 tests/5033 Bun assertions. All17 sharing cases ran in the canonical250; focused OAuth27/443 and authority12/160 are repeated subsets, not added. Browser/recovery/packed lanes are included; separate Node browser assertions are not included in Bun totals. Original container IDs retained, no added containers, owned test container removal verified. Evidence: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-sharing-20261031T024457Z/`.

Read-only governance evaluation passed with audit_logged=false using the existing explicit allura-system credential mapping for the same troy-admin principal. Initial helper default used the FaithMeats credential and correctly returned TENANT_MISMATCH; both receipts are retained. No scope or credential changed and no bypass occurred. Legacy outcome memory writes remain held. This does not establish durable remote audit, real client sign-in, member OAuth/MCP, UI or deployment acceptance.

Parent inspected final sharing SQL/service/routes and all17 test cases after Woz completion. Narrow scope extension: oauth-contract.test.ts expects early mixed-identity401 rather than its obsolete downstream400; recovery.test.ts retains exact inventory, now23 for additive023. These are dependent assertion corrections, not security or inventory relaxation. Parent will independently rerun all canonical gates; worker diagnostic success is not acceptance. Frozen intent and old migrations unchanged.

## Verification

From foundation prefix PATH with `/home/sabira/.local/share/allura-toolchain/bun-linux-x64-baseline:/home/sabira/.local/share/allura-toolchain/node-v24.19.0-linux-x64/bin`. Run `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:db`; retain complete logs and exits. Canonical DB includes browser/recovery/packed lanes. A diagnostic focused DB harness is additional, never substitution. Verify `git diff --check`, unchanged unrelated admission hashes and owned container cleanup. Parent separately reruns all gates, reviews final source, performs secret/diff/governance checks and verifies a local owned commit; no worker commit or external write.

## Active Execution Ledger

Baseline ace4f3fcf8c772cf8705944ba17bd8d36316a83a. Current phase: parent canonical gates and direct final-source review passed,385 unique tests/5033 assertions. Candidate secret/diff/preservation and governance checks passed:15 owned paths,1350 unrelated tracked hashes unchanged. Local commit verification is retained in the parent evidence directory. Next product gate: separately specified member client authorization/integration; this human-only slice does not close that requirement. No writer active. Member OAuth/MCP and actual human/installed/deployed acceptance remain open. Legacy outcome write hold remains; remote operational work status unknown. Older worker-stop notes below are historical and superseded.

### Woz local implementation evidence — bounded dependency stop

- State: **blocked before production implementation**, not acceptance-ready. Read both frontmatter context files fully; missing `.agents/TEAM-RAM-RUNTIME.md` maps to this adapter plus loaded Team RAM Woz guidance. Parent-rendered BMAD steps1–3 remain the admitted workflow; no duplicate rendering or nested workers.
- Added only `foundation/tests/memory-shares.test.ts`: one real core HTTP/restricted-DB positive tracer with two grantless recipients. It creates evidence, proposal and independent synthetic-human approval through the actual services. First observed RED: missing `/api/memory-shares/approve` returns404 where200 is required;0 pass/1 fail/4 assertions, exit1. This is a behavior failure, not an import/setup error. Subsequent A-read/B-denial assertions remain unreached; no claim they passed.
- Receipts under `/home/sabira/.hermes/profiles/troy/cache/scratch/selected-sharing-woz/`: `01-positive-red.log` and confirming `03-positive-red-confirmed.log`. No production source/migration was written and there is **no sharing GREEN receipt**.
- Proven allowlist dependency: contract17 requires mixed identities to fail before protected body work. `foundation/src/gateway.ts:83–87` authenticates human assertion/cookie but does not reject `Authorization`; its only mixed-header rejection is in the machine branch at90. Body parsing occurs at97, before `additionalActions` at101 or route handler at103. `Route` at17 exposes no pre-body guard. The allowlist permits only route registration in `core-api.ts`, not a new ingress wrapper, and excludes `gateway.ts`.
- Real-core diagnostic `mixed-identity.test.ts` (scratch only) with synthetic signed human JWT plus a locally issued synthetic machine bearer proves the dependency: human-only metadata200, machine-only malformed body401, mixed valid body200, mixed malformed body400 `{outcome:"invalid"}` instead of401. Corrected diagnostic RED `04-mixed-identity-blocker-confirmed.log`:0 pass/1 fail/3 assertions, exit1. Initial diagnostic `02-mixed-identity-blocker.log` is retained but not counted as valid RED: its positive metadata control used a non-org administrator and returned403; using the fixture's actual org identity corrected that control without changing authority or production code.
- Required parent action: narrowly extend scope for the pre-body human/machine mixed-identity guard in `foundation/src/gateway.ts` and its behavioral regression coverage (normally `foundation/tests/gateway.test.ts`), or supply an approved equivalent ingress contract. Do not work around it in a late sharing handler or broaden core registration permissions implicitly. Then resume the observed positive RED→minimal GREEN and sequential security/concurrency matrix.
- Canonical commands all executed from `foundation` with the exact specified PATH prefix: `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:db`, each exit0. Full logs `gate-check-toolchain.log`, `gate-typecheck.log`, `gate-lint.log`, `gate-test.log`, `gate-test-db.log`; structured exits `canonical-gates.json`.
- These are **preservation gates only**: canonical unit27 registered files/134 cases/1896 assertions; canonical restricted-postgres233 cases/2642 assertions/0 fail/0 skip/missing[]. Additional repeated focused lanes: OAuth27/443, client-authority12/160. The new sharing test is not yet registered in `test-db.ts`; new registered sharing cases=0. Do not infer feature verification from the baseline gates.
- Both uniquely named diagnostic containers were removed with exact-name readback; diagnostic receipt reports all unrelated containers preserved. Canonical runner confirmed removal of `allura-direct-test-d5b68f18-2a91-45d8-98b4-88b654693058`. No installed beta/staging/legacy DB was targeted.
- Remaining: migration023, sharing services/routes, canonical registration, all contract security/history/replay/revocation/concurrency tests, final source self-check and parent verification. No commit, acceptance closure, external outcome write, deployment, client integration, credentials/live grants change or runtime-goal/budget change. Broader team-client goal remains open.
