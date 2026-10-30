---
title: '6.5 Core journey witness and deployment boundary'
type: feature
created: 2026-10-27
status: in-progress
route: dispatch
baseline_commit: d8f9865991430d1119892068fcc576e69f3ccc3b
---

# Intent and controlling authority

## Approved delivery clarification — 2026-10-30

[Internal-team MCP Correct Course](../planning-artifacts/sprint-change-proposal-2026-10-30-team-mcp.md) was approved for bounded execution. Reconcile later exact private hosted candidate receipts and isolated staging/rollback observations individually rather than repeating completed gates from stale prose. Credit only the build/environment each receipt actually verifies. Named-client team rollout is a distinct witness: legacy endpoint calls and synthetic humans cannot satisfy it. Real-human core journey and remaining operational acceptance stay open; this story remains in-progress. Dashboard-specific tasks remain in 9.4, without removing human authentication prerequisites from actions that genuinely require them. No release closure, broad production mutation or silently incompatible endpoint replacement follows.

Brooks owns architecture/delivery; Woz implementation guidance is loaded in the existing sole writer, through the installed rendered BMAD build route. Direct self-checks replace independent developer review under Sabir's current explicit methodology. Current user authorization includes local code/tests/disposable resources/local beta commits, NOT publication/deployment/production credentials or access-policy changes. A complete local rehearsal is useful preparation, never a substitute for the actual authorized deployed witness required by the catalog. No new framework, worker, board or independent-review ceremony.

## Boundaries

Preserve immutable evidence, independent authorized human semantic approval, current server-resolved scope/permissions and exact-version/replay semantics. Do not copy legacy APIs or add a sixth MCP tool. Existing capture is evidence-only. Synthetic signed fixture humans are real authentication exercises, not actual human product acceptance. Optional external projection, device/OS secure-store acceptance and UI/graph/browser acceptance are outside this core slice; no optional adoption is inferred.

## Code map

- `foundation/tests/core-release.test.ts`: existing genuine packed server, clean install/model, restricted app database, signed synthetic identities and restart fixture. Extend with a single continuous DOC-J01–06 rehearsal, preserving6.4 cases.
- `foundation/src/review-api.ts`: already exposes governed read/evidence/decision/correction/restoration routes, but lacks an initial proposal-submission transport. Reuse `submitProposal` from `src/proposals.ts` behind signed-human `proposal:write`; current field allowlist and gateway origin/scope guards remain authoritative.
- `foundation/src/{decisions,corrections,lifecycle,retrieval,indexing,mcp-api}.ts`: existing transactional/retrieval services, immutable receipts and native indexing. Reuse rather than bypass through owner SQL; owner fixture SQL is allowed only for synthetic grants, fault injection and read-only durable-state verification.
- `foundation/scripts/test-db.ts`: require the actual end-to-end case, no skip/empty discovery.
- `docs/allura/REQUIREMENTS-MATRIX.md:25-30`: stable DOC-J01–06 meanings; legacy source/status columns are historical, not current evidence. Protected specifications remain untouched.

## Tasks & acceptance

- [x] Add real packed-server rehearsal. Given synthetic current machine authority, capture twice with one operation key returns the exact same receipt/event and high threshold does not promote or create a proposal (DOC-J01/02).
- [x] Expose the missing bounded signed-human proposal submission route. Given maximum explicit submitter confidence, proposal stays pending; requester with actual review entitlement cannot self-approve, foreign scope/missing evidence cannot approve (DOC-J02/03).
- [x] Given a reviewer saw version1, a changed version2 makes the stale new decision conflict without approval mutations. Fresh exact-version approval returns an immutable receipt and replay is byte-identical (DOC-J05).
- [x] Given an injected receipt-boundary/deferred-COMMIT failure in the owned fixture, the HTTP outcome is unknown/failure and canonical approval rows/evidence remain unchanged; pending proposal can recover after fault removal (DOC-J04).
- [x] A second authenticated client retrieves approved current knowledge/provenance; correction/deprecation excludes old current content while explicit authorized history retains it; foreign scope and revocation deny (DOC-J06). Do not weaken assertions into lexical/raw fallback to claim native readiness.
- [x] Preserve measured capability/limitations and a traceable release handoff; run all local gates and exact-source CI, with actual counts and archive identity.
- [ ] Separately authorized hosted CI, actual deployment target/identity onboarding, real-human journey and non-destructive operational rollback witness; then epic6 retrospective. These steps remain BLOCKED BY AUTHORITY until Sabir explicitly supplies the required publication/deployment scope. Never mark6.5 or Epic6 fully complete from a local fixture.

## Verification

TDD starts with real HTTP404 for absent proposal submission, then fixes only demonstrated gaps. Use source-linked typed payloads, restricted PostgreSQL, signed identities, actual child server and packed artifacts, deliberate fault/denial cases, nonzero required discovery, compiler/lint, clean-source six-lane CI. No destructive down migrations or deletion of accepted evidence as rollback. All raw logs and checkpoint live in existing direct-build Operations evidence directory, not a shadow task board.

## Implementation notes

Local preparation has no unanswered ordinary engineering question. The production/publication boundary is explicit and cannot be resolved by a design default. This story remains in-progress even if all local rehearsal tasks pass.

Admission12 exercised the continuous journey in the actual extracted package/child server against restricted disposable PostgreSQL and the native pinned model. The missing proposal route initially failed404. Subsequent404 correctly rejected curator access to another actor's unlinked evidence: the fixture now uses an authorized submitter and keeps the denial assertion; no product access was widened. The missing index trigger then failed404. Added signed-human `/api/index/drain` using existing `proposal:write` and one-job drain service, empty body only; no background worker, sixth MCP tool or automatic promotion. Cancellation is propagated into the bounded provider; required negative coverage proves pre-aborted requests make no claim and late provider success cannot publish after cancellation. These are demonstrated transport gaps, not a new indexing policy. Current grants and evidence confidentiality remain authoritative.

Admission12 whole gates:149tests/1186assertions (restricted DB115/932), zero failures/skips/missing required cases, separate typecheck/lint passed. Raw evidence: `admission12-journey-full.log` under the authorized direct-build Operations directory. Packed test `foundation/tests/core-release.test.ts` covers DOC-J01–06, fault rollback, native current retrieval, graph provenance and lifecycle; its restart case covers revoked authority. `foundation/tests/indexing.test.ts` covers abort/no-late-success. These are synthetic signed-human fixtures, not actual human acceptance or deployed proof. Admission13 resumes the exact seven owned hashes at baseline HEAD, adds operational usage/limits to `foundation/core-package/README.md`, and prepares a fresh clean-source CI/artifact handoff. Existing6.4 receipts cannot close this changed revision.

Admission13 exact-source attempt at `be1f303e78e8fb2c36ee851fb9465dcfac2934b7` correctly FAILED: `admission13-ci-attempts/allura-ci-hldz9Q/attempt.json`, restricted DB114pass/1fail. The foreign-schema restore case could not create its disposable target: `recovery_startup_failed`. Inspection found60 retries/100ms delay measured attempts, not elapsed startup time, so fast refusals exhausted readiness early. Added bounded `src/recovery-readiness.ts` and used it for both new targets and restarts, with a 30-second wall-clock deadline, query cancellation, connection cleanup and redacted failure. No image/resource/authority limit or outer CI/supervisor budget was changed. Four required unit regressions cover61 fast failures then success, finite expiry/no retry after expiry, hung/late success cancellation and invalid budgets. `admission13-readiness-red.log` exit1 precedes implementation; `admission13-readiness-green.log` exit0; whole `admission13-readiness-full.log` exit0 at12:02:22 EDT,153tests/1200assertions (DB115/932), separate typecheck/lint green. Original failed CI remains failed and cannot be aggregated with the new attempt.

## Local acceptance handoff — not deployed acceptance

NEWER approved decision2026-10-27 after admission13: [Correct Course](../planning-artifacts/sprint-change-proposal-2026-10-27.md) supersedes the waiting instruction at the end of this historical handoff.6.5/Epic6 remain in-progress for deployment-only acceptance, but independent currently approved dependency-ready local work proceeds, next8.1. No deployment/publication/optional-adoption authority is granted. The unchecked release requirement above remains open.

Implementation revision `ad07bff115e34f64787286334da7020f7f2f05b7` passed fresh clean-source six-lane CI at2026-10-27T12:06:27-04:00. `admission13-exact-ci-fixed.log` and `admission13-ci-attempts/allura-ci-wQ5GHt/attempt.json` identify one local attempt:153tests/1200assertions, unit38/268 and restricted DB115/932; frozen install, typecheck, lint, native model and all discovery passed. All six actual raw-log hashes were recomputed and matched. This proves local acceptance only; no GitHub workflow run or deployed target was inspected.

The EXACT tested archives and original source-clean pack receipts were copied, not repacked, under the direct-build Operations `releases/ad07bff115e34f64787286334da7020f7f2f05b7/` directory and copied bytes rehashed. Core `allura-core-0.1.0-dev.1.tar.gz` SHA256 `af00a3f482cd2e68d928a8d4f205f066b4581b31b9d90d5eaedb785d1959ad68`; consumer `consumer/allura-memory-consumer-0.1.0-dev.1.tgz` SHA256 `4c75bece9528ae25c493686086377b223f631ceb046455f4bb3149ad3c9383da`. Runbook is shipped `README.md` from `foundation/core-package/README.md`. These private artifacts are not published or deployed. Any newer source SHA requires its own same-attempt CI and artifact receipts.

Brooks judgment: the authorized local rehearsal is complete; the story remains IN PROGRESS at the actual deployment/hosted-CI/real-human witness boundary. Current catalog requires closure before the next numbered epic. Request explicit isolated acceptance-target/publication/onboarding authority, or an explicit correct-course decision deferring this deployment gate before further local epics; do not infer either from duration authorization. No independent developer review is required or claimed. Partial local retrospective: [Epic6 local retrospective](epic-6-local-retro-2026-10-27.md); final deployed retrospective remains open.

## Private hosted acceptance follow-up — cold model cache

Sabir subsequently authorized isolated Dell staging, a new private candidate repository and hosted CI, and directed continued agentic development. This does not authorize public publication, public routing, real-person grants or invented human acceptance. Current direct-build adapter still supplies one writer and direct self-checks, not developer review delegates. No operational tracker or semantic promotion is created.

Baseline local source: `bc9cf85d01c91972bb5f5ca02fb4b96168fc90d8`. Private snapshot `3eddff80b19832c1809756573ed21c59c07fb380` has the identical source tree `26551a74ebc28d566d108fe78c195a10459df240` without transferring flagged historical credential material. Private GitHub run `41006001270`, attempt 1, reproduced `embedding_unavailable` in the required OpenAI/default-local-provider unit test: `CI_LANES` schedules unit before model preparation. Existing local model caches hid the defect. All other hosted lanes passed, including 193 DB/browser/package tests and 2,021 assertions. Failed attempts are retained and cannot be aggregated into success.

Bounded fix: `foundation/src/ci-contract.ts` orders model preparation before unit/database inference; `foundation/tests/ci-contract.test.ts` exercises the actual exported execution order; `foundation/scripts/test.ts` requires the new regression and its assertion floor. No application auth, schema, model identity, network fallback or test skip changes. Re-run focused RED/GREEN, full local gates, and a fresh exact-revision hosted attempt. Keep 6.5/9.4 in-progress for actual human/deployed operational acceptance.

- [x] Cold-cache scheduling regression failed before the fix (expected model index 4 before unit index 3) and passed after it: focused suite 5 tests / 63 assertions.
- [x] Installed canonical `allura-dev run check:all` passed: 124 unit / 1,677 assertions, both typechecks and lint, 193 DB/browser/package / 2,021 assertions; zero failures, skips or missing required cases; owned DB fixture removed. Combined 317 tests / 3,698 assertions.
- [ ] Fresh hosted six-lane CI passes on the final candidate; preserve the failed first run separately.
- Next gate: direct four-file diff self-check, scoped local commit, byte-identical private export and exact-revision hosted CI. Model preparation is now before both inference-consuming test lanes; no test or evidence validation was disabled. Outcome evidence lives in Troy's `reports/allura-completion-goal/private-hosted-ci/`, not an operational board.
- Governed `allura-system` retrieval unavailable through the exposed fixed-workspace Troy schema (no group/workspace selector); no cross-tenant substitution. These notes are evidence, not live operational status.
