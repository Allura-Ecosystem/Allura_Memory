# Story 11.4 — Knowledge Graph View

## Story

As an operator of the Allura dashboard, I want an interactive Knowledge Graph page that visualizes Neo4j entities as node cards with connections between them, so I can understand how memories, agents, projects, and people are related at a glance.

**Priority:** P2-Medium | **Complexity:** Large | **Agent:** Woz | **Roadmap Step:** 11
**Repo:** `allura-memory` (dashboard — `src/app/dashboard/graph/`, `src/app/api/memory/graph/`)

> **NEW story — no existing FR.** Covers the `/dashboard/graph` route identified in Story 11.5 route-parity requirements and the graph view referenced in `docs/allura/DESIGN-ALLURA.md`.

## Traceability

Epic 11 -> NEW (graph view) -> `docs/archive/bmad-legacy/bmm/stories/8-3-wire-graph-tab-to-live-neo4j-data.md` (prior graph wiring work) -> `bun run typecheck && bun test`

## Acceptance Criteria

- [ ] AC1: `/dashboard/graph` route renders without error in Next.js App Router; page title is "Knowledge Graph"
- [ ] AC2: On load, the page fetches entity data from `/api/memory/graph?group_id=allura-system` and renders nodes within 2s on a local dev environment
- [ ] AC3: Entity types displayed: `People`, `Organizations`, `Memories`, `Agents`, `Projects` — each type has a distinct color badge using Allura tokens
- [ ] AC4: Each node card shows: entity name, entity type badge, a short description (truncated to 80 chars), and an optional email/role field for People nodes
- [ ] AC5: Connection lines are drawn between related nodes; line opacity is 0.4 on idle, 0.8 on hover of either endpoint node
- [ ] AC6: Clicking a node opens a detail panel on the right side of the layout showing full entity properties, relationship list, and a "View in Brain" link to `/dashboard/search?q={name}`
- [ ] AC7: Filter bar above the graph allows toggling entity types on/off; toggled-off types are hidden from both nodes and connection lines
- [ ] AC8: Search input filters visible nodes by name in real time (no server round-trip)
- [ ] AC9: Empty state: if no entities are returned, renders "No entities in the knowledge graph yet" with a link to `/dashboard/search`
- [ ] AC10: Error state: if `/api/memory/graph` returns an error, renders a friendly retry card — not a crash
- [ ] AC11: Loading state: skeleton shimmer cards shown during fetch
- [ ] AC12: Font is IBM Plex Sans; all colors use `var(--*)` Allura tokens; no hardcoded hex
- [ ] AC13: `group_id: allura-system` passed on every API call; response validated with Zod before render

## Tasks/Subtasks

- [ ] Task 1: Implement `/api/memory/graph/route.ts` — queries Neo4j for entity nodes and relationships; enforces `group_id` via `validateGroupId`; returns `{ nodes: EntityNode[], edges: EntityEdge[] }`; Zod-validates query params
  - [ ] 1.1 Define `EntityNode` and `EntityEdge` Zod schemas in `src/lib/dashboard/graph-contracts.ts`
  - [ ] 1.2 Cypher query: `MATCH (n) WHERE n.group_id = $groupId OPTIONAL MATCH (n)-[r]->(m) WHERE m.group_id = $groupId RETURN n, r, m LIMIT 200`
  - [ ] 1.3 Map Neo4j result to `EntityNode[]` / `EntityEdge[]`
- [ ] Task 2: Create `src/app/dashboard/graph/page.tsx` — Server Component shell; suspense boundary around client graph canvas
- [ ] Task 3: Create `src/components/knowledge-graph/GraphCanvas.tsx` — `"use client"` — renders nodes and edges using SVG or ForceGraph2D (if already in dependencies); handles zoom/pan
- [ ] Task 4: Create `src/components/knowledge-graph/NodeCard.tsx` — entity card with name, type badge, description, email/role; uses Allura tokens
- [ ] Task 5: Create `src/components/knowledge-graph/DetailPanel.tsx` — right-side panel showing selected entity full properties and relationship list
- [ ] Task 6: Create `src/components/knowledge-graph/GraphFilters.tsx` — entity type toggle buttons + name search input
- [ ] Task 7: Loading, empty, and error states as per AC11, AC9, AC10
- [ ] Task 8: Unit tests — API route validation (invalid group_id rejected), Zod schema parsing, filter logic, empty/error state renders
- [ ] Task 9: `bun run typecheck` clean; `bun test` green

## Dev Notes

### Governance (non-negotiable)
- `group_id: allura-system` enforced at the API route via `validateGroupId` before any Neo4j query
- Neo4j reads are read-only; this page must not write or mutate any node or relationship
- Do not expose raw Neo4j error messages to the UI; sanitize to "Graph query failed — please retry"
- Result set capped at 200 nodes to prevent runaway queries; add `LIMIT 200` to all Cypher queries

### Architecture
- API route: `src/app/api/memory/graph/route.ts` (Next.js App Router route handler)
- Canvas rendering: if `force-graph` or `react-force-graph-2d` is already in `package.json`, use it; otherwise render with SVG `<line>` and `<foreignObject>` for node cards — do not add a new graph library without Brooks approval
- Canvas/JS color context (ForceGraph2D): use `tokens.color.*` from `src/lib/tokens.ts` (Path 2 — no CSS vars in canvas)
- HTML/JSX color context (NodeCard, DetailPanel): use `bg-[var(--*)]` Tailwind class syntax (Path 1)
- Entity type color mapping (token-driven):
  - People: `var(--allura-blue)`
  - Organizations: `var(--allura-orange)`
  - Memories: `var(--allura-green)`
  - Agents: `var(--tone-blue-bg)` border with `var(--allura-blue)` text
  - Projects: `var(--allura-gold)` or `var(--tone-gold-bg)` if defined

### Token Authority
- Tailwind `className` syntax for React components: `bg-[var(--allura-blue)]`, `text-[var(--dashboard-text-primary)]`
- `tokens.ts` imports for canvas rendering contexts
- No hardcoded hex values anywhere in graph component code

## Dev Agent Record

### Implementation Plan
_To be filled by Woz on implementation._

### Debug Log
_To be filled during implementation._

### Completion Notes
_To be filled on completion._

## File List

- `src/app/dashboard/graph/page.tsx` — NEW
- `src/app/api/memory/graph/route.ts` — NEW
- `src/lib/dashboard/graph-contracts.ts` — NEW: Zod schemas for EntityNode, EntityEdge
- `src/components/knowledge-graph/GraphCanvas.tsx` — NEW
- `src/components/knowledge-graph/NodeCard.tsx` — NEW
- `src/components/knowledge-graph/DetailPanel.tsx` — NEW
- `src/components/knowledge-graph/GraphFilters.tsx` — NEW
- `src/__tests__/graph-api.test.ts` — NEW: API route unit tests

## Change Log
- 2026-06-11: Story created (new story, not in original Epic 11 plan — added to cover /dashboard/graph route parity and Knowledge Graph view per Story 11.5 requirements) — backlog.

## Status
backlog
