# Story 19.3 — Flip Default to ruvector

**Status:** blocked (needs 19.2)
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 19

## User Story

As the Allura architect, I need `GRAPH_BACKEND=ruvector` set as the default in `factory.ts`, so that the RuVector graph adapter becomes the production backend, retiring Neo4j 5.26 Community as the semantic/knowledge-graph layer.

## Context

- After 19.1 (live-DB E2E passes) and 19.2 (dual-read clean for test period)
- This is the actual cutover — AD-49 decision executed
- Neo4j stays as read-only fallback for one release after the flip (AD-49 consequence)
- `runtime_readiness` label may upgrade from `pgvector_bridge` to `ruvector_graph` (REQ-RV-005, RK-21 Stage 1)

## Acceptance Criteria

- [ ] AC-1: `factory.ts` `getGraphBackend()` returns `ruvector` by default (not `neo4j`)
- [ ] AC-2: The change is behind the existing flag mechanism (no new flag needed)
- [ ] AC-3: Neo4j adapter remains available as fallback (`GRAPH_BACKEND=neo4j` still works)
- [ ] AC-4: All existing tests pass with the new default
- [ ] AC-5: The `runtime_readiness` label in docs is updated to `ruvector_graph` (RK-21 Stage 1 graduation)
- [ ] AC-6: RISKS-AND-DECISIONS.md AD-49 status is updated from `Proposed` to `Decided`
- [ ] AC-7: RK-32 status is updated from `🟡 Open` to `✅ Resolved` (or `Mitigated` if dual-read continues)
- [ ] AC-8: BLUEPRINT.md E2E Readiness Status table is updated
- [ ] AC-9: Evidence of the flip is logged to Allura Brain (group_id=allura-system)

## Tasks

1. Read `src/lib/graph-adapter/factory.ts`
2. Change default from `neo4j` to `ruvector`
3. Run full test suite to verify no regressions
4. Update AD-49 status in RISKS-AND-DECISIONS.md (Proposed → Decided)
5. Update RK-32 status (🟡 Open → ✅ Resolved or Mitigated)
6. Update RK-21 mitigation to reflect Stage 1 graduation achieved
7. Update BLUEPRINT.md E2E Readiness Status table
8. Update SOLUTION-ARCHITECTURE.md §3.4.0.2 to reflect cutover complete
9. Log to Allura Brain

## Dev Notes

- **This is AD-33-gated** — engine mutation requires explicit approval. This story assumes approval to proceed.
- **Do NOT** remove the Neo4j adapter. It stays as fallback for one release.
- **Do NOT** upgrade to `full_ruvector` — that's Stage 2 (native extension), not this story.

## File List

- `src/lib/graph-adapter/factory.ts` (edit — flip default)
- `docs/allura/RISKS-AND-DECISIONS.md` (edit — AD-49 status, RK-32 status, RK-21 mitigation)
- `docs/allura/BLUEPRINT.md` (edit — E2E Readiness Status)
- `docs/allura/SOLUTION-ARCHITECTURE.md` (edit — §3.4.0.2 cutover complete)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |