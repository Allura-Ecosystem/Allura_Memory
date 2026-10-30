---
title: 'Team MCP first slice: owner-linked client authority'
type: feature
created: '2026-10-30'
status: done
route: dispatch
baseline_commit: 7365f9fc2f320401be1e85c3d0eb9a14d8e866e6
review_loop_iteration: 0
context:
  - '{project-root}/guidelines/ALLURA-BMAD.md'
  - '{project-root}/_bmad-output/planning-artifacts/contracts/authority-v1.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-team-mcp-client-auth.md'
---

<frozen-after-approval reason="user-directed owner/member policy and continuation">

## Intent

Implement the first dependency-ready part of Sabir's approved owner/member policy: a separately attributable client can exercise its owner's current authorized content actions without the existing device-only viewer/curator ceiling. On 2026-10-30 Sabir corrected the policy (his accounts retain owner access; Gabe/Sam only what he approves), then directed “contineue goal”. This slice is local source and disposable tests only, not final OAuth/client/deployment completion.

## Boundaries & Constraints

Use a distinct non-human `service` principal for an explicitly bound application connection; do not broaden legacy `device` authority. Bind the connection to its actual human owner, stable issuer/subject, exact workspace and approved actions. Every use intersects current owner rights, the connection's explicit grant, current credential/actions and revocation. The connection's grant never creates or widens the human owner's access. Full workspace_admin content capabilities remain available when genuinely authorized; no viewer/curator-only ceiling by client type. `review:approve` and `workspace:grants:manage` remain genuine-human operations, not impersonated machine powers.

Gabe/Sam default-deny without individually approved content access. This slice cannot provision them or grant whole-workspace access in place of an approved item subset. Resource-level sharing and real account onboarding remain later gates. Existing unrelated services, data, device contracts and human CSRF stay unchanged. No new public routes, OAuth issuer, token delivery, real credentials or migration against an existing database.

## I/O & Edge-Case Matrix

| State | Required behavior |
|---|---|
| Bound client, owner and explicit grants authorize admin content actions | Read/capture/evidence/delete authority available without device ceiling |
| Owner lacks approval, loses membership/grant/binding, or is demoted | Deny or reduce actions immediately, including cached identity and DB RLS |
| Gabe-like grant only; Sam-like connection has no grant | No inherited access |
| Revoked/expired credential or revoked/missing delegation | Deny; never fall back to unbound legacy service authority |
| Wrong owner identity, tenant or workspace | Reject binding/use; no disclosure |
| Human approval or grant administration requested by client | Deny |
| Concurrent transaction versus owner revocation | Serialize correctly; subsequent requests observe revocation |
| Existing legacy service/device credentials | Existing behavior retained; no new client-only ceiling or expansion |

</frozen-after-approval>

## Code Map

Under `foundation/`: `src/authentication.ts`, `authority.ts`, `persistence.ts` own real authentication/current authority/RLS transactions. `migrations/013-device-authority.sql` supplies owner-locking patterns, not permission to widen devices. Read existing migration definitions before wrapping. `tests/device-authority.test.ts` and `lifecycle-fixture.ts` supply disposable fixtures; `scripts/test-db.ts` owns canonical discovery. `tests/recovery.test.ts` has strict inventory expectations.

## Tasks & Acceptance

- [x] Behavioral RED through real authority code before implementation; missing imports/tables alone do not count. Minimal test adapters may reach the failing behavior, never preimplement policy.
- [x] Add fail-closed, explicit credential/delegation linkage in one migration. Missing/revoked linkage cannot become an unbound-service fallback. Keep private helpers, current-owner checks and locks enforced in SQL/RLS, not just TypeScript.
- [x] Test the matrix through real authentication, authority and transactions using disposable synthetic fixtures, including concurrent revocation. No real consent is inferred.
- [x] Register nonzero cases/assertions in canonical DB discovery; update only exact stale inventory expectations without weakening them.
- [x] Run focused GREEN, typecheck/lint and canonical DB gates; parent repeats final tests and inspects the diff. Direct self-checks supersede developer-review ceremonies.

Allowed writes under `foundation/`: new `migrations/021-client-authority.sql`, new `tests/client-authority.test.ts`, bounded `src/authority.ts`, `src/persistence.ts`, `tests/authority.test.ts`, `scripts/test-db.ts`, and exact inventory expectations in `tests/recovery.test.ts`. Append notes here. Report additional essential files before touching them. No commit/push, installation, live DB, secrets, service changes, external calls, nested workers or profile edits.

## Implementation Notes

Scout found missing OAuth; parent verified existing devices are capped at curator. Adopted engineering default: separate owner-linked service identity, preserving devices. This prerequisite needs no public-route change. Overall OAuth/client acceptance remains open. Native goal budget is preserved; admission hashes are in the private `client-authority-build-baseline.json` receipt. Prior 17-test/154-assertion baseline is not a new-feature receipt.

## Spec Change Log

## Review Triage Log

Parent direct review inspected the final migration, all client-authority cases and tracked diffs. Independent developer-review layers were omitted under the current repository adapter, not represented as executed. Parent repeated toolchain, typecheck, lint, the full unit lane (124 tests / 1,677 assertions) and canonical disposable DB lane (205 tests / 2,181 assertions, zero failures/skips/missing cases); focused client lane additionally passed 12 tests / 160 assertions. Unique total is 329 tests / 3,858 assertions; the repeated focused lane is not double-counted. Parent verified owned-container removal and unchanged unrelated baseline files. Receipt directory: `/home/sabira/.hermes/profiles/troy/reports/allura-team-mcp/parent-client-authority-20261030T184132/`.

The worker's isolated browser-app unknown-outcome failure remains recorded in `deferred-work.md`; subsequent passing runs do not prove its root cause fixed. The repository POL-013 file is absent, so no claim of reading it is made; current adapter and loaded evidence-first rules governed this local-only gate. Scoped public governance_check_gate returned pass=true for the local checkpoint, but audit_logged=false: no durable audit event is claimed.

Status `done` applies only to this local owner-linked authority slice. OAuth issuance, real desktop-client use, selective member sharing, SSH deployment, live grants/cutover and 6.5/9.4 acceptance remain open. No endpoint, shared database or live permission was changed.

## Verification

Use existing pinned PATH: `/home/sabira/.local/share/allura-toolchain/bun-linux-x64-baseline:/home/sabira/.local/share/allura-toolchain/node-v24.19.0-linux-x64/bin:$PATH`. Working directory: `foundation`.

`bun run check:toolchain`; focused real behavioral RED/GREEN; `bun run typecheck`; `bun run lint`; canonical `bun run test:db` (no selection override). Disposable Docker resources only through the existing owned harness; preserve unrelated containers. `git diff --check` and changed-path/baseline comparison. Save exact command exits and counts, no credentials. No source presence or synthetic test claims actual client acceptance.

### Parent continuation scope — security completion

Parent inspected the actual SQL/test/source diff after the first pass. The inventory blocker is a mechanical consequence of approved migration021, not a new product decision. Add exactly `foundation/tests/core-release.test.ts` expected `migrations:20` → `migrations:21` to allowed writes; preserve its assertions and all other behavior. All prior scope and no-deployment boundaries remain.

Continue the unfinished matrix with sequential behavioral RED/GREEN: delegation actions must constrain both authentication/current resolution and SQL/RLS; cached identities must observe owner/delegation/action changes; revoked or deleted linkage must fail authentication and cannot use legacy service grants; transaction locks must include the current owner and delegation and serialize with revocation. Preserve admin-level content actions for an authorized owner while denying machine human-only powers. Explicitly test unrelated legacy service/device behavior, no cross-member inheritance, foreign bindings, expiry, private table/helper access and deletion-discriminator behavior. Validate at least one actual gateway request against the new DB-backed path. Test the real production implementations, not source patterns or expected policy implemented inside the fixture. Add every required case to canonical discovery. Canonical tests, typecheck/lint and final changed-file evidence must be green before reporting the slice ready for parent verification. Do not mark it or the overall goal complete yourself.

### Woz bounded-pass receipt — blocked, not accepted

- Current adapter and host Team RAM guidance supplied the explicit missing-runtime mapping. Parent-supplied scoped recall was used; no new remote lookup or write. Installed build renderer, customization resolver and central-config resolver exited 0. Direct self-check applies; no reviewer or nested agent ran.
- Added private delegation/credential-link scaffolding and one admin-content tracer through real authentication, `resolveAuthority`, append/read transactions and SQL context checks. Delegation is the connection's separate explicit grant; legacy service/device workspace grants are not rewritten. The persistent credential discriminator survives linkage deletion.
- Initial execution exposed a fixture array-serialization error; this was corrected and is **not** claimed as behavioral RED. Actual RED: `red-admin-behavior.log`, 0 pass / 1 fail / 3 assertions, exit 1, `AuthorityError: forbidden` from real authority code for the new admin-content case. Minimal resolver implementation then produced focused GREEN: 1 pass / 0 fail / 13 assertions, exit 0.
- Canonical `bun run test:db` on that candidate: 193 pass / 1 fail / 0 skipped / 2034 assertions across 37 files; exit 1. Exact blocker: `foundation/tests/core-release.test.ts:94` expects `migrations:20`, actual is 21. This additional inventory expectation is outside the allowed writes. Request a scope extension for **only** `migrations:20` → `migrations:21` there; no edit was made to that file. The harness verified removal of its owned disposable container.
- **Unfinished/security-sensitive WIP, not suitable for deployment:** explicit delegation-action attenuation, authentication-time revocation/missing-link denial, SQL/RLS action-intersection checks, owner/delegation locks and the remaining negative/concurrent matrix are not yet implemented/tested. Do not mistake the positive tracer for completion of this slice. No task checkbox or overall/story status was closed.
- `bun run check:toolchain`, `bun run typecheck`, `bun run lint`, and `git diff --check` exited 0. Admission hashes confirmed all nine pre-existing parent planning files unchanged before this appended receipt.
- Receipts: `/home/sabira/.hermes/profiles/troy/cache/scratch/owner-client-authority/` (`admission.json`, `red-admin.log`, `red-admin-behavior.log`, `green-admin.log`, `typecheck.log`, `lint.log`). Source changes: `foundation/migrations/021-client-authority.sql`, `foundation/tests/client-authority.test.ts`, `foundation/src/persistence.ts`, `foundation/scripts/test-db.ts`, exact inventory update in `foundation/tests/recovery.test.ts`; plus these appended notes. No commit, push, install, deployment, live DB/credential/grant mutation, new route, OAuth issuance, profile edit, external persistence or work-status mutation.

### Woz continuation receipt — candidate for parent verification, not closed

- Completed the bounded security implementation in migration021: current authentication/action intersection, fail-closed revoked/deleted delegation handling, in-place SQL/RLS action attenuation, and credential/delegation/current-human authority locks. Legacy services/devices retain their prior path. No TypeScript authentication or authority bypass was added.
- Sequential behavioral RED → focused GREEN, using `bun run test:db` and its owned disposable DB harness throughout (counts are pass/fail/assertions): actions `1/1/14 → 2/0/19`; linkage authentication `2/1/20 → 3/0/25`; SQL/RLS `3/1/26 → 4/0/29`; owner locking `4/1/30 → 5/0/35`. Each RED exited 1 for the named security assertion; each focused GREEN exited 0. These are real production-path failures, not infrastructure REDs.
- Extended regression coverage to 12 registered client tests / 160 assertions: cached-identity revocation/expiry/demotion, delegation and credential action changes, deletion discriminator, foreign bindings/scopes, absent member approval, private table/helper denial, human-only action denial, real loopback core-gateway HTTP requests, and observed PostgreSQL blocking in both revocation orderings. Delegation revoke/delete/narrow, owner grant/binding/membership and credential revocation serialize; subsequent authority and SQL checks deny. Existing canonical device and service cases also pass.
- Final `bun run test:db`: focused 12 pass / 0 fail / 160 assertions, exit 0; canonical 205 pass / 0 fail / 0 skip / 2181 assertions across 37 files, missing required cases `[]`, exit 0. The harness verified removal of its owned disposable container. A preceding complete matrix run had the same green counts.
- `bun run check:toolchain`, final `bun run typecheck`, final `bun run lint`, and `git diff --check` exited 0. Bun 1.3.14 / Node v24.19.0 remained pinned. The first typecheck identified one Bun SQL matcher inference error; changing the empty-row assertion to `toHaveLength(0)` fixed it without weakening the behavior. Final canonical tests reran on those bytes.
- Intermediate full-suite results are retained, not hidden: actions GREEN exposed the already-authorized exact core-release `20 → 21` inventory expectation (194 pass / 1 fail / 2040 assertions); that exact edit was made. The owner-lock GREEN run had an unrelated browser-app scenario failure (197 pass / 1 fail / 2044 assertions); no unrelated browser source changed, and subsequent canonical runs passed.
- This continuation changed only `foundation/migrations/021-client-authority.sql`, `foundation/tests/client-authority.test.ts`, `foundation/scripts/test-db.ts`, the exact `foundation/tests/core-release.test.ts` inventory expectation, and this appended receipt. Prior `foundation/src/persistence.ts` and `foundation/tests/recovery.test.ts` edits are preserved. Eight other parent planning files match the prior admission hashes; frozen intent and prior evidence are retained.
- Distinct receipts: `/home/sabira/.hermes/profiles/troy/cache/scratch/owner-client-authority-continuation/` (`red-actions.log`, `green-actions-inventory-red.log`, `red-linkage.log`, `green-linkage.log`, `red-rls.log`, `green-rls.log`, `red-owner-lock.log`, `green-owner-lock.log`, `green-negative-matrix.log`, `green-concurrency-matrix.log`, `canonical-final.log`, `typecheck-final.log`, `lint-final.log`, `verification.json`). No scoped source blocker remains; parent repeat/inspection is still required. No story/goal checkbox or status is closed. OAuth issuance, actual installed clients, member resource sharing, deployment and live acceptance remain outside this slice. No commit/push/install/remote write/live migration or profile/goal/config change occurred.
