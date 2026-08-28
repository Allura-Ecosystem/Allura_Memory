# Story 18.4 — Update REQUIREMENTS-MATRIX.md REQ-RV-001..005

**Status:** Done — authoritative sprint status
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 18

## User Story

As the Allura requirements owner, I need the Requirements Matrix updated with RuVector graph cutover requirements (REQ-RV-001 through REQ-RV-005), so that the B# → F# traceability covers the graph backend migration and the cutover gates are documented.

## Context

- Current matrix has REQ-GOV-003..009 (Carlos/RuVector/RuVix readiness) but nothing about the graph adapter cutover
- The graph adapter is AD-029, the cutover is AD-49 — both need requirement coverage
- Graduation criteria from the cutover need to be traceable requirements

## Acceptance Criteria

- [x] AC-1: New "Section 6C: RuVector Graph Cutover Requirements (REQ-RV-001–REQ-RV-005)" is added
- [x] AC-2: REQ-RV-001 — `IGraphAdapter` seam must back all graph operations; no direct Neo4j/PG graph calls outside the adapter
- [x] AC-3: REQ-RV-002 — `GRAPH_BACKEND` flag must default to `neo4j` until live-DB E2E passes with `ruvector`
- [x] AC-4: REQ-RV-003 — Parity test (`adapter-parity.test.ts`) must pass 14/14 before any cutover
- [x] AC-5: REQ-RV-004 — Dual-read validation must run for one release cycle before Neo4j goes read-only
- [x] AC-6: REQ-RV-005 — `runtime_readiness` label may upgrade from `pgvector_bridge` to `ruvector_graph` only after live-DB E2E + dual-read pass; to `full_ruvector` only after native extension activates
- [x] AC-7: Each REQ-RV entry has the 3-column format: ID | Requirement | Satisfied by (with cross-refs to AD-029, AD-49, RK-32, SOLUTION-ARCHITECTURE.md §3.4.0.2)
- [x] AC-8: AI-Assisted Documentation notice preserved

## Tasks

1. Read current Section 6A.1 (Carlos/RuVector/RuVix Readiness Requirements) for pattern
2. Read AD-029 and AD-49 (after Story 18.1 promotes)
3. Add Section 6C with REQ-RV-001..005
4. Cross-reference AD-029, AD-49, RK-32, SOLUTION-ARCHITECTURE.md §3.4.0.2, DATA-DICTIONARY.md graph adapter tables
5. Run `git diff --check`

## Dev Agent Record

| Date | Action | Agent | Notes |
|------|--------|-------|-------|
| 2026-07-12 | Story executed | Woz | Added Section 6C with REQ-RV-001..005; verified AC-1 through AC-8; `git diff --check` passed |

## File List

- `docs/allura/REQUIREMENTS-MATRIX.md` (edit — added Section 6C with REQ-RV-001..005, replaced Section 6C header)
- `_bmad/bmm/stories/18-4-update-requirements-matrix-req-rv.md` (edit — completed Tasks, added Dev Agent Record)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |
| 2026-07-12 | Added Section 6C (REQ-RV-001..005), completed Tasks, added Dev Agent Record | Woz |
