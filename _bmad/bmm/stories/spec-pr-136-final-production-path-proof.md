---
title: 'PR 136 Final Production-Path Proof'
type: 'bugfix'
created: '2026-08-31'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: '38cadce225a78f4c1ec8f5667344223ef7a04427'
context:
  - '{project-root}/_bmad/bmm/planning/epic-26-correct-course-upstream-bumblebee-plugin.md'
  - '{project-root}/_bmad/bmm/planning/epic-27-governed-branchable-learning-memory.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** PR #136 advertises governed-lane SDK operations and security/upgrade guarantees, but final review found five Important proof gaps: the canonical HTTP gateway cannot dispatch lane tools, historical upgrade proof is not mandatory in CI, held generation N lacks live promoted-N−1 provenance proof, the SDK package is not tested through normal package resolution, and signed Genesis evidence is not proven through the real proposal boundary.

**Approach:** Close all five gaps through the real authenticated production paths, add isolated deterministic acceptance lanes, and rerun the full frozen-SHA gate chain before push.

## Boundaries & Constraints

**Always:** Preserve PostgreSQL as canonical authority; retain migration 055 byte-for-byte; keep 056 forward-only and append-only; derive workspace/actor authority from authenticated gateway principal; require signed tenant-bound Genesis evidence; keep tests deterministic and executable in CI.

**Ask First:** Any migration that rewrites historical evidence, loosens RLS, changes public lane semantics, weakens gateway authentication, or requires a new production dependency.

**Never:** Bypass `guardToolCall`; accept browser/caller-supplied authority; replace live proof with SQL-string assertions or mocks; test SDK publication only by direct `dist/` imports; push or merge before an exact-SHA review reports 0 Critical / 0 Important.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lane workflow | Authenticated principal invokes SDK open → snapshot → review | Canonical gateway advertises and dispatches all three tools; durable scoped rows result | Unknown tools, wrong scope, or insufficient roles fail closed |
| Historical upgrade | Database staged through exact committed 055 with legacy receipts/evidence | Isolated CI database applies 056 and proves reconciliation/legacy reader behavior | Any migration or invariant failure fails the live gate |
| Held findings | Promoted inventory N−1 followed by held findings generation N | Trusted exposure persists and reads exact N−1 lease/batch/generation | Held-only, stale, mismatched, or cross-scope provenance is rejected |
| SDK package | Packed tarball installed in clean consumer | `@allura/sdk` ESM/CJS/types and `client.lanes` resolve normally | Missing files/exports/declarations fail the package test |
| Genesis evidence | Signed evidence drives `generateProposal → syscall_mutate` | Verified claims control policy context; valid proposal succeeds | Tampered, expired, raw override, or cross-tenant evidence fails closed |

</frozen-after-approval>

## Code Map

- `src/mcp/canonical-http-gateway.ts` -- canonical ListTools/CallTool dispatch and `guardToolCall` authorization; wire `governed-lane-tools.ts` here.
- `src/mcp/governed-lane-tools.ts` -- existing secure lane handlers to reuse; do not duplicate workflow logic.
- `packages/sdk/src/lanes.ts` and `packages/sdk/src/client.ts` -- published lane client and authenticated MCP transport.
- `scripts/ci/run-live-db-tests.sh` -- canonical fresh-install live lane; orchestrate a separate empty historical-upgrade database/test.
- `src/__tests__/bumblebee-historical-upgrade.e2e.test.ts` -- exact 055→056 proof; currently opt-in and isolated.
- `docker/postgres-init/56-bumblebee-forward-upgrade.sql` and `src/lib/bumblebee/exposure-store.ts` -- promoted-inventory provenance authority and read path; production behavior is read-only context unless a live defect is proven.
- `packages/sdk/package.json` and `packages/sdk/test/dist-consumer.test.ts` -- package files/exports and current direct-dist coverage; replace/extend with pack-install consumer proof.
- `src/control-plane/genesis-policy-evidence.ts`, `src/control-plane/syscalls.ts`, `src/lib/genesis/proposal-generator.ts` -- signed evidence issuance, verification, and proposal boundary.
- `src/control-plane/genesis-policy-evidence.test.ts` -- current isolated cryptographic tests; extend with real boundary proof.
- `docker/postgres-init/57-governed-lane-review-boundary.sql` -- append-only SECURITY DEFINER authority/locking boundary for application-role review loading; binds group, workspace, lane, branch, snapshot, writer, and reviewer authority.
- `docker/postgres-init/59-genesis-server-verified-authority.sql` -- owner-only verified-claim/proposal transaction; revokes application-role proposal INSERT and both Genesis persistence-function EXECUTE grants.
- `src/lib/genesis/proposal-generator.live-db.test.ts` -- live app-role bypass, trusted signed flow, audit binding, replay, and mutation-mismatch proof.
- `src/__tests__/governed-lane-review-boundary.e2e.test.ts` -- live application-role grant, scope, authority, missing-row, and two-connection serialization proof for migration 057.

## Tasks & Acceptance

**Execution:**
- [x] `src/mcp/canonical-http-gateway.ts` and gateway tests -- advertise and dispatch governed lane open/snapshot/review through `guardToolCall`; prove authenticated SDK round trip.
- [x] `scripts/ci/run-live-db-tests.sh`, live config, and historical-upgrade test -- create/run a dedicated empty upgrade database as a mandatory live sub-gate without reusing the fresh-install database.
- [x] Bumblebee live tests -- execute promoted N−1 then held N for the same scope/profile; persist via the 056 definer and read back exact trusted provenance plus rejection cases.
- [x] SDK packaging tests -- build, pack, install into a clean temporary consumer, and prove ESM/CJS/types plus `client.lanes` through package-name resolution.
- [x] Genesis tests/fixture -- drive valid, tampered, and cross-tenant signed evidence through `generateProposal → syscall_mutate`; prove caller overrides cannot replace verified claims.
- [x] Rebuild tracked SDK dist, run all gates, freeze one SHA, independently review it, and push only on a clean verdict.
- [x] Migration 057 and live boundary tests -- bind the expected branch and authoritative writer inside the locked definer query; prove application-role grants and stale-snapshot race exclusion.
- [x] Migration 059 and Genesis live proof -- remove application-role access to both evidence persistence functions and generic proposal INSERT; persist the server-verified principal/group/target/digest/JTI audit atomically with the proposal and prove replay/mismatch fail closed.

**Acceptance Criteria:**
- Given an authenticated authorized SDK principal, when it calls lane open, snapshot, and review, then the canonical HTTP gateway advertises and executes each tool and unauthorized principals fail closed.
- Given exact committed v055 state, when canonical live CI runs, then a separate empty database applies 056 and verifies deterministic authority, quarantine, validated constraints, and legacy-unverified exposure reading.
- Given promoted inventory N−1 and newer held findings N in one exact scope, when trusted evidence persists and is loaded, then it cites N−1 exactly; stale, held-only, mismatched, and cross-scope inputs fail.
- Given the built SDK tarball, when installed in clean ESM and CJS consumers, then `@allura/sdk`, declarations, and `client.lanes` resolve through declared package exports.
- Given server-issued Genesis evidence, when proposal generation reaches policy evaluation, then verified claims govern the write; tampered, cross-tenant, expired, missing, and raw-override attempts are denied.
- Given the completed candidate SHA, when all non-live, fresh-install, historical-upgrade, and independent reviews run, then all gates are green and review reports 0 Critical / 0 Important before push.

## Spec Change Log

- 2026-08-31 -- Added migration 057 rather than rewriting frozen 056: the application role needs a narrowly granted SECURITY DEFINER loader to lock and validate lane/snapshot authority before proposal creation. Added live concurrency/grant proof, strict canonical JSON compatibility coverage, exact gateway schema assertions, reproducible SDK pack consumers, and the expanded provenance/Genesis negative matrix from final review.
- 2026-09-01 -- Added forward migration 058: signed Genesis evidence now carries a canonical `pg:pattern_proposals` target, canonical mutation digest, and UUID JTI. The database consumes each JTI in an append-only, RLS-protected ledger in the same SECURITY DEFINER transaction that inserts the proposal. The isolated historical fixture now pins committed pre-056/057 baseline `dcd2bb25c8b56678451aa7846f2ead1328d3d4b5` and asserts v055 blob `c154a431fd3a7a3968461705725181d1b268ce5c`.
- 2026-09-01 -- Added forward migration 059 after final architecture review: the HMAC remains exclusively server-side, `allura_app` loses both Genesis persistence-function EXECUTE grants and direct `pattern_proposals` INSERT, and an owner-only SECURITY DEFINER transaction records the server-verified JTI/principal/group/target/digest audit before atomically consuming and inserting the proposal. Live proof now demonstrates direct app-role calls and generic INSERT fail while the signed path succeeds once only.

## Design Notes

Historical upgrade proof must run against its own disposable database because the normal live database has already applied current migrations. It first proves the byte-exact 055→056 boundary, then advances through 057 and verifies the review loader is available. Migration 057 is append-only and must bind the caller's expected branch plus authoritative writer while holding registry/snapshot row locks. Gateway wiring must import and call the existing governed-lane handlers after principal resolution rather than replicating database/workflow logic. Canonical identities use strict UTF-16 code-unit key ordering while retaining legacy identity candidates for historical verification.

## Verification

**Commands:**
- `bun run typecheck && bun run build && bun run lint:ci -- --base=38cadce225a78f4c1ec8f5667344223ef7a04427` -- expected: no errors.
- `bun run test:unit && bun run test:curator && bun run test:integration` -- expected: all configured suites green.
- `cd packages/sdk && bun run build && bun run test` -- expected: package, dist, and clean-consumer tests green.
- `bash scripts/ci/run-live-db-tests.sh --artifact-dir=<fresh>` -- expected: fresh install and mandatory isolated historical upgrade both green, zero failed tests.
- Independent frozen-head review -- expected: 0 Critical / 0 Important; HEAD unchanged before push.
