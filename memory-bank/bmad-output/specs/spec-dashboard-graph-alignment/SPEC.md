---
id: SPEC-dashboard-graph-alignment
companions:
  - contract.md
  - experience.md
  - ../../planning-artifacts/sprint-change-proposal-2026-10-12-dashboard-graph.md
  - ../../../docs/design/command-center/operator-surface-contract.md
  - ../../../docs/design/command-center/project/Allura Memory Command Center.dc.html
  - ../../../docs/portfolio/brand/epic-25-operator-surface/DESIGN.authority.md
  - ../../../docs/allura/REQUIREMENTS-MATRIX.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Governed Dashboard Graph Alignment

## Why

The `/dashboard/graph` route lost its accepted operator capability when an interactive Knowledge Map was replaced by four counters. Authorized Allura operators need to explore real, scoped relationships and inspect their provenance and evidence without weakening tenant isolation, fabricating data, changing the bounded Epic 30 My Work reader, or mistaking route/build success for acceptance.

## Capabilities

- **CAP-1**
  - **intent:** An authenticated viewer can see real tenant/workspace-scoped graph nodes and labeled directed relationships instead of a counts-only or fabricated presentation.
  - **success:** A complete authorized response renders at least the returned nodes and edges with collision-safe identities and no cross-scope or placeholder record; an authorized zero-result response renders the complete-empty state.
- **CAP-2**
  - **intent:** An operator can explore the Knowledge Map visually through category filtering, pan, zoom, fit, selection, clearing, neighborhood emphasis, and relationship navigation.
  - **success:** Pointer and browser tests demonstrate every interaction against the same authorized response while counts remain secondary context only.
- **CAP-3**
  - **intent:** An operator can inspect a selected record's governed content, lineage, provenance, evidence, relationship context, freshness, and scope.
  - **success:** Focused inspection distinguishes evidence available, absent, and unavailable; shows directed incoming/outgoing context and supersession; and never exposes unauthorized or raw unallowlisted properties.
- **CAP-4**
  - **intent:** Keyboard and screen-reader users can explore the same nodes and relationships through an adjacent textual representation.
  - **success:** The text view is payload-identical to the canvas, supports Enter/Space selection and navigation, has visible focus and announcements, and remains usable at 320px and actual 200% zoom.
- **CAP-5**
  - **intent:** An operator can distinguish loading, complete, empty, login-required, forbidden, partial, degraded, stale, continuation-conflict, error, and evidence-unavailable conditions.
  - **success:** State tests and browser captures prove each condition has distinct semantics and presentation; denied/error states reveal no protected names, counts, IDs, snippets, or existence.
- **CAP-6**
  - **intent:** The server can return deterministic, bounded focused subgraphs under current relational authorization and database isolation.
  - **success:** Repeated scoped queries return canonical ordering; isolated roots are retained; caps and continuation are enforced; tampered, stale, changed-query, changed-policy, or cross-scope continuations fail before graph disclosure.
- **CAP-7**
  - **intent:** The restored route preserves the approved Command Center interaction intent and current visual system without redesigning the product.
  - **success:** Comparison evidence confirms the required rail/map/inspector hierarchy, navigation and state behavior, approved tokens, responsive stacking, and the explicit omission of unsupported prototype modes.
- **CAP-8**
  - **intent:** Owners can decide release progression from requirement-level implementation and validation evidence.
  - **success:** GRAPH-01 through GRAPH-36 each has an implementation reference and valid evidence; Pike, Fowler, and Hightower gates pass; the owner personally exercises the local dashboard and then explicitly approves release progression.

## Constraints

- Tenant, workspace, principal, session, role, and policy authority come only from the authenticated server principal; caller scope fields are equality assertions and conflicting values fail before a graph query.
- Reads use the restricted PostgreSQL application role, forced RLS, explicit same-scope joins, active relational membership, and a repeatable-read read-only transaction.
- The browser imports no database or graph driver and consumes one versioned, server-owned focused-subgraph contract.
- PostgreSQL/RuVector is the governing persistence boundary. Neo4j, prototype seed records, mock nodes, and event-derived semantic substitutes are prohibited.
- Node and edge properties are allowlisted. Unknown kinds and relationships remain explicit or fail validation; they are never silently coerced into a familiar category.
- Effective limits cannot exceed 200 nodes, 400 edges, or traversal depth 2. Ordering and continuation are deterministic, authenticated, scope-bound, policy-bound, snapshot-bound, and expiring.
- The visual canvas and textual relationship view consume the same response arrays. Color is never the sole carrier of category, relationship, state, or risk.
- Graph V2 is controlled by a server-only flag. Disabled or failed service produces an honest unavailable/degraded state, never a false accepted Graph.
- Implementation order is contract/trace, additive schema and data service, UI, independent review/repair, evidence, interactive exercise, explicit release decision.
- No requirement passes from source inspection, HTTP 200, build success, unit tests alone, screenshots alone, another gate's approval, or a tracking status.

## Non-goals

- Redesigning or rebranding the Command Center.
- Adding a graph canvas, arbitrary layouts, or Graph acceptance to Epic 30 `/dashboard` My Work.
- Restoring the deleted 514-line page wholesale, reintroducing Neo4j, or accepting browser-selected authority.
- Shipping Security Path or Methodology/Catalog modes before their governed semantics exist.
- Adding 3D rendering, graph mutation, policy editing, promotion changes, or HITL workflow changes.
- Treating event fallback, counters, mock records, or hard-coded prototype people/projects as the semantic graph.

## Success signal

On the working local dashboard, the human owner can personally use one governed response to explore and inspect a real tenant/workspace Knowledge Map visually and textually, including honest failure and partial states, with no leakage or fabricated data. Every GRAPH-01 through GRAPH-36 row is evidenced and the owner explicitly approves release progression after the walkthrough.
