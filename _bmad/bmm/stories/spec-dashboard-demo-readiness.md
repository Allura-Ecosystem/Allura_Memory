---
title: 'Restore the governed dashboard demo path'
type: 'bugfix'
created: '2026-09-01'
status: 'in-progress'
review_loop_iteration: 1
baseline_commit: '414142bcee3b3ba3fd122e427ca14b4a13ecc268'
context:
  - 'docs/design/command-center/operator-surface-contract.md'
  - '_bmad/bmm/planning/epic-24-portfolio-readiness.md'
  - '_bmad/bmm/planning/epic-25-governed-curator-review-console.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The canonical route anchors render, but every `Open live surface` link points to dashboard routes deleted by the June 2026 dashboard sunset. The only remaining dashboard route, `/dashboard/curator`, can fail closed during module-registry audit issuance; the browser title still claims a legacy dual-database architecture. This prevents an honest product demo and current screenshot walkthrough.

**Approach:** Restore a coherent, supported operator demo path over current PostgreSQL APIs and server-owned auth/scope. Implement only the live surfaces referenced by the canonical route registry, repair the Curator launch/audit path at its root cause, add executable browser/route proof, and publish current walkthrough and screenshot evidence.

## Boundaries & Constraints

**Always:** Preserve fail-closed auth, server-derived principal/group/workspace/role, RLS/app-role boundaries, evidence-before-action, receipt-backed decisions, explicit empty/degraded/error states, current Allura tokens, and sixth-grade primary copy. Use source-first current APIs and components. Treat CLI/MCP/API as canonical engine paths and the browser as an operator surface.

**Ask First:** Any new migration, changed RBAC hierarchy, changed public API/schema, restoration of a retired product capability beyond the six mapped routes, or use of non-synthetic external data.

**Never:** Blindly restore the 10,402 deleted dashboard lines from `ad420101`; fabricate live metrics, proposals, receipts, or successful actions; bypass auth; trust browser-supplied scope; hardcode credentials; expose `.env.local`; revive Neo4j; publish screenshots with errors, unknown freshness presented as healthy, or 404 routes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Supported demo | Dev auth + correctly migrated portfolio PostgreSQL stack | Six live routes and Curator render 200 with current title, navigation, truthful data/empty states | No browser errors; trace/audit writes succeed |
| Empty tenant | Valid scoped principal, no records | Readable zero-data state with source/freshness and next action | Never substitutes sample data |
| Dependency unavailable | DB/API unavailable or stale | Route stays navigable and reports explicit degraded state | No false success or uncaught exception |
| Unauthorized user | Missing/insufficient principal | Login redirect or 401/403 according to route contract | No protected payload or scope leakage |
| Audit issuance failure | Registry decision cannot be durably audited | Curator fails closed with actionable, non-secret operator message | No modules/actions issued |

</frozen-after-approval>

## Code Map

- `src/components/allura/route-contract-surface.tsx` — maps six canonical anchors to live routes; mapping, App Router pages, navigation, and HTTP proof must agree.
- `src/__tests__/mission-control-route-parity.test.ts` and `vitest.config*.ts` — current test is file-existence-only and must be registered in a runnable lane that proves rendered HTTP/auth/state behavior.
- `src/app/dashboard/curator/page.tsx`, `src/lib/curator/module-registry.ts`, and `src/lib/curator/operator-read-service.ts` — surviving governed shell and fail-closed audit issuance; preserve its truthful failure state but prove the supported stack can issue a durable audit decision.
- `src/proxy.ts`, `src/lib/auth/api-auth.ts`, `src/lib/auth/dev-auth.ts`, and `src/lib/auth/types.ts` — only server-issued Clerk/dev principal context may reach dashboard code. Raw browser `x-allura-*` headers are not dashboard authority.
- `src/lib/db/tenant-transaction.ts`, `src/lib/postgres/connection.ts`, and `src/lib/curator/operator-read-service.ts` — dashboard reads must use the restricted app role plus transaction-local tenant/principal/workspace settings; owner-pool reads are not an acceptable browser path.
- `src/config/app-config.ts` and `src/app/layout.tsx` — source of browser metadata; remove active dual-database/Neo4j claims.
- `src/app/api/{execution-overview,memory,teams,metrics,work-items}/**` — reuse current server-owned APIs/services, or add a narrow server-owned dashboard read service; do not query with `getPool()` from a page.
- `docker-compose.portfolio.yml`, `.env.portfolio.example`, `package.json`, `scripts/dashboard-doctor.ts`, and `scripts/agent-browser-dashboard.ts` — supported non-secret, loopback-only demo stack. Portfolio database host port must be configurable and collision-safe; start, doctor, and capture must be runnable in documented terminals.
- `docs/quickstart.md`, `docs/portfolio/demo-script.md`, `docs/portfolio/dashboard-route-shots.md`, and `docs/portfolio/dashboard-evidence-manifest.md` — current walkthrough and evidence requirements; failed/404 captures remain excluded.
- `ad420101^` — read-only historical design reference only; deleted code is not implementation authority.

## Tasks & Acceptance

**Execution:**
- [ ] Dashboard authority/read service and six route adapters — derive a server-owned principal, execute every tenant-aware read via restricted app-role workspace transaction, and render only API/service-backed live, empty, degraded, or error states under one navigation shell.
- [ ] Curator audit issuance — reproduce the supported-stack issuance path, correct its app-role/config cause, preserve durable audited issuance and explicit fail-closed error behavior, and prevent unaudited modules/actions from rendering.
- [ ] Metadata and browser/security regression tests — remove dual-database claims; prove raw `x-allura-*` browser headers cannot elevate role/scope; verify HTTP 200 with dev principal, login/401/403 without it, and each surface's empty/degraded state in a registered test lane.
- [ ] Demo stack and evidence tooling — create `.env.portfolio` from a non-secret example when absent; use a configurable loopback host port; split compose startup from the foreground dev server; make doctor require app-role connectivity/RLS and HTTP 200; make the `agent-browser` capture script reject redirects, page/console errors, 404s, and incomplete manifests.

**Acceptance Criteria:**
- Given the supported portfolio stack and a server-issued dev principal, when a reviewer follows the dashboard quickstart, then all six mapped live routes plus `/dashboard/curator` return 200, share navigation, and render truthful API/service-backed live or empty states.
- Given each canonical anchor, when `Open live surface` is activated, then it resolves to an existing authorized route and never 404s.
- Given a raw browser `x-allura-*` header, when a dashboard request reaches the auth boundary, then it cannot create, elevate, or scope a principal; only Clerk or dev-provider context is accepted.
- Given tenant-aware dashboard data, when a live surface reads PostgreSQL, then its app-role transaction sets tenant/principal/workspace scope and RLS rejects cross-tenant data.
- Given missing auth, insufficient role, unavailable DB, empty data, or failed audit issuance, when a route loads, then it fails visibly according to the matrix without leaking data or fabricating success.
- Given a clean capture run, when the evidence script completes, then it emits seven current PNGs, snapshots, route/status metadata, console/error logs, and no image from a failed route.
- Given repository verification, when typecheck, registered focused tests, live-DB proof, build, dashboard doctor, and browser smoke run, then they pass and generated files leave the tracked tree clean.

## Spec Change Log

- Review loop 1 — DeepSeek Flash independent review found browser-trusted authority headers, owner-pool dashboard reads, a false-green route test/doctor, unrunnable Curator tests, and an unusable portfolio launch path. The code map, tasks, acceptance criteria, and verification requirements now require server-owned principal derivation, app-role workspace transactions, executable state/HTTP proof, real app-role/RLS doctor checks, and collision-safe demo startup. This avoids a polished dashboard that bypasses governance or falsely certifies broken routes. **Keep:** thin shared navigation, explicit live/empty/degraded/error states, current API/service reuse, non-secret demo configuration, and failed-capture exclusion.

## Design Notes

Prefer one thin server-owned dashboard shell and small route adapters over restoring retired pages. The dashboard demonstrates governance and evidence; it does not become a second control plane.

## Verification

**Commands:**
- `bun test src/__tests__/mission-control-route-parity.test.ts src/__tests__/curator-handoff-page.test.tsx src/lib/curator/module-registry*.test.ts` — focused regression proof.
- `bun run typecheck && bun run build` — compile and production-route proof.
- `RUN_E2E_TESTS=true bun run test:live-db` — app-role/RLS/audit proof on a fresh migrated database.
- `agent-browser` walkthrough script against the supported demo port — seven routes 200, zero page/console errors, screenshot manifest complete.
