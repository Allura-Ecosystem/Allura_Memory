---
title: 'Story 31.3: Interactive Knowledge Map and Inspector'
type: 'feature'
created: '2026-10-12'
status: 'done'
review_loop_iteration: 2
baseline_commit: '37f86b735b27835b5583f588ae490b1bfbe854e7'
context:
  - '{project-root}/_bmad_output/implementation-artifacts/epic-31-context.md'
  - '{project-root}/_bmad_output/implementation-artifacts/spec-31-2-governed-focused-subgraph-data-and-api.md'
  - '{project-root}/_bmad_output/specs/spec-dashboard-graph-alignment/SPEC.md'
  - '{project-root}/_bmad_output/specs/spec-dashboard-graph-alignment/experience.md'
  - '{project-root}/docs/design/command-center/operator-surface-contract.md'
  - '{project-root}/docs/design/command-center/project/Allura Memory Command Center.dc.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/dashboard/graph` still substitutes four counters for the preserved interactive Knowledge Map, so operators cannot explore or inspect the governed Story 31.2 graph.

**Approach:** Restore the preserved Command Center shell and Knowledge Graph composition faithfully, then project the frozen focused-subgraph contract as an owner-directed connected knowledge brain: compact identity nodes and governed relationships in the canvas, with the full record card revealed only after selection in the inspector. Do not change governed data, authentication, or truth-state behavior.

## Boundaries & Constraints

**Always:** Keep server-derived page/API authority; validate contract-v2 responses; render only real returned nodes/edges; preserve explicit unknown kinds; use identical arrays for canvas and text; reproduce the governing `.dc.html` shell and Graph composition with approved current Allura tokens; preserve the branded 248px navigation, 64px truthful context header, Knowledge Graph hierarchy, 204px filter/relationship rail, flexible warm dotted canvas, 320px evidence inspector, rounded paper surfaces, compact category-accented brain nodes, and inspector card anatomy; expose named controls, visible focus, announcements, deterministic inspector focus/return, reduced motion, and contained panning; distinguish every required truth/evidence state without leaking protected data.

**Ask First:** Any change to the Story 31.1/31.2 contract, API, auth, rollout, taxonomy, pinned hierarchy, required state semantics, or approved omission of unsupported modes; any new graph dependency or visual variance that changes the preserved Command Center composition rather than restoring it.

**Never:** Restore the deleted page wholesale; import legacy Neo4j mappers, platform seeds, mock production data, database/graph drivers, or authority selectors; simulate Security Path or Methodology/Catalog; add 3D, mutation, edit, policy, promotion, or HITL controls; treat counters, screenshots, or HTTP success as interaction proof.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Governed map | Complete/partial contract page | Real labeled graph and same-data text; filters, controls, selection, navigation, inspector | Partial is labeled; append/deduplicate or restart safely |
| Empty/denied/failure | Empty, login-required, forbidden, degraded, conflict, error | Distinct non-leaking state; no blank accepted canvas | Login, retry, or restart action matches contract only |
| Inspection | Available/absent/unavailable evidence; lineage/unknown kinds | Authorized fields and directed context; technical ID disclosed progressively | Never infer missing evidence or taxonomy |
| Narrow/keyboard | 320px, 200% zoom, reduced motion, keyboard-only | Ordered stack, no page overflow, contained map, Enter/Space parity, focus return | Canvas is never the only operable representation |

</frozen-after-approval>

## Code Map

- `src/app/dashboard/graph/page.tsx:8` -- retain `requireDashboardPage` and replace the counters with the client workspace.
- `src/app/api/memory/graph/route.ts:39` -- frozen same-origin request/status seam; UI sends traversal intent only.
- `src/lib/subgraph/contract.ts:344` -- canonical response schemas/types; no legacy graph type conversion.
- `src/components/graph/graph-canvas.tsx:164` -- reuse React Flow controls/minimap/neighborhood concepts, not its types/layout.
- `src/components/dashboard/graph/detail-panel.tsx:104` -- visual anatomy reference only; replace fixed width and inert relationships.
- `docs/design/command-center/project/Allura Memory Command Center.dc.html:348` -- pinned rail/map/inspector and navigation reference; demo data/modes/actions are prohibited.
- `src/app/globals.css:7` -- approved tokens, focus, inspector, and reduced-motion precedents; prefer a scoped CSS module.
- `src/components/dashboard/__tests__/my-work-workspace.test.tsx:184` -- keyboard, focus-return, state, and responsive test patterns.
- `scripts/epic30/verify-reader.cjs:20` -- browser evidence pattern for viewports, overflow, screenshots, hashes, and receipts.
- `src/__tests__/focused-subgraph-live-db.e2e.test.ts:208` -- reuse real data/authority receipts; add visible DOM-to-API identity correlation.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/subgraph/browser-client.ts`, `src/lib/subgraph/browser-client.test.ts`, `src/test/fixtures/focused-subgraph.ts` -- build an abortable authority-free query client plus schema-valid test-only state fixtures.
- [x] `src/components/dashboard/knowledge-map/*` -- implement contract view model, filters/legend, React Flow map, text relationships, inspector, controls, continuation/restart, announcements, and exhaustive state presentation.
- [x] `src/components/dashboard/dashboard-shell.tsx`, `dashboard-shell.module.css` -- restore the shared protected Command Center frame, verified brand asset, icon navigation, active orange rail, truthful context header, and cream/paper hierarchy.
- [x] `src/app/dashboard/graph/page.tsx`, `src/components/dashboard/knowledge-map/*` -- repair the rejected candidate so the guarded workspace faithfully implements the governing Knowledge Graph composition and owner-directed compact knowledge-brain model at desktop and responsive widths.
- [x] `src/components/dashboard/knowledge-map/__tests__/*`, `vitest.config.unit.ts`, `scripts/token-compliance.sh` -- prove matrix behavior, same-array parity, keyboard/focus, non-leakage, reduced motion, and token/import guards.
- [x] `playwright.config.ts`, `tests/playwright/knowledge-map.spec.ts`, `scripts/epic31/verify-knowledge-map.cjs`, `package.json` -- add scoped browser, real-data correlation, interaction, responsive, accessibility, screenshot, and evidence-receipt gates for GRAPH-01..31.

**Acceptance Criteria:**
- Given an authorized response, when the page loads, then the preserved rail/map/text/inspector hierarchy renders real compact identity nodes and directed labeled edges with filters, sparse-aware minimap, pan/zoom/fit, selection, clearing, emphasis, and connected-node navigation; summaries and record metadata remain out of the canvas.
- Given the governing Command Center prototype and the owner's 2026-10-13 correction, when the repaired page is compared at the same viewport, then shell identity, navigation/header hierarchy, 248px/64px frame, 204px/flexible/320px Graph composition, paper/cream surfaces, connected-brain topology, and evidence inspector match the accepted direction; the prototype's card nodes are superseded by compact circular nodes whose full record card opens in the inspector.
- Given any approved truth or evidence state, when rendered, then its semantics and action are distinct, accessible, contract-valid, and non-leaking.
- Given keyboard-only, reduced-motion, 320px, and actual 200% zoom use, when navigating the same payload, then text parity, focus/announcements, contained panning, and zero page-level horizontal overflow hold.
- Given component, browser, real-data, and visual comparison evidence, when GRAPH-01..31 are audited, then each UI-owned row has a valid proof and unsupported modes remain absent.

## Spec Change Log

- 2026-10-12 — Step 4 review repaired Story 31.2 inspection projection so every admitted lineage edge is represented in `relationshipKeys`; the frozen contract and API shape remain unchanged.
- 2026-10-13 — Reopened after owner rejection. The earlier implementation weakened the mandatory visual reference into a structural/token-only check. GRAPH-29/30 were reset; the exact Command Center composition is now an explicit acceptance requirement while data/auth contracts remain frozen.
- 2026-10-13 — Human renegotiation: the canvas must read as a connected knowledge brain, not a board of record cards. Compact icon/label nodes now own the overview; selection reveals the full governed card in the inspector. This supersedes only the prototype's node-card treatment, not its shell, layout, tokens, or inspector authority.

## Design Notes

Use `docs/design/command-center/project/Allura Memory Command Center.dc.html` as the shell and composition authority, not merely a loose proportion reference. Preserve its branded paper sidebar, contextual header, Knowledge Graph product hierarchy, separated rounded panels, warm dotted canvas, labeled governed relationships, and evidence-first inspector. The owner's latest direction supersedes the prototype's canvas card anatomy: use compact circular identity nodes and open the full governed record card only in the inspector. Apply the approved current Allura tokens and IBM Plex families; do not invent demo data, unsupported modes, decorative effects, or fields unavailable from the governed contract. Contract/revision metadata is secondary and belongs in compact context or progressive disclosure, never the hero hierarchy.

## Verification

**Commands:**
- `bun vitest run src/lib/subgraph/browser-client.test.ts src/components/dashboard/knowledge-map` -- focused UI/client suites pass.
- `bun run typecheck && bun run lint:ci --base=37f86b73 && bun run validate:tokens` -- types, changed-file lint, and token/import guards pass.
- `bun run test:unit && bun run build` -- repository regression and production build gates pass.
- `bun run test:graph:browser` -- provision a disposable migration-backed database, then pass interaction, accessibility, responsive, visual, real-data, hashed-receipt, and cleanup gates.
- `git diff --check` -- no whitespace errors.
- `git diff -- src/lib/subgraph/contract.ts src/lib/subgraph/read-service.ts src/lib/graph-adapter/types.ts src/app/dashboard/page.tsx` -- no frozen contract, service, adapter, or Epic 30 My Work diff.

## Suggested Review Order

**Guarded entry and authority boundary**

- Start with the guarded route mounting the single governed Knowledge Map.
  [`page.tsx:7`](../../src/app/dashboard/graph/page.tsx#L7)

- Same-origin serialization validates every response against its originating query.
  [`browser-client.ts:59`](../../src/lib/subgraph/browser-client.ts#L59)

**Request ownership and truth semantics**

- Central state ownership keeps graph, selection, warnings, and inspection synchronized.
  [`knowledge-map-workspace.tsx:119`](../../src/components/dashboard/knowledge-map/knowledge-map-workspace.tsx#L119)

- Continuation merging rejects snapshot drift, identity conflicts, and no-progress loops.
  [`knowledge-map-workspace.tsx:181`](../../src/components/dashboard/knowledge-map/knowledge-map-workspace.tsx#L181)

- Abort and sequence ownership prevent stale requests from overwriting newer intent.
  [`knowledge-map-workspace.tsx:227`](../../src/components/dashboard/knowledge-map/knowledge-map-workspace.tsx#L227)

- Contract states map to distinct, non-leaking recovery actions.
  [`knowledge-map-workspace.tsx:365`](../../src/components/dashboard/knowledge-map/knowledge-map-workspace.tsx#L365)

**Map, text parity, and inspection**

- One filtered array pair drives filters, canvas, text relationships, and inspector.
  [`knowledge-map-workspace.tsx:419`](../../src/components/dashboard/knowledge-map/knowledge-map-workspace.tsx#L419)

- Fixed layout preserves directed labels, emphasis, controls, and deterministic selection.
  [`knowledge-map-canvas.tsx:20`](../../src/components/dashboard/knowledge-map/knowledge-map-canvas.tsx#L20)

- Responsive stacking contains panning and eliminates page-level overflow.
  [`knowledge-map.module.css:492`](../../src/components/dashboard/knowledge-map/knowledge-map.module.css#L492)

**Governed lineage integrity**

- Inspection relationship keys include every admitted neighborhood lineage edge.
  [`read-repository.ts:415`](../../src/lib/subgraph/read-repository.ts#L415)

- Authority scanning blocks storage drivers across static, dynamic, and relative imports.
  [`token-compliance.sh:178`](../../scripts/token-compliance.sh#L178)

**Verification and evidence**

- Stateful component tests cover pagination, conflicts, races, filtering, and focus.
  [`knowledge-map-workspace.test.tsx:157`](../../src/components/dashboard/knowledge-map/__tests__/knowledge-map-workspace.test.tsx#L157)

- Real-browser proofs correlate API identities, canvas behavior, lineage, and responsive reflow.
  [`knowledge-map.spec.ts:34`](../../tests/playwright/knowledge-map.spec.ts#L34)

- Disposable migration-backed PostgreSQL isolates evidence and guarantees cleanup.
  [`run-knowledge-map-browser.sh:18`](../../scripts/epic31/run-knowledge-map-browser.sh#L18)
