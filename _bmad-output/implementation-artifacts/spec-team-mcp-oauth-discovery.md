---
title: 'Epic6: local MCP OAuth discovery'
type: feature
created: '2026-10-30'
status: done
route: dispatch
baseline_commit: 05e16c203a3642e2eb8470d0afda35a69aff410f
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/team-mcp-oauth-v1.md'
---

<frozen-after-approval reason="inherited approved Epic6 intent">

## Intent

Let the real MCP SDK discover the configured local OAuth issuer and complete token acquisition rather than manually injecting a bearer token. Build on the verified owner-linked OAuth foundation, without claiming installed-client acceptance.

## Boundaries & Constraints

One writer, sequential behavioral RED/GREEN and parent repeat verification. Preserve current owner authority, individually approved member access, tenant isolation and genuine-human approval. No SSH, host setup, migration, dependencies, new listener, live Cloudflare change, public exposure, credential access, push, deployment, branch/worktree or automatic semantic promotion. Existing Cloudflare MCP/cf remain the tools for later authorized Cloudflare work. Browser consent UX, DCR/CIMD/refresh and release acceptance remain separate.

## I/O & Edge-Case Matrix

| Input/state | Required result |
|---|---|
| OAuth configured; anonymous GET protected-resource metadata | Exact configured resource/issuer/scopes/header method only; no-store/nosniff |
| GET/POST MCP authentication denial, including wrapper401 | Original body/status plus configured resource_metadata Bearer challenge |
| Foreign Host/forwarding headers | Metadata/challenge URLs remain configuration-bound |
| Scope-conflict403, human/admin route, disabled OAuth | No new upscoping/discovery surface; original behavior retained |
| Cookie/assertion mixed with machine token | Denial preserved, no stripping or human impersonation |
| SDK client initially without tokens | Real discovery and SDK authorization/exchange, then five tools/capture/read-back |

</frozen-after-approval>

## Code Map

- `foundation/src/oauth-resource.ts`: existing opt-in wrapper; add metadata and401 decoration here, not a generic gateway rewrite.
- `foundation/src/core-api.ts`: already conditionally wires wrapper; read-only unless parent grants a demonstrated necessary extension.
- `foundation/src/oauth-http.ts`: existing AS discovery/SDK handlers; preserve RFC7636 verifier guard and truthful metadata.
- Installed SDK1.32.2 `client/auth.{js,d.ts}` and `client/streamableHttp.js`: real challenge extraction, PRM/AS discovery, issuer-bound fixed registration and finishAuth exchange.
- `foundation/tests/oauth-http.test.ts`: packaged process and signed-human JSON consent already exist; currently hand-injects bearer.

## Tasks & Acceptance

Worker allowed files only:
- [x] `foundation/src/oauth-resource.ts`: exact GET well-known route and GET/POST MCP401 challenge; preserve all existing denials/bodies/scopes.
- [x] `foundation/tests/oauth-contract.test.ts`: named tests for the matrix, including disabled mode and hostile header cases.
- [x] `foundation/tests/oauth-http.test.ts`: exercise real SDK authProvider discovery, signed synthetic-human consent, state match, finishAuth, reconnection and five-tool capture/receipt path without manually setting Authorization.
- [x] `foundation/scripts/test-db.ts`: register exact new cases; retain focused and full nonzero canonical discovery.
- [x] Append receipts to this spec only; no edits to its frozen block or parent-authored contract.

Given a tokenless fixed-registration SDK client, when actual HTTP discovery and exchange complete, then its saved SDK token authorizes the expected five-tool/capture/receipt path. Assert metadata/issuer route observations without printing secrets. Preserve existing revocation and invalid-verifier regression coverage.

Given the logical HTTPS resource differs from owned loopback transport, when the test maps only the configured core origin and owned issuer, then return real network responses and reject every unrelated destination. No synthesized responses, resource-validation override, globally disabled TLS, preseeded bearer or external network fallback.

Given OAuth disabled or a non-authentication denial, when requests reach core, then no new discovery or privilege escalation occurs. Metadata contains no private scope inventory. Non-GET metadata requests are not served as metadata.

## Implementation Notes

Scout deleg_ac03d9fb inspected the actual SDK and confirmed missing core PRM/challenges. Parent accepts this reversible local implementation choice under the existing protocol exception; no new owner decision is needed. Previous foundation is committed and independently verified at345 tests/4118 assertions. Admission hashes: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/oauth-discovery-baseline.json`. Parent has modified the adopted contract for this follow-up; preserve those bytes.

This is local SDK integration with transport mapping, not browser UX, TLS or actual desktop evidence. Keep6.5/9.4 open. No independent developer-review ceremony or shadow status board.

## Spec Change Log

## Review Triage Log

Parent directly inspected the complete resource wrapper and actual test/harness diffs. The adapter returns actual owned HTTP responses, never synthetic metadata/tokens, and leaves default SDK resource validation active. Configured URLs, denial status/body, mixed identities and non-auth403 exclusions are tested. Parent independently reran all five gates: check:toolchain/typecheck/lint/test/test:db, each exit0. Unit126/1713 plus canonical DB222/2543 yields348 unique tests/4256 assertions, no failure/skip/missing cases. Focused OAuth17/362 and authority12/160 reruns are not double-counted. Parent verified1344 unrelated admission hashes, the preserved parent contract hash and owned-container removal.

Receipt directory: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-discovery-20261031T005846Z/`. Governance local-commit check passed; audit_logged=false, so durable audit persistence is not claimed. POL-013 remains absent in this checkout; loaded evidence-first rules and current adapter govern this local checkpoint. No independent developer-review ceremony is claimed.

Status done applies only to local SDK discovery with logical-origin transport mapping. It is not TLS, browser-consent UX, desktop-client, public Cloudflare or6.5/9.4 product acceptance. No remote push/live mutation/deployment occurred. Next approved local gap is browser consent integration; read-only Scout is investigating the existing UI/API boundaries.

## Verification

Use pinned Bun1.3.14 and Node24.19.0 PATH from the prior spec. Run `bun run test:db` without selectors (owned disposable container, focused plus full lanes), `bun run test`, `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `git diff --check`. Observe meaningful behavioral RED before implementation, not missing imports or fixture errors. Capture commands/counts/assertions/exits and cleanup. Compare all unrelated admission hashes, preserving the parent contract amendment. No worker commit or acceptance closure; return partial WIP honestly if any matrix remains unverified.

### Woz local implementation receipt — 2026-10-30

Local discovery matrix verified; pending parent repeat verification, not overall acceptance or release closure. Read this spec and both frontmatter context files fully. Applied the adapter's explicit missing `.agents/TEAM-RAM-RUNTIME.md` mapping to `guidelines/ALLURA-BMAD.md` plus the loaded host Team RAM guidance; did not recreate the absent runtime file or invoke obsolete developer-review ceremonies.

Changed only `foundation/src/oauth-resource.ts`, `foundation/tests/oauth-contract.test.ts`, `foundation/tests/oauth-http.test.ts`, `foundation/scripts/test-db.ts`, plus this appended receipt. No core wiring, authorization-server/provider, schema, dependency, lockfile, runtime, profile or contract edits.

#### Sequential behavioral evidence

All DB commands below were `bun run test:db` with no selectors, from `foundation`, on pinned Bun 1.3.14 / Node v24.19.0. Each command owned a disposable loopback PostgreSQL container and verified its removal.

| Slice / receipt | Observed outcome | Exit |
|---|---|---|
| Metadata RED | Anonymous exact metadata GET returned 404 rather than 200; OAuth lane 14 pass / 1 fail / 225 assertions. No fixture/import failure. | 1 |
| Metadata GREEN | OAuth 15 pass / 243 assertions; client-authority 12 pass / 160 assertions; canonical DB 220 pass / 2424 assertions, 0 fail/skip, missing required cases `[]`. | 0 |
| SDK challenge RED | Actual tokenless SDK initialization received MCP401 without the required challenge (`challenge:false` rather than `true`); OAuth 14 pass / 1 fail / 218 assertions. | 1 |
| Challenge matrix RED, before implementation | Added named gateway/wrapper denial matrix also observed missing challenge (`null`); SDK challenge remained RED. Existing disabled/non-auth regression matrix passed unchanged. OAuth 15 pass / 2 fail / 280 assertions. | 1 |
| Final challenge + SDK GREEN | OAuth 17 pass / 362 assertions; client-authority 12 pass / 160 assertions; canonical DB 222 pass / 2543 assertions across 39 files, 0 fail/skip, missing required cases `[]`. | 0 |

SDK integration now begins without tokens, discovers real protected-resource and issuer metadata, uses SDK-generated PKCE/authorization URL with provider-generated round-trip state, performs signed synthetic-human JSON consent, checks callback/state, calls `finishAuth`, and reconnects using provider-saved issuer-bound tokens. Five tools, capture/receipt read-back, independent-human approval and owner-authorized deletion remain exercised. No hand-injected MCP Authorization, resource-validation override, synthesized response, disabled TLS or external network fallback. The test-only adapter preserves request method/body/headers, refuses unrelated origins, and records only origin/path/method/status and authentication/challenge booleans. A separate existing raw HTTP negative human-route probe remains distinct from the SDK MCP flow.

#### Matrix coverage and final gates

- Exact anonymous metadata, configured scopes only, no-store/nosniff, hostile Host/Forwarded headers, exact path and non-GET absence: `OAuth discovery metadata is exact anonymous configuration bound and GET only`.
- GET/POST missing/unknown-token gateway401, valid-token mixed cookie/assertion denial, and genuinely bound expired-token wrapper401 with original status/body/cache behavior and configuration-bound challenge: `OAuth discovery challenges preserve gateway and wrapper authentication denials without trusting forwarded hosts`.
- Disabled discovery/challenges, foreign/duplicate scope403, human/admin401, malformed400, successful MCP and unsupported methods without new challenges: `OAuth discovery stays absent when disabled and never decorates scope conflicts or human routes`.
- Tokenless discovery/exchange/five-tool receipt path and packaged process shutdown/startup-failure/disabled-listener behavior: `OAuth isolated core SDK discovers issuer exchanges tokens and closes its separate listener`.
- All four exact names are registered in canonical DB required discovery; existing PKCE syntax, revocation, owner/member authority and legacy service/device regression cases remained passing.
- `bun run test`: 126 unique cases across 26 required files, 1713 assertions, 0 fail/skip/missing, exit0. Combined unique unit + canonical DB result: **348 tests / 4256 assertions**, excluding duplicated focused-lane runs.
- `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, `git diff --check`: exit0 each. Two initial TypeScript URL-overload diagnostics in the test adapter were corrected by passing URL strings; final actual project typecheck and lint passed.
- Final DB output is retained at `/home/sabira/.hermes/profiles/troy/cache/scratch/oauth-discovery-green-db.log`; unit/toolchain/typecheck/lint/diff output at sibling `oauth-discovery-validation-0.log` through `oauth-discovery-validation-4.log` respectively. Expected induced-failure and browser-denial diagnostics in the existing canonical suite are not failed tests.

#### Preservation, cleanup and open acceptance

Compared all 1349 admission fingerprints: only the four permitted source/test/harness files and the already-parent-amended contract differ from that historical baseline. The dispatch contract SHA256 remains `0a3fb14ac686901a21489a29a483e91514d2ca3c278706389e7cb35f5eed131d`. The entire dispatch spec was still SHA256 `6f3a39f84a4f4ee7b6e560a0b3252b92d32c2c5fe44ff77ea44ace686586fd65` immediately before this append; frozen scope and task text were not changed.

Every DB attempt verified container deletion: `allura-direct-test-1cd1a838-1bff-463f-a07f-9e874e447f3b`, `allura-direct-test-816dabae-67c1-45a8-ae04-bb4634078c31`, `allura-direct-test-07f5189a-8535-4fec-b22c-8910a62389e8`, `allura-direct-test-4c311668-e343-46d5-90ce-94f998da4716`, and final `allura-direct-test-72943c5e-688a-4c91-93f9-15da2f81082d`. Test finalizers stop owned listeners/children, close fixture SQL and remove the unpacked lifecycle directory. Existing harness-generated package artifacts/caches and these sanitized logs remain in scratch; no broad cleanup was attempted.

No commit, stage, branch/worktree, push, deploy, live Cloudflare/MCP, SSH, credential access, production/shared DB change, new dependency or host/profile/budget change. This is local real-HTTP SDK integration with logical-HTTPS-to-loopback mapping, **not TLS, browser-consent UX, installed Gilliam/Hermes/ChatGPT/Claude client, public-routing or rollout evidence**. DCR/CIMD/refresh, real registrations and individual member sharing remain separate. Keep 6.5/9.4 and overall goal open; parent owns independent rerun and acceptance.
