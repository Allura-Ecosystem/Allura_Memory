---
title: '9.3 Persisted interactive Memory Map'
type: feature
created: 2026-10-27
status: in-progress
route: dispatch
baseline_commit: 27f1ecd3bd7c1f937bdeea82d2427f9713f2363f
---

<frozen-after-approval reason="Existing approved Epic9 intent; ordinary design details delegated by Sabir">

## Intent

Replace the explicitly unavailable graph screen with a usable interactive map of actual persisted same-workspace semantic lineage/equivalence and separately authorized source evidence. The same facts must be usable by keyboard and through a text/list alternative. Preserve retained Cream/Ink/Blue/Orange/Plex/AL composition, source→evidence→inspection ordering and honest current/history distinctions.

## Boundaries & Constraints

Always reuse current human identity, scoped DashboardTransport and `/api/memory/graph`/`get`; PostgreSQL canonical relationships remain source of truth. Bound40 semantic+20 evidence nodes, depth0–2 and finite layout work. Relationship labels are supersedes/exact_text/evidence, not invented people/file relationships. Graph distance is layout, never similarity. Filters apply to the fetched bounded slice; counts are displayed-slice counts only. Include evidence is opt-in and requires current evidence:read on server. Clear stale/denied data; malformed navigation cannot initiate a record selection. No new grants, migrations, dependencies, production reads/deployment, optional roadmap adoption or independent developer reviewers.9.4 actual-human/deployed acceptance remains separate.

## I/O & Edge-Case Matrix

| State | Action | Expected |
|---|---|---|
| Persisted approved correction | Include history, select connection/node | Actual supersedes edge, exact old/current versions, readable inspector and text relation |
| Current-only / filters | Read/filter bounded graph | No hidden history/evidence or dangling edges; explicit filtered/truncated/empty state |
| Keyboard / narrow viewport | Tab/Enter, pan/zoom/fit, List | Named controls, selected text/outline not color alone, phone defaults List, readable touch targets |
| Missing/foreign/malformed root | Open map/focus | Existing scoped not_found/denied/invalid; no foreign labels or fabricated fallback |
| Revoked/current authority changes | Select/refresh | Fresh server request; old content removed on denial; late replies never restore it |
| Malformed graph response | Validate/layout | Fail closed, no dangling/duplicate/oversized/unknown relation nodes; screen-level recovery |

</frozen-after-approval>

## Code Map

- `foundation/src/retrieval.ts` GraphOptions/graph and retrieval-api.ts: existing locked reads, current/history, root/depth, graph_evidence, both-endpoint authorization, counts/truncated. No new backend contract needed.
- `foundation/src/dashboard-contract.ts`: strict focus navigation, graph bounds; `dashboard-transport.ts`: cookie-only scope/current authority, abort/late/denial handling.
- `foundation/ui/main.tsx`: current shell, generation invalidation, Boundary; replace only graph placeholder with separately contained component.
- New `foundation/src/dashboard-graph.ts`: pure bounded parser/filter/layout; new `ui/memory-map.tsx`/`graph.css`: actual map, list, inspector and camera controls.
- `foundation/tests/retrieval.test.ts`: existing durable correction/foreign graph negatives; browser fixture builds real HTTPS application and Node Chromium scenarios with synthetic restricted PostgreSQL fixtures.
- Existing mandatory test discovery in `scripts/test.ts`, `scripts/test-db.ts`, `src/ci-contract.ts` must include new unit/browser cases. Pack-core already bundles all imported assets.

## Tasks & Acceptance

- [ ] Write red unit cases for strict graph shapes, endpoints/bounds, deterministic finite layout and subset filters, then implement pure module. Given malformed input, parsing rejects without partial display; given filters, every shown edge has both shown endpoints.
- [ ] Implement graph/list switch, search and relationship filters, current/history/evidence/root/depth reads, semantic inspector and evidence excerpt, selected neighborhood action, bounded pointer/keyboard pan/zoom/fit-width. Given a node, selection reauthorizes before disclosure; given a new read, previous graph/selection is cleared.
- [ ] Real Chromium test seeds approved correction through actual services, asserts rendered persisted edges/history/full details, filters, buttons, keyboard, phone List, denial/revocation clearing and malformed focus containment. Capture desktop/phone screenshots and inspect actual pixels.
- [ ] Run typecheck/lint, required unit and full real DB/browser discovery, direct self-diff, owned local commit and exact-source CI. Update usage/acceptance without closing9.4/Epic9 or deferred6.5 release gates.

## Design Notes

Delegated local defaults, not historical user mandates: deterministic grid avoids unstable physics/dependency cost; SVG directed connections with native HTML node buttons keep text/touch sizing independent of zoom. Camera changes node positions with bounded scale/pan, never implies semantic distance. Fit width restores a readable horizontal frame; large slices require pan or List rather than shrinking60 labels illegibly. Relationship text is always available in List/inspector. Source evidence inspector explicitly identifies graph excerpt versus full semantic get. Narrow default List and reduced-motion/no-animation follow9.1. No material irreversible action or unresolved product choice.

## Implementation Notes

## Verification

`bun test tests/dashboard-graph.test.ts`; typecheck/lint; real `dashboard-graph-browser.test.ts` on owned disposable PostgreSQL; `bun run check:all`; clean `bun run ci <exact full SHA>`. Save logs and screenshots under direct-build Operations. Direct build/self-check replaces stale reviewer delegation, not product independent human approval.
