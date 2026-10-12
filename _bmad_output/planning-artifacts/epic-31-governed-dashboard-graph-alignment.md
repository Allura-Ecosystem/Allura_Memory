# Epic 31: Governed Dashboard Graph Alignment

## Goal

Restore `/dashboard/graph` as the approved, real-data Knowledge Map while preserving server-derived authority, PostgreSQL/RuVector boundaries, RLS, honest states, the pinned Command Center interaction intent, and the separate Epic 30 My Work boundary.

## Authority

- [Approved Correct Course](./sprint-change-proposal-2026-10-12-dashboard-graph.md)
- [Canonical BMAD spec](../specs/spec-dashboard-graph-alignment/SPEC.md)
- AD-64 and REQ-MAP-001 through REQ-MAP-003
- `docs/design/command-center/operator-surface-contract.md`
- `docs/design/command-center/project/Allura Memory Command Center.dc.html`

## Story 31.1: Focused Subgraph Contract and Architecture Trace

As an operator-platform maintainer, I want one approved focused-subgraph contract and decision trace so that every data, UI, and validation slice implements the same authority and truth semantics.

### Acceptance Criteria

1. AD-64 defines a dedicated PostgreSQL focused-subgraph read repository and explicitly leaves `IGraphAdapter` as the canonical-memory lifecycle/storage boundary.
2. REQ-MAP-001 through REQ-MAP-003 trace to AD-64 while endpoint-isolation AD-59 remains unchanged.
3. Strict versioned request/response schemas cover overview/focus queries, complete/empty/partial/degraded/denied/error results, collision-safe identities, budgets, inspection, evidence state, and sanitized warnings.
4. The request contains no caller authority; optional HTTP scope selectors are equality assertions only.
5. Continuation and Graph V2 rollout/rollback contracts are documented and tested before route or UI reliance.
6. The approved spec and companions pass coherence/preservation checks with no unresolved product or architecture question.

## Story 31.2: Governed Focused-Subgraph Data and API

As an authorized viewer, I want the graph endpoint to return deterministic real nodes, relationships, lineage, and inspectable evidence so that exploration reflects my governed workspace rather than an ad hoc sample.

### Acceptance Criteria

1. A dedicated repository reads memory, structural, supersession, provenance, receipt, and evidence records inside a restricted repeatable-read read-only workspace transaction.
2. Active relational tenant/workspace membership is proven before graph expansion; forged selectors and invalid continuations cause zero graph disclosure.
3. Deterministic overview/focus traversal retains isolated authorized roots, closes endpoints, preserves unknown validated ontology, and enforces 200-node/400-edge/depth-2 caps.
4. Additive schema hardening provides typed endpoints, same-scope integrity, workspace-safe identity, graph-scope revision, and query-plan-supported indexes; ambiguous/orphan data degrades without guessing.
5. Continuations are authenticated, expiring, and bound to authority, query, policy, budgets, snapshot revision, and keyset boundary; stale/conflicting snapshots return restart semantics.
6. Event fallback is a labeled non-equivalent context and never populates primary semantic graph arrays.
7. Contract, security, integration, and disposable live-DB tests cover the data and authority cases in GRAPH-01 through GRAPH-28.

## Story 31.3: Interactive Knowledge Map and Inspector

As an authorized operator, I want to explore and inspect the same governed graph visually and textually so that I can understand relationships, evidence, lineage, scope, and freshness without losing accessibility or trust.

### Acceptance Criteria

1. `/dashboard/graph` renders the preserved rail/map/inspector hierarchy with approved tokens, real nodes/edges, labeled directed relationships, controls, minimap, filters, selection, clearing, neighborhood emphasis, and connected-node navigation.
2. One default Knowledge Map experience is implemented. Security Path and Methodology/Catalog modes are omitted rather than simulated.
3. The inspector exposes the approved authorized fields and distinguishes evidence available, absent, and unavailable.
4. The adjacent textual relationship representation consumes the same node/edge arrays and supports complete Enter/Space navigation, visible focus, announcements, inspector focus/return, and reduced motion.
5. Loading, complete, empty, login-required, forbidden, partial, degraded, stale, continuation-conflict, error, and evidence-unavailable states are distinct and non-leaking.
6. The route remains usable at 320px and actual 200% zoom with no page-level horizontal overflow; graph panning remains contained.
7. Component, browser, accessibility, responsive, and visual comparison evidence covers GRAPH-01 through GRAPH-31.

## Story 31.4: Independent Review, Evidence, and Human Acceptance

As the human owner, I want a requirement-level evidence packet and an interactive exercise before release progression so that completion is based on demonstrated behavior rather than status or build output.

### Acceptance Criteria

1. GRAPH-01 through GRAPH-36 each link to an implementation reference, validation method, evidence artifact, and explicit verdict.
2. Pike independently signs visual/interaction/graph/navigation/control/inspection/state/intent and interface-simplicity findings with repair disposition.
3. Fowler independently signs architecture cleanliness, coupling, duplication, reuse, comprehensibility, and testability findings with repair disposition.
4. Hightower independently signs runtime/deployment safety, isolation, authorization, failure, integrity, observability, and regression findings with repair disposition.
5. No critical requirement is missing or failed; test/build/HTTP/screenshot/tracker success alone cannot substitute for another gate.
6. The owner personally exercises the working local graph and receives a dated walkthrough record.
7. After the walkthrough, the owner explicitly approves or rejects release progression; only approval may close the epic.

## Dependencies and Order

31.1 → 31.2 → 31.3 → 31.4. Contract/trace precedes code; data/API precedes UI; independent reviews and human gates follow implementation evidence.

## Non-goals

No Epic 30 My Work canvas, redesign/rebrand, Neo4j restoration, mock production graph, 3D mode, graph mutation, policy editing, promotion changes, or HITL workflow changes.
