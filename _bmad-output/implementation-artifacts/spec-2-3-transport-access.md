---
title: '2.3 Bounded transport and current access integration'
type: feature
created: '2026-10-26'
status: done
route: dispatch
baseline_commit: 90360767d06417d416f1db202bb2eccd8910651b
context: [guidelines/ALLURA-BMAD.md]
---

<frozen-after-approval>
## Intent
Integrate current authority with finite authenticated ingress and governed workspace access lifecycle. No production identity/config changes. All acceptance must precede Epic 3.

## Boundaries & Constraints
No anonymous storage, caller scope minting, production DevAuth, forwarding-header quota identity or machine-as-human. Body reads follow auth. Exact workspace grants and independent human approval remain mandatory.
</frozen-after-approval>

## Code Map and tasks
- `foundation/src/gateway.ts` / `tests/gateway.test.ts`: bounded HTTP boundary and real loopback HTTP exercise, explicit route/action registry, separate human/machine identity, safe errors, streaming limits, concurrency and deadline truth.
- `foundation/src/access.ts`, `src/access-api.ts`, `migrations/002-access.sql`, `tests/access.test.ts`: create with consenting human admin, grants/invites/requests/transfer/orphan recovery and atomic audit; last-admin and self-change negatives.
- Wire actual DB evidence read route; test current revocation and no foreign records across transport before full story acceptance.

## Engineering budgets
Delegated defensive defaults, not SLOs: maximum credential 16 KiB, body 64 KiB, response 128 KiB, request target 2048 chars, 16 in-flight requests, 5-second work/body deadline, storage statement timeout 5 seconds and lock wait 2 seconds. Reject oversized/invalid values; allow only narrower per-instance test limits. No forwarded-header rate identity; global per-process admission prevents arbitrary spoofed identities expanding resources. Deployment-level distributed quotas remain release work.

## Acceptance
Given invalid/machine-as-human credentials, no body or protected service runs. Given oversized/chunked/slow input, bound read/cancel; unknown durable timeout never success. Given membership/lock changes, recheck before disclosure. Given authenticated grant management, exact current human authority, consent, last-admin and audited transaction invariants must hold.

## Verification
TDD and nonzero required lane plus real HTTP request and DB integration. Do not mark complete until access lifecycle and DB transport acceptance are exercised.

## Implementation Notes

Partial implementation verified: explicit route/action gateway, human versus machine credentials, auth-before-body, same-origin checks, bounded streamed/slow input, deadlines/cancellation, concurrency retention for unresolved work, safe errors and revalidation before service/disclosure. Genuine read-only `/api/evidence` is wired to restricted PostgreSQL and exercised over loopback HTTP with real local signatures, foreign sentinel exclusion and current grant revocation. No MCP write route exposed before AD-65. Self-check fixed stale machine action ceilings by rereading current credential actions and rechecking credential expiration after authority lookup.

`final-check.log` in direct-build Operations records full unit, typecheck, lint and disposable DB success, including exact container removal. TDD red receipts: `story2.3-red.log` and `story2.3-http-db-red.log`. No independent reviewer or browser UI test occurred; there is no implemented UI yet.

Local acceptance completed during the next bounded admission. `admission2-epic2-accepted.log` records `bun run check:all` exit 0: 40 tests / 280 assertions, no failures/skips, independent typecheck and ESLint, 22 actual restricted-PostgreSQL tests / 146 assertions, owned container removal. `admission2-access-red.log`, `admission2-access-http-red.log` and `admission2-stale-request-red.log` preserve red evidence. Real loopback HTTP exercised signed-human request → administrator decision → requester status, organization-only denial, CSRF, stale revision conflict and evidence revocation. No browser UI or independent reviewer ran; no UI is implemented yet.

Access services implement human creation/bootstrap and service nomination with mandatory separate human acceptance; current service credential/creation permission recheck; explicit grants and human review entitlement; revision-safe changes; pending/accepted/declined/revoked/expired invitations; request narrowing/denial/cancellation/unavailable states and immutable terminal in-product notifications; consenting successor transfer; voluntary last-admin removal guard; involuntary revocation followed by concurrent orphan recovery with one winner. Organization metadata is an allowlist, never content or request rationale; grant projection is bounded to 100 with a truncation flag. Requests to unknown selectors retain only private request intent so no workspace existence is confirmed. Request revisions bind to the original grant state. Mutation/audit failure rolls back. No external notification is sent.

Delegated implementation defaults: transfer leaves the former administrator a viewer, strips review entitlement and audits both changes. `tenant:member` admits only the human access-command endpoint, not content: every command resolves/locks its actual authorization independently. The existing content action resolver and RLS remain required. The service-only `workspace:create` credential ceiling can only nominate a human; it cannot accept invitations or confer any content/admin/review grant on itself. Access control SQL is a trusted-server-only narrow command interface, not an arbitrary SQL or public credential endpoint; the existing documented shared-login trust boundary remains.

Self-check fixes: stale access requests cannot overwrite intervening grants; machine action ceilings remain current; post-commit authority loss returns unknown rather than a false no-write denial; SQL ambiguity in recovery corrected; disposable readiness waits for the actual TCP database, not the temporary initialization socket. All tested locally only. Deployment binding, distributed quotas, human-facing UI and complete consumer packaging remain their later owning epics, not claims of this story.
