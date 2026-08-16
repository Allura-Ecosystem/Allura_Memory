# Story 24.3 — Database-Enforced Tenant Isolation and Immutable Ledger

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** ready-for-dev
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

- [ ] AC-1: `docs/enterprise/tenant-table-inventory.md` identifies every active table as tenant-scoped, global-reference, operational, or migration-only; an automated test fails when a new table is unclassified.
- [ ] AC-2: The application connects with a non-owner, non-superuser role that cannot bypass row-level security.
- [ ] AC-3: Verified tenant and principal context are set with transaction-local PostgreSQL settings; pooled connections cannot leak context between requests.
- [ ] AC-4: RLS is enabled and forced on every tenant-scoped table, using policies derived from the transaction-local tenant context.
- [ ] AC-5: Missing tenant context fails closed rather than returning all rows.
- [ ] AC-6: Cross-tenant SELECT, INSERT, UPDATE, and DELETE attempts fail through both application APIs and direct SQL executed as the application role.
- [ ] AC-7: PostgreSQL rejects UPDATE and DELETE on `events`; insert remains permitted only when the row tenant matches the active tenant context.
- [ ] AC-8: Migrations run through a distinct migration role, and the separation from the application role is documented and tested.
- [ ] AC-9: Connection-pool tests interleave at least two tenants and demonstrate zero context leakage.
- [ ] AC-10: Backup, restore, incident response, and approved retention jobs identify the explicit role and audit procedure required; no normal application bypass exists.

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

- [ ] Generate and review the active table inventory from the database schema.
- [ ] Create migration and application roles with least privilege.
- [ ] Implement transaction-local tenant/principal context and update pooled query entrypoints.
- [ ] Add and force RLS policies table by table.
- [ ] Add the event-ledger update/delete guard.
- [ ] Add direct-SQL and API-level adversarial tests using the application role.
- [ ] Test rollback and pooled-connection context reset.
- [ ] Document migration, backup, restore, and break-glass responsibilities.

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

**Status:** pending

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
