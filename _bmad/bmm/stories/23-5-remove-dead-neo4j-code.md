# Story 23-5 — Remove Dead Neo4j Code

**Epic:** Epic 23 — Neo4j Sunset Completion
**Status:** Done — authoritative sprint status
**Priority:** P0-Critical | **Complexity:** Medium
**Agent:** Woz

**Description:**
90+ source files still reference Neo4j. Delete the dead Neo4j modules and remove all Neo4j imports from source files. Keep `src/lib/graph-adapter/ruvector-adapter.ts`, `factory.ts`, and `types.ts` — the RuVector adapter is the production path.

## Acceptance Criteria

- [ ] `src/lib/neo4j/` directory deleted (client.ts, connection.ts, queries/, schema/, agent-nodes.ts)
- [ ] `src/lib/graph-adapter/neo4j-adapter.ts` deleted
- [ ] `src/lib/backup/neo4j.ts` deleted
- [ ] `src/lib/errors/neo4j-errors.ts` deleted
- [ ] All Neo4j imports removed from source files (non-test)
- [ ] Neo4j references in test files updated — tests for deleted modules removed, tests for remaining modules updated to not import Neo4j
- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run test:unit` — 0 failures
- [ ] `grep -r "neo4j\|Neo4j" src/ --include="*.ts" | grep -v node_modules | wc -l` — 0 (or only historical comments)

## Implementation Files

**Delete:**
- `src/lib/neo4j/` (entire directory)
- `src/lib/graph-adapter/neo4j-adapter.ts`
- `src/lib/backup/neo4j.ts`
- `src/lib/errors/neo4j-errors.ts`
- All `src/lib/neo4j/*.test.ts` files
- `src/__tests__/neo4j-writer-errors.test.ts`
- `src/lib/graph-adapter/neo4j-adapter.test.ts`

**Update (remove Neo4j imports/references):**
- All 90+ files identified by grep that reference neo4j/Neo4j
- Test files that mock neo4j-driver — remove mocks, update assertions

## Dev Notes

This is the biggest story. Work file-by-file:
1. Delete the dead modules first
2. Then fix the imports in files that imported them
3. Then fix the tests that mocked them
4. Run typecheck + tests after each batch

Keep `src/lib/graph-adapter/factory.ts` — it still has the `GRAPH_BACKEND` switch but now only `ruvector` is the active path. Remove the `neo4j` case from the switch.

Keep `src/lib/graph-adapter/dual-read-adapter.ts` if it's used for drift validation — but if it only reads from Neo4j (dead), delete it.

**Dependencies:** Stories 23.1, 23.2, 23.3 should be done first (they fix the immediate failures). This story does the deep cleanup.

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Delete `src/lib/neo4j/` directory and all files within
- [ ] 2. Delete `src/lib/graph-adapter/neo4j-adapter.ts`
- [ ] 3. Delete `src/lib/backup/neo4j.ts` and `src/lib/errors/neo4j-errors.ts`
- [ ] 4. Delete Neo4j-specific test files
- [ ] 5. Remove Neo4j imports from all source files (batch by directory)
- [ ] 6. Update `factory.ts` — remove neo4j case from GRAPH_BACKEND switch
- [ ] 7. Update test files — remove Neo4j mocks, update assertions
- [ ] 8. Run typecheck after each batch — fix cascading errors
- [ ] 9. Run test:unit — 0 failures
- [ ] 10. Final grep: `grep -r "neo4j\|Neo4j" src/ --include="*.ts" | grep -v node_modules` — must be 0 or only comments

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)
