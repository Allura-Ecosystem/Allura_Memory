# Story 2.3: Implement Dashboard Empty and Degraded States

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD execution artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As an operator, I want clear empty and degraded states across dashboard routes, so that absence of data is understandable and never disguised as success.

## Acceptance Criteria

- Given memories, approvals, agents, or graph data are empty or unavailable, when `/dashboard`, `/dashboard/memory-space`, `/dashboard/agents`, `/dashboard/insights`, or `/dashboard/builder` render, then each route shows a friendly state with retry or next-action guidance where appropriate.
- Graph errors do not crash the page.
- All route states remain visually aligned to the v2 spec.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 2.3.
- Traceability: Epic 2 -> FR11, FR13 -> route smoke evidence.
- Validation target from epic: `bun test src/__tests__/dashboard-schemas.test.ts`.
- Story 2.1 established shell source/degraded declarations and dashboard guard compliance.
- Story 2.2 established honest states: no placeholder metrics, fabricated counts, or hidden degraded modes.
- Next.js App Router error-boundary documentation confirms route `error.tsx` fallbacks must be client components and should expose retry via `unstable_retry`; current dashboard-level `error.tsx` already provides segment recovery, so this story focuses on route-level data empty/degraded states.
- Notion Work Board remains canonical; local sprint status is reconciliation only.

## Tasks/Subtasks

- [x] Run Story 2.3 Allura drift gate before implementation.
- [x] Add RED tests for route empty/degraded state contracts and graph failure copy.
- [x] Implement minimal shared state model and render retry/next-action guidance on affected dashboard routes.
- [x] Run targeted validation and record exact output.
- [x] Run Pike/Fowler review and resolve blockers.
- [x] Log outcome to Allura Brain and update local BMAD evidence.

## Dev Agent Record

### Debug Log

- 2026-05-24: Story opened from Epic 2 backlog. Scout hydration and Brain search completed before edits.
- 2026-05-24: Drift gate considered prior memories: Notion Work Board remains canonical, raw Brain traces are context not proof, no autonomous promotion, dashboard v2/no-fabrication lessons apply.
- 2026-05-24: RED test confirmed missing `@/lib/dashboard/empty-states` module before implementation.
- 2026-05-24: Fowler review found unfriendly generated degraded titles; added explicit route degraded titles and a RED/GREEN regression test.
- 2026-05-24: Ralph iteration 2 re-review found remaining degraded-state false-empty paths; added source guards and minimal route/query fixes before final acceptance closure.

### Completion Notes

- Added `DASHBOARD_ROUTE_EMPTY_STATES` and `buildDashboardRouteState()` as a small shared route-state contract for Story 2.3 routes.
- Rendered clearer empty/degraded copy and retry/next-action affordances on `/dashboard`, `/dashboard/memory-space`, `/dashboard/agents`, `/dashboard/insights`, and `/dashboard/builder`.
- Kept graph failures non-crashing and added an explicit retry path for memory graph reloads.
- Validation evidence:
  - RED: `bun test src/lib/dashboard/__tests__/empty-states.test.ts` failed with missing module `@/lib/dashboard/empty-states`.
  - RED review fix: `bun test src/lib/dashboard/__tests__/empty-states.test.ts` failed because generic degraded title returned `agents indexed yet unavailable` instead of `Agents unavailable`.
  - GREEN: `bun test src/lib/dashboard/__tests__/empty-states.test.ts src/__tests__/dashboard-schemas.test.ts src/lib/dashboard/__tests__/allura-route.test.ts tests/dashboard/resurrection-guard.test.ts`: `32 pass`, `0 fail`, `119 expect() calls`.
  - `bun run typecheck`: `tsc --noEmit`, no output after command line.
- `bash .github/scripts/dashboard-guard.sh`: `✅ Dashboard guard passed — no resurrection artifacts found.`
- YAML parse: `YAML parse passed`.
- Targeted `git diff --check`: no output.
- Ralph iteration 2 closure validation: `bun test src/lib/dashboard/__tests__/empty-states.test.ts src/__tests__/dashboard-schemas.test.ts src/lib/dashboard/__tests__/allura-route.test.ts tests/dashboard/resurrection-guard.test.ts` passed with `38 pass`, `0 fail`, `154 expect() calls`; `bun run typecheck` passed with `tsc --noEmit`; dashboard guard passed; YAML parse passed; targeted `git diff --check` passed with no output.
- Closure review evidence: Pike final pass reported no blocking findings; Fowler final pass reported no blocking findings; final Acceptance Auditor pass reported no blocking findings after degraded dashboard queue, agents, insights, builder, memory-space, and `loadInsights("all" | "rejected")` fixes.
- Notion Work Board update: attempted through Notion MCP search, but tool returned `Unauthorized`; local status remains reconciliation-only pending board sync.

## File List

- `_bmad/bmm/stories/2-3-implement-dashboard-empty-and-degraded-states.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/lib/dashboard/empty-states.ts`
- `src/lib/dashboard/queries.ts`
- `src/lib/dashboard/__tests__/empty-states.test.ts`
- `src/app/(main)/dashboard/page.tsx`
- `src/app/(main)/dashboard/memory-space/page.tsx`
- `src/app/(main)/dashboard/agents/page.tsx`
- `src/app/(main)/dashboard/insights/page.tsx`
- `src/app/(main)/dashboard/builder/page.tsx`

## Change Log

- 2026-05-24: Created Story 2.3 execution artifact and started implementation.
- 2026-05-24: Added shared route empty/degraded state contract, route rendering updates, and RED/GREEN tests.
- Review evidence: Pike final re-review reported no blocking findings; Fowler final re-review reported no blocking findings.
- Brain outcome memory: `6010f123-70cf-41e4-ade6-5dfc971525a8`; Ralph iteration 2 closure memory: `2748ad17-f330-49c0-a3f4-4d0d788d72b0`.
- 2026-05-24: Ralph iteration 2 closure tightened degraded-state handling and query routing; final Pike/Fowler/Acceptance reviews reported no blocking findings. Notion board sync blocked by Unauthorized MCP response.
