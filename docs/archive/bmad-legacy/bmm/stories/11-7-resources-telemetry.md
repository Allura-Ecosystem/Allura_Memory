# Story 11.7 — Resources and Telemetry Pages

## Story

As an operator of the Allura dashboard, I want a Resources page that shows available skills, agents, MCP servers, and containers from the Resource Manifest, and a Telemetry page that shows real model, prompt, and tool usage metrics, so I can understand what the system has available and how it is being used — without fabricated data.

**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Woz | **Roadmap Step:** 11
**Repo:** `allura-memory` (dashboard — `src/app/dashboard/resources/`, `src/app/dashboard/telemetry/`, `src/app/api/`)

## Traceability

Epic 11 -> FR44 + FR46 -> Resource Manifest (`src/lib/resources/` or equivalent) and Brain telemetry events -> `bun run typecheck && bun test`

> **FR44 and FR46 are not yet listed in the epics.md FR inventory** (the plan ends at FR38). These FRs are inferred from the task description and the Definition of Done NFR4 requirement (`NFR4: All UI state must be truthful: no fake healthy state, fake live data, placeholder metrics, unlabeled samples, or fabricated provenance`). They should be formally registered in the requirements matrix when this story moves to Ready.

## Acceptance Criteria

### Resources Page (`/dashboard/resources`)

- [ ] AC1: `/dashboard/resources` route exists and returns HTTP 200
- [ ] AC2: Page renders four sections: Skills, Agents, MCP Servers, Containers
- [ ] AC3: Skills section lists all skills from the Resource Manifest; each entry shows: name, version (if available), description (truncated to 120 chars), and status badge (`active` / `inactive` / `unknown`)
- [ ] AC4: Agents section lists all registered Team RAM agents; each entry shows: persona name, model, role, and availability status
- [ ] AC5: MCP Servers section lists all configured MCP servers from `mcp-client-config.json` or equivalent; each entry shows: server name, transport type, and connection status (`connected` / `unreachable` / `unknown`)
- [ ] AC6: Containers section lists Docker containers relevant to Allura (postgres, neo4j, ruvector, allura-brain); each entry shows: container name, image, and status (`running` / `stopped` / `unknown`)
- [ ] AC7: If a section has no data available, it renders a "No [resource type] found" empty state — not an error, not a blank area
- [ ] AC8: Page does not fabricate status; if data is unavailable, the status field shows `unknown` and the card is visually distinguished (muted color, not green/active)
- [ ] AC9: `group_id: allura-system` passed on all API calls

### Telemetry Page (`/dashboard/telemetry`)

- [ ] AC10: `/dashboard/telemetry` route exists and returns HTTP 200
- [ ] AC11: Page renders three metric sections: Model Usage, Prompt Activity, Tool Invocations
- [ ] AC12: Model Usage shows: requests by model name, token counts (input/output) per model, aggregated for the last 7 days — sourced from Brain event traces filtered by `event_type = 'model_usage'` or equivalent
- [ ] AC13: Prompt Activity shows: number of prompts, average response time (ms), and error rate — sourced from Brain traces
- [ ] AC14: Tool Invocations shows: tool name, call count, success/failure count — sourced from Brain traces
- [ ] AC15: If Brain has no telemetry events (empty result), renders "No telemetry data recorded yet" — not zero-filled charts or placeholder numbers
- [ ] AC16: If Brain query fails, renders an error state with a retry button — not a crash
- [ ] AC17: No metric value is fabricated; all numbers come from real Brain event queries or are labeled `N/A`
- [ ] AC18: Charts/tables use Allura token colors; IBM Plex Sans for all text; IBM Plex Mono for numeric values

## Tasks/Subtasks

### Resources Page
- [ ] Task 1: Define Resource Manifest schema — `src/lib/resources/manifest.ts`; exports `getResourceManifest()` that reads skills from `.opencode/skills/`, agents from `.opencode/agent/`, MCP servers from `mcp-client-config.json`; returns `{ skills, agents, mcpServers, containers }`
- [ ] Task 2: Create `/api/resources/route.ts` — calls `getResourceManifest()`; validates `group_id`; returns manifest as JSON
- [ ] Task 3: Create `src/app/dashboard/resources/page.tsx` — Server Component; fetches from `/api/resources`; passes to `<ResourcesView />`
- [ ] Task 4: Create `src/components/resources/ResourcesView.tsx` — four-section layout; each section is a `<ResourceSection>` with heading, item cards, and empty state
- [ ] Task 5: Container status: attempt `GET /api/health` for each known service endpoint (postgres: 5432, neo4j: 7474, ruvector: 5433, brain: 5888); set `connected` on 200/TCP, `unreachable` on timeout/error

### Telemetry Page
- [ ] Task 6: Create `/api/telemetry/route.ts` — queries Brain PostgreSQL events with `group_id = 'allura-system'` and relevant event types; returns aggregated `{ modelUsage, promptActivity, toolInvocations }`; Zod-validates query params
- [ ] Task 7: Create `src/app/dashboard/telemetry/page.tsx` — Server Component; fetches from `/api/telemetry`; passes to `<TelemetryView />`
- [ ] Task 8: Create `src/components/telemetry/TelemetryView.tsx` — three metric sections; handles empty data and error states
- [ ] Task 9: Unit tests — manifest parsing, API route group_id validation, empty-data state renders, error state renders
- [ ] Task 10: `bun run typecheck` clean; `bun test` green

## Dev Notes

### Governance (non-negotiable)
- `group_id: allura-system` on every Brain query; pattern enforced via `validateGroupId`
- PostgreSQL queries are read-only; no writes from telemetry or resources API routes
- Container status checks use HTTP health endpoints only — never `docker exec` or `docker inspect`; see `.claude/rules/mcp-integration.md`
- No fabricated data under any circumstances; NFR4 is a hard requirement for this story

### Architecture
- Resource Manifest: read-only filesystem + config parsing; no DB writes
- Telemetry queries: aggregate over `events` table — `SELECT event_type, COUNT(*), SUM(metadata->>'tokens_input'), SUM(metadata->>'tokens_output') FROM events WHERE group_id = $1 AND event_type IN ('model_usage', 'tool_call', 'prompt') GROUP BY event_type ORDER BY COUNT(*) DESC LIMIT 50`
- MCP server status: read `mcp-client-config.json` for server list; do not attempt live TCP checks in server components — return `unknown` if TCP probe is not feasible without blocking SSR
- IBM Plex Mono for numeric metric values: `font-["IBM_Plex_Mono"]` or `font-mono` if IBM Plex Mono is mapped to the `mono` family in Tailwind config

### Token Authority
- Tailwind `className` syntax: `bg-[var(--allura-cream)]`, `text-[var(--dashboard-text-primary)]`, `text-[var(--allura-green)]` (active/connected), `text-[var(--tone-red-text)]` (error/stopped)
- Unknown/inactive: `text-[var(--dashboard-text-secondary)]`, `bg-[var(--tone-gray-bg)]` or equivalent muted token
- No hardcoded hex values

## Dev Agent Record

### Implementation Plan
_To be filled by Woz on implementation._

### Debug Log
_To be filled during implementation._

### Completion Notes
_To be filled on completion._

## File List

- `src/lib/resources/manifest.ts` — NEW: Resource Manifest reader
- `src/app/api/resources/route.ts` — NEW: Resources API route
- `src/app/api/telemetry/route.ts` — NEW: Telemetry API route
- `src/app/dashboard/resources/page.tsx` — NEW
- `src/app/dashboard/telemetry/page.tsx` — NEW
- `src/components/resources/ResourcesView.tsx` — NEW
- `src/components/telemetry/TelemetryView.tsx` — NEW
- `src/__tests__/resources-api.test.ts` — NEW: API unit tests
- `src/__tests__/telemetry-api.test.ts` — NEW: API unit tests

## Change Log
- 2026-06-11: Story created (materialized from task description FR44+FR46 requirement; FRs not yet in epics.md inventory — register in Requirements Matrix when story moves to Ready) — backlog.

## Status
backlog
