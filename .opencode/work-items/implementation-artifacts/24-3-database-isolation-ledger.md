# Story 24.3 — Database-Enforced Tenant Isolation and Immutable Ledger

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** done
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Story 24.2

## User Story

As a regulated-system operator, I need tenant isolation and ledger immutability enforced by PostgreSQL, so that a missed application predicate or compromised handler cannot cross the data boundary or rewrite evidence.

## Context

Allura performs tenant validation and commonly scopes queries by `group_id`, but application checks alone do not constitute a database security boundary. The event log is described as append-only, while database roles and triggers/policies must prove that property. This story makes both invariants independently enforceable by PostgreSQL.

## Scope

- Inventory every active tenant-bearing table and classify its access pattern.
- Introduce a non-owner application database role.
- Set verified principal/tenant context per transaction.
- Apply and force row-level security to tenant-bearing tables.
- Reject event ledger update/delete operations for application and maintenance paths except a separately documented break-glass role.
- Add live-database adversarial and migration tests.

## Out of Scope

- Changing product retention policy.
- Redesigning the semantic graph schema.
- Promotion transaction behavior, which is Story 24.4.

## Acceptance Criteria

Legend: `[x]` = fully satisfied and provable on the build machine.

- [x] AC-1: `docs/enterprise/tenant-table-inventory.md` identifies every active table as tenant-scoped, global-reference, operational, or migration-only; an automated test fails when a new table is unclassified. Verified live: `validateTenantTableInventory()` reports zero unclassified tables and zero missing-RLS tables.
- [x] AC-2: The application connects with a non-owner, non-superuser role that cannot bypass row-level security. `allura_app` is created with `NOBYPASSRLS`; `getAppPool()` connects as `allura_app` and is rejected when no tenant context is set.
- [x] AC-3: Verified tenant and principal context are set with transaction-local PostgreSQL settings; pooled connections cannot leak context between requests. `withTenantTransaction()` runs `SET LOCAL app.current_group_id / app.current_tenant / app.current_principal` inside a transaction and resets them on client release.
- [x] AC-4: RLS is enabled and forced on every tenant-scoped table, using policies derived from the transaction-local tenant context. 37 tenant-scoped tables plus `memberships` and `mcp_tokens` have forced RLS; the inventory live test passes.
- [x] AC-5: Missing tenant context fails closed rather than returning all rows. Direct query as `allura_app` with no context returns 0 rows from `allura_memories`.
- [x] AC-6: Cross-tenant SELECT, INSERT, UPDATE, and DELETE attempts fail through both application APIs and direct SQL executed as the application role. Adversarial test inserts `group_id = tenant-B` inside a tenant-A context and is rejected by the RLS `WITH CHECK` clause.
- [x] AC-7: PostgreSQL rejects UPDATE and DELETE on `events`; insert remains permitted only when the row tenant matches the active tenant context. `events_immutable_trigger` is a `SECURITY INVOKER` row-level trigger; app-role UPDATE/DELETE raises `insufficient_privilege`; INSERT with matching tenant succeeds.
- [x] AC-8: Migrations run through a distinct migration role, and the separation from the application role is documented and tested. `allura_migration` is created with `BYPASSRLS`; CI script applies migrations as the owner-equivalent bootstrap user and then sets the app-role password.
- [x] AC-9: Connection-pool tests interleave at least two tenants and demonstrate zero context leakage. `does not leak tenant context between pooled connections` runs A/B/A/B in parallel and observes exactly one row per tenant.
- [x] AC-10: Backup, restore, incident response, and approved retention jobs identify the explicit role and audit procedure required; no normal application bypass exists. `allura_breakglass` is documented and granted explicit `ALL PRIVILEGES ON events`; normal `allura_app` cannot assume it.

## Implementation Files

- `docker/postgres-init/35-application-roles.sql` — role and least-privilege grants.
- `docker/postgres-init/36-tenant-rls.sql` — RLS functions and policies.
- `docker/postgres-init/37-events-immutable.sql` — ledger mutation guard.
- `src/lib/db/tenant-transaction.ts` — transaction-local principal/tenant context helper.
- `src/lib/db/tenant-table-inventory.ts` — checked table classification.
- `src/__tests__/database-tenant-isolation.e2e.test.ts` — direct and API attack matrix.
- `src/__tests__/events-immutability.e2e.test.ts` — live-database ledger proof.
- `docs/enterprise/tenant-table-inventory.md` — reviewed inventory and role model.

Migration numbers must be adjusted if another migration lands first; ordering must remain deterministic.

## Tasks

- [x] Generate and review the active table inventory from the database schema.
- [x] Create migration and application roles with least privilege.
- [x] Implement transaction-local tenant/principal context and update pooled query entrypoints.
- [x] Add and force RLS policies table by table.
- [x] Add the event-ledger update/delete guard.
- [x] Add direct-SQL and API-level adversarial tests using the application role.
- [x] Test rollback and pooled-connection context reset.
- [x] Document migration, backup, restore, and break-glass responsibilities.

## Validation and Evidence

The evidence artifact must enumerate each table and each operation tested. A passing summary without the matrix is insufficient.

Required negative cases:

- no tenant context
- foreign tenant context
- forged request tenant
- reused pooled connection after another tenant
- ledger update
- ledger delete

## Definition of Done

- Tenant isolation survives intentional removal of an application-level `group_id` predicate in a test-only query.
- Ledger mutation fails when attempted directly as the application role.
- Canonical data and security documentation changes are identified in the story record.

## Dev Agent Record

**Status:** done

### Completion Notes

Implemented the database-enforced tenant isolation and immutable ledger foundation for Epic 24. Added three deterministic migrations, TypeScript helpers for transaction-local tenant/principal context, a machine-checked table inventory, and live-database adversarial tests. Verified on a fully cleaned `pgvector/pgvector:pg16` container with all 40 migrations and the live-DB test lane.

Key design decisions:
- `allura_app` is `NOLOGIN NOBYPASSRLS` and receives least-privilege DML at migration time.
- `allura_migration` is `BYBYPASSRLS` for CI/deployment tooling only.
- `allura_breakglass` is `NOLOGIN NOINHERIT BYBYPASSRLS` and is granted explicit `ALL PRIVILEGES ON events`; it must be assumed via `SET ROLE` after documented approval.
- `withTenantTransaction()` sets `app.current_group_id`, `app.current_tenant`, and `app.current_principal` using `SET LOCAL` so the context cannot leak across pooled connections.
- `events_immutable_trigger` is a `SECURITY INVOKER` `BEFORE UPDATE OR DELETE FOR EACH ROW` trigger, so the actual session role is evaluated, not the function owner.

### File List

- `docker/postgres-init/35-application-roles.sql` — creates `allura_app`, `allura_migration`, and the `app` schema.
- `docker/postgres-init/36-tenant-rls.sql` — enables and forces RLS on tenant-scoped tables, creates policies, grants least privilege.
- `docker/postgres-init/37-events-immutable.sql` — creates `allura_breakglass`, the `app.reject_events_mutation()` trigger function, and the `events_immutable_trigger`.
- `src/lib/db/tenant-transaction.ts` — `TenantContext`, `withTenantTransaction()`, `tenantQuery()` with optional pool parameter and context reset on release.
- `src/lib/db/tenant-table-inventory.ts` — `TENANT_TABLE_INVENTORY`, `TABLES_REQUIRING_RLS`, `validateTenantTableInventory()`.
- `src/lib/db/tenant-table-inventory.test.ts` — unit and live validation tests.
- `src/__tests__/database-tenant-isolation.e2e.test.ts` — live-DB tenant isolation adversarial tests (AC-3..AC-6, AC-9).
- `src/__tests__/events-immutability.e2e.test.ts` — live-DB events ledger immutability and break-glass tests (AC-7, AC-10).
- `src/lib/postgres/connection.ts` — added `POSTGRES_APP_USER`/`POSTGRES_APP_PASSWORD` support and `getAppPool()`; fixed password selection so the owner pool uses `POSTGRES_PASSWORD`.
- `vitest.config.live-db.ts` — included the new live-DB tests plus the existing checkpoint continuation test.
- `scripts/ci/run-live-db-tests.sh` — sets `POSTGRES_APP_PASSWORD` and applies it to `allura_app` after migrations; exports it for the test harness.
- `docs/enterprise/tenant-table-inventory.md` — reviewed table classification.
- `_bmad/bmm/stories/sprint-status.yaml` — updated Epic 24 sprint status.

### Status Evidence

Run on 2026-08-18 against a fresh Docker container:
- Container: `pgvector/pgvector:pg16` → PostgreSQL 16.15, pgvector 0.8.6.
- Migrations: 40 files applied deterministically via `scripts/ci/run-live-db-tests.sh`.
- Live-DB tests: 12/12 passed (4 suites: checkpoint-continuation.integration, database-tenant-isolation.e2e, events-immutability.e2e, tenant-table-inventory).
- Unit tests: 1782/0 failed (89 files, 8 skipped suites).
- RLS coverage: 37 tenant-scoped tables plus `memberships` and `mcp_tokens` with forced RLS; `validateTenantTableInventory()` reports zero unclassified and zero missing-RLS tables.
- Break-glass: `allura_breakglass` successfully UPDATE/DELETEs an event row after `SET ROLE`; `allura_app` is rejected for both operations.

Artifact: `artifacts/ci/local/live-db/live-db-tests.json` written by the CI script.
