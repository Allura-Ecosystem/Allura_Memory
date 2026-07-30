# Story 23-3 — Fix target-resolver.test.ts Failures

**Epic:** Epic 23 — Neo4j Sunset Completion
**Status:** ready-for-dev
**Priority:** P0-Critical | **Complexity:** Small
**Agent:** Woz

**Description:**
Tests in `src/kernel/target-resolver.test.ts` are failing because `validateTenantForWrite` and `neo4jMutate` reference the dead Neo4j path. The `neo4jMutate` function in target-resolver.ts calls Neo4j which no longer exists. Remove the Neo4j mutate path and update tests.

## Acceptance Criteria

- [ ] `neo4jMutate` function removed from `src/kernel/target-resolver.ts`
- [ ] `validateTenantForWrite` no longer references Neo4j
- [ ] `bun run test:unit` — 0 failures from target-resolver.test.ts
- [ ] No new test failures introduced

## Implementation Files

- `src/kernel/target-resolver.ts` — remove `neo4jMutate` function, keep `pgMutate` path
- `src/kernel/target-resolver.test.ts` — remove tests for `neo4jMutate`

## Dev Notes

The target-resolver had two paths: `pgMutate` (PostgreSQL) and `neo4jMutate` (Neo4j). With Neo4j sunset, only `pgMutate` should remain. The kernel write path (AD-40) goes through PostgreSQL only.

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Remove `neo4jMutate` from target-resolver.ts
- [ ] 2. Update target-resolver.test.ts — remove neo4jMutate tests
- [ ] 3. Run test:unit — target-resolver.test.ts must have 0 failures
- [ ] 4. Verify no other files call `neo4jMutate`

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)