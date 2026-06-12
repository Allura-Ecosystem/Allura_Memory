# Story 9: Dreams Surface LIVE — Receipt

**Story ID:** Phase 0 Step 9 (AC-3 4/4)
**Date:** 2026-06-12
**Owner:** Brooks (architect), Woz (builder — direct execution)
**Status:** ✅ DONE

## What Was Done

The Dreams surface was upgraded from a static placeholder to a live operational surface backed by the curator proposal pipeline and background activity from Postgres, following the operational-state pattern.

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/lib/operational-state/sources/dreams-source.ts` | **Created** | Live dreams source — reads curator proposal pipeline (pending/approved/rejected) + embedding backfill + proposal creation from Postgres |
| `src/lib/operational-state/sources/dreams-source.test.ts` | **Created** | 15 unit tests covering all 5 operational states, pipeline data, promotion mode |
| `src/app/dashboard/dreams/page.tsx` | **Rewritten** | Async server component with `force-dynamic`, 5 honest states, status strip, HITL gate notice, pipeline cards, background activity cards, promotion mode |

## Key Design Decisions

- **HITL-only promotion**: Per the plan, Dreams surfaces the curator proposal queue with explicit HITL gating. Pending proposals show a gold-bordered notice reminding operators that human review is required.
- **Canonical proposals as data source**: The `canonical_proposals` table is the pipeline truth — pending/approved/rejected counts come from it.
- **Promotion mode visibility**: The surface shows the current promotion mode (auto/soc2/unknown) so operators understand the pipeline behavior.

## Acceptance Criteria Met

- [x] **Source file** mirrors the operational-state pattern (5 honest states)
- [x] **Page rewrite** with `force-dynamic`, status strip, recovery messaging
- [x] **HITL gate surfaced** — pending proposals notice with mode-specific guidance
- [x] **Tenant-scoped** — every query uses `WHERE group_id = $1`
- [x] **12+ unit tests** — 15 tests pass
- [x] **Typecheck clean**
- [x] **No mock data**
- [x] **Durham tokens only**

## Test Results

```
✓ src/lib/operational-state/sources/dreams-source.test.ts (15 tests) 7ms
✓ All 5 operational-state test files: 65/65 pass
```

## AC-3 CLOSURE

**AC-3 = 4/4 — ALL PHASE 0 SURFACES LIVE**

| Surface | Story | Status |
|---------|-------|--------|
| Scheduled Tasks | Story 6 | ✅ LIVE |
| Settings | Story 7 | ✅ LIVE |
| Teams | Story 8 | ✅ LIVE |
| Dreams | Story 9 | ✅ LIVE |