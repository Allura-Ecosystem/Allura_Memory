# Command Center — Data Sources Audit

> Goal `goal-20260617-2205`: every Command Center surface on LIVE data only (zero
> mock/placeholder). This file is the audit of what is live vs. what still needs wiring.
> Honest-state contract: a surface may show empty / stale / degraded — it must never
> fabricate values.

**Audited:** 2026-06-18 · branch `feat/knowledge-hive`

## Sidebar surfaces (Command Center primary nav)

| Surface | Route | Data source | Verdict |
|---------|-------|-------------|---------|
| Overview — KPIs | `/dashboard/overview` | PG live `COUNT(*)` on `allura_memories` / `canonical_proposals` / `mcp_tokens` / `workspaces`, group_id-scoped | ✅ LIVE |
| Overview — System health | same | Memory store + Curator from `isPoolHealthy()`; Knowledge graph via `isDriverHealthy()` (Neo4j); Allura Brain via `brainClient.healthReport()` — both bounded 2.5s, honest Healthy/Unreachable/Unknown | ✅ LIVE |
| Overview — Recent receipts | same | Live read of last 5 `events` rows for the group; honest empty / degraded states | ✅ LIVE |
| Memory (Search) | `/dashboard/search` | `unifiedSearch` server action → live hybrid search | ✅ LIVE |
| Knowledge Graph — Live Memory | `/dashboard/knowledge-graph` | `GET /api/memory/graph?group_id=…` (Neo4j) | ✅ LIVE |
| Knowledge Graph — Platform Hive | same | `PLATFORM_NODES/EDGES` seed — Allura's own architecture map, **explicitly labeled via mode toggle** (documentation, not faked tenant data) | ✅ HONEST |
| Agents | `/dashboard/agents` | `listTenantAgents(pool, groupId)` → `mcp_tokens` | ✅ LIVE |
| Approvals | `/dashboard/approvals` | PG `getPool()`, group_id-scoped | ✅ LIVE |
| Allura Guard | `/dashboard/guard` | live token/workspace repos | ✅ LIVE |
| Settings | `/dashboard/settings` | `force-dynamic`; settings-resources | ✅ LIVE (verify) |

## Shell chrome (`DashboardHeader`, fed by `getHeaderState` in `layout.tsx`)

| Element | Current | Verdict |
|---------|---------|---------|
| Organization indicator | live active group_id from `x-allura-group-id`; non-interactive (no membership source to switch orgs) | ✅ LIVE |
| Source · freshness | `getHeaderState` reads `events` for last-write relative time + live/stale; "store unreachable" when down | ✅ LIVE |
| Data-state switch | **REMOVED** (was a no-op demo toggle) | ✅ RESOLVED |
| Activity / receipts badge | `receiptCount` = events in last 24h for the group | ✅ LIVE |

## Non-sidebar dashboard pages (still under `src/app/dashboard/**`)

| Surface | Route | Issue | Verdict |
|---------|-------|-------|---------|
| Graph (old operator console) | `/dashboard/graph` | `PLACEHOLDER_NODES` removed; honest "No graph yet" empty state + empty canvas on error | ✅ LIVE |

## Work items (maps to goal tasks)

1. **Header** (Task 2/6): make `layout.tsx` fetch live header state (active group_id from
   request headers, source freshness from a real read, receipt count from events) and pass
   props. Resolve the Data-state switch — either drive it from the real operational state or
   remove the demo toggle.
2. **Overview receipts** (Task 3): replace synthesized receipts with a live read of recent
   audit/receipt events (group_id-scoped); honest empty state when none.
3. **Overview health rows** (Task 3): replace hardcoded `Checking…` for Knowledge graph +
   Allura Brain with real probes (or an honest `unknown` state if not probed server-side).
4. **Old graph page** (Task 5): remove `PLACEHOLDER_NODES`/`PLACEHOLDER_EDGES`; show honest
   empty/degraded state instead of fabricated nodes.

## Validation (tests)

| Surface | Test | Lane |
|---------|------|------|
| Header live state | `src/lib/operational-state/sources/header-source.test.ts` (5 tests: unreachable / no-activity / recent / stale / group_id-bound) | unit |
| Overview receipts + freshness + KPIs | `tests/integration/overview-page-contract.test.ts` (events shape, receipts query, MAX+24h freshness, group-scoped KPI counts) | integration (DB-gated) |
| Memory / search | `tests/integration/search-page-contract.test.ts` | integration (DB-gated) |
| Approvals | `tests/integration/approvals-page-contract.test.ts` | integration (DB-gated) |
| Graph route | `src/__tests__/graph-route.test.ts` | unit |

`bun run typecheck` clean · `bun run test:unit` green (1411 passed) · overview + header
contract tests verified against the live Brain stack on 2026-06-18.

## Honest-state contract reference
`src/lib/operational-state/` — ready / empty / stale / error / degraded. Every wired surface
must surface one of these, never a fabricated value.

## Goal trace
`goal-20260617-2205` (Brain GOAL_SET `56ab21fd`). Iterations: task 1 `58b5db58`,
tasks 2+6 `a75c02fb`, task 3 `1dfc43f5`, task 5 `9a1603c5`, task 4 `1629cb91`.
