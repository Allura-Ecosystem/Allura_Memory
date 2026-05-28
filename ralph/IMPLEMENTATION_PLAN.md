# Phase 1 Dashboard Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Ralph may mark tasks `[x]` only after evidence is produced. Do not rewrite task descriptions.

**Goal ID:** goal-20260528-2141

**Goal:** Complete all remaining Phase 1 dashboard screens on branch `feat/phase1-completion` and merge a passing PR to `main`.

**Architecture:** Keep the dashboard inside the canonical Next.js App Router app at `src/app/(main)/dashboard` and server APIs under `src/app/api`. All live data reads must flow through existing data-access seams (`src/lib/postgres/connection.ts`, `src/lib/dashboard/queries.ts`, existing graph API) with `group_id = 'allura-system'` enforced on every PostgreSQL and Neo4j query. UI work must use `var(--allura-*)` or `var(--dashboard-*)` CSS tokens except documented data-viz colors for graph nodes, status dots, and HITL badges.

**Tech Stack:** Bun, Next.js App Router Route Handlers, React client components, `react-force-graph-2d`, PostgreSQL, Neo4j/RuVector graph adapter, Docker Compose.

**Stopping condition:** PR is opened against `main` from `feat/phase1-completion`, every listed route responds 200 with real data, `bun run typecheck` introduces zero branch errors, `docker compose build web` exits 0, `curl -f http://localhost:3100/api/health/live` returns 200, and PR CI/typecheck is green.

**Guardrails:**
- Runtime is Bun only; do not use `npm` or `npx`.
- Work only in `/tmp/allura-phase1` on branch `feat/phase1-completion`.
- Preserve the canonical main repo at `/media/ronin704/Games/Projects/ai-agents/allura-memory` unless explicitly instructed.
- Do not redo completed work: sidebar nav, `/dashboard/agents/contracts`, `/api/agents`, `/api/skills`.
- Every PostgreSQL and Neo4j query must include `group_id = 'allura-system'`.
- No hardcoded hex colors outside graph node/status/HITL data-viz exceptions.
- Do not claim completion without fresh command output.

## Context7 / Current Docs Receipt

- Next.js: `/vercel/next.js`, topic `App Router route handlers GET Response.json`; finding: App Router APIs use `app/**/route.ts` with exported `GET()` returning `Response.json(...)` and standard Web Request/Response APIs.
- React Force Graph: `/vasturiano/react-force-graph`, topic `ForceGraph2D props graphData onNodeClick draggable`; finding: `ForceGraph2D` accepts `graphData={ { nodes, links } }`, supports `nodeId`, `nodeLabel`, `linkSource`, `linkTarget`, `onNodeClick`, and node drag callbacks.

## Tasks

- [ ] **Task 1: Baseline inventory and root-cause declaration**
  - Files to inspect:
    - `src/lib/dashboard/queries.ts`
    - `src/lib/dashboard/types.ts`
    - `src/lib/postgres/connection.ts`
    - `src/app/api/memory/graph/route.ts`
    - `src/app/(main)/dashboard/projects/page.tsx`
    - `src/app/(main)/dashboard/memory-space/page.tsx`
  - Run:
    ```bash
    git status --short
    git log --oneline main..HEAD
    ```
  - Acceptance:
    - Branch is `feat/phase1-completion`.
    - Root cause for remaining work is documented in session notes: projects route lacks real PG endpoint and memory-space needs real interactive graph wiring.

- [ ] **Task 2: Add project summary data types and query**
  - Files:
    - Modify: `src/lib/dashboard/types.ts`
    - Modify: `src/lib/dashboard/queries.ts`
  - Required implementation:
    - Add a `DashboardProjectSummary` type with project name/count fields matching existing dashboard naming conventions.
    - Add a query function that executes the semantic equivalent of:
      ```sql
      SELECT DISTINCT project, COUNT(*)
      FROM events
      WHERE group_id = 'allura-system'
      GROUP BY project
      ```
    - Filter out null/empty project labels in SQL or post-processing.
    - Use the existing PG pool/client helper from `src/lib/postgres/connection.ts`.
  - Acceptance:
    - `group_id = 'allura-system'` is present in the SQL parameters or SQL predicate.
    - Function returns a stable empty array on handled data errors only if existing dashboard query patterns do so; otherwise let API route return an error.

- [ ] **Task 3: Create `GET /api/projects`**
  - Files:
    - Create or modify: `src/app/api/projects/route.ts`
  - Required implementation:
    - Export `GET()` using App Router Route Handler style.
    - Call the project summary query from Task 2.
    - Return `Response.json({ projects })` or the existing API envelope shape if dashboard APIs already use one.
    - On error, return JSON with status 500 and no secret-bearing details.
  - Acceptance:
    - `curl -f http://localhost:3100/api/projects` returns JSON rows from PostgreSQL when the app is running.

- [ ] **Task 4: Wire `/dashboard/projects` to real API data**
  - Files:
    - Modify: `src/app/(main)/dashboard/projects/page.tsx`
  - Required implementation:
    - Remove stub and “Coming soon” copy.
    - Fetch `/api/projects` or call the server query directly, following existing dashboard page patterns.
    - Render project cards using returned project names and counts.
    - Include loading/error/empty states with mission-control copy; empty state is allowed only when the live endpoint returns zero rows, not as a stub.
  - Acceptance:
    - `/dashboard/projects` renders project cards from real endpoint data.
    - No hardcoded hex colors outside documented exceptions.

- [ ] **Task 5: Wire `/dashboard/memory-space` ForceGraph2D to real graph data**
  - Files:
    - Modify: `src/app/(main)/dashboard/memory-space/page.tsx`
    - Modify supporting component files only if the page already delegates graph rendering.
  - Required implementation:
    - Fetch `GET /api/memory/graph` at runtime.
    - Render `ForceGraph2D` with live `{ nodes, links }` data.
    - Configure `nodeId`, `nodeLabel`, `linkSource`, and `linkTarget` to match the API shape.
    - Enable interaction: nodes can be dragged by default; `onNodeClick` selects a node and displays details in the existing page UI.
    - Do not use static positions as the primary layout.
  - Acceptance:
    - Nodes and edges render from live endpoint data.
    - Clicking a node updates selected-node UI.
    - Dragging nodes works.

- [ ] **Task 6: Confirm already-built routes and contracts**
  - Routes:
    - `/dashboard/audit`
    - `/dashboard/agents/contracts`
    - `/api/audit/events`
  - Run while app is serving port 3100:
    ```bash
    curl -f http://localhost:3100/dashboard/audit
    curl -f http://localhost:3100/dashboard/agents/contracts
    curl -f http://localhost:3100/api/audit/events
    ```
  - Acceptance:
    - No 404.
    - No runtime error page.
    - Audit endpoint returns data or a valid empty live-data response.

- [ ] **Task 7: Verify all 11 sidebar routes**
  - Routes:
    - `/dashboard`
    - `/dashboard/feed`
    - `/dashboard/graph`
    - `/dashboard/insights`
    - `/dashboard/evidence`
    - `/dashboard/agents`
    - `/dashboard/projects`
    - `/dashboard/skills`
    - `/dashboard/audit`
    - `/dashboard/memory-space`
    - `/dashboard/settings`
  - Run while app is serving port 3100:
    ```bash
    for route in /dashboard /dashboard/feed /dashboard/graph /dashboard/insights /dashboard/evidence /dashboard/agents /dashboard/projects /dashboard/skills /dashboard/audit /dashboard/memory-space /dashboard/settings; do
      curl -f "http://localhost:3100$route" >/dev/null || exit 1
    done
    ```
  - Acceptance:
    - All routes return 200-class `curl -f` success.
    - No page contains “Coming soon” or known stub copy.

- [ ] **Task 8: Typecheck, token audit, and branch-error audit**
  - Run:
    ```bash
    bun run typecheck
    ```
  - Also inspect branch diff for dashboard hardcoded colors:
    ```bash
    git diff main...HEAD -- 'src/app/(main)/dashboard' 'src/components' 'src/lib/dashboard' | grep -nE '#[0-9A-Fa-f]{3,8}' || true
    ```
  - Acceptance:
    - Typecheck exits 0 or only shows documented pre-existing env stub errors that are also present on `main`.
    - Any hardcoded hex in dashboard diff is limited to graph/status/HITL data-viz exceptions and documented in PR body.

- [ ] **Task 9: Docker build and health verification**
  - Run:
    ```bash
    docker compose build web
    docker compose up -d web
    curl -f http://localhost:3100/api/health/live
    ```
  - Acceptance:
    - Build exits 0.
    - Live health returns HTTP 200.

- [ ] **Task 10: Commit, open PR, and capture CI**
  - Run:
    ```bash
    git status --short
    git log --oneline main..HEAD
    ```
  - Commit only intentional files with clean conventional messages, no WIP/fixup spam.
  - Open PR:
    ```bash
    gh pr create --base main --head feat/phase1-completion
    ```
  - PR body must include:
    - Route verification table for all 11 routes.
    - `/api/projects` evidence.
    - `/api/memory/graph` + ForceGraph2D evidence.
    - `bun run typecheck` result.
    - `docker compose build web` result.
    - `curl -f http://localhost:3100/api/health/live` result.
  - Acceptance:
    - PR URL is captured.
    - PR CI/typecheck job is green or failing only on explicitly documented unrelated infrastructure.

## Completion Check

Run and collect evidence:

```bash
bun run typecheck
docker compose build web
docker compose up -d web
curl -f http://localhost:3100/api/health/live
for route in /dashboard /dashboard/feed /dashboard/graph /dashboard/insights /dashboard/evidence /dashboard/agents /dashboard/projects /dashboard/skills /dashboard/audit /dashboard/memory-space /dashboard/settings; do
  curl -f "http://localhost:3100$route" >/dev/null || exit 1
done
curl -f http://localhost:3100/api/projects
curl -f http://localhost:3100/api/memory/graph
```

Final state requires an opened PR against `main` and green PR CI/typecheck.
