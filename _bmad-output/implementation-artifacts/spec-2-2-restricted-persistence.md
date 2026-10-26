---
title: '2.2 Restricted PostgreSQL persistence'
type: feature
created: '2026-10-26'
status: done
route: dispatch
baseline_commit: 2ba5e4a69cea1281611379e5c02e22be85765783
context: [guidelines/ALLURA-BMAD.md]
---

<frozen-after-approval>
## Intent
Implement fresh authority storage and append-only events through service-owned scoped transactions. Use real disposable PostgreSQL and non-owner app role, not mocked RLS. No production migration, credentials or live grants.

## Boundaries & Constraints
Retain authority-v1/persistence-v1 contracts. App never owns tables or bypasses RLS; missing context denies. Later replay/proposal/semantic migrations remain in Epics 3/4, not empty placeholders. Independent development review removed; human product approval remains mandatory.

## I/O & Edge-Case Matrix
| Input | Expected |
|---|---|
| bound current admin + matching scoped event | append/read |
| foreign/missing/revoked/locked/forged actor | zero content/no write |
| event update/delete/truncate or grant direct write | denied |
| injected transaction failure | no partial event |
| pooled A then B then empty | no A leakage |
| same migration checksum / changed checksum | no-op / fail |
</frozen-after-approval>

## Code Map and tasks
- `foundation/migrations/001-authority.sql`: new restricted authority/event DDL and fixed-search-path functions.
- `foundation/src/persistence.ts`: checksum migrations, current DB resolver, scoped service transaction/append/read.
- `foundation/tests/persistence.test.ts`: real non-owner positives/negatives, pool, rollback and migration tests.
- `foundation/scripts/test-db.ts`: exact owned ephemeral container, pinned observed image digest, synthetic random credentials, cleanup in finally.
- `foundation/package.json`: required integration lane; no unrelated dependency.

## Acceptance
Given signed server identity and exact workspace grant, when app transaction executes, then current RLS independently filters tenant/workspace/action and actor. Given rollback/missing context, no partial content is returned or committed. Given fixture owner, only setup uses that privileged connection; all security assertions use a separately authenticated restricted app login. Report shared-login GUC trust limitation honestly.

## Verification
TDD red then `bun run test:db`, `bun run check`, migration checksum and pool/rollback assertions. Test container only on loopback, no mounts/shared DB/env, exact container removal. No skip/zero suite passes.

## Implementation Notes

Implemented migration, SQL current-authority resolver, scoped transaction with authority-row locks, append-only evidence and isolated DB test runner. App login is separate non-owner/NOBYPASSRLS; tables FORCE RLS; missing/foreign scope reads return zero; grant/config writes and event mutation/truncation denied. Shared-login service assertion threat limit remains explicit in persistence-v1.

TDD missing-module red exit 1. Real PostgreSQL initially exposed Bun lazy query matcher and JSON double-encoding defects; fixed by executing denied queries and binding object payloads. Concurrency test now uses actual observed waiting pg_locks, not a sleep-only assertion. `story2.2-final.log`: PostgreSQL 16.15, pinned image, 9 DB tests/50 assertions/0 failures/skips; foundation 3/19 and authority 7/75, typecheck and ESLint pass. Exact owned container removal verified after each run. Forward migration repeat/checksum conflict, rollback before/after insert, foreign populated sentinel, pool reuse and current machine revocation exercised. Final role-safety guard added during self-check; subsequent full validation required before commit.

No application grant-management endpoint is exposed yet; Story 2.3 must implement consent/bootstrap/last-admin/recovery/access audit before Epic 2 closure. Later proposal/semantic/receipt structures are logical contracts only until Epics 3/4, as partitioned in Story 1.3. No production or independent review claim.
