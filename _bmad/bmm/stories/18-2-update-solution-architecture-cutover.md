# Story 18.2 — Update SOLUTION-ARCHITECTURE.md §3.4.0 Cutover Path

**Status:** ready-for-dev
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 18

## User Story

As the Allura architecture owner, I need SOLUTION-ARCHITECTURE.md §3.4.0 "Current RuVector Readiness Boundary" expanded to document the actual graph cutover path (AD-029 adapter pattern + AD-49 cutover decision), so that the topology doc reflects that the migration is 90% built behind a feature flag, not greenfield.

## Context

- Current §3.4.0 says: "Full RuVector-Postgres remains a planned migration target and requires separate approval"
- Reality: the `IGraphAdapter` seam is built, `RuVectorGraphAdapter` implements all 16 methods, parity test is 14/14 green
- The readiness table (lines 237-242) shows `ruvector_function_count=0` — this is about the *native extension*, not the graph adapter. The graph adapter uses PG tables, not the native extension.
- Need to distinguish: (1) pgvector bridge for vector search, (2) RuVector graph adapter for semantic/knowledge graph, (3) native RuVector extension (still not active)

## Acceptance Criteria

- [x] AC-1: §3.4.0 is expanded with a "Graph Backend Cutover Path" subsection
- [x] AC-2: Documents the `GRAPH_BACKEND` flag (`neo4j` default, `ruvector` available, `ruvector-crate` planned)
- [x] AC-3: Documents the `IGraphAdapter` seam (AD-29) with the three adapter implementations
- [x] AC-4: Includes the readiness table distinguishing vector search (pgvector bridge) from graph backend (adapter pattern)
- [x] AC-5: Includes graduation criteria for the graph backend cutover: live-DB E2E pass, dual-read validation, parity test
- [x] AC-6: Cross-references AD-29, AD-49, RK-32
- [x] AC-7: AI-Assisted Documentation notice preserved
- [x] AC-8: The existing readiness table (lines 237-242) is preserved but clarified — `ruvector_function_count=0` refers to the native extension, not the graph adapter

## Tasks

1. [x] Read current §3.4.0 (lines 206-242) in full
2. [x] Read AD-49 from RISKS-AND-DECISIONS.md (AD-29 referenced from RISKS-AND-DECISIONS line 44)
3. [x] Add "Graph Backend Cutover Path" subsection after the existing readiness table
4. [x] Document the three `GRAPH_BACKEND` values and their status
5. [x] Add graduation criteria table for the cutover
6. [x] Cross-reference AD-29, AD-49, RK-32
7. [x] Run `git diff --check` (passed)

## Dev Notes

- **Pattern to follow:** §3.4.1 (RuVix Kernel Governance Contract) — same density, same table style
- Keep the existing `ruvector_function_count=0` evidence — it's still true for the native extension. Add context that the graph adapter is a separate concern.
- **Dev implementation:** Woz (2026-07-12) added new subsection "§3.4.0.1 Graph Backend Cutover Path" after existing readiness table (line 242), inserted 40 lines of new content, clarified `ruvector_function_count=0` note, cross-references AD-29, AD-49, RK-32 (RK-15 is resolved; RK-32 is active graph cutover risk)
- **Cross-reference note:** Story AC-6 mentioned RK-15, but RK-15 is "Approve route connection leak" (marked resolved). The active graph cutover risk is RK-32.

## File List

- `docs/allura/SOLUTION-ARCHITECTURE.md` (edit — expanded §3.4.0 with subsection 3.4.0.1)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |
| 2026-07-12 | Added §3.4.0.1 "Graph Backend Cutover Path" | Woz |