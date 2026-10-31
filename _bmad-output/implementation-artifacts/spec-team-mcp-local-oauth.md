---
title: 'Team MCP: local consent-to-token vertical slice'
type: feature
created: '2026-10-30'
status: done
route: dispatch
baseline_commit: 28ebd494d5ba45270852c59d622c044d1f579847
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/team-mcp-oauth-v1.md'
---

<frozen-after-approval reason="inherited owner intent; technical defaults are separate">

## Intent

Give a verified owner an attributable client connection through human consent, a one-use S256 authorization code and an opaque token that reaches the actual five-tool beta. This is a local implementation dependency, not real desktop-client acceptance.

## Boundaries & Constraints

Preserve Sabir's legitimate owner content access and genuine-human approval boundaries. Gabe/Sam get no inherited access; their separately approved content sharing remains unimplemented. Preserve migration021, device ceilings, tenant isolation and browser/machine separation. No live grants, credentials, databases, services, Cloudflare changes, push, fabricated identity or automatic promotion. One Woz source writer, sequential behavioral RED/GREEN, parent repeat tests. Only disposable synthetic identities and isolated loopback test listeners.

## I/O & Edge-Case Matrix

| Scenario | Required outcome |
|---|---|
| Signed owner consent, current admin, exact registered request, S256 exchange | Distinct owner-linked credential; actual scoped MCP |
| No consent, foreign subject/workspace, member lacking approval | Deny without new content grants |
| Bad/replayed/expired code, callback/client/resource/PKCE mismatch | No issuance or sensitive diagnostics |
| Simultaneous exchange or revoked/narrowed authority | One issuance at most; current authority and atomic rollback |
| Disabled configuration or machine-only mode | No OAuth consent/issuer activation |
| Machine with browser headers or request for human approval | Existing denials preserved |

</frozen-after-approval>

## Code Map

- `migrations/021-client-authority.sql`: verified owner-linked discriminator, action intersection and locks; unchanged.
- `src/devices.ts`, migration014: reuse hash-only restricted SQL/human issuance pattern, never device ceilings.
- `src/{authentication,gateway,core-api,mcp-api}.ts`: signed humans, same-origin, machine guards and actual five tools.
- Installed MCP SDK `server/auth/{provider,handlers,router}`: explicit provider and composed handlers; default router metadata over-advertises capabilities.
- `tests/lifecycle-fixture.ts`, `scripts/test-db.ts`: synthetic setup and canonical owned-container lifecycle.

## Tasks & Acceptance

All implementation paths below are under `foundation/`; no files outside this list except appended evidence in this spec.

- [x] `migrations/022-client-oauth.sql`, `src/{oauth-provider,oauth-consent,oauth-resource}.ts`: private consent/code transitions, atomic issuance, binding and revocation.
- [x] `src/oauth-http.ts`, `src/{core-api,core-config,core-server,persistence}.ts`: SDK listener, authenticated consent surface, strict opt-in config, real startup/shutdown and scope-derived core integration.
- [x] `package.json`, `bun.lock`: direct Express5.3.0 and compatible Express5 types only; no unrelated upgrades.
- [x] `tests/{oauth-contract,oauth-http}.test.ts`, `tests/core-config.test.ts`, `scripts/{test,test-db}.ts`: register real behavior and negative/concurrency cases from the contract; no missing-case bypass or skip.
- [x] `tests/{recovery,core-release}.test.ts`: exact migration-inventory expectation21→22 only where the new registered migration requires it.

Given a configured isolated process and synthetic signed human, when consent and exchange occur over HTTP, then obtain the test token through that path, initialize/list exactly five MCP tools, capture and read its receipt, exercise authorized deletion and deny human-only powers.

Given malformed/foreign/expired/replayed requests, concurrent exchange, rollback faults or revoked/narrowed authority, when actual endpoints/SQL enforcement run, then preserve the contract's denial and atomicity without secret disclosure.

Given unchanged legacy clients and OAuth disabled, when canonical tests run, then retain original behavior and nonzero full-suite discovery. No synthetic test establishes real user consent, item sharing, production readiness or installed-client acceptance.

## Implementation Notes

Parent adopted the detailed local contract after Scout deleg_273e2233 and direct SDK/config review. Technical defaults: five-minute pending/code, fifteen-minute token, fixed public registration, no refresh/DCR/CIMD, explicit loopback Express listener and metadata-only local exception. Routine local engineering is authorized by the current adapter; public exposure remains gated. No independent developer-review ceremony is reinstated.

Baseline28ebd494d5ba45270852c59d622c044d1f579847; clean admission hashes in `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/oauth-build-baseline.json`. Scoped Brain discovery succeeded; subsequent read-only recall timed out, so no retrieved-result or operational-status claim. Prior verified outcome remains fbc314a1-e551-4756-8ff8-61086c9e00e1.

Current session native goal is paused on the separate SSH prerequisite,4/15 turns used; no reset/resume or budget increase performed. Local work is authorized by the existing explicit continuation, not by the automated result. SSH remains blocked and no deployment work is attempted.

## Spec Change Log

## Review Triage Log

Parent direct inspection found an uncovered RFC7636 verifier-validation defect: the SDK hash check accepted a one-character verifier with a matching S256 challenge. A new registered actual-HTTP regression first failed:13 pass/1 fail/198 assertions, expected400 but received200, canonical command exit1. Parent then added the 43–128 unreserved-character syntax check before SDK token handling. Final focused OAuth14/0/224 and full canonical219/0/2405 passed; five malformed verifier variants issue no credential and leave the code unconsumed. Receipt: `red-pkce-verifier.log` under the directory below. No runtime limit or existing expectation was weakened.

Independent parent final gates all exited0: toolchain, typecheck, lint, unit126 tests/1713 assertions, full restricted DB219 tests/2405 assertions, OAuth focused14/224 and authority focused12/160. Deduplicated345 tests/4118 assertions; focused reruns excluded. Full DB has zero failures/skips/missing named cases. Parent verified1329 unrelated baseline hashes and removal of all three parent-owned test containers. No independent developer-review ceremony is claimed.

Evidence: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-oauth-20261031T002937Z/`. Governed local-commit check passed, audit_logged=false: no durable governance audit is claimed. Repository POL-013 remains absent as previously checked; loaded evidence-first rules and the current adapter apply.

Status done means only this local HTTP consent/issuance foundation. Consent is a signed-human JSON API, not a completed browser consent UI; tests supply the selected authorized workspace. Resource-server discovery/challenges, browser consent UX, DCR/CIMD, refresh, actual clients and release acceptance remain open. Next bounded Epic6 work is protected-resource discovery. The current epics-only goal supersedes the earlier paused/SSH implementation note above; SSH is out of scope.

## Verification

Use pinned Bun/Node PATH from the prior authority spec. Run `bun run check:toolchain`, `bun run test:db` (no selection arguments), `bun run test`, `bun run typecheck`, `bun run lint`, `git diff --check`. Focused OAuth execution must run within the canonical owned-container lifecycle, then retain full discovery. Record each actual behavioral RED/GREEN command/count/assertions/exit. Verify cleanup and every unrelated admission hash. No commit/push/deploy by worker; any incomplete matrix returns explicit WIP, never ready.

### Woz implementation evidence — local candidate, parent acceptance pending

Scope correction received during implementation: SSH/host setup is not a prerequisite for this local Epic6 dependency. No SSH, host setup, Cloudflare write, public deployment, live credential access, runtime-budget change, commit or push was performed. Existing Cloudflare signed-human issuer/audience/key verification remains unchanged. Parent retains the overall goal and independent verification; this spec remains in-progress.

Implemented migration022 private pending/consent/code state, hash-only secrets, owner-linked atomic issuance, registration-bound token revocation, human connection revocation, resource-derived MCP scope, opt-in fixed registration, explicit SDK authorize/token/revoke handlers, and a separate loopback issuer in the packaged core lifecycle. The authenticated consent surface is JSON; signed-in product UX remains deferred. No refresh, DCR or CIMD is advertised.

#### Sequential behavioral RED → GREEN receipts

Commands ran in `foundation` with verified Bun1.3.14 / Node24.19.0. `C` below means `bun test ./tests/core-config.test.ts`; `D` means canonical `bun run test:db` with no selection arguments. Counts are `pass/fail/assertions` for the focused case lane. Every listed RED exited1; every final GREEN listed exited0. The DB harness also ran its unchanged client-authority lane and complete restricted PostgreSQL discovery on each successful GREEN.

| Behavior | RED receipt | GREEN receipt | Full DB GREEN pass/assertions |
|---|---|---|---|
| Explicit opt-in registration | `bun run check:toolchain && C`: 2/1/37, valid OAuth config rejected | `C && bun run test`: 3/0/39 | n/a |
| Strict configuration rejection | `C`: 3/1/40, invalid config accepted | `C && bun run typecheck && bun run lint`: 4/0/73 | n/a |
| Actual issuer listener/metadata | `D`: 0/1/6, expected200 but no listener response | `oauth-green-02.log`: 1/0/13 | 206/2194 |
| HTTP human consent → PKCE token → actual MCP | `D`: 0/1/12, authorize404 instead of302 | `oauth-green-04.log`: 1/0/30 | 206/2211 |
| Token revocation | `D`: 1/1/36, revoke404 instead of200 | `oauth-green-05.log`: 2/0/38 | 207/2219 |
| Exact authorization protocol fields | `oauth-red-protocol.log`: 2/1/49 | `oauth-green-06.log`: 3/0/50 | 208/2231 |
| Resource mismatch cannot fall back to legacy scope | `oauth-red-resource.log`: 3/1/56 | `oauth-green-07.log`: 4/0/56 | 209/2237 |
| Binding also enforced on agent API / OAuth-disabled core | `oauth-red-core-binding.log`: 3/1/57 | `oauth-green-08.log`: 4/0/58 | 209/2239 |
| Human connection revocation | `oauth-red-human-revoke.log`: 4/1/63 | `oauth-green-09.log`: 5/0/67 | 210/2248 |
| Token scope injection rejected rather than ignored | `oauth-red-token-scope.log`: 9/1/155, issued200 instead of400 | `oauth-green-10-retry.log`: 10/0/157 | 215/2338 |
| Safe parser-error JSON | `oauth-red-parser.log`: 10/1/165, HTML diagnostics rather than JSON | `oauth-green-11.log`: 11/0/173 | 216/2354 |

The first four REDs and token-revocation RED are retained in worker session `20261030_190142_82ab9c`, tool-message IDs130504,130519,130539,130574,130606. Other named logs and final logs are under `/home/sabira/.hermes/profiles/troy/cache/scratch/` (ephemeral receipts; this table preserves counts).

Additional regression coverage exercised consent CSRF/mixed identity, swapped display fields/subject/scope, one-use nonce/cancel/expiry; missing/bad PKCE, exact callback/client/resource, expired/replayed/concurrent redemption; deferred audit COMMIT failure rolling back consumption and all six affected artifact tables; private SQL access and forged transitions; owner narrowing/revocation with cached identities; registration-bound foreign-token revocation; an observed PostgreSQL lock wait during concurrent owner revocation; bounded pending state and expiry cleanup. The packaged HTTP flow now also covers independent human approval, forbidden self/machine approval, authorized MCP deletion and replay, exactly five tools, capture/receipt read-back, startup failure cleanup, disabled issuer and shutdown. Existing legacy service/device lanes remain intact.

#### Final gates and discovery

- `bun run test:db` → exit0; OAuth lane13 passes/194 assertions; client-authority lane12/160; complete restricted PostgreSQL lane218/2375, zero failures/skips/missing names. Receipt: `oauth-final-db.log`.
- `bun run test` → exit0;26 required files,126 passes/1713 assertions, zero failures/skips/missing names. Receipt: `oauth-final-test.log`.
- Programmatically deduplicated unit + full DB:344 unique cases /4088 assertions. Focused OAuth and authority reruns are not added again.
- Final `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `git diff --check` → exit0. No timeouts or runtime limits were raised.
- 1329 unrelated admission hashes match; migration021 is unchanged. HEAD remains28ebd494d5ba45270852c59d622c044d1f579847. All311 original dependency-resolution lines remain identical; only direct Express5.3.0 / Express5 types5.0.6 and nine required type-resolution entries were added.
- Re-inspected 28 owned container names found across available receipts: none remain. Packaged lifecycle verifies its owned listeners/processes close; no shared database or existing service was used.

#### Issues encountered and resolved

- Repeated OAuth execution initially reused a fixture group; randomized synthetic fixture names removed the duplicate-key collision. This was a fixture error, not behavioral RED.
- Migration registration required the two permitted inventory assertions21→22; no recovery behavior was changed.
- Bun SQL queries are lazy thenables: direct `expect(query).rejects` stalled private-table checks. `Promise.resolve(query)` initiates them; both original failed runs and their timeout/cleanup remain recorded in `oauth-matrix-01.log` / `oauth-matrix-debug.log`. No timeout was increased.
- The SDK authorization rate limiter correctly returned429 after the bounded-state stress test. Expiry cleanup is therefore tested through the same restricted SQL pending transition, without disabling the limiter or issuing credentials directly.
- `oauth-green-10.log` had one existing browser app version-update assertion timeout. The unchanged complete rerun passed (`oauth-green-10-retry.log`); later final complete runs also passed. No browser test or budget was changed.
- A final unit run exposed six agent-drain fixture regressions from the added separate OAuth lookup (401 instead of expected legacy behavior). A single SQL `coalesce(oauth_lookup,lookup_machine)` now performs the same null-only fallback atomically; revoked OAuth rows never fall back. Existing tests were not changed. RED: `oauth-red-legacy-seam.log`, agent-drain0/6/18; GREEN: final unit lane6/0/88 plus the complete final DB run above.
- One lint failure for Express's required four-argument error-handler signature was fixed without suppressing the rule.

#### Changed paths and remaining integration boundaries

Created: `foundation/migrations/022-client-oauth.sql`; `foundation/src/oauth-{provider,consent,resource,http}.ts`; `foundation/tests/oauth-{contract,http}.test.ts`.

Modified: `foundation/src/{core-api,core-config,core-server,persistence}.ts`; `foundation/{package.json,bun.lock}`; `foundation/tests/{core-config,core-release,recovery}.test.ts`; `foundation/scripts/{test,test-db}.ts`; appended this evidence only. Parent-authored contract remains unchanged.

No local gate is currently failing, but parent inspection/repeat verification and product acceptance remain outstanding. This does not establish real desktop-client compatibility, actual human consent or individual member sharing. Public issuer/resource/callback values and the exact edge policy separation between OAuth protocol routes and signed-human consent require later authorized integration through the existing Cloudflare MCP/cf tooling—not SSH or a new management stack. The current issuer is deliberately loopback-only and cannot be treated as a production issuer merely by adding routing. DCR/CIMD, refresh/rotation/restart policy, installed clients, signed-in UX, individual resource sharing, rollout/rollback and deferred6.5/9.4 remain open. The overall goal is not closed.
