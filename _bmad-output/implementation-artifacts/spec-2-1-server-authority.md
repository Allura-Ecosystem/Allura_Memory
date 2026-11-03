---
title: '2.1 Server-resolved authority'
type: feature
created: '2026-10-26'
status: done
route: dispatch
baseline_commit: f8256bfca45a4f39d2a2a9a80a0602b9221d88c6
context: [guidelines/ALLURA-BMAD.md]
---

<frozen-after-approval>
## Intent
Implement signed Cloudflare human identity, separate machine credentials and current server-derived tenant/workspace/action authority. Ordinary local design/tests authorized; no live bindings, grants or production configuration.

## Boundaries & Constraints
No email linking, default scope, machine-as-human, caller identity headers, DevAuth or provider fallback. Product independent human approval unchanged. Retain foundation toolchain and protected UX/vendor bytes.

## I/O & Edge-Case Matrix
| Input | Expected |
|---|---|
| valid local-key RS256 human JWT and current explicit grant | exact stable principal/scope/action |
| forged/wrong issuer/audience/time/algorithm/type or missing/conflicting credential | unauthenticated; no authority lookup |
| valid machine token | separately bound kind and action ceiling |
| org admin only / wrong workspace / revoked / locked / lookup failure | forbidden, no protected effect |
| cross-site human mutation | forbidden |
| malicious login target | safe relative default |
</frozen-after-approval>

## Code Map
`foundation/` provides Bun/TS/ESLint, no product modules. New `src/authority.ts` and `src/authentication.ts` use node:crypto already typed by installed Node types. No new auth dependency needed for narrow RS256 verification. `contracts/authority-v1.md` defines policy; persistence-v1 assigns DB resolver to 2.2.

## Tasks & Acceptance
- Write local RSA signed tests first and observe red.
- Implement strict JWT parsing/signature/claims, separate opaque machine verification and current authority resolver.
- Given invalid identity, protected lookup never executes. Given revoked current state, next request denies even with previously valid credential. Given arbitrary runtime action/selector, no default permission is inferred.
- Register nonzero product tests in required lane; run test/typecheck/lint and induced failure check.
- Self-check claims against real test output. No independent development review.

## Verification
`cd foundation && bun run check`; local key/fixture tests only. DB current-state proof follows 2.2 and cross-transport integration 2.3. Production CF-AC05 remains excluded.

## Implementation Notes

Implemented `foundation/src/authentication.ts` and `authority.ts`. Narrow RS256 verifier uses native crypto and server-owned key map; separate SHA256 opaque credential lookup, in-process verified-identity provenance, exact current action/scope resolution, CSRF and safe-return utilities. Authenticated identities carry expiration; machine context carries credential digest for current revocation lookup in 2.2. No network JWKS provider or live credential configuration claimed.

TDD red exit 1 on missing implementation (`story2.1-red.log`); final `bun run check` exit 0 (`story2.1-green.log`): foundation 3 tests/19 assertions plus authority 7 tests/75 assertions, no failures/skips, separate typecheck/lint pass. One type error corrected by narrowing human authenticator return type. Direct self-check: no org-admin content inference, role prototype lookup guarded, raw evidence not granted to curator, machine cannot hold human authority. Database-backed current state and ingress integration remain 2.2/2.3, not silently claimed. No independent review.
