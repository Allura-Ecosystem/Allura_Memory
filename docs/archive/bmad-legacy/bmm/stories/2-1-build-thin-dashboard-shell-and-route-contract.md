# Story 2.1: Build Thin Dashboard Shell and Route Contract

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, Dashboard Visual Spec v2, and team consensus.

## Status

Done

## Story

As an operator,
I want `/dashboard` to render the approved thin mission-control shell,
So that the dashboard has stable layout, route boundaries, and source declarations before feature panels are added.

## Traceability

Epic 2 -> FR10, FR11, FR12, FR13 -> dashboard shell evidence -> `bun test src/__tests__/dashboard-schemas.test.ts src/lib/dashboard/__tests__/allura-route.test.ts`

## Acceptance Criteria

- [x] `/dashboard` uses warm cream background, thin workflow navigation, and search-first center area.
- [x] `/dashboard` avoids old dark sidebar, old logo lockup, generic card-grid hero, and system-status-as-product framing.
- [x] Every visible panel declares backing source and degraded behavior.
- [x] Allura drift gate confirms no newer design decision supersedes Dashboard Visual Spec v2.

## Allura Drift Gate

- Story: `2-1-build-thin-dashboard-shell-and-route-contract — Build Thin Dashboard Shell and Route Contract`
- Brain query: `Story 2.1 Build Thin Dashboard Shell Route Contract blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `prop-session-13i`: Notion contract remains authoritative for gates.
  - `mem-33e1d9be65b38174`: Notion is source of truth for planning/status/approval.
- Compared against:
  - Notion Work Board: unavailable in this runtime; local status remains reconciliation-only.
  - Code/schemas/docs/BMAD plan: `docs/design/DASHBOARD-VISUAL-SPEC-v2.md`, `_bmad/bmm/planning/epics.md`, `_bmad/bmm/stories/sprint-status.yaml`, `src/app/(main)/dashboard/page.tsx`, `src/app/(main)/dashboard/layout.tsx`, `src/app/(main)/dashboard/_components/governance-sidebar.tsx`, `src/lib/dashboard/allura-route.ts`.
- Drift classification: `none` for starting Story 2.1; no newer design decision superseding Dashboard Visual Spec v2 was found in Brain search.
- Disposition: proceed with TDD implementation.
- Owner: Brooks route; Woz build; Pike/Fowler review.

## Tasks / Subtasks

- [x] Write failing route-shell contract tests before production edits.
- [x] Implement dashboard route contract constants for navigation and panel source/degraded declarations.
- [x] Replace heavy dashboard sidebar with thin workflow navigation from Dashboard Visual Spec v2.
- [x] Ensure `/dashboard` visible panels declare source and degraded behavior.
- [x] Run targeted validation and update evidence packet.
- [ ] Run Pike/Fowler review or documented gate-equivalent review.

## Evidence Packet

- Validation:
  - RED: `bun test src/lib/dashboard/__tests__/allura-route.test.ts` failed because `DASHBOARD_WORKFLOW_NAV_ITEMS` was not exported.
    - Exact output excerpt: `SyntaxError: Export named 'DASHBOARD_WORKFLOW_NAV_ITEMS' not found in module ... src/lib/dashboard/allura-route.ts`.
  - GREEN: `bun test src/__tests__/dashboard-schemas.test.ts src/lib/dashboard/__tests__/allura-route.test.ts` passed: 25 tests, 81 expect calls. The schema tests intentionally printed existing shape-drift warnings.
    - Exact output excerpt: `25 pass`, `0 fail`, `81 expect() calls`.
  - RED: `bun test src/lib/dashboard/__tests__/api.test.ts` failed because `loadCuratorQueue("pending")` returned `error: null` when the pending queue request rejected.
    - Exact output excerpt: `Expected: "pending queue offline" Received: null`.
  - GREEN: `bun test src/lib/dashboard/__tests__/api.test.ts src/__tests__/dashboard-schemas.test.ts src/lib/dashboard/__tests__/allura-route.test.ts` passed: 35 tests, 116 expect calls. The schema tests intentionally printed existing shape-drift warnings.
    - Exact output excerpt: `35 pass`, `0 fail`, `116 expect() calls`.
  - `bun run typecheck` passed.
    - Exact output: `$ tsc --noEmit`.
  - `bash .github/scripts/dashboard-guard.sh` passed after moving the old metric card component out of `src/components/dashboard` and removing forbidden dashboard imports.
    - Exact output: `✅ Dashboard guard passed — no resurrection artifacts found.`
  - YAML parse and targeted `git diff --check` passed.
    - Exact output: `no output`.
- Review: Pike/Fowler review blockers resolved. Remaining nonblocking risk: no browser-level visual screenshot check was run in this runtime.
- Brain outcome memory: `6e33eea5-895c-4cf2-8c31-ab0517e27cb7`.
- Board traceability: Notion board update pending; no Notion tool available in this runtime.

## Changed Files

- `src/lib/dashboard/allura-route.ts`
- `src/lib/dashboard/__tests__/allura-route.test.ts`
- `src/app/(main)/dashboard/_components/governance-sidebar.tsx`
- `src/app/(main)/dashboard/_components/metric-summary-card.tsx`
- `src/app/(main)/dashboard/page.tsx`
- `src/app/(main)/dashboard/agents/page.tsx`
- `src/app/(main)/dashboard/governance-log/page.tsx`
- `src/components/dashboard/metric-card.tsx` (deleted)
- `_bmad/bmm/stories/sprint-status.yaml`
- `_bmad/bmm/stories/2-1-build-thin-dashboard-shell-and-route-contract.md`

## Review Fixes Applied

- Removed Quick stats and Governance health from the `/dashboard` shell so visible shell panels match the four declared panel contracts.
- Added explicit approval queue error rendering instead of falling through to the “No pending proposals” success state.
- Moved Mission board source/degraded declaration above the lane grid so it appears even when lanes are empty.
- Added stable nav IDs and query-qualified secondary nav targets to reduce duplicate route-key/active-state ambiguity.
- Added `failed` handling to governance-log status metadata.
- Added curator queue regression test and changed `loadCuratorQueue` so rejected pending/approved proposal reads set `error` and `degraded: true` instead of presenting empty success.
- Normalized governance-log allowed/blocked stat aliases so `pass`/`approved` and `fail`/`failed`/`rejected` count consistently with status rendering.
- Added source/degraded declaration to the blank-workspace onboarding panel.
- Expanded validation evidence with exact output excerpts or `no output`.
