# Story 23-1 — Fix Typecheck Errors in canonical-tools.ts

**Epic:** Epic 23 — Neo4j Sunset Completion
**Status:** Done — authoritative sprint status
**Priority:** P0-Critical | **Complexity:** Small
**Agent:** Woz

**Description:**
10 typecheck errors in `src/mcp/canonical-tools.ts` — all `Type 'Driver | null' is not assignable to type 'Driver | undefined'`. The Neo4j driver optional path returns `null` where `undefined` is expected. Also 2 errors in `scripts/content-aware-curator*.ts`.

## Acceptance Criteria

- [ ] `bun run typecheck` produces 0 errors
- [ ] No `Driver | null` assignments remain in canonical-tools.ts
- [ ] scripts/content-aware-curator*.ts errors fixed
- [ ] No new test failures introduced

## Implementation Files

- `src/mcp/canonical-tools.ts` — fix 10 `Driver | null` → `Driver | undefined` or change type signature
- `scripts/content-aware-curator-v2.ts` — fix argument count error (line 155)
- `scripts/content-aware-curator.ts` — fix `InsightInsert` property error (line 140)

## Dev Notes

The Neo4j driver was made optional (Neo4j sunset). When absent, the code returns `null` but the type signatures expect `undefined`. Simplest fix: change the type to accept `null` or normalize `null` → `undefined` at the assignment site.

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Fix 10 `Driver | null` type errors in canonical-tools.ts
- [ ] 2. Fix content-aware-curator-v2.ts argument count error
- [ ] 3. Fix content-aware-curator.ts InsightInsert property error
- [ ] 4. Run typecheck — must be 0 errors
- [ ] 5. Run test:unit — no new failures beyond existing 25 (which stories 23.2/23.3 fix)

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)
