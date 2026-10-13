# Epic 31 Context: Governed Dashboard Graph Alignment

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Restore `/dashboard/graph` as a trustworthy, interactive Knowledge Map over real tenant/workspace-scoped PostgreSQL and RuVector data. The route must preserve server-derived authority, relational authorization, forced RLS, honest truth states, and the approved Command Center interaction intent while keeping the separate Epic 30 `/dashboard` My Work reader unchanged. Completion means operators can explore and inspect the same governed graph visually and textually, and the human owner accepts requirement-level evidence after personally exercising the result.

## Stories

- Story 31.1: Focused Subgraph Contract and Architecture Trace
- Story 31.2: Governed Focused-Subgraph Data and API
- Story 31.3: Interactive Knowledge Map and Inspector
- Story 31.4: Independent Review, Evidence, and Human Acceptance

## Requirements & Constraints

- Render real authorized nodes and labeled directed relationships. Counts may remain secondary diagnostics but cannot replace the map. Never show seeded, placeholder, or production-looking synthetic graph records.
- Support deterministic overview and focused traversal, including isolated authorized roots, endpoint closure, lineage, provenance, evidence references, and explicit version/deprecation context. Preserve validated unknown kinds and relationships rather than coercing them into familiar categories.
- Distinguish complete, empty, partial, degraded, denied, error, stale, continuation-conflict, and evidence-unavailable outcomes. Empty is valid only after a healthy complete authorized query returns no graph data. Event-derived context is a labeled, non-equivalent fallback and never populates semantic graph arrays.
- Derive tenant, workspace, principal, session, role, and policy solely from authenticated server authority. Caller scope selectors are equality assertions only; conflicts, missing or revoked membership, insufficient role, and invalid continuations fail before graph disclosure.
- Execute reads through the restricted application role under forced RLS in a repeatable-read, read-only workspace transaction. Every join remains explicitly tenant/workspace qualified.
- Enforce effective ceilings of 200 nodes, 400 edges, and traversal depth 2. These are safety limits, not completeness or scale claims.
- Project only allowlisted properties. Denied and error responses reveal no protected names, labels, counts, IDs, snippets, or existence signals. Evidence state is exactly available, absent, or unavailable.
- The browser consumes one versioned server-owned contract and imports no storage or graph driver. PostgreSQL/RuVector remains authoritative; Neo4j, client-side traversal, graph mutation, policy editing, promotion changes, and HITL changes are out of scope.
- The acceptance ledger covers GRAPH-01 through GRAPH-36. No row passes from source inspection, unit tests alone, HTTP success, build success, screenshots alone, tracker status, or another gate's approval.

## Technical Decisions

- Use a concrete PostgreSQL focused-subgraph read repository for dashboard traversal and projection. Keep the canonical-memory adapter limited to lifecycle/storage concerns; do not add a repository interface until a second authoritative implementation exists.
- Define strict versioned request and response schemas. Requests form an overview/focus union with optional filters, bounded limits, and an opaque continuation; they contain no authority fields. Responses form a discriminated union for complete, empty, partial, degraded, denied, and error outcomes and include contract version, snapshot metadata, applied budgets, warnings, and optional focused inspection.
- Use collision-safe qualified client keys for memory and structural nodes. Canonical relationship semantics include authored-by, relates-to, member-of, contributes-to, and supersedes; stored aliases require versioned derivation rules, and supersedes points from newer to superseded.
- Traverse with deterministic iterative breadth-first expansion and keyset ordering. Admit an edge only when both endpoints are admitted, preserve valid isolated nodes, and serialize nodes and edges canonically.
- Authenticate and encrypt continuations. Bind each token to contract version, authority and scope, normalized query, policy epoch, graph revision, effective budgets, ordering boundary, issuance/expiry, and key version. Tampering, replay, expiry, or snapshot/policy/query changes fail closed; snapshot conflicts require restart.
- Harden the schema additively with typed structural endpoints, same-scope endpoint integrity, workspace-safe keys, a per-scope graph revision ledger, and evidence-backed indexes. Ambiguous or orphan data degrades explicitly rather than being guessed.
- Gate Graph V2 with a server-only flag. Rollback disables V2 and unwires the service/UI; it never restores Neo4j, browser-selected scope, fabricated data, or the deleted legacy route wholesale.

## UX & Interaction Patterns

- Preserve the desktop rail/map/inspector hierarchy: source and snapshot context, category filters and relationship legend, flexible 2D map with pan/zoom/fit/minimap, adjacent same-data text relationships, and a selected-node inspector. Stack these in reading order on narrow screens.
- Implement one default Knowledge Map. Omit Security Path and Methodology/Catalog modes until governed semantics exist; do not show simulated or disabled mode controls.
- Support filter, select, clear, neighborhood emphasis, and connected-node navigation. Show directed relationship labels for selected/focused edges and always in the text representation.
- The inspector presents only authorized label, kind, content or summary, lineage/version state, provenance, evidence state, directed relationship context, freshness, scope, and progressive-disclosure technical ID. It contains no mutation action.
- Canvas and text views consume identical node and edge arrays. Every node and relationship is keyboard operable through the text view with Enter/Space, visible focus, selection announcements, deterministic inspector focus/return, and reduced-motion behavior.
- At 320px and actual 200% zoom, the page has no page-level horizontal overflow and graph panning remains contained. Category, relationship, state, and risk never rely on color alone. Use the approved Command Center tokens and assets; do not introduce a new visual system.

## Cross-Story Dependencies

Story 31.1 establishes the architecture trace, schemas, state model, continuation contract, and rollout boundary before any route or UI relies on them. Story 31.2 then supplies the governed data/API seam and live authorization evidence. Story 31.3 consumes that exact contract for both visual and textual experiences. Story 31.4 follows implementation and repairs: Pike, Fowler, and Hightower provide independent signed reviews; every acceptance-ledger row receives implementation and validation evidence; the owner conducts a dated interactive walkthrough and separately approves or rejects release progression. Only that final explicit approval may close the epic.
