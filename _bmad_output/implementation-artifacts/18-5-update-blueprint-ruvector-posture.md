# Story 18.5 — Update BLUEPRINT.md §2 + §8 RuVector Posture

**Status:** done
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 18

## User Story

As the Allura architecture owner, I need BLUEPRINT.md §2 (Engine Boundary) updated to distinguish the graph adapter cutover from the vector search bridge, and §8 (Port Allocation) updated to confirm the RuVector PG port, so that the blueprint reflects the actual three-layer RuVector posture (pgvector bridge for vectors, graph adapter for semantic, native extension not yet active).

## Context

- Current §2 says "pgvector bridge" and "ruvector_function_count=0" — correct for the native extension, but doesn't mention the graph adapter
- §8 (Port Allocation, AD-45) lists "RuVector PG 5433" as infra-exempt but doesn't explain what it is
- The graph adapter uses PG tables on the existing 5432, not a separate port — 5433 is for the native extension if it activates

## Acceptance Criteria

- [x] AC-1: §2 "Engine Boundary and RuVector/RuVix Posture" is expanded with a three-layer distinction: (1) pgvector bridge for vector search, (2) graph adapter for semantic/knowledge graph, (3) native RuVector extension (not yet active)
- [x] AC-2: §2 documents the `GRAPH_BACKEND` flag and that the graph adapter is 90% built (AD-029, AD-49)
- [x] AC-3: §2 preserves the existing `ruvector_function_count=0` evidence for the native extension
- [x] AC-4: §8 (Port Allocation) clarifies that RuVector PG 5433 is the native extension port (not yet active), and the graph adapter runs on the existing PG 5432
- [x] AC-5: Cross-references to AD-029, AD-49, RK-32, RK-21 are present
- [x] AC-6: AI-Assisted Documentation notice preserved
- [x] AC-7: E2E Readiness Status table is updated to distinguish graph adapter readiness from native extension readiness

## Tasks

1. [x] Read current §2 (lines 131-170) in full
2. [x] Read current §8 (Port Allocation, around line 718)
3. [x] Read AD-029 and AD-49 (after Story 18.1 promotes)
4. [x] Expand §2 with the three-layer RuVector posture
5. [x] Update §8 to clarify port 5433 vs 5432
6. [x] Update E2E Readiness Status table (around line 168) to add graph adapter readiness row
7. [x] Run `git diff --check`

## File List

- `docs/allura/BLUEPRINT.md` (edit — expand §2, update §8, update readiness table)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |
| 2026-07-12 | Implementation: three-layer RuVector posture, GRAPH_BACKEND flag, E2E table, port clarified | Woz |

## Dev Agent Record

**Agent:** Woz (primary builder)
**Runtime:** OpenCode / OpenClaw
**Tools used:** Read, Edit, Bash, Write

## Evidence

- Code: `docs/allura/BLUEPRINT.md` changes committed
- Git diff: Verified no whitespace issues via `git diff --check`
- Parity tests: 14/14 green for IGraphAdapter graph ops (AD-29)

---

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.

(End of file - total 75 lines)
