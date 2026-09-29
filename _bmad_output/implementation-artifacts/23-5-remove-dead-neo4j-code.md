# Story 23-5 — Remove Dead PostgreSQL (graph_memories) Code

**Epic:** Epic 23 — PostgreSQL (graph_memories) Sunset Completion
**Status:** Done — authoritative sprint status
**Priority:** P0-Critical | **Complexity:** Medium
**Agent:** Woz

**Description:**
90+ source files still reference PostgreSQL (graph_memories). Delete the dead PostgreSQL (graph_memories) modules and remove all PostgreSQL (graph_memories) imports from source files. Keep `src/lib/graph-adapter/ruvector-adapter.ts`, `factory.ts`, and `types.ts` — the RuVector adapter is the production path.

## Acceptance Criteria

- [ ] `src/lib/PostgreSQL (graph_memories)/` directory deleted (client.ts, connection.ts, queries/, schema/, agent-nodes.ts)
- [ ] `src/lib/graph-adapter/ruvector-adapter.ts` deleted
- [ ] `src/lib/backup/PostgreSQL (graph_memories).ts` deleted
- [ ] `src/lib/errors/neo4j-errors.ts` deleted
- [ ] All PostgreSQL (graph_memories) imports removed from source files (non-test)
- [ ] PostgreSQL (graph_memories) references in test files updated — tests for deleted modules removed, tests for remaining modules updated to not import PostgreSQL (graph_memories)
- [ ] `bun run typecheck` — 0 errors
- [ ] `bun run test:unit` — 0 failures
- [ ] `grep -r "PostgreSQL (graph_memories)\|PostgreSQL (graph_memories)" src/ --include="*.ts" | grep -v node_modules | wc -l` — 0 (or only historical comments)

## Implementation Files

**Delete:**
- `src/lib/PostgreSQL (graph_memories)/` (entire directory)
- `src/lib/graph-adapter/ruvector-adapter.ts`
- `src/lib/backup/PostgreSQL (graph_memories).ts`
- `src/lib/errors/neo4j-errors.ts`
- All `src/lib/PostgreSQL (graph_memories)/*.test.ts` files
- `src/__tests__/neo4j-writer-errors.test.ts`
- `src/lib/graph-adapter/ruvector-adapter.test.ts`

**Update (remove PostgreSQL (graph_memories) imports/references):**
- All 90+ files identified by grep that reference PostgreSQL (graph_memories)/PostgreSQL (graph_memories)
- Test files that mock neo4j-driver — remove mocks, update assertions

## Dev Notes

This is the biggest story. Work file-by-file:
1. Delete the dead modules first
2. Then fix the imports in files that imported them
3. Then fix the tests that mocked them
4. Run typecheck + tests after each batch

Keep `src/lib/graph-adapter/factory.ts` — it still has the `GRAPH_BACKEND` switch but now only `ruvector` is the active path. Remove the `PostgreSQL (graph_memories)` case from the switch.

Keep `src/lib/graph-adapter/dual-read-adapter.ts` if it's used for drift validation — but if it only reads from PostgreSQL (graph_memories) (dead), delete it.

**Dependencies:** Stories 23.1, 23.2, 23.3 should be done first (they fix the immediate failures). This story does the deep cleanup.

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Delete `src/lib/PostgreSQL (graph_memories)/` directory and all files within
- [ ] 2. Delete `src/lib/graph-adapter/ruvector-adapter.ts`
- [ ] 3. Delete `src/lib/backup/PostgreSQL (graph_memories).ts` and `src/lib/errors/neo4j-errors.ts`
- [ ] 4. Delete neo4j-specific test files
- [ ] 5. Remove PostgreSQL (graph_memories) imports from all source files (batch by directory)
- [ ] 6. Update `factory.ts` — remove PostgreSQL (graph_memories) case from GRAPH_BACKEND switch
- [ ] 7. Update test files — remove PostgreSQL (graph_memories) mocks, update assertions
- [ ] 8. Run typecheck after each batch — fix cascading errors
- [ ] 9. Run test:unit — 0 failures
- [ ] 10. Final grep: `grep -r "PostgreSQL (graph_memories)\|PostgreSQL (graph_memories)" src/ --include="*.ts" | grep -v node_modules` — must be 0 or only comments

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)
