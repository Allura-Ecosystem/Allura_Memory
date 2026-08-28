# Story 23-2 — Remove Neo4j Fallback Tests in writer.test.ts

**Epic:** Epic 23 — Neo4j Sunset Completion
**Status:** Done — authoritative sprint status
**Priority:** P0-Critical | **Complexity:** Small
**Agent:** Woz

**Description:**
12 tests in `src/lib/memory/writer.test.ts` test the `MEMORY_BYPASS_KERNEL=true` Neo4j fallback path (createEntity, createRelationship with Cypher, session.run mocks). Neo4j is dead. These tests reference a code path that should no longer exist. Delete the Neo4j fallback tests or rewrite them to test the PostgreSQL-only control plane path.

## Acceptance Criteria

- [ ] No tests reference `MEMORY_BYPASS_KERNEL=true` Neo4j fallback
- [ ] No tests mock `neo4j-driver` session.run/createEntity/createRelationship Cypher
- [ ] `bun run test:unit` — 0 failures from writer.test.ts
- [ ] If the Neo4j fallback code path in writer.ts still exists, remove it (dead code)
- [ ] No new test failures introduced

## Implementation Files

- `src/lib/memory/writer.test.ts` — delete or rewrite Neo4j fallback test block
- `src/lib/memory/writer.ts` — remove Neo4j fallback code path if present

## Dev Notes

The writer.ts had a bypass path where `MEMORY_BYPASS_KERNEL=true` would write directly to Neo4j using Cypher. With Neo4j sunset, this path is dead. Remove the code and tests together.

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Identify all Neo4j fallback tests in writer.test.ts
- [ ] 2. Remove the Neo4j fallback code path from writer.ts (if present)
- [ ] 3. Delete the Neo4j fallback tests from writer.test.ts
- [ ] 4. Run test:unit — writer.test.ts must have 0 failures
- [ ] 5. Verify no other tests depend on the removed code path

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)
