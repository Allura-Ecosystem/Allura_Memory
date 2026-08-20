# Epic 23 Code Review — Neo4j Sunset Completion

**Reviewer:** BMad adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor)
**Date:** 2026-07-29
**Commits reviewed:**
- `fadbdc80` fix(epic-23): stories 23.1-23.3 — typecheck 0 errors, 25 test failures fixed
- `e9934b13` feat(epic-23): stories 23.4-23.5 — token compliance + dead Neo4j code removal

**Scope:** 104 files changed, +1651 / −10328 lines across 2 commits.

---

## Verification Baseline

| Check | Result |
|---|---|
| `bun run typecheck` | ✅ 0 errors |
| `bun run test:unit` | ✅ 1623 passed, 171 skipped, 0 failures |
| Token compliance test | ✅ 0 hex, 0 deprecated (3 token-compliance tests pass) |
| `src/lib/neo4j/` deleted | ✅ Confirmed absent |
| `src/lib/graph-adapter/neo4j-adapter.ts` deleted | ✅ Confirmed absent |
| `src/lib/backup/neo4j.ts` deleted | ✅ Confirmed absent |
| `src/lib/errors/neo4j-errors.ts` deleted | ✅ Confirmed absent |
| `src/lib/graph-adapter/dual-read-adapter.ts` deleted | ✅ Confirmed absent |
| `src/__tests__/neo4j-writer-errors.test.ts` deleted | ✅ Confirmed absent |
| `src/lib/graph-adapter/neo4j-adapter.test.ts` deleted | ✅ Confirmed absent |

---

## Layer 1: Blind Hunter — Bugs, Security, Logic Errors

### canonical-tools.ts: `?? undefined` null normalization

**Assessment:** ✅ Correct but incomplete.

The `getConnections()` in `src/mcp/canonical-tools/connection.ts` returns `neo4j: Driver | null`. The `createGraphAdapter()` signature was changed to accept `neo4j?: unknown` (deprecated, ignored). The `?? undefined` normalization converts `null` → `undefined` to satisfy the optional parameter type. This is functionally correct — the `neo4j` parameter is never read inside `createGraphAdapter()` (verified via grep: zero references to `connections.neo4j` in factory.ts).

However, the **root cause was not fixed**: `connection.ts` still imports `neo4j-driver`, maintains a `neo4jDriver` singleton, and has an active code path that creates a real Neo4j driver when `GRAPH_BACKEND=neo4j` (lines 65-78). The `?? undefined` is a type-level band-aid over a connection layer that should have been cleaned up.

### writer.ts: buildNeo4jBackend removal

**Assessment:** ✅ Clean removal.

- `buildNeo4jBackend()` function fully removed (157 lines deleted).
- `getGraphBackend` import removed (only `createGraphAdapter` is imported now).
- `readTransaction` / `writeTransaction` / `ManagedTransaction` imports from `@/lib/neo4j/connection` removed.
- The `memory()` function now falls back to `buildAdapterBackend()` unconditionally — the `getGraphBackend()` branching is gone.
- Grep confirms zero references to `buildNeo4jBackend` in source files.

### target-resolver.ts: neo4jMutate / neo4jQuery removal

**Assessment:** ✅ Clean removal, all callers updated.

- `neo4jMutate()` and `neo4jQuery()` functions fully removed (79 lines).
- `VALID_LABELS` set and `validateLabel()` helper removed.
- `randomUUID` import removed (was only used by neo4jMutate).
- `readTransaction` / `writeTransaction` imports from `@/lib/neo4j/connection` removed.
- The `resolveTarget()` function's `neo4j` prefix branch is removed; error message updated to `"Supported prefixes: pg"`.
- Test file `target-resolver.test.ts` updated: Neo4j mock removed, `assertRegisteredTenant` mock added, 2 Neo4j test cases removed. Tests pass.

### factory.ts: neo4j case removed from GRAPH_BACKEND switch

**Assessment:** ⚠️ Silent fallback — no backward compat error.

`getGraphBackend()` now has this logic:
```ts
const value = process.env.GRAPH_BACKEND?.toLowerCase()
if (value === "ruvector-crate") return "ruvector-crate"
return "ruvector"  // ← any other value, including "neo4j", silently falls back
```

If `GRAPH_BACKEND=neo4j` is still set in `.env`, the factory **silently** selects `ruvector` rather than throwing a clear error. This masks a misconfiguration. See Edge Case Hunter finding below.

The `GraphBackend` type was narrowed to `"ruvector" | "ruvector-crate"` — the `"neo4j"` union member is removed. The `createGraphAdapter()` and `isGraphAdapterAvailable()` signatures now accept `neo4j?: unknown` (deprecated, ignored). The barrel export `index.ts` no longer exports `Neo4jGraphAdapter` or `DualReadAdapter`.

### knowledge-promotion.ts: PostgreSQL rewrite — SQL injection + transaction safety

**Assessment:** ⚠️ No SQL injection risk, but missing transaction wrapping.

**SQL injection:** ✅ Safe. All queries use parameterized placeholders (`$1`, `$2`, etc.). No string interpolation of user input into SQL. The `ILIKE '%' || $N || '%'` pattern in retrieval-layer.ts is also safe (parameter bound, concatenated in SQL).

**Missing transaction:** ⚠️ The `promoteToNeo4j()` function performs two INSERTs without a transaction:
1. `INSERT INTO graph_memories ...` (line 777)
2. `INSERT INTO graph_supersedes ...` (line 784)

If the second INSERT fails (e.g., FK constraint, duplicate key), the first INSERT has already committed — leaving an orphaned memory node without the SUPERSEDES relationship. This is a data integrity risk for the versioning chain.

**Error handling:** ✅ Adequate. The `try/catch` wraps both branches and re-throws as `KnowledgePromotionError`. The `linkInsightToAgent()` function has non-fatal error handling (logs and continues).

**Naming:** ⚠️ The function is still named `promoteToNeo4j()` and the alias `Neo4jPromotionError = KnowledgePromotionError` is exported. The `updateNotionWithNeo4jId()` function also retains its Neo4j name. These are misleading since the implementation no longer touches Neo4j.

### in-process-executor.ts: executeCypher — SQL injection risk

**Assessment:** 🔴 CRITICAL — Raw SQL execution without parameterization or tenant scoping.

The `executeCypher()` function (skill-cypher-query) was rewritten to execute raw SQL:
```ts
const sql = String(input.cypher ?? "")
assertReadOnlySQL(sql)
const pool = getPool()
const result = await pool.query(sql)  // ← raw string, no parameters
```

**Issues:**
1. **No parameterization:** The user-provided SQL string is passed directly to `pool.query()`. The mutation keyword regex guard (`SQL_MUTATION_RE`) only blocks DML keywords — it does not prevent data exfiltration via `UNION SELECT`, subqueries, or `COPY ... TO PROGRAM`.
2. **Tenant scoping discarded:** `groupId` is validated but then discarded (`void groupId`). The query is not scoped to the tenant — a caller can read any group's data.
3. **Input field still named `cypher`:** The function accepts `input.cypher` as the SQL string, which is confusing.

The `recallInsight()` function in the same file is correctly parameterized.

---

## Layer 2: Edge Case Hunter

### GRAPH_BACKEND=neo4j still set in .env

**Assessment:** ⚠️ WARNING — Silent fallback, no error.

If `GRAPH_BACKEND=neo4j` is still set:
- `factory.ts` → `getGraphBackend()` returns `"ruvector"` silently (the `neo4j` value is not matched, falls through to default `return "ruvector"`).
- `connection.ts` → `getConnections()` enters the Neo4j driver creation path (line 65-78), requires `NEO4J_PASSWORD`, and will throw `"NEO4J_PASSWORD environment variable is required"` — a confusing error that doesn't mention the sunset.
- `health/metrics/route.ts` → Still dynamically imports `neo4j-driver` and attempts to connect (line 156-171). This will fail and report `neo4jStatus = "unhealthy"` — but the health endpoint should not be checking Neo4j at all.

**Recommendation:** `getGraphBackend()` should throw a clear deprecation error when `GRAPH_BACKEND=neo4j`:
```ts
if (value === "neo4j") throw new Error("GRAPH_BACKEND=neo4j is no longer supported. Neo4j has been sunset — use GRAPH_BACKEND=ruvector (default) or GRAPH_BACKEND=ruvector-crate.")
```

### Importing from deleted `src/lib/neo4j/` path

**Assessment:** ✅ Adequate for source files, ⚠️ Scripts use throwing stub.

Source files that imported from `@/lib/neo4j/*` have been updated. The deleted directory no longer exists, so TypeScript would catch any remaining imports at compile time (and typecheck passes).

For scripts, a `scripts/lib/neo4j-stub.ts` was created that exports all previously-available functions as throw-on-call stubs. 20+ scripts import from this stub. The error message is clear: `"Neo4j is sunset — use PostgreSQL (pgvector) instead"`. However, any script that calls these functions will fail at runtime.

### Test mocks vs actual function signatures

**Assessment:** ✅ Correct.

- `writer.test.ts`: Neo4j driver mock and session mock fully removed. The `neo4j-driver` vi.mock() is deleted. Tests now only test the control plane and adapter backends. Tests pass (1623/1623).
- `target-resolver.test.ts`: Neo4j connection mock replaced with `assertRegisteredTenant` mock. Test numbering updated (tests 5-8 renumbered to 5-6). Tests pass.
- `backup-automation.test.ts`: `backupNeo4j` import removed. `ALL_BACKUP_TYPES` assertion updated (removed `neo4j`, kept `config`). `getDefaultConfig` assertions updated to remove neo4j fields. Module export assertion updated. Tests pass.
- `sync-contract.test.ts`: Updated (91 lines changed). Tests pass.
- `knowledge-promotion-approval-guard.test.ts`: Updated (48 lines changed). Tests pass.

### Remaining active Neo4j code paths

**Assessment:** ⚠️ WARNING — Two source files still have active Neo4j runtime code.

1. **`src/mcp/canonical-tools/connection.ts`** (lines 65-78): Still creates a real Neo4j driver when `GRAPH_BACKEND` is not `ruvector`/`ruvector-crate`. Imports `neo4j-driver` directly.

2. **`src/app/api/health/metrics/route.ts`** (lines 156-171): Still dynamically imports `neo4j-driver` and attempts to connect to Neo4j for health metrics. Always reports Neo4j status (healthy/degraded/unhealthy).

3. **`src/lib/retrieval/startup-validator.ts`** (lines 33-104): Full Neo4j health check suite — `getNeo4jDriver()`, `checkNeo4jMemoryIndex()`, `checkNeo4jSchemaLabels()`. The `validateStartup()` function (line 130-140) actively tries to connect to Neo4j and will report failure.

These were not cleaned up in Epic 23 and represent remaining dead code that will cause runtime errors or misleading health reports.

---

## Layer 3: Acceptance Auditor

### Story 23.1: Fix typecheck errors — ✅ PASS

- `bun run typecheck` → 0 errors (verified)
- `Driver | null` → `?? undefined` normalization applied in all 10 call sites in `canonical-tools.ts`
- `content-aware-curator-v2.ts` argument count error fixed (added `tenantConfig` parameter)
- `content-aware-curator.ts` InsightInsert property error fixed (changed `score` → `confidence`, `tier` → `topic_key`)

### Story 23.2: Remove Neo4j fallback tests in writer.test.ts — ✅ PASS

- 12 Neo4j fallback tests removed (457 lines deleted)
- Neo4j driver mock, session mock, and env vars removed
- Remaining tests pass (control plane + adapter backends only)

### Story 23.3: Fix target-resolver.test.ts — ✅ PASS

- Neo4j connection mock replaced with tenant existence mock
- 2 Neo4j test cases removed (neo4j:Entity insert, neo4j:Query read)
- Test renumbered (8 → 6 tests)
- Tests pass

### Story 23.4: Fix token compliance — ✅ PASS

- Token compliance tests pass: 0 hex colors, 0 deprecated tokens
- 3 token compliance test cases all green
- Dashboard component files updated (command-palette, dashboard-header, graph components, inspector views)

### Story 23.5: Remove dead Neo4j code — ⚠️ PARTIAL PASS

**Completed:**
- `src/lib/neo4j/` directory deleted ✅
- `src/lib/graph-adapter/neo4j-adapter.ts` deleted ✅
- `src/lib/backup/neo4j.ts` deleted ✅
- `src/lib/errors/neo4j-errors.ts` deleted ✅
- `src/lib/graph-adapter/dual-read-adapter.ts` deleted ✅
- Neo4j-specific test files deleted ✅
- `factory.ts` neo4j case removed from switch ✅
- `typecheck` 0 errors ✅
- `test:unit` 0 failures ✅

**NOT completed (exit gate criteria):**
- `grep -r "neo4j\|Neo4j" src/ --include="*.ts" | grep -v node_modules | wc -l` → **843 results** (exit gate says 0 or only historical comments)
  - 465 in source files, 378 in test files
  - Many are comments/docs, but several are **active runtime code**:
    - `src/mcp/canonical-tools/connection.ts` — active `neo4j-driver` import + driver creation
    - `src/app/api/health/metrics/route.ts` — active `neo4j-driver` dynamic import + health check
    - `src/lib/retrieval/startup-validator.ts` — active Neo4j health check functions
    - `src/team-ram/orchestrator.ts` — `skill-neo4j-memory` skill name in type definition

---

## Findings Summary

### 🔴 CRITICAL (must fix before merge)

**C1. `in-process-executor.ts`: `executeCypher()` executes raw SQL without parameterization or tenant scoping**

The function passes user-provided SQL directly to `pool.query(sql)` with only a mutation-keyword regex guard. This allows:
- Data exfiltration via `UNION SELECT`, subqueries, or `COPY ... TO PROGRAM`
- Cross-tenant data access (groupId is validated but discarded — `void groupId`)
- The mutation guard can be bypassed with creative SQL (e.g., `WITH` clauses, CTEs with side effects via functions)

**Fix:** Either (a) remove `executeCypher` entirely if it's no longer needed, or (b) enforce parameterized queries only and scope all queries to the validated `groupId`. At minimum, add `group_id` filtering to every query and reject queries that reference tables without tenant scoping.

---

### ⚠️ WARNING (should fix)

**W1. `knowledge-promotion.ts`: `promoteToNeo4j()` performs two INSERTs without a transaction**

The supersede path inserts into `graph_memories` then `graph_supersedes` as separate statements. If the second INSERT fails, the first has committed — orphaning a memory node without its SUPERSEDES relationship, breaking the version chain.

**Fix:** Wrap both INSERTs in a `pool.connect()` + `client.query('BEGIN')` / `COMMIT` transaction.

**W2. `factory.ts`: `GRAPH_BACKEND=neo4j` silently falls back to `ruvector`**

No error or warning is emitted. A misconfigured `.env` with `GRAPH_BACKEND=neo4j` will silently use ruvector, masking the issue. The connection layer (`connection.ts`) will still try to create a Neo4j driver and throw a confusing `NEO4J_PASSWORD` error.

**Fix:** Add `if (value === "neo4j") throw new Error("GRAPH_BACKEND=neo4j is no longer supported...")` in `getGraphBackend()`.

**W3. `connection.ts` still has active Neo4j driver creation path**

`src/mcp/canonical-tools/connection.ts` lines 65-78 still create a real Neo4j driver when `GRAPH_BACKEND` is not `ruvector`/`ruvector-crate`. This is dead code that will cause runtime errors if triggered.

**Fix:** Remove the Neo4j driver creation block entirely. Return `{ pg: pgPool, neo4j: null }` unconditionally. Remove the `neo4j-driver` import.

**W4. `health/metrics/route.ts` still checks Neo4j health**

The health metrics endpoint dynamically imports `neo4j-driver` and attempts to connect. It will always report Neo4j as unhealthy/degraded. This produces misleading health metrics.

**Fix:** Remove the Neo4j health check block (lines 146-172). Remove Neo4j from the response schema. Clean up the degraded-mode counters that query `neo4j_unavailable` events (or keep as historical metrics).

**W5. `startup-validator.ts` still has full Neo4j health check suite**

`src/lib/retrieval/startup-validator.ts` has `getNeo4jDriver()`, `checkNeo4jMemoryIndex()`, `checkNeo4jSchemaLabels()`, and the `validateStartup()` function actively calls them (lines 130-140). This will always report Neo4j connection failure.

**Fix:** Remove the Neo4j check functions and the Neo4j check block in `validateStartup()`. Remove the `neo4j_url` from `RetrievalConfig` if no longer needed.

**W6. `scripts/content-aware-curator.ts` uses throwing stub — broken at runtime**

The script imports `createInsight` from `./lib/neo4j-stub`, which throws `"Neo4j is sunset"` on call. The script is functionally broken — it cannot promote insights. Other scripts (`batch-approve-proposals.ts`, `curator-batch-triage.ts`, `approve-proposals-by-id.ts`, `e2e-validation-gate.ts`) have the same issue.

**Fix:** Either rewrite these scripts to use PostgreSQL directly (as was done for `approve-cli.ts`), or add a clear deprecation notice and remove them from the scripts directory.

**W7. Exit gate not met: 843 Neo4j references remain in src/**

The exit gate states `grep -r "neo4j\|Neo4j" src/ --include="*.ts" | grep -v node_modules | wc -l` should be 0 (or only historical comments). 843 references remain, including active runtime code in 3 source files. While many are comments, the active code paths in W3-W5 are not "historical comments."

---

### 💡 SUGGESTION (nice to have)

**S1. Rename `promoteToNeo4j()` → `promoteToKnowledgeGraph()`**

The function no longer touches Neo4j. The name is misleading. Similarly, `updateNotionWithNeo4jId()` → `updateNotionWithGraphId()`. Export a deprecation alias for backward compatibility.

**S2. `Neo4jPromotionError` alias should be marked deprecated with a JSDoc `@deprecated` tag**

Currently it's `export const Neo4jPromotionError = KnowledgePromotionError;` with a comment, but no `@deprecated` JSDoc annotation that IDEs would surface.

**S3. `in-process-executor.ts`: `recallInsight()` uses `id AS topic_key` — semantically incorrect**

The query maps `id` to both `insight_id` and `topic_key`, which are different concepts. The original Neo4j query had `i.topic_key` as a separate field. If `graph_memories` doesn't have a `topic_key` column, this should return `null` or be removed from the result shape.

**S4. `scripts/lib/neo4j-stub.ts` — consider adding a `@deprecated` module-level JSDoc**

The stub file is well-documented as deprecated, but adding `@deprecated` at the module level would surface warnings in IDEs when scripts import from it.

**S5. `group-governance.ts`: `Neo4jGroupIdReport` renamed to `GraphGroupIdReport` but `GroupIdGovernanceReport.neo4j` → `.graph` — verify all consumers updated**

The interface field was renamed from `neo4j` to `graph`. Any code consuming `report.neo4j` would break. Typecheck passes, but runtime consumers in scripts might access the old field name via `any`-typed variables.

**S6. `in-process-executor.ts`: redundant `assertReadOnlySql` function**

Two read-only guard functions exist: `assertReadOnlySql` (line 64, pre-existing) and `assertReadOnlySQL` (line 42, new). The new one duplicates the old one with different keywords. Consolidate into one.

---

## Verdict

The Epic 23 work successfully achieved its primary goals: typecheck is clean (0 errors), all tests pass (1623/1623), token compliance is green, and the major dead Neo4j modules are deleted. The 91-file cleanup removed ~10,328 lines of dead code.

However, the exit gate criterion for Neo4j reference elimination is **not met** — 843 references remain, including **active runtime code** in 3 source files (`connection.ts`, `health/metrics/route.ts`, `startup-validator.ts`) that will cause runtime errors or misleading health reports.

The **CRITICAL** finding (C1) is a security regression: `executeCypher()` in `in-process-executor.ts` now executes raw, unparameterized SQL without tenant scoping. This must be fixed before merge.

**Recommendation:** Fix C1 before merge. Address W1-W3 before merge (data integrity + silent misconfiguration). Track W4-W7 as follow-up stories for a "Neo4j Sunset Completion — Phase 2" cleanup.