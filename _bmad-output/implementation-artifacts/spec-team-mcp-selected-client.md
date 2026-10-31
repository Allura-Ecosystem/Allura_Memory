---
title: 'Team MCP: selected-member client backend'
type: feature
created: '2026-10-30'
status: done
route: dispatch
baseline_commit: d4bc73f954624626c2c58e0494d15a51065e1a3a
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/selected-client-v1.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

Advance Sabir's approved individually scoped member access: a grantless recipient explicitly self-consents to a client and reads only separately approved immutable versions. Implement backend consent/exchange and the actual SDK exact-get tracer. Keep owner access unchanged; never infer access from login, email or team membership.

## Boundaries & Constraints

Reviewed-version-only, separate recipients and new approval for later versions are settled user choices. The linked contract adopts narrow engineering defaults: selected scope, distinct connection authority and explicit selected kind on existing memory_get. No sixth tool, default-get change, viewer grant, owner-consent relaxation or implicit evidence/history/successor access. Backend-only: member browser UI remains a following dependency, not accepted UX. Old migrations001–023 and generic retrieval/RLS remain unchanged. Only additive024 on owned disposable synthetic DBs. No live grants/credentials/database mutation, deployments, branches/worktrees, remote push, SSH, Epics12–14 or automatic semantic promotion.

## I/O & Edge-Case Matrix

| Given | When | Then |
|---|---|---|
| A has one exact share, no workspace grant | Self-consent/exchange | Separate selected connection; B/no-share denied; no workspace grant created |
| Valid selected credential | SDK metadata and explicit selected get | Same five tools, exact content-only DTO |
| Selected connection | Default/receipt get or other tools | Deny; no inherited workspace access |
| Unshared successor/neighbor/foreign/revoked target | Exact get | Uniform safe not_found |
| Mixed scope/mode/session or stale code/nonce | Protocol request | Reject without issuance or state confusion |
| Share loss / connection loss | Read / self-revoke | Current read denial; self-revoke still available after share loss |
| Concurrent revoke or audit failure | Read/issuance | Ordered authorization, atomic rollback and no leaked content |

</frozen-after-approval>

## Code Map

Under foundation: `authority.ts` is role/grant-based; add dedicated MCP admission without fake roles. `authentication.ts` issues WeakSet-verified identities. `mcp-api.ts` currently requires memory:read before parsing and clones /mcp/human; preserve human admission separately. `consumer-contract.ts` has five tools with no outputSchema; consumer-client checks the contract marker. SQL021 owner delegations require workspace grants; SQL022 supplies bounded private OAuth state, owner-only consent and expiry rules; SQL023 supplies exact-version disclosure and tenant advisory lock ordering. Do not pass a synthetic human identity to memoryShare. `oauth-consent.ts` and owner browser verification stay read-only. Current packed and standalone recovery inventories are23.

## Tasks & Acceptance

Exact writer allowlist:
- [x] New `foundation/tests/selected-client.test.ts`: real HTTP behavioral RED for grantless A self-consent/exchange; minimal GREEN before sequential SDK/security/revocation/concurrency tests.
- [x] New `foundation/migrations/024-selected-client.sql`, `foundation/src/selected-client.ts`, `foundation/src/selected-client-api.ts`: private selected linkage, typed guarded services and separate human API; shared transaction mode/budget as contracted.
- [x] Narrow integration in `foundation/src/{authentication,authority,persistence,gateway,mcp-api,consumer-contract,consumer-client,core-api,core-config,oauth-provider}.ts`: authenticated classification, dedicated admission, safe dispatch and selected configuration. `oauth-resource.ts` only if lookup binding requires it; `oauth-http.ts` only for mixed-scope early validation, preserving SDK handlers/PKCE checks.
- [x] Regression additions only in `foundation/tests/{gateway,authority,core-config,oauth-contract,oauth-http,consumer-http,consumer-client}.test.ts`; preserve parent early mixed-identity guard.
- [x] `foundation/scripts/test-db.ts` suite path and exact new case names; `foundation/tests/{core-release,recovery}.test.ts` exact inventory24. No new unit file planned; if one becomes necessary, return the exact additional registry/file dependency instead of weakening discovery.
- [x] Append implementation receipts here; run full canonical gates and return exact changed paths, exits/counts, limitations and cleanup. Parent owns closure/commit.

Acceptance:
- Given grantless A and B, when A completes the signed self-consent and PKCE flow, then only A gets selected-only connection authority and no workspace grants or shares are created by consent.
- Given real SDK discovery/exchange, when initialize/list-tools/explicit selected get run, then five-tool metadata and both exact content-only representations pass; every other content/action path denies.
- Given current authority changes, missing linkage, later recipient elevation or concurrent revocation, when cached credentials are reused, then the contracted intersection and no-fallback boundary hold.
- Given changed scope/mode/callback/resource/session/nonce/verifier, expiry/replay or induced audit failure, when protocol operations run, then no unauthorized credential, state transition or content is committed/disclosed.
- Given baseline owner/device/browser/recovery behavior, when all canonical registered suites run, then every mandatory lane passes without skips, filters or inventory weakening.

## Implementation Notes

## Spec Change Log

## Parent scope extension and next gate

The first selected-client worker completed at an allowed-file dependency, not a runtime/tool cap. Parent reproduced the exact consumer schema expectation failure in `foundation/tests/consumer-client.test.ts`:5pass/1fail/39assertions, exit1. Approved production enum already includes selected under the adopted contract. Parent changed only the exact expectation to semantic/receipt/selected; focused rerun6pass/0fail/40assertions, exit0. Receipts: reports/allura-team-mcp/parent-selected-client-enum/{red,green}.log. This narrowly adds consumer-client.test.ts to the writer allowlist, not scripts/test.ts, any new tool or broader permission.

Remaining gate before parent final verification: finish the declared security matrix sequentially in the existing selected-client test/source allowlist, then rerun every canonical lane. Cover cached real authenticated machine objects and forged/spread objects, original issuer/recipient binding substitution, actual local AlluraClient typed selected readback, and observed read-first/revoke-first plus issuance-first/revocation-first for current recipient/issuer/connection/token authority as applicable. Missing controls must be reproduced before fixing; passing added regressions may document behavior already implemented, not fabricated RED receipts.

Parent source-review observations to exercise, not yet verified defects: selectedGet's UUID regex accepts malformed36-character dash/hex strings and may report SQL-cast failure as unavailable instead of invalid; test the real boundary before changing it. The existing other-surface loop uses several unverified path/method pairs; replace/supplement those with real registered evidence/review/dashboard/admin endpoints and assert authentication/authorization denial, not merely404/405. Current revoke-first blocker helper can return the same reader PID for both read/exchange observations; require distinct actual blocked backends or individually attributable waits before claiming both operations were blocked. Check owner/human denial of selected kind, wrong explicit namespace/workspace/resource, service-principal/membership attenuation, and private function execution restrictions as part of full source/matrix reconciliation. Do not broaden scope or acceptance if a required lane exposes another exact dependency; record it.

## Review Triage Log

Parent direct self-checks apply under the current repository adapter; no separate developer-review ceremony or human acceptance is claimed.

| Finding | Disposition and evidence |
|---|---|
| Consumer enum expectation omitted the approved selected variant | Corrected exact equality only; parent RED5/1/39 → GREEN6/0/40; full unit rerun passes. |
| Malformed36-hyphen IDs reached a PostgreSQL cast and returned unavailable | Reproduced worker RED then narrow UUID grouping fix; parent independently executed the registered regression in the full canonical DB lane. |
| Other-surface tests accepted wrong-path/method404/405 as denial evidence | Replaced with actual registered endpoints/methods and exact401/403 before malformed-body parsing; parent source review and canonical run passed. |
| Revoke-first observation could reuse one waiter PID | Tests now require distinct observed backend blockers, including an attributable reader-to-issuer dependency; both orderings execute real production reads/revoke/exchange. |
| Read-first HTTP response can be suppressed by a later current-authority recheck | Conservative existing gateway behavior, not a disclosure bug; service transaction ordering and later HTTP denial are tested separately. No guard relaxed. |

### Parent final verification

Independent final-source review and all five canonical commands passed against captured source hashes: check:toolchain, typecheck, lint, test and test:db all exit0. Unit135 tests/1954 assertions across27 required children; canonical DB266 tests/3727 assertions, zero failures/skips/missing cases. Unique total401 tests/5681 Bun assertions. Repeated OAuth27/443 and authority12/160 mandatory children are not added to the unique total. All16 selected-client cases are registered and observed passing; existing owner/browser/device/retrieval and packed/standalone recovery inventory24 passed.

Receipts: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-selected-client-20261031T034639Z/`. Parent verified23 owned candidate paths,1348 unrelated baseline hashes, unchanged tested source and both frozen parent documents, original container IDs retained and no extra containers. Diff checks and Gitleaks8.30.1 candidate scan passed. Governance through the existing same-principal allura-system mapping passed; audit_logged=false, so no durable governance audit claimed. Legacy outcome writes remain held. Final document bytes are rescanned before local commit.

This is bounded local backend acceptance only. Member browser consent, actual human/desktop sign-in, hosted/TLS and6.5/9.4 remain open. No source-history publication, remote push, deployment, live grants/credentials/database mutations or broader workspace permission was performed.

## Verification

From foundation prefix PATH `/home/sabira/.local/share/allura-toolchain/bun-linux-x64-baseline:/home/sabira/.local/share/allura-toolchain/node-v24.19.0-linux-x64/bin`. Run `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:db`; preserve full logs/exits. Actual SDK protocol with signed synthetic humans is local evidence, not real human/installed-client acceptance. Parent independently reviews final source, reruns gates, verifies preservation/secret/diff/governance and an owned local commit. No worker commit or external writes.

## Active Execution Ledger

Baseline d4bc73f954624626c2c58e0494d15a51065e1a3a clean. Scout reconnaissance and parent source checks completed; ordinary engineering defaults adopted under continuous local build authority. Next gate: actual gateway/DB RED for selected self-consent/exchange. Baseline385/5033 is inherited evidence, not this slice's acceptance. Member UI, real clients and6.5/9.4 remain open; legacy outcome writes held. No source writer until dispatch.

### Woz implementation evidence (unverified WIP)

- Installed `bmad-build` renderer exited0; explicit in-progress spec routed to step03. Missing TEAM-RAM-RUNTIME uses this repository adapter. Parent owns independent review/commit; no nested agents, operational tracker or Allura writes.
- Admission hashes and original container names: profile scratch `selected-client-woz-ukftm1zn/admission.json`. Only the parent's client-auth document differed from its baseline manifest.
- Behavioral first RED: real independent synthetic review and share approval succeeded; selected authorization returned the error callback instead of selected consent. `first-red.log`: exit1, 0pass/1fail/4assertions.
- Minimal consent/exchange GREEN: `first-green.log`: exit0, 1pass/0fail/17assertions. Grantless A approved/exchanged; B denied; no recipient grants, new shares or owner delegation. Both owned containers removed and original names preserved.
- Next named gate: SDK tokenless discovery and explicit selected exact-get RED. This is not complete backend acceptance. No commit/push/deploy/live DB or credential changes.

### Canonical gate checkpoint — blocked on excluded contract assertion

- SDK RED `sdk-red.log`: exit1, 1pass/1fail/34assertions; exchanged selected token could not initialize. SDK GREEN `sdk-green.log`: exit0, 2pass/38assertions, actual tokenless SDK discovery, generated PKCE, exchange, initialize, ping, five-tool inventory and exact text/structured content DTO. No manual Authorization injection in this SDK test.
- Revoke RED `revoke-red.log`: exit1, 3pass/2fail/147assertions. One failure was the absent self-revoke route; the other was a test fixture attempting a forbidden service workspace-admin grant. Corrected that corruption fixture to an allowed legacy viewer grant, without disabling its guard. GREEN `revoke-green.log`: exit0, 5pass/162assertions.
- Explicit config RED/GREEN: `config-red.log` exit1 (3pass/1fail/73assertions); `config-green.log` exit0 (4pass/75assertions). Existing defaults unchanged.
- Mixed-scope early validation RED `protocol-red.log`: exit1, 6pass/1fail/264assertions (302 rather than required400). `protocol-green.log`: exit0, 7pass/269assertions.
- Focused `security-concurrency.log`: exit0, 11pass/0fail/377assertions. Includes exact history/foreign denial, other-tool denial, later recipient elevation, current authority attenuation, missing-link denial with a real legacy credential/grant, self/RFC revocation, protocol tamper/replay/expiry, private SQL/shared100 bound, deferred audit rollback and observed pg_blocking_pids read-first/revoke-first share ordering. All11 names registered in the canonical DB inventory.
- Canonical `check-toolchain.log`, `typecheck.log`, `lint.log`: exit0 each. `canonical-db.log`: top-level exit0; OAuth child27pass/443assertions/exit0; client-authority child12pass/160assertions/exit0; full restricted PostgreSQL child261pass/0fail/0skip/3458assertions/exit0, missing=[] across42 files. Existing owner browser/device/retrieval/standalone and packed recovery lanes passed with exact inventory24.
- **Blocked:** canonical `unit.log` exit1. Excluded `foundation/tests/consumer-client.test.ts:41` asserts the old exact kind enum `['semantic','receipt']`; approved production schema now includes `selected`. Its child reports5pass/1fail/39assertions/exit1; runner correctly halts, so later unit lanes did not run. Required narrow extension: update that exact expected enum to `['semantic','receipt','selected']`, retain all assertions and optionally assert selected disclosure. File and `scripts/test.ts` remain untouched. No workaround/filter or weakened assertion.
- No full acceptance claim: remaining explicit coverage includes broader current-authority concurrency orderings (issuer/recipient/connection/token and issuance-first), cached authenticated service-object checks, exact original-binding substitution, selected local consumer typed readback and final matrix/source review. Parent independent review/governance/commit remain unperformed; member UI, actual human/desktop sign-in, hosted TLS and6.5/9.4 remain open.
- `verification.json` records frozen contract/client-auth hashes preserved, all unrelated baseline manifest hashes preserved, all original container names present and no new containers remaining. `git diff --check` exit0. Migration001–023, generic retrieval/RLS and owner consent/browser source unchanged. Only owned disposable synthetic databases used. No commit or external writes.
- Receipt directory: `/home/sabira/.hermes/profiles/troy/cache/scratch/selected-client-woz-ukftm1zn/`. Next gate: Brooks extends the excluded consumer-client assertion scope, then finish the remaining matrix and rerun all canonical lanes; do not treat this checkpoint as ready-to-commit.

### Resumed Woz evidence — local matrix and canonical gates

- Resumed the installed rendered `bmad-build` at step03 against the supplied in-progress spec, preserving the baseline and frozen intent. Missing TEAM-RAM-RUNTIME maps to the current repository adapter; direct self-checks apply. No nested workers, tracker, governance write, commit or acceptance closure.
- Receipts: `/home/sabira/.hermes/profiles/troy/cache/scratch/selected-client-resume-8xen2e_w/`. `admission.json` fingerprints the resumed source and original container names. Parent's exact semantic/receipt/selected expectation is unchanged.
- Actual malformed-ID RED: `uuid-red.log`, exit1, 11pass/1fail/386assertions. Thirty-six hyphens reached the SQL cast and returned unavailable instead of invalid. The only resumed production change replaces the permissive character-count regex with canonical UUID grouping. `uuid-green.log`: exit0, 12pass/389assertions.
- Added real cached authenticated machine-object checks through selectedGet, not just HTTP token reauthentication: share, issuer grant/binding/membership, recipient binding/membership/principal, credential/connection expiry/revocation, tenant/workspace, service principal/membership, client/resource mismatch and missing-link denial with valid-looking legacy credential/grant. Forged/spread objects, human/service-default identities and wrong group/workspace deny. Direct restricted selected_get rejects wrong client/resource. The initial cached test mistakenly used the resource-less legacy store lookup; its safe refusal is recorded in `cached-authority.log`, then the test uses actual resource-bound selected_lookup plus authenticateMachine. No production relaxation.
- Real registered evidence/review/dashboard/access/MCP endpoints now use their actual methods and require exact401/403 outcomes, including pre-parser refusal of invalid bodies, rather than treating404/405 as authorization evidence. Real AlluraClient.get returns the exact selected DTO using a token acquired by HTTP consent/exchange; omitted-kind denies. Human and real owner-OAuth explicit selected-kind calls deny. Alternate active bindings for the original principal plus reassignment of the original subject to another active human do not substitute for the exact issuer/recipient pair, for read or exchange.
- Lock tests exercise actual production reads, HTTP exchange and production share/self/RFC-token revoke functions. Privileged synthetic issuer-grant/recipient-binding UPDATE fixtures are explicitly labeled. Read-first/revoke-first covers share, issuer, recipient, selected connection and token; issuance-first/revocation-first covers share, issuer, recipient and pending connection. Token revocation applies to an issued token, not an unrelated pending authorization. Each asserted wait is observed in pg_blocking_pids, with distinct reader/issuer PIDs; indirect wait through the reader's shared tenant lock is accepted only as an observed dependency. No sleep-only ordering assertions.
- `ordered-authority.log` and `ordering-diagnostic.log` record two test-assumption failures, not product defects: final HTTP admission conservatively suppressed a committed recipient read (503 unknown, no content), and an issuer waited indirectly through the blocked reader. Production service commit ordering is now tested directly, with later HTTP denial; distinct transitive blockers are observed. `ordered-authority-green.log`: exit0, 16pass/647assertions. No concurrency production changes.
- Deferred audit rollback now also retries the exact failed approval nonce and checks that failed issuance leaves the same code approved before successful retry. Existing content/issuance/revoke rollback, private SQL, no-fallback, shared100 limit, immutable mode, owner defaults and exact five-tool inventory remain exercised.
- Final focused receipt `final-focused.log`: exit0, 16pass/0fail/646assertions. All16 exact selected-client case names are registered in `scripts/test-db.ts`; five new cases were added without changing existing names/floors.
- Canonical `bun run check:toolchain`, `bun run typecheck`, `bun run lint`: exit0 each, pinned Bun1.3.14/Node24.19.0. `unit.log`: exit0;27 mandatory child files,135pass/0fail/0skip/1954assertions, every runnerExit0 and missingCases empty. `canonical-db.log`: top-level exit0; OAuth27/443/exit0, client-authority12/160/exit0, full restricted PostgreSQL266pass/0fail/0skip/3727assertions across42 files, missing=[]/child exit0. Existing owner/browser/device/retrieval and packed/standalone recovery inventory24 all passed.
- Resume changes only: `foundation/src/selected-client.ts`, `foundation/tests/selected-client.test.ts`, `foundation/scripts/test-db.ts`, and this append-only evidence section. All other admission hashes—including migration001–024, owner consent/browser, generic retrieval/RLS, frozen contract/client-auth docs and parent's consumer enum fix—are preserved. `verification.json` records hashes and cleanup; diff hygiene exit0. Only owned synthetic containers were created; all were removed and original containers remain.
- Next gate belongs to parent: independent final-byte matrix/source verification, preservation/secret/governance checks and any authorized commit. Backend test evidence does not close member browser UI, actual human/desktop sign-in, hosted TLS or6.5/9.4. No live DB/service/credential changes, public route/deploy/push/SSH, new dependency, or legacy memory write. Spec remains in-progress; this is not acceptance closure.
