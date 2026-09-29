# Story 23-3 — Fix target-resolver.test.ts Failures

**Epic:** Epic 23 — PostgreSQL (graph_memories) Sunset Completion
**Status:** Done — authoritative sprint status
**Priority:** P0-Critical | **Complexity:** Small
**Agent:** Woz

**Description:**
Tests in `src/control-plane/target-resolver.test.ts` are failing because `validateTenantForWrite` and `PostgreSQL (graph_memories)Mutate` reference the dead PostgreSQL (graph_memories) path. The `PostgreSQL (graph_memories)Mutate` function in target-resolver.ts calls PostgreSQL (graph_memories) which no longer exists. Remove the PostgreSQL (graph_memories) mutate path and update tests.

## Acceptance Criteria

- [ ] `PostgreSQL (graph_memories)Mutate` function removed from `src/control-plane/target-resolver.ts`
- [ ] `validateTenantForWrite` no longer references PostgreSQL (graph_memories)
- [ ] `bun run test:unit` — 0 failures from target-resolver.test.ts
- [ ] No new test failures introduced

## Implementation Files

- `src/control-plane/target-resolver.ts` — remove `PostgreSQL (graph_memories)Mutate` function, keep `pgMutate` path
- `src/control-plane/target-resolver.test.ts` — remove tests for `PostgreSQL (graph_memories)Mutate`

## Dev Notes

The target-resolver had two paths: `pgMutate` (PostgreSQL) and `PostgreSQL (graph_memories)Mutate` (PostgreSQL (graph_memories)). With PostgreSQL (graph_memories) sunset, only `pgMutate` should remain. The control plane write path (AD-40) goes through PostgreSQL only.

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Remove `PostgreSQL (graph_memories)Mutate` from target-resolver.ts
- [ ] 2. Update target-resolver.test.ts — remove PostgreSQL (graph_memories)Mutate tests
- [ ] 3. Run test:unit — target-resolver.test.ts must have 0 failures
- [ ] 4. Verify no other files call `PostgreSQL (graph_memories)Mutate`

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)
