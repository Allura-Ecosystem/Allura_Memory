# Story 19.1 — Live-DB E2E with GRAPH_BACKEND=ruvector

**Status:** ready-for-dev
**Owner:** Brooks → Knuth + Woz
**group_id:** allura-system
**Epic:** 19

## User Story

As the Allura data architect, I need the 10-point acceptance gate run against live Docker PostgreSQL with `GRAPH_BACKEND=ruvector`, so that we have evidence the RuVector graph adapter works end-to-end against a real database (not DB-mocked) before flipping the default.

## Context

- The parity test (`adapter-parity.test.ts`) passes 14/14 but is DB-mocked
- RK-32 sub-risk R5: "No live-DB E2E proof" is the gating item for the cutover
- The 10-point acceptance gate was defined for the engine acceptance (BLUEPRINT.md E2E Readiness Status)
- `GRAPH_BACKEND=neo4j` is the current default; `GRAPH_BACKEND=ruvector` uses PG tables
- Docker Postgres is running (knowledge-postgres container, port 5432, healthy)

## Acceptance Criteria

- [ ] AC-1: The 10-point engine acceptance gate runs against live Docker PostgreSQL with `GRAPH_BACKEND=ruvector` set in the environment
- [ ] AC-2: All 10 engine unit/integration tests pass against real PostgreSQL (not mocked)
- [ ] AC-3: Memory CRUD operations (create, read, search, list, count, export) work through the RuVector graph adapter
- [ ] AC-4: SUPERSEDES immutability is verified — new node created, old node marked deprecated, no history mutation
- [ ] AC-5: `group_id` scoping is verified — own-tenant retrieval returns data, foreign-tenant returns empty
- [ ] AC-6: Full-text search works via PG `tsvector` (replaces Neo4j fulltext index)
- [ ] AC-7: Structural context (Agent/Project/Task nodes + edges) is written through `memory/writer.ts` → `graph_structural_nodes/edges`
- [ ] AC-8: Evidence is captured: test output, timing, any failures with stack traces
- [ ] AC-9: If any test fails, the failure is documented with root cause analysis (not just "it failed")
- [ ] AC-10: The test run does NOT flip the default — `GRAPH_BACKEND=neo4j` remains the production default

## Tasks

1. Read `scripts/e2e-validation-gate.ts` or equivalent E2E test runner
2. Read `src/lib/graph-adapter/factory.ts` to understand how `GRAPH_BACKEND` is set
3. Read `src/lib/graph-adapter/__tests__/adapter-parity.test.ts` for the 14/14 parity coverage
4. Set `GRAPH_BACKEND=ruvector` in the test environment (env var, not code change)
5. Run the 10-point acceptance gate against live Docker PostgreSQL
6. Capture full test output with timing
7. Verify SUPERSEDES immutability specifically (create new, check old is deprecated, check no mutation)
8. Verify group_id scoping (write to allura-test, try to read from allura-other, confirm empty)
9. Verify full-text search via tsvector
10. Document results — pass/fail per test, any failures with root cause

## Dev Notes

- **Do NOT** flip the default in `factory.ts`. This is a test run with the env var set, not a cutover.
- **Do NOT** run against the production `allura-system` group_id. Use `allura-test-e2e` or similar isolated tenant.
- **Pattern to follow:** The existing E2E validation gate (`scripts/e2e-validation-gate.ts`) if it exists, or the engine acceptance tests referenced in BLUEPRINT.md.
- If the E2E gate doesn't exist as a single script, run the individual tests that make up the 10-point gate.

## Previous Learnings

- RK-32 R5: "No live-DB E2E proof — parity tests pass but are DB-mocked. The 10-point acceptance gate has not run against live Docker Postgres with GRAPH_BACKEND=ruvector. This is the real 'ready' gate."
- The worktree may not have `.env` — if live DB connection fails, copy `.env` from the main checkout or set the connection string explicitly.

## File List

- (No doc changes expected — this is a test run. If evidence is captured, write to `docs/archive/allura/evidence/` or Brain.)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |