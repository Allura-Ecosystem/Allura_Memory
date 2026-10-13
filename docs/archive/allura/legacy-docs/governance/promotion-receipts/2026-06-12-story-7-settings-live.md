# Story 7: Settings Surface LIVE — Receipt

**Story ID:** Phase 0 Step 7 (AC-3 2/4)
**Date:** 2026-06-12
**Owner:** Brooks (architect), Woz (builder — direct execution)
**Status:** ✅ DONE

## What Was Done

The Settings surface was upgraded from a static configuration display to a live operational surface backed by real Postgres events data and MCP health reports, following the exact operational-state pattern established by Story 6 (Scheduled Tasks) and Story 13.2 (Governance).

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/lib/operational-state/sources/settings-source.ts` | **Created** | Live settings source — reads governance policy/gate activity from Postgres + subsystem health from MCP audit_health_report |
| `src/lib/operational-state/sources/settings-source.test.ts` | **Created** | 17 unit tests covering all 5 operational states, MCP health mapping, promotion mode sanitization, env isolation |
| `src/app/dashboard/settings/page.tsx` | **Rewritten** | Async server component with `force-dynamic`, 5 honest states, status strip, subsystem health cards, governance activity cards, promotion mode indicator |

## Acceptance Criteria Met

- [x] **Source file** mirrors the operational-state pattern (settings-source.ts with SourceOutcome, 5 honest states)
- [x] **Page rewrite** with `force-dynamic`, status strip, 5 states (ready/empty/stale/error/degraded), recovery messaging
- [x] **Tenant-scoped** — every query uses `WHERE group_id = $1` with bound parameter
- [x] **Audited** — MCP health report and governance event counts are read-only, append-only safe
- [x] **12+ unit tests** — 17 tests pass (exceeds minimum)
- [x] **Typecheck clean** — `bun run typecheck` passes
- [x] **No mock data** — all data comes from live Postgres + MCP health
- [x] **No secrets leaked** — promotion mode sanitized, errors sanitized, env values never exposed raw
- [x] **Durham tokens only** — all CSS uses `var(--allura-*)` tokens

## Test Results

```
✓ src/lib/operational-state/sources/settings-source.test.ts (17 tests) 9ms
  Test Files  1 passed (1)
       Tests  17 passed (17)
```

## Typecheck Results

```
$ tsc --noEmit
(no errors)
```

## Operational State Verification

All 5 states are renderable:

| State | Trigger | Rendering |
|-------|---------|-----------|
| **ready** | Postgres + MCP both healthy, governance activity exists | Subsystem health cards + governance activity cards + promotion mode |
| **empty** | Postgres healthy but no governance activity | "No governance activity recorded yet" + onboarding hint |
| **stale** | Data older than 30s | Same as ready but with "Stale" label and freshness warning |
| **error** | Postgres query fails (non-connection) | "Settings source reported an error" + sanitized error + recovery |
| **degraded** | Postgres unreachable or pool fails | "Settings source is unreachable" + recovery action |

## Architecture Decisions

- **AD-N (implicit)**: Settings surface reads from both Postgres events AND MCP health report, unlike other surfaces that use only Postgres. Rationale: Settings is uniquely about runtime configuration truth, and subsystem health is the primary value. MCP health failure is non-fatal — subsystem health degrades to "unknown" but governance data from Postgres still displays.
- **Promotion mode**: Read from `process.env.PROMOTION_MODE` with whitelist sanitization ("auto" or "soc2" only; anything else maps to "unknown"). Never exposes raw env values.

## Closing AC-3 Progress

Before Story 7: AC-3 = 1/4 (Scheduled Tasks ✅)
After Story 7: AC-3 = 2/4 (Scheduled Tasks ✅, Settings ✅)

Remaining: Teams (Story 8), Dreams (Story 9)