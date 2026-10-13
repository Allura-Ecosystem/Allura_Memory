# Knowledge Map Experience Contract

## Route and layout

This contract applies to `/dashboard/graph`, not Epic 30 `/dashboard` My Work.

The desktop hierarchy preserves the pinned Command Center intent:

1. source/snapshot/truth-state context;
2. category filters and relationship legend rail;
3. flexible 2D Knowledge Map with pan, zoom, fit, and minimap;
4. adjacent same-data textual relationship representation;
5. sticky selected-node inspector.

Counts may appear as secondary diagnostics. They never replace the map or establish acceptance.

## Required interaction

- Category and relationship filtering over the already authorized response.
- Pan, zoom, fit, node select, clear selection, and connected-node navigation.
- Selected-neighborhood emphasis without hiding the textual equivalent.
- Directed relationship labels on selected/focused edges and always in the text view.
- One default `Knowledge Map` experience preserving the prototype's Hive Map intent.

`Security Path` and `Methodology/Catalog` are deferred and omitted. Do not render disabled or simulated mode controls. They return only after governed query, authorization, and evidence semantics are approved.

## Inspector

For a selected node show:

- label and exact kind/category;
- authorized content or summary;
- status, version, deprecation, restoration, and supersession state where applicable;
- provenance and source;
- evidence references with explicit available, absent, or unavailable status;
- incoming/outgoing relationship type, direction, and connected-node label;
- source freshness and tenant/workspace context;
- partial, stale, or degraded qualifiers;
- technical ID under progressive disclosure.

Owner, risk, and quality appear only when authoritative. This correction exposes no editing, policy, promotion, or other mutation action.

## Truth states

- `loading`: visible and announced while no final payload exists.
- `complete`: authorized data fully returned within budget.
- `empty`: only after a healthy, complete, authorized zero-node result.
- `login-required`: authentication journey without protected context.
- `forbidden`: insufficient authority without names, counts, existence, or snippets.
- `partial`: valid bounded data with cause and continuation.
- `degraded`: identified fallback/source with no semantic-equivalence claim.
- `stale`: source or snapshot freshness is outside policy.
- `continuation-conflict`: changed snapshot/policy/query requires restart.
- `error`: sanitized failure, never a blank success canvas.
- `evidence-absent` versus `evidence-unavailable`: distinct inspector semantics.

## Responsive and accessible behavior

At narrow widths and actual 200% zoom, stack source/state, filters/legend, map, text relationships, and inspector. At 320px, the page has no horizontal overflow and graph panning stays inside its viewport.

Every node and relationship is operable through the text representation with Enter/Space. Controls have accessible names and visible focus. Selection is announced; inspector focus/return is deterministic. Reduced motion disables animated selection/edge effects. Category, relationship, state, and risk never rely on color alone.

## Product acceptance

`/dashboard/graph` passes product acceptance only when an authenticated viewer can use one tenant/workspace-scoped response to explore real nodes and directed relationships visually and textually; filter categories; pan, zoom, fit, select, clear, and follow relationships; inspect authorized content, provenance, evidence, version lineage, source, freshness, and scope; and distinguish every required truth state. The route remains usable at 320px, actual 200% zoom, by keyboard, and with a screen reader.

Synthetic nodes, silent ontology remapping, cross-scope disclosure, counts-only presentation, or simulated modes fail acceptance.
