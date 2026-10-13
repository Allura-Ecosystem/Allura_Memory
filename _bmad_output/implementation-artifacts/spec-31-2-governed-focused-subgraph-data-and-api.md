---
title: 'Story 31.2: Governed Focused-Subgraph Data and API'
type: 'feature'
created: '2026-10-12'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'd87cecc22c095e151fcb7c228158d6654eabf30f'
context:
  - '{project-root}/_bmad_output/implementation-artifacts/epic-31-context.md'
  - '{project-root}/_bmad_output/implementation-artifacts/spec-31-1-focused-subgraph-contract-and-architecture-trace.md'
  - '{project-root}/_bmad_output/specs/spec-dashboard-graph-alignment/contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The graph route still uses ad hoc SQL, incomplete authorization proof, and event-shaped fallback data. It cannot deliver Story 31.1's deterministic, inspectable, workspace-governed contract.

**Approach:** Add relational hardening, a concrete PostgreSQL repository, authenticated continuation service, and thin GET adapter that return real governed graph data through that contract.

## Boundaries & Constraints

**Always:** Derive authority from the server principal; reject conflicting selectors before database access; prove active tenant/workspace membership relationally; use the restricted app role in one repeatable-read, read-only transaction; scope every join; preserve deterministic BFS/keysets, isolated roots, endpoint closure, explicit unknown ontology, 200/400/2 caps, newer-to-superseded lineage, allowlisted projection, evidence truth, and sanitized failures.

**Ask First:** Any change to the approved contract, taxonomy, HTTP mapping, caps, cursor bindings, rollout, or mutation API beyond requiring verified scope/endpoint kinds; any destructive migration, invented legacy scope, or discarded ambiguous data.

**Never:** Extend `IGraphAdapter`; expose raw JSON, IDs, secrets, or authority fields; use route SQL, client traversal, Neo4j, mutation, mocks, or events as semantic graph records; weaken forced RLS or restore the legacy payload.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Overview/focus | Valid query and active membership | Canonical real page; requested inspection/lineage | Empty only after healthy completion |
| Forged/revoked authority | Conflicting selector or inactive membership | No disclosure; selector conflict makes zero DB queries | Sanitized `403 denied` |
| Continuation | Bound token | Resume after authenticated keyset | Malformed `400`; authority `403`; snapshot `409` |
| Ambiguous endpoint | Quarantined legacy edge | No guessed graph data | `200 degraded: AMBIGUOUS_ENDPOINTS` |
| Backend unavailable | Governed read fails | Optional non-equivalent event context | Degraded/`503`; never empty success |

</frozen-after-approval>

## Code Map

- `src/lib/subgraph/contract.ts:40` -- frozen public seam; edit only for proven contradiction.
- `src/lib/subgraph/read-repository.ts` -- concrete `PoolClient` projection/BFS/evidence/lineage/keyset repository.
- `src/lib/subgraph/continuation.ts` -- graph-domain encryption, expiry, key version, digests, and binding checks.
- `src/lib/subgraph/read-service.ts` -- rollout, authority, transaction, revision, and truth-state orchestration.
- `src/app/api/memory/graph/route.ts:135` -- replace legacy SQL/fallback with strict transport mapping.
- `src/lib/auth/api-auth.ts:318` -- reuse `withPermission(request, "memory:read")` and server authority.
- `src/lib/digital-brain/production-reader.ts:48` -- reuse relational membership/approval proof pattern only.
- `src/lib/db/tenant-transaction.ts:45` -- add a restricted repeatable-read, read-only helper.
- `docker/postgres-init/78-focused-subgraph-read-contract.sql` -- endpoint quarantine/typing, identities, revisions, integrity, RLS, indexes.
- `src/lib/memory/writer.ts:166`, `src/lib/memory/knowledge-promotion.ts:842` -- harden scoped typed endpoint writes.
- `src/__tests__/memory-graph-authority.test.ts:26`, `src/__tests__/focused-subgraph-live-db.e2e.test.ts` -- transport and live-DB evidence.

## Tasks & Acceptance

**Execution:**
- [x] `docker/postgres-init/78-focused-subgraph-read-contract.sql`, `docker/postgres-rollback/78-focused-subgraph-read-contract-recovery.sql`, `src/lib/db/tenant-table-inventory.ts`, `src/lib/subgraph/migration-contract.test.ts` -- add quarantine/typing, workspace-safe keys, revision triggers, deferred integrity, forced RLS, guarded recovery, and proven indexes without assigning legacy scope.
- [x] `src/lib/memory/writer.ts`, `src/lib/memory/knowledge-promotion.ts`, `src/lib/memory/writer.test.ts` -- require verified scope and write explicit endpoint kinds.
- [x] `src/lib/db/tenant-transaction.ts`, `src/lib/subgraph/continuation.ts`, `src/lib/subgraph/continuation.test.ts` -- add restricted read transactions and graph-specific authenticated bound tokens.
- [x] `src/lib/subgraph/read-repository.ts`, `src/lib/subgraph/read-repository.test.ts` -- implement deterministic mixed-endpoint BFS, roots, lineage, inspection, evidence, caps, and ambiguity detection.
- [x] `src/lib/subgraph/read-service.ts`, `src/lib/subgraph/read-service.test.ts` -- prove membership, validate revision-bound continuations, revalidate authority, and emit contract truth states.
- [x] `src/app/api/memory/graph/route.ts`, `src/__tests__/memory-graph-authority.test.ts` -- implement strict GET parsing, selector assertions, status mapping, method refusal, and non-disclosure.
- [x] `src/__tests__/focused-subgraph-live-db.e2e.test.ts`, `vitest.config.live-db.ts` -- prove GRAPH-01..GRAPH-28 and query plans in disposable PostgreSQL.

**Acceptance Criteria:**
- Given active viewer authority and scoped records, when overview/focus runs, then a deterministic valid page preserves closure, roots, lineage, evidence, inspection, and 200/400/2 limits.
- Given forged scope, revoked membership, cross-scope rows, or invalid token, when requested, then no protected fact leaks and forced RLS remains effective.
- Given token authority/query/policy/budget/key/revision drift, when checked, then documented 400/403/409 restart semantics apply before disclosure.
- Given ambiguous/orphan data or backend failure, when equivalence is impossible, then the result is degraded and events never enter graph arrays.
- Given live PostgreSQL evidence, when GRAPH-01..GRAPH-28 run, then they pass without changing `IGraphAdapter` or dashboard UI.

## Spec Change Log

## Design Notes

Keep the repository concrete until a second authoritative implementation exists. It accepts an authorized `PoolClient`; the service owns scope checks, membership, cursors, rollout, and transaction lifetime. Preserve unresolved rows as quarantined evidence; require new typed same-scope writes. Use graph-specific key derivation and AAD even with a shared deployment master secret.

## Verification

**Commands:**
- `bun vitest run src/lib/subgraph src/__tests__/memory-graph-authority.test.ts` -- expected: focused suites pass.
- `bun run typecheck && bun run lint:ci` -- expected: no TypeScript or changed-file lint errors.
- `bun run test:unit` -- expected: complete unit lane passes with Story 31.2 suites included.
- `bun run test:live-db` -- expected: disposable PostgreSQL proofs pass, including forced RLS and query-plan assertions.
- `git diff --check` -- expected: no whitespace errors.
- `git diff -- src/lib/graph-adapter/types.ts src/app/dashboard src/components` -- expected: no output.

## Suggested Review Order

**Governed read orchestration**

- Start with authority, revision, continuation, and truth-state orchestration.
  [`read-service.ts:108`](../../src/lib/subgraph/read-service.ts#L108)

- Follow the bounded recursive traversal and canonical page assembly.
  [`read-repository.ts:216`](../../src/lib/subgraph/read-repository.ts#L216)

- Confirm repeatable-read, read-only scope is enforced on one restricted client.
  [`tenant-transaction.ts:103`](../../src/lib/db/tenant-transaction.ts#L103)

- Review strict transport parsing, status mapping, and no-store responses.
  [`route.ts:89`](../../src/app/api/memory/graph/route.ts#L89)

**Schema integrity and mutation boundaries**

- Inspect endpoint typing, orphaning, revisions, RLS, and traversal indexes.
  [`78-focused-subgraph-read-contract.sql:99`](../../docker/postgres-init/78-focused-subgraph-read-contract.sql#L99)

- Verify guarded recovery restores the pre-migration constraint shape.
  [`78-focused-subgraph-read-contract-recovery.sql:1`](../../docker/postgres-rollback/78-focused-subgraph-read-contract-recovery.sql#L1)

- Confirm graph writes require explicit verified workspace and principal scope.
  [`writer.ts:140`](../../src/lib/memory/writer.ts#L140)

- Confirm agent linkage fails closed when scoped identity is ambiguous.
  [`knowledge-promotion.ts:842`](../../src/lib/memory/knowledge-promotion.ts#L842)

**Acceptance and regression evidence**

- Begin live evidence with real mixed nodes, edges, inspection, and lineage.
  [`focused-subgraph-live-db.e2e.test.ts:208`](../../src/__tests__/focused-subgraph-live-db.e2e.test.ts#L208)

- Review pagination, closure, taxonomy, and bounded traversal regressions.
  [`read-repository.test.ts:63`](../../src/lib/subgraph/read-repository.test.ts#L63)

- Review authority drift, backend failure, and continuation conflict coverage.
  [`read-service.test.ts:46`](../../src/lib/subgraph/read-service.test.ts#L46)

- Finish with executable HTTP authority and method-refusal behavior.
  [`memory-graph-authority.test.ts:34`](../../src/__tests__/memory-graph-authority.test.ts#L34)
