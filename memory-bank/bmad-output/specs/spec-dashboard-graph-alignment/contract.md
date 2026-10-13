# Focused Subgraph Contract and Architecture

## Decision

AD-64 defines a dedicated PostgreSQL `FocusedSubgraphReadRepository`. `IGraphAdapter` remains the canonical-memory lifecycle/storage abstraction and does not acquire dashboard traversal, evidence projection, truth-state, or cursor concerns. The first repository is concrete; introduce an interface only when a second authoritative implementation exists.

Suggested boundaries:

- `src/lib/subgraph/contract.ts`: strict Zod request/response schemas and public types.
- `src/lib/subgraph/read-repository.ts`: PostgreSQL projection and deterministic traversal.
- `src/lib/subgraph/read-service.ts`: authorization, transaction, cursor, rollout, and response-state orchestration.
- `src/app/api/memory/graph/route.ts`: thin GET transport adapter.

Rejected: route-local SQL, client-side traversal, extending `IGraphAdapter`, semantic event fallback, Neo4j restoration, and browser authority.

## Request

`SubgraphQuery` is a strict union:

```ts
type SubgraphQuery =
  | {
      kind: "overview"
      nodeKinds?: string[]
      relationshipKinds?: string[]
      nodeLimit?: number
      edgeLimit?: number
      continuation?: string
    }
  | {
      kind: "focus"
      focusNodeKey: string
      direction?: "incoming" | "outgoing" | "both"
      depth?: 0 | 1 | 2
      includeLineage?: boolean
      nodeKinds?: string[]
      relationshipKinds?: string[]
      nodeLimit?: number
      edgeLimit?: number
      continuation?: string
    }
```

The request contains no group, workspace, principal, session, role, or policy field. The server clamps budgets to 200 nodes, 400 edges, and depth 2. Optional legacy scope selectors are transport-only equality assertions.

## Response

The versioned response is a discriminated union:

- `complete`: authorized traversal exhausted within effective budgets.
- `empty`: a healthy, complete authorized query returned zero nodes and edges.
- `partial`: valid graph data plus exhausted budget dimension and opaque continuation.
- `degraded`: no semantic-graph equivalence claim; may carry a separately typed fallback context.
- `denied`: no protected scope, names, counts, IDs, labels, snippets, or existence signal.
- `error`: sanitized code, retryability, and restart action when applicable.

Every successful graph page includes contract version; policy epoch, graph revision, and timestamp snapshot; requested/applied budgets; typed nodes and edges; warning codes; and optional focused inspection. Loading is client-only. Stale continuation/snapshot conflict maps to HTTP 409 and a restart action.

HTTP mapping:

- `200`: complete, empty, partial, or labeled degraded.
- `400`: malformed query or token.
- `401`: login required.
- `403`: insufficient role, explicit scope conflict, or continuation authority mismatch.
- `409`: snapshot or continuation conflict requiring restart.
- `503`: sanitized unavailable/error.

## Identity, taxonomy, and projection

- Qualified client keys distinguish at least `memory:<opaque-id>` and `structural:<opaque-id>`; raw database IDs never identify a client node alone.
- Primary product families are Memory, Agent, Team, and Project. `AgentGroup` may derive to Team only through a versioned rule. Other allowlisted structural kinds retain explicit server names.
- Canonical relationships are `AUTHORED_BY`, `RELATES_TO`, `MEMBER_OF`, `CONTRIBUTES_TO`, and `SUPERSEDES`. Stored aliases require a versioned derivation rule. Unknown types never silently become `CONNECTED_TO`.
- `SUPERSEDES` direction is newer to superseded. Superseded lineage may render; soft-deleted non-lineage content stays hidden from ordinary viewers.
- Structural properties are projected through an allowlist; raw JSON is never forwarded.
- Each node/edge carries a direct source-record reference or versioned derivation rule, freshness, evidence state, and applicable version/deprecation data.
- Full authorized content, evidence details, and relationship context appear only in the focused node's inspection object.

Evidence state is exactly `available`, `absent`, or `unavailable`. Governed memory evidence resolves through same-scope proposal, source-event, receipt, and evidence-reference links. Arbitrary structural property values do not become verified evidence.

## Authorization and transaction

1. Require viewer or higher.
2. Derive authority solely from the server principal.
3. Reject conflicting `group_id` or `workspace_id` before transaction/query.
4. Validate the query and continuation.
5. Prove active tenant and explicit current workspace membership relationally.
6. Run through the restricted app pool under forced RLS in a `REPEATABLE READ READ ONLY` workspace transaction.
7. Keep explicit `(group_id, workspace_id)` predicates and scope-qualified joins on every table.

A session workspace claim alone is not relational-authorization-first proof.

## Traversal and continuation

Use deterministic iterative breadth-first expansion, not an unbounded recursive query:

1. Select deterministic roots.
2. Expand a sorted frontier through depth 2.
3. Fetch at most remaining edge budget plus one.
4. Admit nodes within budget.
5. Emit an edge only when both endpoints are admitted.
6. Preserve focused/overview isolated nodes.
7. Serialize nodes and edges in canonical order.

Ordering is depth, relationship type, direction, qualified source, qualified target, and stable edge key; node order is distance, stable kind rank, freshness descending, and qualified key. Overview closes edge endpoints first and then fills remaining capacity with ordered isolated nodes. Pagination is keyset-only.

Continuation uses authenticated encryption with a graph-specific domain/AAD and binds contract version, tenant, workspace, principal/session hash, role, policy epoch, route-policy version, normalized query hash, effective budgets, graph revision, ordering boundary, issue/expiry time, and key version. Tamper, expiry, changed query, changed policy/membership, changed revision, or scope replay fails before disclosure.

## Additive schema hardening

- Add endpoint kinds to structural edges; backfill only uniquely resolving same-workspace endpoints and quarantine/report missing or ambiguous endpoints.
- Require endpoint kinds for new writes and enforce same-scope endpoint existence with deferred constraint triggers.
- Reconcile graph keys/indexes that omit `workspace_id` so equal logical IDs can coexist across workspaces in a tenant.
- Add `graph_scope_revisions`, incremented transactionally by changes to all graph rows and graph-linked proposal/receipt/evidence rows.
- Add scope-first traversal, lineage, proposal-memory, and receipt-memory indexes only after duplicate preflight and query-plan evidence.
- Until endpoint typing is enforced, omit ambiguous/orphan edges and return `degraded` rather than guessing.
- Repair or retire structural writers that omit workspace/principal or use owner-style/unscoped access.

## Rollout and rollback

Graph V2 uses a server-only flag. Disabling it renders an honest unavailable/degraded Graph state; counters may remain diagnostics but do not satisfy acceptance.

Rollback order: disable Graph V2; revert UI and service wiring; wait beyond continuation TTL; remove additive revision machinery only through a reviewed recovery migration. Never fall back to Neo4j, mock data, browser-selected scope, or wholesale restoration of the deleted route.

## Trace and proof

- Add AD-64 to `docs/allura/RISKS-AND-DECISIONS.md` and retarget only REQ-MAP-001..003 from AD-59 to AD-64. AD-59 remains endpoint isolation.
- Record missing AD-61..63 canonical rows as a separate documentation-integrity issue; do not reuse their numbers.
- Live-DB evidence must cover cross-tenant/workspace zero leakage, missing/revoked membership, zero-query forged scope, mixed structural-memory edges, isolated nodes, lineage/deletion, evidence states, ambiguous/orphan degradation, deterministic order, exact budgets, cursor attacks/conflicts, forced RLS, and query plans.
- The Correct Course proposal's GRAPH-01..GRAPH-36 matrix remains the acceptance ledger.
