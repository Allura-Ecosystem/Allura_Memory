# Aion API Wire Evidence — 2026-05-30

## Scope

- Built authenticated, group-scoped Allura Memory routes:
  - `GET /api/governance`
  - `GET /api/dreams`
  - `GET /api/kanban`
- Wired Aion renderer surfaces to those routes:
  - Governance page reads `/api/governance`
  - Dreams page reads `/api/dreams`
  - Kanban page reads `/api/kanban` instead of seeding `localStorage`

## Live API Evidence

Server:

```bash
ALLURA_DASHBOARD_PORT=3334 bunx next dev -p 3334
```

Receipts:

```text
GET /api/governance?group_id=allura-system -> 200
governance: degraded=false, policies=6, events=8

GET /api/dreams?group_id=allura-system -> 200
dreams: degraded=false, runs=1

GET /api/kanban?group_id=allura-system -> 200
kanban: degraded=false, cards=9, total=9

OPTIONS /api/governance -> 204
GET /api/governance?group_id=bad -> 400
```

The Aion adapter was also exercised live against the running Allura server:

```text
governance: degraded=false, policies=6, events=8
dreams: degraded=false, runs=1
kanban: degraded=false, cards=9, total=9
```

## Validation

Allura Memory:

```text
bun run typecheck
pass

bun run validate:tokens
TOKEN COMPLIANCE: PASSED (warnings: 0)

bun test src/__tests__/api-degradation.test.ts src/__tests__/dashboard-contracts.test.ts
10 pass, 0 fail

bun test src/__tests__/api-degradation.test.ts src/__tests__/dashboard-contracts.test.ts src/__tests__/sentry-wiring.test.ts src/__tests__/sidebar-items.test.ts src/__tests__/token-compliance.test.ts
58 pass, 0 fail
```

Aion:

```text
bunx tsc --noEmit
pass

bun run i18n:types
pass

node scripts/check-i18n.js
pass with pre-existing warnings

bun test tests/unit/common-adapter/kanban.test.ts
8 pass, 0 fail
```

## Brand Gate

- Touched Aion files scan clean for raw hex colors, generated logo language, Difference Driven contamination, hero patterns, and gradient language.
- Touched Allura Memory API files scan clean for raw hex colors, generated logo language, Difference Driven contamination, hero patterns, and gradient language.
- Allura token compliance now passes through `bun run validate:tokens`.

## Repair Notes

- Added the missing Next instrumentation module expected by Sentry wiring tests.
- Added the reset-era sidebar navigation contract module expected by sidebar tests.
- Added the missing token compliance script and required scan roots.
- Adjusted request-context tags so both flat Sentry tag keys and the existing nested test assertion are supported without sending nested data through enumerable Sentry tags.
