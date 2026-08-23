# Story 25.2a — Migration, rollback, and live-lane evidence

**Status:** implementation evidence only; this does not mark the story or sprint item Done.

## Fresh disposable validation environment

- PostgreSQL image: `pgvector/pgvector:pg16`
- Server version: `16.15 (Debian 16.15-1.pgdg12+2)`
- Historical disposable container: `allura-252a-final-green-pg`
- Historical endpoint: `127.0.0.1:55623`
- Database: `memory`
- Credentials: explicit owner and `allura_app` environment values were supplied; no secret values are recorded here.

The named disposable container and its Docker-managed anonymous volume were removed with explicit user approval. Neither is retained for Story 25.2a work.

The command below and `artifacts/ci/local/25.2a-final-hygiene-green/live-db-tests.json` identify reproducible **local** evidence only. The generated `artifacts/ci/...` output is intentionally untracked and is not staged corroboration.

## TDD and live-lane results

1. **RED:** `workspace-subgraph-authority.e2e.test.ts` first proved three missing behaviors on a fresh PG16 database:
   - an app transaction scoped to workspace A could read same-group workspace B and legacy NULL-workspace events;
   - a receipt in workspace A could reference a source event in workspace B or another tenant;
   - replaying migration 39 left an added group-only `events` policy without a workspace predicate.
2. **GREEN:** Migration 39 now replay-safely alters every extant `events` policy to conjunct `app.current_group_id` and `app.current_workspace_id` in both `USING` and `WITH CHECK`; it adds the scoped event identity and receipt provenance FK. The live suite verifies same-group A→B event read/write denial, legacy event invisibility, cross-workspace/tenant receipt-source rejection, and policy replay.
3. **Watchdog/strict-pool unit lane:** `src/curator/watchdog.test.ts` and `src/lib/postgres/connection.app-pool.test.ts` passed after proving candidate/config reads execute on the scoped transaction client and a forged owner pool cannot replace managed `getAppPool()`.
4. **Full fresh live lane:**

   ```bash
   POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=55624 POSTGRES_DB=memory_hygiene_green \
   POSTGRES_USER=allura_owner POSTGRES_PASSWORD=... \
   POSTGRES_APP_USER=allura_app POSTGRES_APP_PASSWORD=... \
   bash scripts/ci/run-live-db-tests.sh \
     --artifact-dir=artifacts/ci/local/25.2a-final-hygiene-green
   ```

   Result: exit `0`; all 43 ordered migrations applied and **14/14 suites, 38/38 tests passed**. JSON report: `artifacts/ci/local/25.2a-final-hygiene-green/live-db-tests.json`.

## Rollback boundary

Migration `39-workspace-subgraph-foundation.sql` leaves legacy `canonical_proposals.workspace_id` and `events.workspace_id` NULL where no reviewed ownership map exists; it does not invent a workspace backfill. The receipt source-event composite FK is `NOT VALID` to preserve pre-existing receipt data while enforcing new writes. Rollback requires an approved, tested migration that first removes application use of scoped writes, then removes only Story 25.2a policies, functions, triggers, grants, constraints, indexes, and tables in dependency order. It must not delete legacy rows or infer workspace ownership. This evidence does not authorize rollback execution.
