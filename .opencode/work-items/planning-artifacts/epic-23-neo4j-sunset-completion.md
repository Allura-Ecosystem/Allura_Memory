# Epic 23 — Neo4j Sunset Completion — Clean Codebase

> [!NOTE]
> **AI-Assisted Documentation**
> This historical planning record was split from the prior combined epic rollup without changing its stated scope or acceptance content.
> Current delivery status is controlled by [`sprint-status.yaml`](../stories/sprint-status.yaml).
> When in doubt, defer to code, schemas, tests, and the authoritative sprint record.

**Lifecycle status:** Done — authoritative sprint status (retrospective complete)
**Owner:** Brooks (historical delivery record)
**group_id:** `allura-system`
**Migration note:** Source-preserving split from `epics.md` on 2026-08-28 to give every epic one planning file.

**Date:** 2026-07-29
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** The Neo4j container was removed and `GRAPH_BACKEND=ruvector` is the production default, but the codebase still has 90+ source files and 30+ test files referencing Neo4j. There are 25 failing tests (Neo4j fallback paths), 10+ typecheck errors (`Driver | null` vs `Driver | undefined`), and dead code across `src/lib/neo4j/`, `src/lib/graph-adapter/neo4j-adapter.ts`, and `src/lib/backup/neo4j.ts`. This epic cleans the debt so the repo has green tests, clean typecheck, and zero dead Neo4j references.

**Why now:** Every future change is harder with 25 failing tests and broken typecheck. You can't tell if a new change broke something or if it was already broken. The Neo4j sunset was done halfway — container removed, code never cleaned up. This is the completion.

**Stories:**

- **23.1** Fix typecheck errors in `canonical-tools.ts` — 10 `Driver | null` vs `Driver | undefined` errors. The Neo4j driver optional path returns `null` where `undefined` is expected. Fix the type signatures or the callers.
- **23.2** Remove or rewrite Neo4j fallback tests in `writer.test.ts` — 12 tests testing `MEMORY_BYPASS_KERNEL=true` Neo4j fallback path. Neo4j is dead. Delete the tests or rewrite them to test the PostgreSQL-only path.
- **23.3** Fix `target-resolver.test.ts` failures — `validateTenantForWrite` and `neo4jMutate` tests failing because Neo4j path is dead code. Remove the Neo4j mutate path from target-resolver and update tests.
- **23.4** Fix token compliance failures — 19 raw hex colors and 13 deprecated token references. Replace with design tokens.
- **23.5** Remove dead Neo4j code — delete `src/lib/neo4j/` directory (client, connection, queries, schema, agent-nodes), `src/lib/graph-adapter/neo4j-adapter.ts`, `src/lib/backup/neo4j.ts`, `src/lib/errors/neo4j-errors.ts`. Remove Neo4j imports from all 90+ files that reference it. Keep `src/lib/graph-adapter/ruvector-adapter.ts` and `factory.ts` (already production).

**Exit gate:**
- `bun run typecheck` — 0 errors
- `bun run test:unit` — 0 failures (existing 171 skips OK)
- `grep -r "neo4j\|Neo4j" src/ --include="*.ts" | grep -v node_modules | wc -l` — 0 results (or only historical comments in docs)
- No `src/lib/neo4j/` directory
- `src/lib/graph-adapter/neo4j-adapter.ts` deleted
- Git commit with all changes, pushed to origin/main
- Brain log + retrospective
