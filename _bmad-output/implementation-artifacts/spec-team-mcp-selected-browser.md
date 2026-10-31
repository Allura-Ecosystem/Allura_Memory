---
title: 'Epic6: selected-member browser consent'
type: feature
created: '2026-10-31'
status: done
route: dispatch
baseline_commit: 1538f460cf950337824a8de23f740e464cdb521c
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/selected-client-v1.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/selected-consent-ui/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/selected-consent-ui/design-contract.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/selected-consent-ui/implementation-handoff.md'
---

<frozen-after-approval reason="standing approved Epic6 scope; delegated engineering defaults, not human product acceptance">

## Intent
Connect a grantless recipient's client through a separate selected-member browser review, reaching exact approved-version MCP read without new workspace access. Backend1538f460 is complete; extend its selected redirect/UI only. Owner consent stays unchanged.

## Boundaries & Constraints
Always retain signed identity, current immutable-version sharing, five tools, selected-only capability, strict callback/PKCE/session binding and fail-closed one-use state. Apply the linked design/behavior contract including M1–M12. Ordinary design defaults are delegated under the repository adapter; no unresolved product decision remains.

Never add migrations, authority APIs, enumeration, workspace grants, dependencies, storage, browser token exchange or owner-only context checks. No SSH, branch/worktree, remote push/deploy, live credentials/grants/schema changes, production access, automatic semantic promotion, unrelated profiles or budget changes. Preserve STOP controls, original services/containers/data/source and all completed work. No legacy memory writes. Worker cannot commit or close operational/human acceptance.

## I/O & Edge-Case Matrix
| State | Required result |
|---|---|
| Eligible signed member + reviewed scope | Frozen selected request; explicit decision; SDK exact read only |
| Invalid identity/scope/binding/authority/tamper/replay | No private disclosure, issuance or navigation |
| Dismiss confirmation | No POST; focus returns |
| Explicit eligible cancellation | Bound callback/state, no code/credential |
| Lost/stale/unknown/navigation result | Terminal clear/abort; no retries or inferred rollback |
| Owner/disabled/machine-only paths | Existing behavior/security unchanged |

Detailed M1–M12 and exact field/transport/callback rules in the frozen design contract are normative; map every row to actual executed evidence, including retained backend cases where appropriate.

</frozen-after-approval>

## Code Map
- `foundation/src/selected-client-api.ts` and SQL024: existing exact ten-field display/eleven-field decision and current entitlement; READ ONLY.
- `foundation/src/oauth-provider.ts`, `dashboard-server.ts`, `ui/main.tsx`: selected destination, neutral shell and separate component dispatch.
- Owner consent transport/UI: patterns only; admin verification and owner DTO assumptions MUST NOT be reused.
- Existing browser fixture/runtime: actual HTTPS/Chromium, synthetic signed cookies, owned callback/issuer and strict SDK origin mapping.

## Tasks & Acceptance
- [x] Observe real selected authorization RED, then implement minimum separate page/transport/component and Chromium→callback→SDK GREEN.
- [x] Sequentially cover contract M1–M12; preserve JSON helper tests and owner behavior.
- [x] Register all cases in strict unit/CI and both DB/browser inventories; run canonical gates and reconcile real counts.
- [x] Direct final-source/security self-check, preservation/cleanup and exact evidence handoff for parent verification.

Given an eligible grantless signed recipient, when real browser approval and client state verification complete, then installed SDK exchanges/reconnects and returns only the approved immutable version through selected get.
Given any matrix refusal or uncertain result, when exercised through real production paths, then private state/authority cannot be widened or resurrected.
Given final candidate bytes, when canonical lanes run, then no required case is missing/skipped and existing owner/browser/recovery24 behavior passes.

## Exact Writer Allowlist
New:
- foundation/ui/selected-consent.tsx
- foundation/src/selected-consent-transport.ts
- foundation/tests/selected-consent-transport.test.ts
- foundation/tests/selected-consent-browser.test.ts
- foundation/tests/selected-consent-browser-fixture.ts
Narrow existing changes:
- foundation/src/oauth-provider.ts
- foundation/src/dashboard-server.ts
- foundation/ui/main.tsx
- foundation/tests/selected-client.test.ts
- foundation/tests/dashboard-http.test.ts
- foundation/scripts/test.ts
- foundation/scripts/test-db.ts
- foundation/src/ci-contract.ts
- foundation/tests/ci-contract.test.ts
This spec: status/task checks and append-only evidence only; frozen block remains unchanged. New design documents and broader client-auth continuation are parent-owned/frozen. All other paths are outside scope. If evidence proves another file essential, return the exact dependency and observed failing receipt; do not relax a test or expand scope silently.

## Verification
From foundation with PATH=/home/sabira/.local/share/allura-toolchain/bun-linux-x64-baseline:/home/sabira/.local/share/allura-toolchain/node-v24.19.0-linux-x64/bin:$PATH:
`bun run check:toolchain`; `bun run typecheck`; `bun run lint`; `bun run test`; `bun run test:db`.
Run sequential behavioral RED→minimal GREEN, then remaining matrix. Keep strict exact CI inventory and assertion floors; browser names must run in OAuth pre-gate and full restricted DB lane. Parse child exits/fail/skip/missing, not wrapper exit alone; avoid double-counting pre-gates and report browser assertions separately. Retain diagnostic failures honestly. No source-regex-only behavioral evidence.

Capture admission hashes and container IDs; all unrelated bytes/services remain preserved and owned fixtures removed. Write sanitized receipts under profile scratch, with commands/counts/exits, matrix mapping, changed paths, retained failures and unknowns. No secrets/session credentials in output. Parent reruns gates, performs governance/secret/diff checks and owns the local commit; worker stops at verified handoff or concrete boundary, not at a lone green tracer.

## Design Notes
One-step known-scope review is sufficient because selected SQL already verifies entitlement and freezes request. No dashboard-context API is appropriate. Current sharing remains authoritative per read; consent does not freeze future content grants. Source-grounded design defaults are not human visual approval.

## Implementation Notes
Parent adoption2026-10-31: clean baseline; Scout full report recovered from session message132723. No source implementation yet. BMAD rendered workflow and current adapter used; absent TEAM-RAM runtime maps to adapter plus loaded Team RAM. Routine approval/reviewer ceremonies are superseded by standing direct-build authorization, not human product/security gates. Scoped legacy memory_search discovery succeeded; subsequent authenticated session initialization timed out before retrieval, so recall is unavailable, not an empty result/status. No outcome writes. Real human/installed-client/hosted6.5/9.4 gates remain open.

## Spec Change Log

## Review Triage Log

### Woz local evidence handoff — 2026-10-31

Implementation tasks above are local execution evidence only. Status remains **in-review** for parent verification; no commit, product/human acceptance, operational status mutation or external release closure was performed. The installed BMAD build was rendered once and followed through direct implementation/self-check using the current adapter. Missing `.agents/TEAM-RAM-RUNTIME.md` mapped to `guidelines/ALLURA-BMAD.md` plus loaded Team RAM guidance; no replacement runtime was created. No nested implementation/reviewer agents were used. Generic workflow commit, Done and Brain-write instructions were not executed because this spec expressly withholds them.

All receipts below are under `/home/sabira/.hermes/profiles/troy/cache/scratch/selected-browser-woz/`. `handoff-verification.json` contains exact commands, child exits, named-test/line references for M1–M12, deduplicated counts, final owned paths/hashes and preservation checks. `verify-handoff.py` derives this receipt from actual logs/source/baseline, not assumed wrapper success. `source-review.diff` is the reviewed foundation-only candidate; `final-candidate.diff` also retains parent document context and is not an ownership claim.

#### Sequential behavioral checkpoints and retained diagnostics

- `red-browser.log`: actual tokenless SDK authorization/Chromium failed because destination was `/api/oauth/selected-consent` instead of `/dashboard/oauth/selected-consent`; child exit1, 0 pass/1 fail. This was the missing browser route, not a test-import/type error.
- `green-tracer.log`: the separate route, page and transport reached actual callback, original state comparison, SDK exchange/reconnect and exact selected-get; child exit0, 1 pass, 13 Bun assertions and 14 browser assertions.
- Subsequent focused receipts: `cancellation-check.log` (2 pass), `admission-check.json` (3 pass), `binding-check.json` (4 pass), `current-authority-check.json` (5 pass), `lifecycle-check.json` (8 pass), `lost-response-green.json` (9 pass), `robustness-unit.json` (9 pass/259 assertions), `focused-matrix-check.json` (12 pass/56 Bun assertions). These are historical checkpoints, not additive final totals. The last malformed-navigation case was then included in both canonical DB inventories.
- Retained diagnostic failures: `transport-check.log` had 6 pass/1 fail because an adapted test mutated `/consent` instead of `/selected-consent`; its mutation was corrected. `lost-response-check.json` had 8 pass/1 fail because the test incorrectly expected an approved transaction to retain its nonce; production SQL consumes it. The corrected assertion explicitly checks one approved/consumed/coded transaction and one displayed/unconsumed/uncoded transaction, with no credential and one pending connection. `responsive-modes-check.json` had 10 pass/1 fail because programmatic focus alone does not activate keyboard focus-visible; the witness now tabs away/back and checks active-element outline. No production security rule or existing assertion floor was weakened to pass these diagnostics.
- Early wrapper process exit was not used as a child result: RED/GREEN use their logged child exits and test output; canonical gates use their explicit JSON receipts plus parsed lane summaries. Expected refusal401/403, aborted requests and deliberately induced packing/recovery failures remain visible inside successful negative-test runs.

#### Final canonical gates on unchanged foundation candidate bytes

Working directory: `/home/sabira/Allura_Memory-beta-local/foundation`; PATH prefix exactly as specified above. All five commands exited0:

| Command | Receipt | Actual result |
|---|---|---|
| `bun run check:toolchain` | `canonical-toolchain.json` / `.log` | Bun1.3.14 and Node24.19.0 verified |
| `bun run typecheck` | `canonical-typecheck.json` / `.log` | exit0 |
| `bun run lint` | `canonical-lint.json` / `.log` | exit0 |
| `bun run test` | `canonical-unit.json` / `.log` | 144 tests, 2225 Bun assertions; 0 fail/skip |
| `bun run test:db` | `canonical-db.json` / `.log` | Full restricted lane: 280 tests, 3804 Bun assertions; 0 fail/skip/missing |

DB pre-gates also passed: OAuth40 tests/502 Bun assertions, client-authority12/160; these duplicate full-lane coverage and are **not** added to the unique total. Final unique canonical total: **424 tests / 6029 Bun assertions**. Separate browser-runtime counters: **1081 Playwright assertions** in the full DB lane; selected-browser cases contribute **202**. OAuth pre-gate has337 browser assertions, including the same202 selected assertions, not an additional unique total. All13 selected browser names executed in both inventories; all9 selected transport names executed in strict unit/CI inventory; all16 retained selected backend cases executed in the full DB lane. Previous parent backend verification is not substituted for this run.

#### Matrix map

Exact full names and actual pass-line numbers are recorded under `verification.matrix` in `handoff-verification.json`; the following abbreviations identify their subject, not replacement tests.

| Contract row | Actual executed evidence |
|---|---|
| M1 | Selected browser SDK discovery: tokenless challenge, real Chromium signed synthetic grantless recipient, explicit GET/approval, callback original state, SDK exchange/reconnect, five tools/ping and exact text/structured selected DTO |
| M2 | Browser no-share refusal plus retained `selected client grantless recipient...` and `selected client exact history...`: no new recipient workspace grants/owner connections/shares; wrong kinds/tools/routes denied, elevation does not broaden selected capability |
| M3 | Selected browser dialog dismissal/cancellation: cancel-first focus, Enter/Escape, focus return, no dismissal POST; explicit cancellation returns original state and no code/credential |
| M4 | Browser absent/invalid/expired/mixed/bearer-only and human-plus-Authorization inputs, no-share/foreign/malformed scope; malformed navigation stays neutral without API calls |
| M5 | Browser frozen-field/session/cross-site/replay/expiry cases plus retained protocol/exchange tests: all frozen fields, owner/selected swaps, callback/resource/PKCE/code binding and same-principal fresh session |
| M6 | Browser share/issuer-authority/issuer-binding/recipient-binding/membership/workspace loss for both decisions; retained current-read/original-binding/exchange/authority-loss-first/self-revoke/RFC-revoke tests |
| M7 | Browser real away/back, reload and persisted history events, synchronous duplicate requests/competing decisions/tabs, delayed real responses; transport close/abort and abort-ignoring timeout |
| M8 | Fixture drops GET/POST after real handler status200; witness verifies request count, no callback/retry, persisted approved versus displayed state, pending connection and zero credentials; no inferred rollback |
| M9 | All selected transport tests: exact field/type/envelope restrictions, callbacks, JSON/UTF-8/type/bounds, stalled streaming, finite timeout and late aborted responses |
| M10 | Chromium1440/390/320 wrapping/no overflow/44px controls, named keyboard controls, forced-colors/reduced-motion focus, escaped app text, no nonce/transaction rendering, no storage or callback referrer |
| M11 | New neutral selected-shell HTTP case checks GET/security headers/wrong methods; browser disabled API and machine-only cases; no dashboard-context call in selected success |
| M12 | Existing owner browser cases, selected backend, authority/device/retrieval, packed consumer/core/dashboard and standalone/packed recovery all ran in canonical lanes; migration files/count24 preserved |

#### Direct final-source/security and preservation self-check

Reviewed the full foundation candidate diff and final transport/component, tracing strict ten-field display and two-field decision validation, frozen echo, callback whitelist/canonicality, one-use synchronous locking, bounded/abortable transport, lifecycle generation checks and separation from owner authority. No unresolved in-scope source defect was identified. This is a direct self-check, not an independent reviewer or human visual/accessibility acceptance claim.

`admission.json` and `preservation.json` retain initial and post-gate records. Final verification confirms branch `local/beta-machine-only`, unchanged HEAD `1538f460cf950337824a8de23f740e464cdb521c`, all non-allowlisted baseline bytes preserved, frozen parent documents exact, owner UI/transport/styles/assets and migrations untouched, no unexpected source paths, and `git diff --check` exit0. Foundation candidate hashes still match the post-canonical preservation receipt; only this spec's allowed status/tasks/evidence changed afterward. Original12 container IDs/names remain present unchanged; owned disposable test container removal is explicit in the DB log and no owned selected-browser fixture directories remain.

Frozen-block hash remains `c63ab739a6cd3b081ea2eaedeaff34ea1a8e1965f785187a9ec3aacbdefdc37f`. The admission receipt's different hash was an extraction mismatch, not edited contract bytes: the parent extraction starts22 characters after the opening-tag start, retaining the following space/attributes, and stops before the closing tag. Final verification uses that exact extraction and independently checks all frozen document hashes.

Changed source/test paths are exactly the14 foundation paths in this spec's allowlist, plus this spec's permitted metadata/evidence. Parent-owned client-auth continuation and three selected UI design documents remain untouched. Actual accounts/installed clients, hosted TLS/registration, live-recipient and independent human visual/assistive-technology evidence remain open;6.5/9.4 are not closed. Scoped Brain recall remains unavailable after initialization timeout, operational status unknown, and legacy outcome writes remain held.


### Parent independent verification and local completion — 2026-10-31

The initial staged diff check caught extra blank lines at EOF in the newly added browser test; unstaged git diff --check had omitted that untracked file. Commit was stopped before creation. Parent removed only trailing blank lines; final-byte-rerun/ carries the required subsequent canonical gates, while initial receipts remain. This is whitespace hygiene, not a behavior or security-rule change. Final candidate scan/staged check must include newly added files.

Parent inspected the final production transport/component, test fixture and behavioral matrix, all changed source/registry hunks and the complete candidate diff. No source remediation was necessary. Direct parent checks replace obsolete reviewer ceremonies; no independent human acceptance is claimed.

Independent receipts: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-selected-browser-20261031T043302Z/`. Parent reran check:toolchain, typecheck, lint, test and test:db on fingerprinted final source, all exit0. Parsed28 mandatory unit children:144 tests/2225 Bun assertions; full restricted DB:280 tests/3804 Bun assertions, zero failures/skips/missing cases. Unique total424 tests/6029 Bun assertions; repeated OAuth40/502 and authority12/160 are excluded. Full-lane browser counters total1081 separately, including the13 selected cases; repeated OAuth337 is not additive. All9 transport cases,13 selected-browser cases in both inventories and16 retained selected backend cases executed. `counts.json` is derived from actual parent logs.

| Parent check | Result and evidence |
|---|---|
| No accidental owner authority reuse | Separate transport directly calls selected API; no dashboard-context request; owner files and backend authority unchanged |
| Unknown response semantics | Actual handler returns200 before response loss; persisted approved transaction consumes nonce and may retain pending connection; no credential/callback/retry inferred |
| Exact callback and original state | Transport validates canonical registration destination/parameters and connectionId; real requesting-client witness compares original state before finishAuth; no invented browser state field |
| Lifecycle and UI concurrency | Synchronous locks, generation guard, abort race, actual away/back/reload and duplicate-tab/decision cases ran |
| Required matrix and regressions | M1–M12 mapped to inspected tests; all named cases ran in parent logs, including owner UI and recovery24 |
| Scope/preservation | 1361 unrelated tracked hashes, frozen contract block and worker-preserved parent docs verified; original12 container IDs/names retained and no extra containers |
| Governance | Same-principal existing allura-system credential mapping; gate passed, audit_logged=false. This is not a durable audit or human approval |

Broader client-auth planning evidence is reconciled by the parent after its frozen worker-admission check; this document-only reconciliation does not alter tested foundation bytes. Final candidate secret/diff checks and verified owned local commit are recorded in the parent receipt directory. Status done means this bounded local engineering slice only. Genuine human account sign-in, installed Gilliam/Hermes/ChatGPT/Claude compatibility, hosted TLS/registration, live recipient witnesses,6.5/9.4 and human visual/assistive-technology acceptance remain open. No push, deployment, live grants/credentials/schema mutation or legacy outcome write. Earlier in-review/adoption statements above are historical checkpoints, not current status.
