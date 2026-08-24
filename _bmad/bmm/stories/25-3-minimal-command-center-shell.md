# Story 25.3 — Focused 2D Knowledge Map Shell

**Status:** Planned
**Owner:** Woz + Pike
**Depends on:** 25.1, 25.2, 25.2a
**Blocks:** 25.3b, 25.4, and optional Story 25.3a

## Outcome

Render one authenticated `/dashboard/curator` route for one job: **see what your team knows about one review item, where it came from, and what still needs review.** The primary view is a server-authorized bounded 2D Knowledge Map, not a dashboard shell or whole-workspace graph.

## Acceptance Criteria

- [ ] The route derives scope from authenticated server context and sends only typed `SubgraphQuery` intent. Browser URL/header/body values cannot choose group, workspace, role, or policy scope.
- [ ] The primary map renders only the bounded `SubgraphResponse` for the current authorized anchor. It states whether the view is complete, bounded, partial, degraded, empty, or denied.
- [ ] Each returned node and edge has a plain-language label, freshness/review state, and evidence reference or declared derived-source rule.
- [ ] Selecting a node opens a source-first detail panel with a summary, sources, freshness, review state, receipt/provenance link when applicable, and optional technical details.
- [ ] A same-data text relationship list is adjacent to the map and lets a keyboard/screen-reader user complete the inspection without canvas gestures.
- [ ] Primary copy uses sixth-grade language: `What your team knows`, `Knowledge map`, `Sources for this answer`, `May be old`, `Needs more proof`.
- [ ] Loading, empty, denied, stale, partial/degraded, and complete states are distinct and never show stale node/count/source data from a prior state.
- [ ] Desktop map/detail layout targets 61.8% / 38.2%; small screens stack in the Pike-defined reading order.
- [ ] Route smoke, ARIA/keyboard tests, and focused-subgraph render-budget evidence pass. No 3D, decision controls, broad navigation, fake metrics, or mock production data ships.

## Evidence

- Playwright role/name route smoke and keyboard traversal.
- ARIA snapshot for map summary, selected node, detail panel, text relationship list, and state changes.
- Token-compliance and Pike accessibility review output.
- Bellard focused-subgraph response/render-budget artifact.

## Rollback

Disable the route and return to governed MCP/API/CLI review. The map has no mutation path or retrieval authority of its own.
