# Story 24.4 — Atomic Human-Governed Promotion

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** changes-requested
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** unassigned
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

**Status:** changes-requested — see `docs/reviews/epic-24-post-merge-adversarial-review-2026-08-22.md`

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
