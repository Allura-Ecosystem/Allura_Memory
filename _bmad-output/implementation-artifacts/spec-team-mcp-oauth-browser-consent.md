---
title: 'Epic6: local browser OAuth consent'
type: feature
created: '2026-10-30'
status: done
route: dispatch
baseline_commit: 8b245880d006334e3f6d18464ee81d6208151fbd
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/team-mcp-oauth-v1.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/oauth-consent-ui/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/oauth-consent-ui/design-contract.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/oauth-consent-ui/implementation-handoff.md'
---

<frozen-after-approval reason="approved Epic6 continuation; ordinary design delegated by current adapter">

## Intent
Make existing owner OAuth consent usable through the actual browser: explicit workspace entry, authenticated exact request review, approve/cancel and client callback. Preserve signed-human JSON consent and SQL transitions. No eligible-workspace listing API exists; use the retained manual scope pattern, never privileged enumeration.

## Boundaries & Constraints
Always preserve current human verification, same-origin/mixed-identity denial, tenant/workspace isolation, owner-linked non-human authority and independent human semantic promotion. One writer; local disposable synthetic tests only. Browser receives no access token and performs no token exchange. Preserve five MCP tools and legacy clients.
Never add sign-in providers, DevAuth, shared DB changes, migrations, dependencies, automatic grants/promotion, DCR/CIMD/refresh, member sharing, SSH/host work, public routing, push or deployment. Legacy outcome writes are on hold; keep receipts locally. Real client/human acceptance and6.5/9.4 stay open.

## I/O & Edge-Case Matrix
| Given / when | Then |
|---|---|
| Valid issuer authorization redirects | GET /dashboard/oauth/consent?transaction=… uses existing secure shell; parse exactly one43-character base64url transaction, no extra navigation fields/fragment |
| Human enters scope | Verify dashboard context and current workspace:grants:manage before explicit one-use consent GET; inputs are routing hints only |
| Exact consent displays | Freeze selection and server app name/ID, exact callback, tenant/workspace/actions; render strings as text; nonce remains in memory only |
| Approve / Cancel connection | POST frozen display plus decision; validate server callback result against displayed registration, navigate once; cancel returns access_denied and no credential |
| Dialog dismisses | No OAuth cancellation or mutation; return focus |
| Missing/bad/machine/mixed identity, member-only/foreign/revoked scope | Deny, clear stale private state, no code or credential |
| Tampered display/session/scope, cross-site POST, expiry/replay | Existing server rejects; browser must not recover by weakening or retrying |
| Duplicate submit, reload/back, delayed/lost response | No automatic retry or optimistic result; block stale submissions and explain starting a fresh client authorization |
| Malformed/oversized response or arbitrary callback | Fail closed; no navigation; bounded streaming/timeout, abort and stale-generation guards |
| Keyboard/phone/disabled OAuth/machine-only | Focus-safe, usable/wrapped layout; no unauthorized data or usable consent path |

</frozen-after-approval>

## Code Map
All product paths below are under foundation/. oauth-provider.ts:21 redirects to the JSON API today. oauth-consent.ts and SQL022 display once from pending and bind human/session/scope/nonce; unchanged. dashboard-server.ts serves neutral HTML with restrictive CSP/no-store/no-referrer. ui/main.tsx verifies manual scope through DashboardTransport/readDashboardContext. controls.tsx Confirm dismissal is not protocol cancellation. dashboard-transport.ts cannot GET and POST one consent route; use a dedicated bounded adapter rather than generalizing it. Existing oauth-http.test.ts proves SDK discovery with strict test-only logical-origin mapping. dashboard-browser-fixture.ts and dashboard-admin-browser.test.ts demonstrate signed synthetic-cookie browser tests; browser-runtime.ts owns bounded execution/cleanup.

## Tasks & Acceptance
Allowed source files only:
- [x] src/oauth-provider.ts: change only consent destination to dedicated browser page.
- [x] src/dashboard-server.ts and ui/main.tsx: serve/dispatch this page before normal dashboard routing; no persistent nav entry or security-header changes.
- [x] NEW ui/oauth-consent.tsx and src/oauth-consent-transport.ts: exact flow/matrix; reuse context transport and controls. Only essential consent-scoped additions to ui/style.css allowed.
- [x] NEW tests/oauth-consent-browser.test.ts, tests/oauth-consent-transport.test.ts and optional NEW tests/oauth-consent-browser-fixture.ts: behavioral coverage, owned fixture/listener cleanup.
- [x] tests/oauth-http.test.ts and tests/dashboard-http.test.ts: update exact redirect and page/header/method coverage without bypassing new browser journey.
- [x] scripts/test.ts and scripts/test-db.ts: register required nonzero unit/browser cases; preserve all prior lanes and inventory.
- [x] Append receipts here only. Parent contract/design files stay byte-identical at dispatch. No other file edits without parent scope extension.

Given actual SDK tokenless discovery, when a real browser follows its authorization redirect using signed synthetic-human cookies, enters scope, reviews and explicitly approves, then an owned callback receives matching state/code, SDK finishAuth exchanges PKCE and reconnects for exactly five tools plus capture/receipt read-back. No hand-injected MCP bearer or fabricated response. Browser cancel must yield no code/credential. Use real server/DB paths for authority tests; adapter fault tests may mock only fetch boundaries. Preserve existing binding/replay/expiry/security cases and identify which named tests cover each matrix row.

## Implementation Notes

## Spec Change Log

Parent scope extension after Woz return: authorize only adding the already-registered consent transport file to foundation/src/ci-contract.ts UNIT_FILES and correcting foundation/tests/oauth-contract.test.ts begin() to assert the new browser redirect before selecting the retained JSON API. Both files matched admission hashes. This reconciles exact inventories and lower-level fixtures for the approved behavior; no equality assertion, security check or product permission is relaxed. Parent is now sole writer and will rerun every gate. Worker failure receipts below remain historical evidence.

## Review Triage Log

Parent direct review replaced the obsolete developer-review layers under current user/adapter authority. Inspected production transport/UI and every changed source/test/harness path. Confirmed exact request/callback binding, same-origin transport, bounded streaming, fail-closed unknown results, no browser token exchange/storage and one-use lifecycle clearing. The two worker inventory/helper findings were real blocking test-integration defects, not new product decisions: parent fixed them within the documented scope extension without weakening gates.

Parent additionally registered `OAuth browser real back navigation discards private consent without resubmission`: actual Chromium navigates away to the dashboard and goes back; private details disappear, verification remains disabled, only the original GET occurred and no callback was made. This complements synthetic lifecycle-event and real reload coverage; it does not certify every browser's back-cache implementation.

Independent full gates all exit0: check:toolchain/typecheck/lint/test/test:db. Unit27 files,134 tests/1896 Bun assertions; canonical restricted DB233 tests/2642 Bun assertions, zero failures/skips/missing cases. Unique total367 tests/4538 Bun assertions. OAuth27/443 and authority12/160 focused reruns are excluded from totals; Node browser assertions are separate. The formerly blocked machine-bearer/consent security regression lane now passes. Receipt directory: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-browser-20261031T013250Z/`.

Parent verified1340 unrelated admission hashes, all four parent design/contract hashes and owned-container removal. SQL, locks, dependencies, retained styles/assets and human/authentication guards are unchanged. Governance local-commit check passed, audit_logged=false; POL-013 is absent, so no loaded-policy or durable-audit claim. External outcome writes remain held; no semantic receipt will be created. Local consent acceptance does not close real sign-in, installed-client, hosted TLS/Cloudflare, human visual or6.5/9.4 release acceptance.

## Design Notes
No human decision is missing for this bounded continuation. Adopt current component/token design from the three context files, not new approved artwork. One-use display makes reload recovery intentionally require client restart. Neutral HTML may render while OAuth is disabled, but absent APIs must deny and reveal no request; machine-only serves no dashboard. Keep SQL/auth/API contracts unchanged. Callback must retain displayed endpoint and non-protocol query fields, reject unexpected/duplicate protocol fields, and contain valid code XOR access_denied. The client remains responsible for OAuth state validation. Browser-history/pagehide restoration must not resurrect actionable stale consent.

## Verification
Sequential real behavioral RED→GREEN, never missing-import failures. In foundation with pinned Bun1.3.14/Node24.19.0, run bun run check:toolchain, typecheck, lint, test and test:db (no selectors). Canonical harness must include browser/security/previous OAuth lanes with zero skips/missing cases. Capture exact counts/exits and real browser DOM/computed layout at desktop and phone; no visual-human acceptance claim. Use only owned local origins; strict test transport mapping or fixture-scoped TLS trust is permitted, never global TLS-disable flags. Preserve1st-party source/lockfiles/SQL; compare admission hashes from reports/allura-team-mcp/oauth-browser-baseline.json and dispatch hashes of parent docs. Check git diff --check and all cleanup. Parent repeats gates and secret scan before owned local commit; worker must not commit/close goal. Report partial WIP honestly if bounded execution ends.

BMAD: current adapter replaces missing runtime guides, obsolete reviewer ceremonies and routine approval stops. Native budget is preserved. Latest legacy semantic auto-curation discrepancy means external outcome persistence is held, not claimed pending; operational status remains unknown. Current local source and exact verified receipts supply continuity.

## Woz local implementation receipt — partial WIP

Source remains uncommitted at baseline `8b245880d006334e3f6d18464ee81d6208151fbd`. This append does not approve release, mark the goal complete, or replace the original task checkboxes. All five context files and the rendered step-03 were read. Missing `.agents/TEAM-RAM-RUNTIME.md` was mapped to `guidelines/ALLURA-BMAD.md` plus the loaded host Team RAM skill. Current direct-self-check authority replaces obsolete reviewer delegation. Step-04 was inspected, but its completion/status transition was not entered because the full gates are red. No nested worker, external outcome write, commit, push, deployment, live identity, live grant, shared database mutation, or runtime-budget change was performed.

### Implemented within the allowed source boundary

- Modified `foundation/src/oauth-provider.ts`, `foundation/src/dashboard-server.ts`, `foundation/ui/main.tsx`: issuer redirect and dedicated neutral browser page; existing security headers and normal dashboard navigation preserved.
- Added `foundation/src/oauth-consent-transport.ts`, `foundation/ui/oauth-consent.tsx`: explicit manual scope verification, one-use exact display, frozen actions, approve/explicit cancellation, bounded JSON/stream/timeout handling, exact callback validation, terminal uncertainty, duplicate blocking and page lifecycle invalidation. No browser bearer/token exchange or persistent consent storage.
- Added `foundation/tests/oauth-consent-browser-fixture.ts`, `foundation/tests/oauth-consent-browser.test.ts`, `foundation/tests/oauth-consent-transport.test.ts`.
- Modified `foundation/tests/oauth-http.test.ts`, `foundation/tests/dashboard-http.test.ts`, `foundation/scripts/test.ts`, `foundation/scripts/test-db.ts`: retained JSON protocol tracer, neutral shell/header/method coverage and required case registrations. The new browser test separately follows the actual issuer redirect; it does not replace the browser flow with JSON calls.
- No CSS change was needed: existing IBM Plex, wrapping and target-size rules passed actual Chromium checks at 1440, 390 and 320 pixels. No SQL, dependencies, lockfiles, API consent implementation or authorization guards changed.

### Sequential behavioral receipts

Logs are local under `/home/sabira/.hermes/profiles/troy/cache/scratch/`, prefix `oauth-browser-`; the numeric gap is intentional. `red-5.log` is an already-passing viewport audit, NOT a RED receipt. All real REDs below had test exit 1; all GREENs had test exit 0. Browser assertions are reported separately by the Node browser runner and are not included in Bun expect counts.

| Tracer/log suffix | Observed behavior before implementation | RED pass/fail/Bun assertions | GREEN pass/fail/Bun assertions |
|---|---|---|---|
| 1 | Actual issuer browser redirect reached `/api/oauth/consent`, not the required browser page | 0/1/0 | 1/0/11, plus 15 browser assertions |
| 2 | Explicit Cancel connection control absent after successful keyboard dialog dismissal | 0/1/1 | 2/0/18, plus 20 browser assertions |
| 3 | Stalled display stream remained pending beyond the adapter deadline | 0/1/1 | 1/0/4 |
| 4 | Pagehide/pageshow restoration retained actionable private request | 0/1/0 | 3/0/21, plus 26 browser assertions |
| 6 | Verification stayed pending when fetch ignored abort | 1/1/5 | 2/0/6 |
| 7 | Navigation with an empty fragment delimiter was accepted | 2/1/8 | 3/0/15 |
| 8 | Callback with an empty fragment delimiter was accepted | 3/1/16 | 4/0/51 |

Focused browser/database command used the owned disposable runner `python3 $TMPDIR/oauth-browser-gate.py <log> ./tests/oauth-consent-browser.test.ts`, with `-t` only during individual RED probes. Unit tracers used `bun test ./tests/oauth-consent-transport.test.ts`. Final focused browser/header run (`oauth-browser-focused-final.log`) discovered 12 tests across the browser and dashboard HTTP files: 12 pass, 0 fail, 0 skip, 88 Bun assertions plus 131 actual browser assertions. Final consent transport suite: 8 pass, 0 fail, 0 skip, 183 assertions.

Fixture corrections were NOT counted as behavioral REDs: Bun Request reconstructs credentials differently, so fetch-boundary assertions inspect the supplied RequestInit; machine-only fixtures must omit human configuration; Playwright route.fetch omitted Sec-Fetch-Site, so lost-response tests now drop the real owned server response after its actual handler commits. The latter verifies GET 200/GET 200/POST 200, one POST despite duplicate clicks, no callback and no issued connection. Initial typecheck errors were fixed without treating them as RED evidence.

### Canonical registered gates — final source snapshot

All commands ran from `foundation/` using Bun 1.3.14 and Node v24.19.0 with the pinned toolchain PATH. No selectors were passed to the canonical scripts. Full output is in `oauth-browser-gate-{check-toolchain,typecheck,lint,test,test-db}.log`; machine-readable receipts are `oauth-browser-gates.json` and `oauth-browser-summary.json` in the same scratch directory.

| Command | Exit | Actual outcome |
|---|---|---|
| `bun run check:toolchain` | 0 | Exact pinned Bun/Node verified |
| `bun run typecheck` | 0 | Core/tests/scripts and UI project checks passed |
| `bun run lint` | 0 | Zero-warning ESLint gate passed |
| `bun run test` | 1 | 16 of 27 registered file lanes reached; 90 pass, 1 fail, 0 skip, 1214 assertions. New consent lane: 8/0/0, 183 assertions, no missing cases. CI exact-inventory assertion failed; remaining 11 lanes were NOT RUN. |
| `bun run test:db` | 1 | OAuth pre-gate: 26 tests, 14 pass, 12 fail, 0 skip, 180 Bun assertions plus 131 browser assertions. All 9 new browser cases passed, and packaged SDK OAuth HTTP tracer passed. Existing JSON-consent fixtures followed the newly changed browser redirect and received 404. Client-authority and full restricted-postgres lanes were NOT RUN. Full restricted lane still registers 40 files and 232 required named cases. |
| `git diff --check` | 0 | No whitespace errors |

**Scope blockers, not waived gates:**

1. `foundation/src/ci-contract.ts` owns `UNIT_FILES`. The new required unit suite must be added there in the same order as the runner. This file is outside the spec's allowed list. Do not weaken `tests/ci-contract.test.ts` inventory equality or remove the new lane.
2. `foundation/tests/oauth-contract.test.ts:17` assumes issuer authorization redirects directly to the JSON API. Its helper must assert the new browser destination and then explicitly select `/api/oauth/consent` for these retained lower-level protocol tests, as the allowed `oauth-http.test.ts` now does. This file is also outside the allowed list. Twelve existing cases therefore fail before exercising their intended security assertions.

Both files were left unchanged pending a narrow parent scope extension. Product authority is not the missing approval; this is an explicit writer/file-boundary dependency. Rerun every canonical gate after that extension. The recorded full-lane failures cannot be represented as completed acceptance.

### Matrix audit against actually executed named cases

Names below occur in the registered new test files unless marked otherwise. All listed new cases passed both their focused run and the reached canonical lane. Coverage does not erase the full-suite blockers.

| Matrix row | Executed evidence / remaining limitation |
|---|---|
| Valid issuer redirect / exact transaction | `OAuth browser follows SDK discovery approves exact consent and reconnects for five tools and receipt readback`; `OAuth consent navigation accepts only one exact transaction and no fragment or extra field`; `OAuth consent page serves only neutral GET HTML with unchanged dashboard security headers` (focused header run; full DB lane not reached) |
| Explicit verified scope | `OAuth browser denies absent invalid mixed member foreign and revoked identities before private display`; `OAuth consent transport denies malformed scope context and display without disclosure or recovery` |
| Frozen exact display/text/memory-only nonce | SDK browser tracer; `OAuth consent transport freezes exact display uses same origin and blocks duplicate decisions`; `OAuth browser display bindings reject tamper swapped session cross site replay and expiry without issuance` |
| Approve/cancel and validated callback | SDK browser tracer; `OAuth browser dialog dismissal preserves consent while explicit cancellation issues no credential`; `OAuth consent callback validation rejects arbitrary ambiguous and malformed destinations` |
| Dialog dismiss/focus | `OAuth browser dialog dismissal preserves consent while explicit cancellation issues no credential` — keyboard Enter/Escape, cancel-first focus, focus return, zero POST on dismissal |
| Identity/foreign/revoked denial | Denied-identity and current-revocation browser cases; malformed context adapter case. Signed assertion/cookie mismatch is tested. Valid machine bearer plus browser consent regression remains dependent on the blocked existing OAuth security lane; no complete machine-identity coverage claim. |
| Tamper/session/scope/CSRF/expiry/replay | `OAuth browser display bindings reject tamper swapped session cross site replay and expiry without issuance`; current revocation browser case. Real restricted gateway and disposable PostgreSQL transitions used; no forged response success. |
| Duplicate/history/delayed/lost | `OAuth browser lost display or decision responses clear private state and never retry or navigate`; `OAuth browser history restoration clears private request and cannot resurrect a decision`; `OAuth consent transport aborts late display and decision responses after closure`. History case dispatches pagehide/persisted-pageshow in Chromium and performs real reload; actual installed-browser back-cache acceptance is not claimed. |
| Malformed/oversized/callback/timeout | `OAuth consent transport bounds malformed oversized denied and lost responses with no retry`; callback validation case; `OAuth consent transport bounds verification and rejects late context after close`; `OAuth consent transport bounds stalled streams and never retries a consumed display` |
| Keyboard/phone/disabled/machine-only | Dialog focus case; `OAuth browser exact request wraps at desktop and phone with readable named controls` (45 browser checks); `OAuth browser disabled APIs deny private consent and machine only mode has no dashboard` |

### Preservation, cleanup and unfinished acceptance

All four parent contract/design files matched `oauth-browser-dispatch-docs.json` byte-for-byte before this receipt; the original spec also matched before this append. Admission hash comparison found only the seven modified tracked foundation paths above plus the parent's OAuth contract amendment; new foundation paths are the five additions listed above. Lockfiles, migrations, retained UI assets, all other tracked foundation files and vendor BMAD source remained unchanged.

Actual all-changes diff, including untracked files and parent documents, was generated without staging and read in full: `/home/sabira/.hermes/profiles/troy/cache/scratch/oauth-browser-review-a6b1c1b8-4d17-4b1a-a28f-6e0b48505784.diff` (pre-receipt snapshot). Direct self-check found the two blocking scope dependencies. No independent reviewer verdict is claimed.

Every focused runner verified removal of its exact owned disposable container. Canonical DB cleanup verified removal of `allura-direct-test-d06a7d84-bce6-46a0-80bc-3a07f458997e`. Final checks found no containers labeled `allura.task=oauth-browser-owned`, no `allura-consent-*` fixture directories, and no owned Node browser-scenario child processes. Fixture finally blocks close core/callback/issuer/control listeners and SQL pools. Scratch scripts/logs/diffs remain intentionally for parent inspection and are subject to scratch expiry.

Still open: the two scope extensions and full canonical rerun; complete matrix/security regression acceptance; parent independent rerun and secret scan; actual signed-in human UX, installed clients, hosted TLS/Cloudflare/callback acceptance and release/rollback checks 6.5/9.4. No goal closure, commit, production identity or human visual approval is implied. External Allura outcome writes remain held and operational status remains unknown.
