# Story 25.2a Retrospective — Workspace Scope and Evidence Lifecycle Foundation

**Date:** 2026-08-23
**Review outcome:** Approved by independent Pike + Fowler + Knuth review
**Story state:** Implementation/review unit accepted; story remains dependency-blocked, not Done.

## What was delivered

- A PostgreSQL workspace-scope foundation for proposals, events, evidence requests, immutable governance receipts, and semantic projections.
- Composite tenant/workspace provenance for token, proposal, event, evidence, receipt, and projection relationships.
- Token-derived workspace scope at Watchdog GET/POST; request-selected tenant/workspace values do not confer authority.
- Restricted `allura_app` workspace transactions, managed app-pool lifecycle, and fail-closed legacy curator entry points.
- Scope-preserving watchdog and auto-curator paths with event provenance revalidation.
- Replay-oriented migration policy tightening without a default workspace backfill or destructive legacy-data rewrite.
- Queryable lifecycle records, projection source references, receipt state fields, and migration/rollback evidence.

## Evidence

- Fresh PostgreSQL 16 live lane: **14/14 suites, 38/38 tests passed**.
- TypeScript typecheck: passed.
- Staged diff whitespace check: passed.
- Independent final review: **APPROVE**.
- Validation container/anonymous volume cleanup was explicitly approved and completed. Generated live reports remain ignored local artifacts and are reproducible through the command in `migration-rollback-evidence.md`.

## Review lessons

1. Adding a `workspace_id` column is not authority. Every reader, writer, foreign key, RLS policy, transaction boundary, test fixture, and durable provenance reference must carry the same scope.
2. A restricted DB role is ineffective if a public helper permits arbitrary owner-pool injection or if candidate reads happen before scope enforcement.
3. Live fixtures must be workspace-aware and teardown must close every pool even when an earlier cleanup action fails.
4. Evidence must distinguish tracked narrative from ignored generated reports and must record approved cleanup truthfully.
5. Review iterations found meaningful defects; code review remains a delivery activity, not a ceremonial last step.

## Remaining boundaries

- This story does **not** release approval mutation: Story 24.4 remains the atomic-promotion gate.
- This story does **not** provide the complete scoped retrieval/API contract: Story 25.2 remains blocked until dependencies are reconciled.
- Legacy unscoped events/proposals remain unavailable to workspace-scoped governed readers; no ownership is inferred.
- No browser dashboard, workflow module, Copilot Cowork, Claude Code, Codex adapter, or laptop deployment was released by this story.

## Next dependency-ready work

Reconcile and close the declared prerequisites in dependency order—25.1 scope/product truth and the relevant Epic 24 authority evidence—before changing Story 25.2a to Done or starting the 25.2 read-contract implementation.
