# Branded Memory Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Allura-branded memory management dashboard that lets operators inspect memory health, browse memories, review proposals, trace provenance, and manage tenant/governance settings without fabricating data or weakening the API/MCP-first engine.

**Architecture:** The dashboard is an opt-in human control plane over existing Allura Memory APIs. Raw API shapes stay behind `src/lib/dashboard/*` adapters; UI components consume typed view models that always expose source, freshness, degraded state, and `group_id` scope. The dashboard must use real Allura brand assets and tokens, never generated logos or unrelated project tokens.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Bun, existing API routes under `src/app/api/*`, `@xyflow/react` or existing graph libraries for graph views, Recharts for small metrics, lucide-react for icons, CSS modules or existing app styling conventions after component audit.

---

## Governance Receipt

**Role:** Brooks active as planning chair; Codex is applying Team RAM guidance only, no external subagent executed.

**Skills:** superpowers:writing-plans, team-durham:brand-strategy, team-ram-payload:payload-project-hydration.

**Scout hydration:**
- Local context checked: `README.md`, `package.json`, `docs/allura/BLUEPRINT.md`, `docs/allura/DESIGN-ALLURA.md`, `src/app/api/**`, `src/lib/memory/**`, `src/lib/audit/**`, `src/lib/curator/**`.
- Brain: local Codex memory registry searched for dashboard context. No live Allura Brain MCP search/write was available in this turn.

**Context7:**
- required: yes
- library: Next.js App Router / React
- topic: dashboard routing, server/client component boundary
- finding: plan uses App Router pages for routes and client components only for interactive dashboard islands; current docs should be rechecked during implementation before code changes.

**RuVix:**
- mutate: planning artifact only; no dashboard code changes in this plan
- attest: plan references repo docs and existing API route inventory
- verify: implementation requires route tests, API adapter tests, accessibility checks, and browser smoke
- isolate: Allura project scope, `group_id` visible in every memory operation
- sandbox: no production mutation paths; approval actions use existing governed curator endpoints
- audit: implementation outcomes should be logged to Allura Brain if memory tools are available

## Product Decision

The README currently says Allura is terminal/API-only, while `docs/allura/DESIGN-ALLURA.md` describes dashboard, curator, settings, audit, and graph surfaces. This plan resolves the tension by positioning the dashboard as an optional operator control plane:

- Core engine remains MCP/API-first.
- Dashboard does not replace MCP, CLI, or service endpoints.
- Dashboard only displays real data, unknown states, or explicit empty states.
- Dashboard manages memory governance: inspection, review, provenance, graph, audit, and settings.
- README/docs must be updated before launch so the product story is honest.

## Approval Status

**Approved by Ronin:** 2026-05-29

**Approved direction:** Build a RuVix-governed Memory Command Center, not a decorative dashboard.

**First build slice:**
- Memories: search, inspect, filter, provenance, relationship context.
- RuVix Governance: policy mode, thresholds, role separation, tenant isolation, promotion locks, drift warnings, mutation receipts.
- Curator: pending proposals, approve, reject, request evidence, request changes, rationale capture.
- Audit/Evidence: full event log, receipt detail, export packet, source lineage.
- Governance receipt drawer: every mutation and approval must show intent, actor, source, policy, validation, and audit trail.

**Approved navigation:**
- Overview
- Memories
- Curator
- Governance
- Graph
- Audit
- Settings

**Non-negotiables:**
- No fake healthy state.
- No fake live data.
- Every page shows active `group_id`.
- Every mutation creates an audit receipt.
- Every approval shows source evidence first.
- Every graph node links back to provenance.
- Every degraded state is visible.
- Real Allura branding only; no generated logos.

## Brand Direction

**Brand stance:** Warm, governed, connected, trustworthy.

**Use:**
- Real Allura wordmark and lettermark from tracked brand assets.
- Palette: cream `#F5F1E6`, charcoal `#111827`, blue `#1D4ED8`, orange `#FF5A2E`, green `#157A4A`, gold `#C89B3C`.
- Typography mood: strong editorial headings, practical dense data surfaces, calm operator controls.
- Language: people, memory, trust, clarity, evidence, source, review, provenance.

**Avoid:**
- New logo marks or reconstructed wordmarks.
- Purple AI gradients, dark cyberpunk panels, fake charts, vanity metrics.
- Claims like “healthy,” “live,” “done,” or “synced” without evidence.
- Imported Difference Driven / unrelated design tokens.

## Dashboard Scope

### Primary Routes

| Route | Owner | Purpose |
| --- | --- | --- |
| `/dashboard` | Operator/Admin | System status, queue health, freshness, degraded state, recent memory activity |
| `/dashboard/memories` | Operator/Curator | Search, filter, inspect memory records and provenance |
| `/dashboard/curator` | Curator | Review pending proposals, approve, request changes, reject with rationale |
| `/dashboard/graph` | Operator/Admin | Explore promoted semantic memory graph with source receipts |
| `/dashboard/audit` | Admin/Compliance | Filter audit events, export CSV, inspect decisions |
| `/dashboard/settings` | Admin | Tenant scope, promotion mode, user/role visibility, data-source health |

### First Release Must-Haves

- Visible active `group_id` scope on every page.
- Unknown/degraded/empty states as first-class UI, not errors hidden in console.
- Source-of-truth badge on every panel.
- Curator actions require rationale where appropriate.
- Evidence detail drawer for memory, proposal, graph node, and audit event.
- Keyboard-accessible action flow and focus-safe confirmation dialogs.
- Real brand assets and no generated logo-like treatment.

### Later Release

- Kanban/work-board management.
- Agent roster with activity traces.
- MCP catalog approval workflow.
- Resource manifest and deployment topology.
- Export packets for compliance review.
- Live stream mode after real polling/streaming evidence exists.

## File Structure

Create:
- `src/lib/dashboard/types.ts` — dashboard view models and state enums.
- `src/lib/dashboard/api.ts` — server-safe API fetch helpers returning `DashboardResult<T>`.
- `src/lib/dashboard/mappers.ts` — transform raw API payloads into UI-safe contracts.
- `src/lib/dashboard/fixtures.ts` — test-only fixtures; never imported by production routes.
- `src/components/dashboard/shell.tsx` — branded dashboard shell and route navigation.
- `src/components/dashboard/source-badge.tsx` — source, freshness, and degraded-state display.
- `src/components/dashboard/evidence-drawer.tsx` — reusable evidence detail panel.
- `src/components/dashboard/status-panel.tsx` — system health and freshness summary.
- `src/components/dashboard/memory-browser.tsx` — memory search, filters, result list.
- `src/components/dashboard/curator-queue.tsx` — proposal review list and actions.
- `src/components/dashboard/graph-view.tsx` — semantic graph canvas with fallback list.
- `src/components/dashboard/audit-table.tsx` — audit event table and export affordance.
- `src/components/dashboard/settings-panel.tsx` — tenant and promotion-mode display.
- `src/app/dashboard/layout.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/memories/page.tsx`
- `src/app/dashboard/curator/page.tsx`
- `src/app/dashboard/graph/page.tsx`
- `src/app/dashboard/audit/page.tsx`
- `src/app/dashboard/settings/page.tsx`
- `src/__tests__/dashboard-contracts.test.ts`
- `src/__tests__/dashboard-pages.test.tsx`

Modify:
- `README.md` — update terminal/API-only wording once dashboard work begins.
- `docs/allura/BLUEPRINT.md` — replace terminal-only non-goal with optional control-plane decision.
- `docs/allura/DESIGN-ALLURA.md` — reconcile route plan with this dashboard scope.
- `docs/allura/REQUIREMENTS-MATRIX.md` — restore dashboard requirements if accepted.

## Implementation Tasks

### Task 1: Resolve Product Truth

**Files:**
- Modify: `README.md`
- Modify: `docs/allura/BLUEPRINT.md`
- Modify: `docs/allura/DESIGN-ALLURA.md`
- Modify: `docs/allura/REQUIREMENTS-MATRIX.md`

- [ ] Replace absolute “no dashboard” claims with “MCP/API-first engine with optional branded operator dashboard.”
- [ ] Add a dashboard launch rule: no route is considered done without real data, degraded states, evidence receipts, and route smoke.
- [ ] Record the decision as an architecture note in `docs/allura/RISKS-AND-DECISIONS.md`.
- [ ] Run `bun run prettier README.md docs/allura/BLUEPRINT.md docs/allura/DESIGN-ALLURA.md docs/allura/REQUIREMENTS-MATRIX.md docs/allura/RISKS-AND-DECISIONS.md`.

### Task 2: Define Dashboard Contracts First

**Files:**
- Create: `src/lib/dashboard/types.ts`
- Create: `src/lib/dashboard/api.ts`
- Create: `src/lib/dashboard/mappers.ts`
- Test: `src/__tests__/dashboard-contracts.test.ts`

- [ ] Create `DashboardResult<T>` with `data`, `error`, `degraded`, `warnings`, `source`, `freshness`, and `groupId`.
- [ ] Create view models for `DashboardStatus`, `MemoryListItem`, `CuratorProposal`, `GraphSnapshot`, `AuditEventRow`, and `TenantSettingsView`.
- [ ] Write tests that reject missing `group_id`, unknown source labels, and fabricated healthy states.
- [ ] Wire mappers to existing API routes under `src/app/api/health`, `src/app/api/memory`, `src/app/api/curator`, and `src/app/api/audit`.
- [ ] Run `bun test src/__tests__/dashboard-contracts.test.ts`.

### Task 3: Build the Branded Dashboard Shell

**Files:**
- Create: `src/components/dashboard/shell.tsx`
- Create: `src/components/dashboard/source-badge.tsx`
- Create: `src/app/dashboard/layout.tsx`
- Test: `src/__tests__/dashboard-pages.test.tsx`

- [ ] Use the real Allura wordmark or approved text lockup only.
- [ ] Add navigation for Overview, Memories, Curator, Graph, Audit, Settings.
- [ ] Add persistent `group_id`, source, freshness, and degraded status region.
- [ ] Keep the shell dense and operator-focused; no marketing hero section.
- [ ] Test that each route renders the shell and exposes source/degraded state copy.

### Task 4: Overview Page

**Files:**
- Create: `src/components/dashboard/status-panel.tsx`
- Create: `src/app/dashboard/page.tsx`
- Test: `src/__tests__/dashboard-pages.test.tsx`

- [ ] Show PostgreSQL, Neo4j, MCP gateway, curator queue, and embeddings status.
- [ ] Show unknown/degraded as honest states when API data is missing.
- [ ] Show recent memory activity with provenance links.
- [ ] Add “Next actions” for failed promotions, stale traces, and schema drift.
- [ ] Test loading, empty, degraded, and healthy-with-receipt states.

### Task 5: Memory Browser

**Files:**
- Create: `src/components/dashboard/memory-browser.tsx`
- Create: `src/components/dashboard/evidence-drawer.tsx`
- Create: `src/app/dashboard/memories/page.tsx`
- Test: `src/__tests__/dashboard-pages.test.tsx`

- [ ] Add search input, state filters, confidence range, source filter, and date filter.
- [ ] List memory content, score, state, source, created timestamp, and evidence ID.
- [ ] Open evidence drawer with trace, actor, hash, promotion state, and graph relationship.
- [ ] Disable destructive actions in v1; dashboard is inspection-first.
- [ ] Test that every row includes provenance and `group_id`.

### Task 6: Curator Queue

**Files:**
- Create: `src/components/dashboard/curator-queue.tsx`
- Create: `src/app/dashboard/curator/page.tsx`
- Test: `src/__tests__/dashboard-pages.test.tsx`

- [ ] Render pending proposals sorted by score descending.
- [ ] Show reasoning, evidence, source traces, score tier, and policy mode.
- [ ] Implement approve, reject, and request changes against existing curator endpoints.
- [ ] Require rationale for reject/request changes.
- [ ] Add confirmation dialogs that trap and restore focus.
- [ ] Test action payloads include actor, rationale, proposal ID, and `group_id`.

### Task 7: Graph View

**Files:**
- Create: `src/components/dashboard/graph-view.tsx`
- Create: `src/app/dashboard/graph/page.tsx`
- Test: `src/__tests__/dashboard-pages.test.tsx`

- [ ] Render graph snapshot from `/api/memory/graph`.
- [ ] Use a list fallback when graph data is missing, too large, or disabled.
- [ ] Clicking a node opens evidence drawer.
- [ ] Surface total nodes/edges and sample cap honestly.
- [ ] Test fallback and capped graph states.

### Task 8: Audit and Settings

**Files:**
- Create: `src/components/dashboard/audit-table.tsx`
- Create: `src/components/dashboard/settings-panel.tsx`
- Create: `src/app/dashboard/audit/page.tsx`
- Create: `src/app/dashboard/settings/page.tsx`
- Test: `src/__tests__/dashboard-pages.test.tsx`

- [ ] Audit page filters by actor, event type, memory ID, proposal ID, date, and group.
- [ ] CSV export uses existing audit export helpers.
- [ ] Settings page displays tenant, promotion mode, roles, and source health.
- [ ] Settings v1 is mostly read-only unless a governed write endpoint already exists.
- [ ] Test audit filter query construction and settings degraded state.

### Task 9: Brand and Accessibility Gate

**Files:**
- Create: `src/__tests__/dashboard-brand-gate.test.tsx`
- Modify: dashboard components from prior tasks

- [ ] Assert no generated logo-like image is used in the shell.
- [ ] Assert approved color tokens are the only dashboard brand colors.
- [ ] Assert every interactive action has accessible name and keyboard path.
- [ ] Add empty/degraded copy that uses Allura voice: clear, warm, honest, never inflated.
- [ ] Run `bun test src/__tests__/dashboard-brand-gate.test.tsx src/__tests__/dashboard-pages.test.tsx`.

### Task 10: End-to-End Smoke and Launch Gate

**Files:**
- Create: `tests/e2e/dashboard-control-plane.spec.ts`
- Modify: `README.md`
- Modify: `docs/allura/DESIGN-ALLURA.md`

- [ ] Smoke `/dashboard`, `/dashboard/memories`, `/dashboard/curator`, `/dashboard/graph`, `/dashboard/audit`, `/dashboard/settings`.
- [ ] Verify no app errors and no fabricated healthy/live states.
- [ ] Verify keyboard navigation through curator actions.
- [ ] Verify screenshots at desktop, tablet, and mobile widths.
- [ ] Update README with dashboard status only after smoke passes.
- [ ] Run `bun run typecheck`, targeted dashboard tests, and `bun run test:e2e`.

## Acceptance Bar

- Real data or explicit unknown state everywhere.
- Every memory-management operation is scoped by `group_id`.
- No production fixture imports.
- No fake live polling, fake healthy state, or fake graph metrics.
- Curator actions write through governed endpoints only.
- All pages have source, freshness, degraded, and evidence affordances.
- Allura branding uses approved assets and palette only.
- Browser smoke includes visual screenshots and keyboard checks.

## Execution Recommendation

Start with Tasks 1-3. Do not build the graph or settings pages until the contract layer and shell pass tests. The critical early win is a truthful branded shell plus typed dashboard results; after that, every page becomes a safer composition problem instead of a guessing game.
