# Story 24.4 — Atomic Human-Governed Promotion

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** in-review
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** Brooks (Hermes)
**Dependencies:** Story 24.3

## User Story

As a curator, I need proposal approval and canonical memory promotion to commit as one idempotent operation, so that retries, failures, or concurrent approvals cannot create orphaned knowledge, duplicate versions, or misleading audit evidence.

## Context

Promotion spans proposal state, canonical memory/version records, relationship records, and audit events. These writes must share one PostgreSQL transaction and one verified curator principal. External projections must occur only after commit through a retryable outbox.

## Scope

- Create one canonical promotion service used by HTTP, MCP, CLI, and automated curator entrypoints.
- Lock and validate the proposal within the transaction.
- Atomically write canonical memory, version linkage, proposal transition, audit event, and outbox event.
- Add idempotency and concurrency controls.
- Add deterministic failure injection and live-database tests.

## Out of Scope

- Changing curator scoring policy or auto-approval thresholds.
- Synchronous external projection inside the database transaction.
- Reworking retrieval ranking.

## Acceptance Criteria

- [ ] AC-1: Every approval entrypoint calls one `approveProposal` domain service; no entrypoint duplicates transaction logic.
- [ ] AC-2: The service accepts `PrincipalContext`, proposal ID, rationale, and idempotency key; curator identity is not accepted as caller-authoritative text.
- [ ] AC-3: Proposal selection uses tenant scope and row locking; only a pending proposal may transition.
- [ ] AC-4: Canonical memory/version write, supersession link when applicable, proposal transition, approval audit event, and projection outbox event share one transaction.
- [ ] AC-5: Failure at any injected write point rolls back every write in the operation.
- [ ] AC-6: Repeating the same idempotency key returns the original committed result without duplicate canonical or audit records.
- [ ] AC-7: Concurrent approvals for the same proposal yield one success and stable already-decided/idempotent outcomes; no orphan or duplicate version is created.
- [ ] AC-8: Unauthorized, wrong-tenant, rejected, or stale proposals cannot be promoted.
- [ ] AC-9: The post-commit outbox worker is retryable and cannot change the committed approval decision.
- [ ] AC-10: A round-trip assertion proves the promoted memory is retrievable by ID and approved-only search before the operation is reported complete.

## Implementation Files

- `src/lib/memory/approve-proposal.ts` — new canonical transaction service.
- `src/lib/memory/promotion-repository.ts` — transaction-bound repository operations.
- `src/mcp/curator-tools.ts` — delegate approval to the domain service.
- `src/app/api/curator/approve/route.ts` — delegate approval to the domain service.
- `src/curator/approve-cli.ts` — delegate approval to the domain service.
- `docker/postgres-init/38-promotion-idempotency-outbox.sql` — constraints and outbox storage.
- `src/lib/memory/__tests__/atomic-promotion.e2e.test.ts` — rollback and concurrency proof.
- `src/lib/memory/__tests__/promotion-roundtrip.e2e.test.ts` — approved retrieval proof.

Migration numbering is provisional and must follow the current migration head.

## Tasks

- [ ] Inventory every approval/promotion entrypoint and remove duplicated write sequencing.
- [ ] Define transaction result, reason codes, and idempotency semantics.
- [ ] Add required uniqueness constraints and projection outbox schema.
- [ ] Implement the transaction using one checked-out client.
- [ ] Route MCP, HTTP, CLI, and curator calls through the domain service.
- [ ] Add failure injection at each write boundary.
- [ ] Add concurrent approval and replayed-request tests.
- [ ] Prove approved-only retrieval before returning success.

## Validation and Evidence

Evidence must include database counts and IDs before and after each injected failure, plus the concurrent approval results. The test must run against live PostgreSQL rather than mocks alone.

## Definition of Done

- No partial promotion state is observable after failure.
- One proposal creates at most one active canonical result for one idempotent approval decision.
- All promotion entrypoints share the same authorization and transaction service.

## Dev Agent Record

**Status:** in-review — remediation verified 2026-08-28 (Brooks/Hermes)

### Completion Notes

C1/C2/C3 findings from the post-merge adversarial review (2026-08-22) are
resolved in the current codebase (landed via PR #105, Epic 25 workspace
authority foundation):

- **C1 (entrypoints bypass service):** HTTP route
  (`src/app/api/curator/approve/route.ts:60`) and CLI
  (`src/curator/approve-cli.ts:64`) both delegate to `approveProposal`. No
  entrypoint duplicates the transaction logic.
- **C2 (session_replication_role):** removed from production
  `approve-proposal.ts`; only test fixtures use it for cleanup.
- **C3 (outbox concurrency):** `promotion-outbox-worker.ts` claims rows with an
  atomic `UPDATE ... WHERE status IN('pending','failed') RETURNING id` inside
  `withTenantTransaction` — no `SELECT FOR UPDATE SKIP LOCKED` outside a
  transaction.

Verified against a fresh disposable PostgreSQL (all 52 migrations applied):
7/7 atomic-promotion e2e, 1/1 promotion-roundtrip, 2/2 promotion-outbox-worker,
4/4 curator-approve, 23/23 workspace-subgraph-authority — all pass.

### File List

- `src/lib/memory/approve-proposal.ts` (verified, no change needed)
- `src/app/api/curator/approve/route.ts` (verified, no change needed)
- `src/curator/approve-cli.ts` (verified, no change needed)
- `src/lib/memory/promotion-outbox-worker.ts` (verified, no change needed)

### Status Evidence

Fresh-DB e2e runs 2026-08-28: atomic-promotion 7/7, promotion-roundtrip 1/1,
promotion-outbox-worker 2/2, curator-approve 4/4, workspace-subgraph-authority
23/23. Note: the long-running `knowledge-postgres` dev container is stale
(missing migration 38's `approved_memory_id` column); a fresh DB is required for
these tests.
