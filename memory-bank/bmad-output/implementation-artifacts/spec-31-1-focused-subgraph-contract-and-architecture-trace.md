---
title: 'Story 31.1: Focused Subgraph Contract and Architecture Trace'
type: 'feature'
created: '2026-10-12'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'a7e5f37bb4410d0ecad9ee692a77b2314d305f54'
context:
  - '{project-root}/_bmad_output/implementation-artifacts/epic-31-context.md'
  - '{project-root}/_bmad_output/specs/spec-dashboard-graph-alignment/contract.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/dashboard/graph` has no enforceable, versioned contract for governed traversal, inspection, truth states, continuation, or rollout, so later data and UI work could reintroduce caller-owned authority, fabricated graph semantics, or incompatible payloads.

**Approach:** Establish one strict server-owned focused-subgraph contract and a server-only Graph V2 rollout boundary, backed by executable contract tests and the already-approved AD-64/REQ-MAP trace. Later stories will implement the repository, route, schema hardening, and UI against this seam.

## Boundaries & Constraints

**Always:** Keep authority fields out of requests; cap effective budgets at 200 nodes, 400 edges, and depth 2; use collision-safe typed node keys; preserve explicit unknown validated kinds; model evidence as `available | absent | unavailable`; distinguish `complete | empty | partial | degraded | denied | error`; require continuation claims to bind authority, normalized query, policy, snapshot revision, budgets, boundary, expiry, and key version; make denied/error payloads structurally incapable of carrying graph data.

**Ask First:** Any change to the approved taxonomy, relationship direction, HTTP-state mapping, cap, continuation binding, or rollout/rollback behavior; any need to alter AD-64 or REQ-MAP-001..003 rather than clarify them.

**Never:** Extend `IGraphAdapter`; add route SQL, database migrations, repository reads, UI behavior, Neo4j, browser authority, mock production nodes, event-derived semantic nodes, graph mutation, or client-visible rollout secrets in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Overview | Strict overview query with optional filters/budgets | Canonical normalized query with clamped effective budgets | Reject unknown or authority-bearing fields |
| Focus | Typed focus key, direction, depth, lineage option | Canonical focus query; depth never exceeds 2 | Reject raw/untyped IDs and malformed continuation |
| Successful result | Versioned complete, empty, or partial payload | Valid typed nodes/edges, snapshot, budgets, warnings; partial requires continuation | Reject endpoint/key mismatch and invalid state combinations |
| Degraded result | Identified non-equivalent fallback context | No fallback record enters semantic node/edge arrays | Reject unlabeled or equivalence-claiming fallback |
| Denied/error | Sanitized reason and action | No scope, IDs, labels, snippets, counts, nodes, or edges | Strict schema rejects protected fields |
| Rollout | Missing/false/true server flag | Disabled unless exactly enabled; rollback yields honest unavailable behavior | Invalid values fail closed |

</frozen-after-approval>

## Code Map

- `src/lib/subgraph/contract.ts` -- new strict Zod v4 schemas, inferred public types, caps, canonical normalization, and continuation-claim shape; this is the sole Story 31.1 runtime seam.
- `src/lib/subgraph/rollout.ts` -- new `server-only` Graph V2 flag parser and rollback-state contract.
- `src/lib/subgraph/contract.test.ts` -- executable request/response invariants, state exclusivity, collision-safe identity, cap, and non-disclosure tests.
- `src/lib/subgraph/rollout.test.ts` -- fail-closed flag and rollback tests; mock `server-only` as existing dashboard tests do.
- `docs/archive/allura/reference/focused-subgraph-contract.md` -- tracked protocol, continuation, HTTP mapping, rollout, and later-story implementation boundary.
- `docs/allura/RISKS-AND-DECISIONS.md:76` -- AD-64 is approved; clarify only if executable contract exposes a contradiction.
- `docs/allura/REQUIREMENTS-MATRIX.md:461` -- REQ-MAP-001..003 already trace to AD-64; keep AD-59 unchanged.
- `src/lib/graph-adapter/types.ts:170` -- read-only boundary evidence: lifecycle/storage interface must not gain traversal concerns.
- `src/app/api/memory/graph/route.ts:135` -- legacy route is read-only evidence in this story; Story 31.2 replaces its ad hoc contract.
- `src/lib/digital-brain/read-receipt.ts:61` -- reuse the authenticated-cursor design pattern later, with a distinct graph domain/AAD; do not couple the contracts.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/subgraph/contract.ts` -- implement strict versioned request/result and continuation-claim schemas plus deterministic normalization -- freeze the shared data/UI seam before implementation.
- [x] `src/lib/subgraph/rollout.ts` -- implement fail-closed server-only enablement and honest disabled-state metadata -- make rollout reversible without legacy fallback.
- [x] `src/lib/subgraph/contract.test.ts`, `src/lib/subgraph/rollout.test.ts` -- cover every matrix row and forbidden authority/disclosure field -- prevent permissive schema drift.
- [x] `docs/archive/allura/reference/focused-subgraph-contract.md` -- publish the approved protocol, HTTP mapping, continuation bindings, and story boundaries -- keep architecture trace reviewable in Git.
- [x] `docs/allura/RISKS-AND-DECISIONS.md`, `docs/allura/REQUIREMENTS-MATRIX.md` -- verify AD-64 and REQ-MAP-001..003 remain coherent with executable schemas; edit only for discovered contradiction -- preserve accepted traceability.

**Acceptance Criteria:**
- Given valid overview and focus examples, when schemas normalize them, then outputs are deterministic, authority-free, versioned, and capped at 200/400/2.
- Given malformed, authority-bearing, or raw-ID requests, when parsed, then strict validation fails before any repository or route dependency exists.
- Given each result state, when validated, then required fields and forbidden disclosures are enforced and only `partial` can carry continuation.
- Given continuation claims, when validated, then every AD-64 authority/query/policy/snapshot/budget/boundary/expiry/key-version binding is mandatory.
- Given Graph V2 is missing, false, malformed, or disabled, when rollout state is read, then it fails closed without Neo4j, fabricated data, or a successful empty claim.
- Given the implementation diff, when reviewed, then `IGraphAdapter`, the legacy route, database schema, and UI are unchanged and AD-59 remains endpoint-isolation authority.

## Spec Change Log

## Design Notes

Keep transport parsing separate from server-derived authority. The request schema describes only traversal intent; continuation claims are internal server data and never accepted as decomposed browser fields. Zod objects are strict at every externally parsed boundary. The response union should make invalid combinations unrepresentable rather than relying on prose checks.

## Verification

**Commands:**
- `npx vitest run src/lib/subgraph/contract.test.ts src/lib/subgraph/rollout.test.ts` -- expected: all contract and rollout cases pass.
- `npm run typecheck` -- expected: no TypeScript errors.
- `git diff --check` -- expected: no whitespace errors.
- `git diff -- src/lib/graph-adapter/types.ts src/app/api/memory/graph/route.ts` -- expected: no output.

## Suggested Review Order

**Server-owned query contract**

- Strict request variants exclude caller authority before normalization.
  [`contract.ts:40`](../../src/lib/subgraph/contract.ts#L40)

- Deterministic normalization makes defaults and 200/400/2 caps explicit.
  [`contract.ts:130`](../../src/lib/subgraph/contract.ts#L130)

- Semantic serialization canonicalizes filters while excluding page tokens.
  [`contract.ts:165`](../../src/lib/subgraph/contract.ts#L165)

**Result integrity**

- One strict union enforces ordering, closure, exhaustion, and admitted lineage.
  [`contract.ts:422`](../../src/lib/subgraph/contract.ts#L422)

- The exchange seam binds successful payloads to their normalized request.
  [`contract.ts:550`](../../src/lib/subgraph/contract.ts#L550)

**Continuation and rollout boundaries**

- Continuation claims bind authority, policy, revision, budgets, boundary, and expiry.
  [`contract.ts:607`](../../src/lib/subgraph/contract.ts#L607)

- Exact server-only enablement returns one sanitized unavailable shape when disabled.
  [`rollout.ts:29`](../../src/lib/subgraph/rollout.ts#L29)

- Protocol guidance preserves HTTP truth states, rollback, and accepted architecture trace.
  [`FOCUSED-SUBGRAPH-CONTRACT.md:57`](../../docs/archive/allura/reference/focused-subgraph-contract.md#L57)

**Executable evidence**

- Contract tests exercise request, result, exchange, and continuation invariants.
  [`contract.test.ts:180`](../../src/lib/subgraph/contract.test.ts#L180)

- Rollout tests prove malformed and missing flags fail closed identically.
  [`rollout.test.ts:20`](../../src/lib/subgraph/rollout.test.ts#L20)

- Unit configuration keeps both contract suites in the standard CI lane.
  [`vitest.config.unit.ts:146`](../../vitest.config.unit.ts#L146)
