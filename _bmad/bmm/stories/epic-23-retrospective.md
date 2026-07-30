# Retrospective — Epic 23: Neo4j Sunset Completion

**Date:** 2026-07-29
**Epic:** 23 — Neo4j Sunset Completion — Clean Codebase
**Facilitator:** Brooks (Gilliam)
**Team:** Woz (builder), Pike/Fowler (review gates)

---

## Epic Summary

| Metric | Before | After |
|--------|--------|-------|
| Typecheck errors | 10+ | 0 |
| Test failures | 25 | 0 |
| Tests passing | 1598 | 1623 |
| Dead Neo4j files | ~20 | 0 (deleted) |
| Files changed | — | 91 |
| Lines deleted | — | ~10,328 |
| Lines added | — | ~1,651 |
| Token compliance | 19 hex + 13 deprecated | 0 + 0 |
| Commits | — | 3 |
| Source files with Neo4j refs | 90+ | ~20 (mostly comments + defensive checks) |

## What Went Well

1. **Parallel dispatch worked perfectly.** Stories 23.1-23.3 touched different files (canonical-tools.ts, writer.ts, target-resolver.ts) so 3 subagents ran in parallel with zero conflicts. Each finished in ~5 minutes.

2. **The foundation-first approach was right.** Fixing typecheck and test failures (23.1-23.3) before the big cleanup (23.5) meant the subagent doing the cleanup could verify its work against a green baseline.

3. **Code review caught a real security issue.** The adversarial review found `executeCypher()` executing raw SQL without tenant scoping — a genuine security regression that would have shipped without the review gate.

4. **Token compliance was quick and clean.** 19 hex colors and 13 deprecated tokens fixed across 13 files in one pass. Simple story, high value.

## What Didn't Go Well

1. **Story 23.5 was too big for one subagent.** 90+ files needed updating. The first subagent deleted the dead modules and rewrote core files but left 60 cascading typecheck errors and 5 test failures. A second subagent was needed to finish the cleanup. Should have split 23.5 into two stories: "delete dead modules + rewrite core files" and "fix cascading imports in scripts + tests."

2. **The exit gate for "0 Neo4j references" was unrealistic.** 843 references remain — mostly comments, defensive checks, and the `neo4j-driver` type import. The gate should have said "0 active Neo4j runtime code paths" instead of "0 grep results." The gate was too strict and the code review correctly flagged this as a partial pass.

3. **Gilliam started on the wrong repo.** Earlier in the session, I spent 20 minutes looking at a stale repo clone and dispatched a subagent to build obsolete Epic 10 work. The Captain had to redirect me. The lesson: search Allura Brain + session history BEFORE touching files.

4. **No transaction wrapping in promoteToNeo4j().** The rewrite of knowledge-promotion.ts did two INSERTs without a transaction. The code review caught this (W1), but it should have been in the original implementation. When rewriting code that does multiple dependent writes, transaction wrapping is not optional.

## Key Insights

1. **Neo4j sunset was a 3-epic process, not one.** Epic 19 flipped the default. Epic 22 removed the container. Epic 23 cleaned the code. Each was necessary. Skipping the cleanup phase leaves a codebase that looks done but has 25 failing tests and broken typecheck.

2. **Subagents are fast but need scoping.** 5 stories, 6 subagent dispatches, ~35 minutes total wall time. But the big story (23.5) needed two passes because it wasn't scoped tightly enough.

3. **Code review gates prevent real security regressions.** The `executeCypher()` raw SQL issue was introduced by the Neo4j→PostgreSQL rewrite. Without the adversarial review, it would have shipped to production.

## Action Items

### Process
1. **Split large cleanup stories** — if a story touches 90+ files, split it into "delete + rewrite core" and "fix cascading imports" — Owner: Brooks
2. **Realistic exit gates** — use "0 active runtime code paths" not "0 grep results" for sunset stories — Owner: Brooks

### Technical (tracked as follow-up)
1. **W4: health/metrics/route.ts** still checks Neo4j health — remove the block
2. **W5: startup-validator.ts** still has Neo4j check functions — remove them
3. **W6: scripts using throwing stubs** — rewrite or deprecate
4. **S1: Rename promoteToNeo4j() → promoteToKnowledgeGraph()** — misleading name
5. **Clean up remaining 843 Neo4j references** — mostly comments, but tidy up

### Team Agreements
- Always search Allura Brain + session history before starting work
- Transaction-wrap all multi-write operations
- Run code review after every epic, not just when "it feels done"

## Readiness Assessment

| Dimension | Status |
|-----------|--------|
| Typecheck | ✅ 0 errors |
| Tests | ✅ 1623 passed, 0 failed |
| Token compliance | ✅ 0 hex, 0 deprecated |
| Dead code removed | ✅ src/lib/neo4j/ deleted |
| Code review | ✅ C1 fixed, W1-W3 fixed, W4-W7 tracked |
| Pushed to GitHub | ✅ commit e9e0eb22 on main |

## Next Steps

1. Track W4-W7 as follow-up stories (Neo4j Sunset Phase 2)
2. Define Epic 24 — what to build next on the clean foundation
3. Consider SOC2 hardening or product layer (chat, dashboard) as next priority