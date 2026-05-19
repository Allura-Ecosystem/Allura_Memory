# Dashboard Cutover Readiness

> [!NOTE]
> **AI-Assisted Documentation**
> This document was drafted with AI assistance and must be checked against
> runtime evidence, source code, Notion board state, and Captain approval.

Current status: **NOT READY FOR `3100` CUTOVER**.

This gate protects the current Docker dashboard on `3100`. Mission Control work
may continue on `3334`, but `3100` must not be replaced until every gate below
is `PASS` and Captain approval is recorded.

## Canonical Ports

| Port | Role | Status |
| --- | --- | --- |
| `6420` | Visual/reference memory dashboard | Reference surface |
| `3334` | Mission Control development integration target | Development validation |
| `3100` | Current Docker dashboard and future cutover target | Protected |

## Cutover Gate Checklist

| Gate ID | Requirement | Current Status | Required Evidence |
| --- | --- | --- | --- |
| `route-parity` | Mission Control route parity is complete. | `PASS` | Route map and runtime HTTP evidence in `artifacts/mission-control-route-parity-2026-05-17.md`; Notion `3631d9be-65b3-81c0-a052-dc5c4cb458ad`; Brain `6c947189-0ee4-4ff8-9b05-d6c52b5d6552`. |
| `visual-parity` | Visual parity with `6420` reference is complete. | `PENDING` | Desktop and mobile screenshots plus reviewer note. |
| `source-truth-parity` | Every route declares source of truth and write policy. | `PARTIAL` | Adapter declarations and visible UI badges/panels for every route. |
| `adapter-declarations` | Adapter declarations are complete and validated. | `PENDING` | Registry/adapter tests and route evidence. |
| `no-fabricated-data` | No route fabricates live data. | `PENDING` | Tests or audit proving placeholders are labeled or removed. |
| `auth-validation` | Authenticated and unauthenticated flows pass. | `PENDING` | Auth smoke evidence for protected and public routes. |
| `smoke-tests` | Smoke tests pass against target runtime. | `PENDING` | `curl`, browser, or MCP browser evidence for target routes. |
| `runtime-health` | Runtime health checks pass. | `PARTIAL` | Liveness passed; readiness is unhealthy because MCP is false and bounded readiness times out. See `artifacts/runtime-health-partial-2026-05-17.md`; Notion `3631d9be-65b3-8133-b63d-d40473f4f32c`; Brain `d9bbabb7-676a-4eb7-959b-942d07103c5e`. Container health output still required. |
| `rollback-ready` | Rollback command is documented and tested. | `PENDING` | Command transcript proving rollback restores current dashboard. |
| `captain-approval` | Captain approves replacing `3100`. | `PENDING` | Notion approval comment or signed decision record. |

## Rollback Command

If a cutover attempt fails, restore the current Docker dashboard target:

```bash
docker compose --env-file .env --env-file .env.local up -d web
docker compose --env-file .env --env-file .env.local ps web
curl -f http://localhost:3100/api/health/live
```

If the cutover used a custom dashboard image, roll back to the previous known
good image or commit before rerunning the commands above. Record the image tag,
commit, and health output in Notion and Allura Brain.

## Current Evidence

- Cutover strategy: `docs/allura/SOLUTION-ARCHITECTURE.md`.
- Decision record: `docs/allura/RISKS-AND-DECISIONS.md` AD-29.
- Requirements: `docs/allura/REQUIREMENTS-MATRIX.md` F48.
- Mission Control route parity: `artifacts/mission-control-route-parity-2026-05-17.md`.
- Runtime health partial evidence: `artifacts/runtime-health-partial-2026-05-17.md`.
- Phase 1/2 board route smoke: Notion page `3631d9be-65b3-81f0-807c-f77fe17918e9`.
- Current status remains `NOT READY` because visual parity, auth validation,
  no-fabricated-data audit, runtime health, tested rollback, and Captain
  approval are not all recorded.
