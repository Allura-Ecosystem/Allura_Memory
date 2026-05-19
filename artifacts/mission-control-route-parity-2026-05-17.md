# Mission Control Route Parity Evidence - 2026-05-17

## Scope

This artifact records the Phase 4 `route-parity` gate for the Mission Control
development surface on `3334`.

The cutover-required routes are:

- `/command`
- `/work-board`
- `/agents`
- `/telemetry`
- `/allura`
- `/resources`

## Code Evidence

Route files:

- `/command`: `src/app/(main)/command/page.tsx`
- `/work-board`: `src/app/(main)/work-board/page.tsx`
- `/agents`: `src/app/agents/page.tsx`
- `/telemetry`: `src/app/(main)/telemetry/page.tsx`
- `/allura`: `src/app/(main)/allura/page.tsx`
- `/resources`: `src/app/(main)/resources/page.tsx`

Shared route shell:

- `src/app/(main)/_components/mission-control-route-shell.tsx`

Route parity test:

- `src/__tests__/mission-control-route-parity.test.ts`

Adapter declaration evidence:

- `src/lib/adapter-registry/registry.ts`
- `src/lib/adapter-registry/__tests__/registry.test.ts`

## Runtime Evidence

Target runtime:

- `http://127.0.0.1:3334`

HTTP HEAD checks:

- `curl -I http://127.0.0.1:3334/command` -> `HTTP/1.1 200 OK`
- `curl -I http://127.0.0.1:3334/work-board` -> `HTTP/1.1 200 OK`
- `curl -I http://127.0.0.1:3334/agents` -> `HTTP/1.1 200 OK`
- `curl -I http://127.0.0.1:3334/telemetry` -> `HTTP/1.1 200 OK`
- `curl -I http://127.0.0.1:3334/allura` -> `HTTP/1.1 200 OK`
- `curl -I http://127.0.0.1:3334/resources` -> `HTTP/1.1 200 OK`

## Validation

Focused route tests:

```text
bun test src/__tests__/mission-control-route-parity.test.ts src/lib/adapter-registry/__tests__/registry.test.ts src/__tests__/dashboard-cutover-readiness.test.ts
```

Result:

```text
30 pass
0 fail
118 expect() calls
```

Typecheck:

```text
bun run typecheck
```

Result:

```text
pass
```

## Result

The Phase 4 `route-parity` gate is `PASS` for route presence, adapter
declarations, and HTTP reachability on `3334`.

This does not approve replacing `3100`. The following cutover gates remain
open:

- `visual-parity`
- `source-truth-parity`
- `adapter-declarations`
- `no-fabricated-data`
- `auth-validation`
- `smoke-tests`
- `runtime-health`
- `rollback-ready`
- `captain-approval`

## Receipts

- Notion: `3631d9be-65b3-81c0-a052-dc5c4cb458ad`
- Brain: `6c947189-0ee4-4ff8-9b05-d6c52b5d6552`
