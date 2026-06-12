# Story 8: Teams Surface LIVE — Receipt

**Story ID:** Phase 0 Step 8 (AC-3 3/4)
**Date:** 2026-06-12
**Owner:** Brooks (architect), Woz (builder — direct execution)
**Status:** ✅ DONE

## What Was Done

The Teams surface was upgraded from a static hardcoded team roster to a live operational surface backed by the canonical AGENT_MANIFEST (AD-15) and real Postgres event activity per agent, following the operational-state pattern.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/lib/operational-state/sources/teams-source.ts` | **Created** | Live teams source — reads canonical agent roster from AGENT_MANIFEST + per-agent event counts from Postgres |
| `src/lib/operational-state/sources/teams-source.test.ts` | **Created** | 15 unit tests covering all 5 operational states, activity merging, manifest-based roster |
| `src/app/dashboard/teams/page.tsx` | **Rewritten** | Async server component with `force-dynamic`, 5 honest states, status strip, fleet stats, live team cards with per-agent activity |

## Key Design Decisions

- **AGENT_MANIFEST as roster source (AD-15)**: The canonical TypeScript manifest is the single source of truth for team composition. Teams are derived from agent categories (primary+code+support = RAM, core+utility = Operations).
- **`allura-team-*` group_ids are legacy**: The prior hardcoded page referenced `allura-team-durham`, `allura-penasoto`, etc. Per the group_id invariant, only `allura-system` is used for Postgres queries. Non-`allura-system` teams from the old hardcoded page are not surfaced until they have entries in the manifest under `allura-system`.
- **Per-agent activity counts**: Each agent shows its 24h event count from Postgres, with green dots for active agents and gray dots for idle ones.

## Acceptance Criteria Met

- [x] **Source file** mirrors the operational-state pattern (teams-source.ts with SourceOutcome, 5 honest states)
- [x] **Page rewrite** with `force-dynamic`, status strip, 5 states, recovery messaging
- [x] **Tenant-scoped** — every query uses `WHERE group_id = $1` with bound parameter
- [x] **AD-15 compliance** — roster comes from AGENT_MANIFEST, not hardcoded data
- [x] **No `allura-team-*` drift** — only `allura-system` is queried
- [x] **12+ unit tests** — 15 tests pass (exceeds minimum)
- [x] **Typecheck clean** — `bun run typecheck` passes
- [x] **No mock data** — all data comes from canonical manifest + live Postgres
- [x] **Durham tokens only** — all CSS uses `var(--allura-*)` tokens

## Test Results

```
✓ src/lib/operational-state/sources/teams-source.test.ts (15 tests) 8ms
  Test Files  1 passed (1)
       Tests  15 passed (15)
```

## Typecheck Results

```
$ tsc --noEmit
(no errors)
```

## Closing AC-3 Progress

Before Story 8: AC-3 = 2/4
After Story 8: AC-3 = 3/4 (Scheduled Tasks ✅, Settings ✅, Teams ✅)

Remaining: Dreams (Story 9)