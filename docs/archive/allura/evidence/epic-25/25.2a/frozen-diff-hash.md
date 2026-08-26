# Story 25.2a frozen diff hash

**Scope:** the complete non-ignored working-tree snapshot versus `HEAD`, including untracked files, except this self-referential hash record.

## Deterministic recipe

Run from the Story 25.2a worktree root with Git's normal clean/smudge rules:

```bash
manifest='docs/archive/allura/evidence/epic-25/25.2a/frozen-diff-hash.md'
tmp_index="$(mktemp)"
trap 'rm -f "$tmp_index"' EXIT
GIT_INDEX_FILE="$tmp_index" git read-tree HEAD
GIT_INDEX_FILE="$tmp_index" git add -A -- . ":(exclude)$manifest"
GIT_INDEX_FILE="$tmp_index" git diff --cached --binary --full-index HEAD | LC_ALL=C sha256sum
GIT_INDEX_FILE="$tmp_index" git diff --cached --name-only -z HEAD | python3 -c 'import sys; print(len(sys.stdin.buffer.read().split(b"\0"))-1)'
```

**SHA-256:** `d54e4f8a81e90d9ed9a6a5761c613ec0d6ac51f5835a7cdc7cdb6c5a95d72c33`

**Frozen changed-file count:** `88`

The hash record is excluded solely to avoid a self-referential digest. Any other tracked modification, deletion, or untracked file changes the digest.

## Provenance

- Base: `HEAD` = `2ff57052` (feat(epic-24): story 24.12 effective-tenant authority seam).
- Context7 receipt: `/websites/postgresql`, current PostgreSQL documentation for transaction-local scope and RLS `USING`/`WITH CHECK`; retrieved through Context7's public raw library because the Docker discovery endpoint required an unavailable API-key secret.
- Strict TDD: direct promotion first failed with zero `withWorkspaceTransaction` calls; first frozen review then exposed the same class in operative RuVector adapter writes, workspace-unscoped proposal/workflow reads, and owner-backed agent linking. Each new test was observed RED before remediation.
- Remediation now requires group/workspace/principal across graph write and promotion workflow contracts; RuVector create/supersede, proposal reads, direct promotion, and agent linking use managed app-role workspace transactions and exact workspace predicates.
- Second-review remediation gives `graph_structural_edges` durable workspace columns, quarantine semantics, composite workspace FK, validated constraints, FORCE RLS, restrictive workspace policy, app-role grants, and symmetric rollback. Graph get/search/list and writer search contracts require explicit workspace/principal; the dedicated adapter E2E suite is in the live lane.
- Strict live RED was **52/59**: missing edge columns plus six stale adapter read-scope calls. Fresh disposable PostgreSQL GREEN is **59/59**, zero failed and zero pending. Evidence: `artifacts/ci/local/25.2a-edge-contract-green/live-db-tests.json`.
- Final focused promotion, adapter, writer, traceable-memory, and Knowledge Hub tests: **89/89 passed**. Full unit lane: **1,904 passed**, 160 predeclared skips. `bun run typecheck`, `bun run lint`, `git diff --check`, Epic 25 drift (8/8/8), 10/10 drift tests, and `bun run build` (53 pages) passed.
- Architecture resolution: direct writer fallback is retired. `MEMORY_BYPASS_KERNEL`, `MEMORY_BYPASS_CONTROL_PLANE=true`, and `memoryWithAdapter()` fail closed. Nine unsupported tenant-only lifecycle methods reject before pool access. Migration 40 recovery refuses every current workspace-scoped graph family, including structural edges.
- Retirement evidence: focused **25/25**, full unit **1,905 passed**, disposable PostgreSQL **59/59** with zero pending, including edge-only rollback refusal. Evidence: `artifacts/ci/local/25.2a-retired-fallback-green/live-db-tests.json`. Typecheck/lint/build/drift/diff gates pass.
- Live Notion Work Board card: `https://app.notion.com/p/3c81d9be65b381538ba0d7bdcb306779?pvs=204`, status **Blocked** pending independent re-review. No Done claim has been made.
- Three review cycles exposed incompatible workspace-scoped and tenant-only architectures. The user selected the fail-closed retirement boundary; all findings were remediated under that decision. **Final unanimous Knuth/Pike/Fowler review is pending for this exact candidate.**
