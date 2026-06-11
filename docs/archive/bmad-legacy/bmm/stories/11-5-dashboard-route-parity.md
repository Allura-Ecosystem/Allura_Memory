# Story 11.5 — Dashboard Route Parity

## Story

As an operator of the Allura dashboard, I want all dashboard pages to exist as proper Next.js App Router routes matching the allura-app route structure, so navigation never lands on a 404 and every surface degrades gracefully rather than crashing.

**Priority:** P1-High | **Complexity:** Medium | **Agent:** Woz | **Roadmap Step:** 11
**Repo:** `allura-memory` (dashboard — `src/app/dashboard/`)

## Traceability

Epic 11 -> FR13 + FR15 -> `docs/archive/bmad-legacy/bmm/planning/epics.md` lines 207–209 (`FR13: Epic 2 - dashboard route availability/degraded states`, `FR15: Epic 5 - cutover, rollback, parity, and final release evidence`) -> `bun run typecheck && bun test`

## Acceptance Criteria

- [ ] AC1: All 8 routes exist as Next.js App Router page files and return HTTP 200 (not 404):
  - `/dashboard` — Chat / Memory workspace (primary landing)
  - `/dashboard/search` — Memory search
  - `/dashboard/governance` — Governance and policy controls
  - `/dashboard/scheduled-tasks` — Scheduled tasks
  - `/dashboard/kanban` — Kanban board
  - `/dashboard/graph` — Knowledge Graph (Story 11.4)
  - `/dashboard/mission-control` — Mission control overview
  - `/dashboard/settings` — Settings (Story 9.5)
- [ ] AC2: Each route renders a page shell with: correct `<title>` tag, IBM Plex Sans font, Allura cream background (`var(--allura-cream)`), and the shared dashboard sidebar/nav layout
- [ ] AC3: Routes that depend on a not-yet-shipped data surface render an explicit "Coming soon" or "Not yet connected" degraded state — not an error boundary crash, not a blank white page, not fake data
- [ ] AC4: The shared dashboard layout (`src/app/dashboard/layout.tsx`) includes navigation links to all 8 routes; the active route is highlighted using `var(--allura-blue)` token
- [ ] AC5: Navigation is keyboard-accessible: Tab reaches all nav links; active link has visible focus ring
- [ ] AC6: On mobile (≤720px), the sidebar collapses and a bottom nav or hamburger affordance provides access to all routes
- [ ] AC7: `bun run typecheck` passes with zero errors across all 8 page files and the shared layout
- [ ] AC8: No route imports components from the deprecated `@/components/dashboard` path (old dashboard shell); each page uses `src/components/` or `src/app/dashboard/` local components
- [ ] AC9: `group_id: allura-system` is passed from server components to any data-fetching calls; no missing group_id on any page load

## Tasks/Subtasks

- [ ] Task 1: Audit `src/app/dashboard/` — list which of the 8 routes already exist as `page.tsx` files and which are missing
- [ ] Task 2: Create any missing `page.tsx` stubs; each stub must include: page title, degraded-state placeholder, and correct layout wrapper — do not leave any route as an unhandled 404
  - [ ] 2.1 `/dashboard` — verify existing chat/workspace page; add degraded state if Brain is unreachable
  - [ ] 2.2 `/dashboard/search` — verify existing; add empty state if no results
  - [ ] 2.3 `/dashboard/governance` — stub or verify; degraded if governance MCP tools unavailable
  - [ ] 2.4 `/dashboard/scheduled-tasks` — stub or verify; degraded if scheduler not wired
  - [ ] 2.5 `/dashboard/kanban` — stub or verify; degraded if Notion adapter not connected
  - [ ] 2.6 `/dashboard/graph` — stub pointing to Story 11.4 implementation
  - [ ] 2.7 `/dashboard/mission-control` — stub or verify
  - [ ] 2.8 `/dashboard/settings` — verify Story 9.5 page exists; add theme toggle hook for Story 11.3
- [ ] Task 3: Update `src/app/dashboard/layout.tsx` — add nav links for all 8 routes; highlight active using `usePathname()`; ensure IBM Plex Sans font is loaded
- [ ] Task 4: Implement mobile nav collapse (≤720px) — bottom tab bar or hamburger; see Story 11.6 for full polish, this task only ensures routes are reachable on mobile
- [ ] Task 5: Remove any remaining imports from `@/components/dashboard` (old path); replace with current component paths
- [ ] Task 6: `bun run typecheck` clean; verify zero 404s by running `bun run build` and checking the route manifest

## Dev Notes

### Governance (non-negotiable)
- All server component data fetches must include `group_id: "allura-system"`
- Degraded states must be explicit (visible text, not empty DOM); no surface may silently omit content without explanation

### Architecture
- Layout file: `src/app/dashboard/layout.tsx` is the single layout wrapper; all 8 routes are children
- Active route detection: `usePathname()` from `next/navigation` in a `"use client"` nav component
- Font: IBM Plex Sans loaded via `next/font/google` or the existing `src/styles/` import — confirm it is set in the root layout, not duplicated per page
- Do not create new sidebar components if `src/components/sidebar/` or equivalent already exists; extend it

### Token Authority
- Layout and nav: `bg-[var(--allura-cream)]`, `text-[var(--dashboard-text-primary)]`, `border-[var(--tone-blue-bg)]`
- Active nav item: `text-[var(--allura-blue)]` or `bg-[var(--tone-blue-bg)]`
- No hardcoded hex values in layout or nav components

### Definition of Done Check (7-point)
Each route must pass:
1. Loading state present
2. Empty state present
3. Error/degraded state present
4. Ready state present (real or explicit stub)
5. Real API call or explicit "not yet connected" label
6. Correct next action visible to user
7. No fake status indicators

## Dev Agent Record

### Implementation Plan
_To be filled by Woz on implementation._

### Debug Log
_To be filled during implementation._

### Completion Notes
_To be filled on completion._

## File List

- `src/app/dashboard/layout.tsx` — MODIFIED: full nav link set, mobile collapse
- `src/app/dashboard/page.tsx` — VERIFIED/MODIFIED
- `src/app/dashboard/search/page.tsx` — VERIFIED/MODIFIED
- `src/app/dashboard/governance/page.tsx` — NEW or VERIFIED
- `src/app/dashboard/scheduled-tasks/page.tsx` — NEW or VERIFIED
- `src/app/dashboard/kanban/page.tsx` — NEW or VERIFIED
- `src/app/dashboard/graph/page.tsx` — NEW (see Story 11.4)
- `src/app/dashboard/mission-control/page.tsx` — NEW or VERIFIED
- `src/app/dashboard/settings/page.tsx` — VERIFIED (Story 9.5)

## Change Log
- 2026-06-11: Story created (materialized from Epic 11 route-parity requirement; covers FR13 and FR15 parity gate) — backlog.

## Status
backlog
