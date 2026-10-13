# Sprint Change Proposal — Restore the Governed Command Center Graph Experience

**Date:** 2026-10-12  
**Owner:** Brooks (architecture chair)  
**Mode:** Batch  
**Scope classification:** Moderate direct adjustment  
**Status:** Approved for bounded implementation by the human owner  
**Gate Status:** REOPENED — OWNER REJECTED VISUAL CANDIDATE; REPAIR IN PROGRESS
**Tenant boundary:** `allura-system`

`READY FOR NEXT PHASE` means this Correct Course proposal is ready for a human approve/revise/reject decision. It does not authorize implementation, tracker mutation, deployment, or any acceptance claim.

## Change statement

> Restore alignment between Allura’s preserved Command Center UX and its dashboard implementation. The current summary-only Graph page does not satisfy the intended interactive graph experience. Reconcile design authority, identify missing capabilities, and revise acceptance criteria and stories before further implementation. Preserve the current governed data and authentication boundaries.

## 1. Issue summary

The current `/dashboard/graph` implementation renders four counts: active graph memories, superseded memories, structural nodes, and structural edges. It does not render graph nodes or relationships, cannot select or navigate nodes, and provides no graph inspector for memory content, provenance, evidence, or relationship context.

This is a requirement/acceptance drift, not a new design request. The preserved Command Center prototype, the approved operator-surface contract, the canonical requirement matrix, the October 12 user correction recorded in Allura Brain, and historical graph stories all require an explorable graph or memory map. The current summary route was restored later as a bounded portfolio surface and was never evidence that the interactive experience had been accepted.

The core failure is:

> A route that returns successfully and displays graph counts does not satisfy a requirement that an operator can explore a governed graph.

### Trigger evidence

- Current route: `src/app/dashboard/graph/page.tsx:8-35` calls `getGraphStats()` and renders only counts.
- Current read model: `src/lib/dashboard/read-service.ts:55-60,153-176` exposes only four numeric fields for the page.
- Preserved prototype: `docs/design/command-center/project/Allura Memory Command Center.dc.html:333-506` defines a three-column graph workspace with filters/legend, an interactive node/edge canvas, modes, states, and a right inspector.
- Approved operator contract: `docs/design/command-center/operator-surface-contract.md:9,14,45-49,55-59` requires inspectable provenance/tenant/authority/outcomes, a readable map with labeled connections and equivalent text, explicit truth states, and accessible controls.
- Canonical requirements: `docs/allura/REQUIREMENTS-MATRIX.md:430,461-463,488` require real graph data, a server-owned subgraph contract, distinct states, evidence-bearing nodes/edges, relational authorization first, an equivalent text relationship list, and keyboard/screen-reader operation.
- Canonical UX use case: `docs/allura/DESIGN-ALLURA.md:868-882` requires an interactive graph, node click, a `NodeDetailPanel`, and visible relationship types.
- Governed correction: Allura Brain memory `6a99498b-49e9-40f5-b1d0-03131927a4b8` records the 2026-10-12 rejection of the summary-only Graph as a mismatch.
- Git history: `ad420101e` removed the earlier 514-line interactive Graph route on 2026-06-20; `acb4e98a0` restored the current 35-line count route on 2026-09-01.
- Restoration boundary: `_bmad_output/implementation-artifacts/spec-dashboard-demo-readiness.md:18` describes the September restoration as a thin governed recovery and warns against blindly restoring the deleted dashboard; it is not interactive-Graph acceptance.

## 2. Design authority matrix

| Requirement | Source | Revision / reference | Current implementation | Conflict? | Governing decision |
|---|---|---|---|---|---|
| Graph must be an explorable operator experience, not counters | User correction + Allura Brain | 2026-10-12; memory `6a99498b-49e9-40f5-b1d0-03131927a4b8` | Four-count definition list | Yes | Latest explicit user correction governs. Summary tiles may supplement the graph but cannot replace it. |
| Visible nodes and relationships | Preserved Command Center prototype | Commit `8e8d3edf`; SHA-256 `d67a92be…a523c4edc`; HTML lines 333-449 | No canvas on active route | Yes | Restore the interaction intent using real governed data. Prototype seed data is illustrative only and must not ship as live data. |
| Category controls, relationship legend, graph navigation, minimap | Preserved prototype | HTML lines 340-425, 1107-1181 | Active route has none; surviving `src/components/graph/graph-canvas.tsx` has React Flow controls/minimap but is not mounted | Yes | Required where backed by the approved data contract. Unsupported prototype modes must be explicitly deferred, never simulated. |
| Select node and inspect details, relationships, evidence | Preserved prototype | HTML lines 451-505, 1158-1173 | Active route has no selection or inspector | Yes | Required. Minimum governed inspector fields are content/summary, provenance/source, evidence availability, relationship context, scope/freshness, and honest unavailable values. |
| Readable map and equivalent text | Approved operator contract | Status approved; restored commit `c3f85288`; SHA-256 `f05bf91e…97692c13`; lines 45-46 | No map and no relationship list | Yes | Both visual graph and same-data textual relationship representation are required. |
| Real tenant/workspace-scoped data only | REQ-DASH-001/006/007; user brief | `REQUIREMENTS-MATRIX.md:425,430-431` | Counts are real/scoped; full API returns scoped structural data | Partial | Preserve server-derived tenant/workspace scope, restricted transaction, RLS, and no fabricated nodes. |
| Server-owned focused subgraph contract | REQ-MAP-001/002 | Introduced by commit `9f8e5dac`; matrix lines 461-462 | No `SubgraphQuery`/`SubgraphResponse` implementation; current API uses an ad hoc node/edge shape | Yes | Define and approve the typed read contract before UI implementation. Do not widen scope client-side. |
| Evidence/version references on nodes and edges | REQ-MAP-001 | Matrix line 461 | Current API strips source/target props to empty metadata and edge relationship type only | Yes | Contract and mapping must expose governed references or an explicit unavailable state without leaking unauthorized data. |
| Relational authorization first, deterministic budgets | REQ-MAP-002 | Matrix line 462 | API is scoped and capped at 150 edges, but has no focused traversal, deterministic ordering, continuation, or complete/partial status | Partial | Keep server-derived scope and add deterministic query/budget/state semantics. Initial caps are safety limits, not completeness claims. |
| Honest loading, empty, denied, partial/degraded, and error states | User brief; REQ-MAP-001; operator contract | Matrix line 461; contract lines 55-59 | Server page supports live/empty/degraded/error; no graph loading/partial state; unauthorized redirects; API degrades to an event-derived graph | Partial | States must remain distinct. A blank canvas is never empty-state evidence. Event fallback must be labeled degraded context, not semantic-graph equivalence. |
| Governed API/MCP boundary | REQ-GOV-007; REQ-RV-001 | Matrix lines 393,415 | UI page reads graph counts directly through `read-service`; graph API directly queries graph tables rather than an approved focused-subgraph seam | Yes | UI consumes one server-owned graph contract. Reconcile whether the implementation extends `IGraphAdapter` or introduces a governed read repository; no browser or unscoped substrate access. |
| Authentication and tenant isolation | Current auth/RLS code | `dashboard-principal.ts:8-47`; `page-guard.ts:12-27`; graph API lines 135-170; migration 40 | Strong surviving implementation | No | Preserve. Clerk/DevAuth principal, workspace requirement, forged-scope `403`, restricted app-role transaction, and RLS remain non-negotiable. |
| Visual identity and composition | Owner rejection + preserved Command Center prototype + protected baseline + Epic 25 token authority + operator contract | Owner statement 2026-10-13; `.dc.html` lines 44-125 and 333-505; baseline `6f104bc1851e8f190bb595573cb9a80d67eb98bb`; `DESIGN.authority.md:3-9`; operator contract lines 16-35 | Rejected candidate keeps only a generic rail/map/inspector skeleton, omits the protected branded shell and contextual header, elevates contract metadata, and substitutes flat developer-oriented boxes for the approved Knowledge Graph language | Yes | The `.dc.html` is the visual/composition authority and must be reproduced faithfully with approved current tokens and real governed data. The shell, hierarchy, navigation identity, 248px/64px frame, 204px/flexible/320px Graph anatomy, rounded paper panels, node-card language, and evidence inspector are acceptance requirements. Variances require explicit evidence and approval; token equivalence alone cannot satisfy fidelity. |
| Typography | Epic 25 design authority vs operator contract | `DESIGN.authority.md:7` says Aeonik with IBM Plex/system fallbacks; operator contract line 29 says IBM Plex Sans | Yes | Use a verified existing font asset only. IBM Plex Sans is the safe governed fallback; do not add or claim Aeonik without verified licensed assets. |
| Tracker completion | Notion canonical Work Items | Story 2.5 and DASH-04 currently `Done`; E2.4 `Not Started` | Current route contradicts Done claims | Yes | `Done` is historical delivery status, not present acceptance. Create a correction story and link/supersede stale claims; do not rewrite history as if prior evidence never existed. |
| Epic 30 graph-canvas non-goal | Epic 30 PRD + governed workspace spec | `epic-30-prd.md:33-35`; `epic-30-governed-digital-brain-workspace.md:34-42` | Epic 30 replaces a canvas with focused lineage inside its bounded `/dashboard` **My Work** reader, while this correction targets the existing `/dashboard/graph` operator route | Yes | The 2026-10-12 correction supersedes the Epic 30 graph-canvas non-goal only for the separate `/dashboard/graph` route. Epic 30's `/dashboard` My Work reader remains text-link/focused-lineage based; this correction does not add a canvas, arbitrary layouts, or graph acceptance to Epic 30. |
| Exact architecture trace for Knowledge Map | REQ-MAP-001..003 now trace `AD-64` | Matrix lines 461-463; AD-64 approved 2026-10-12 | Canonical AD-59 remains `endpoint_isolation`; AD-64 governs the dedicated relational focused-subgraph repository | Resolved | Keep AD-59 unchanged. AD-61..63 remain reserved by existing requirement traces and their missing canonical rows are tracked separately. |
| Production graph backend | Canonical AD-49/AD-50 | `RISKS-AND-DECISIONS.md` current graph cutover/sunset decisions | Archived stories and old UI copy still say Neo4j | Yes | PostgreSQL/RuVector is current authority. Neo4j references are historical implementation context only. |

### Authority resolution

1. The October 12 human correction is the newest explicit product decision and rejects the count-only route as acceptable Graph UX.
2. The approved operator contract governs trust, accessibility, and truth-state behavior.
3. The preserved HTML prototype governs interaction intent and layout reference, not production data. Its hard-coded nodes, counts, and people are demonstrative and cannot be shipped as live content.
4. Canonical requirements govern data/auth/traceability. AD-64 now supplies the corrected focused-subgraph decision reference; AD-59 remains the endpoint-isolation decision.
5. Historical Notion “Done” records and green route tests document earlier delivery; they do not override later deletion, restoration, or the current source.
6. Epic 30 governs the bounded `/dashboard` My Work reader. The newer correction governs the separate `/dashboard/graph` route and does not silently alter Epic 30 acceptance, status, or evidence.
7. Current code and schemas are authoritative for what exists now, not for what the product requirement should be.

## 3. Intended behavior, current behavior, divergence

### Intended behavior

An authenticated operator enters `/dashboard/graph` and sees a real, tenant/workspace-scoped 2D graph. Nodes and labeled relationships are visible. The operator can pan/zoom, filter, select a node, follow relationships, and inspect the selected record’s governed content, provenance, evidence references, relationship context, source/freshness, and scope. The same relationships are available in text for keyboard and screen-reader use. Loading, empty, denied, partial/degraded, and error states are visually and semantically distinct.

### Current behavior

- The page resolves a server-owned principal and workspace correctly.
- It runs a restricted tenant/workspace read correctly.
- It displays only four counts.
- The full graph API can return structural nodes/edges incident to up to 150 edges.
- It omits isolated structural nodes and does not return `graph_memories` or `graph_supersedes` in the full graph payload.
- It drops node properties into empty metadata and exposes no provenance/evidence contract.
- It has no focused traversal, node inspection request, deterministic ordering, signed continuation, partial/completeness state, or same-data text view.
- On graph-query failure it may return an event-derived graph marked `degraded`; this is real scoped PostgreSQL data but not equivalent to the semantic/structural graph.
- Substantial React Flow graph components survive under `src/components/graph/`, but the active page does not mount them and their types/relationship vocabulary do not match the active API contract.

### Divergence

The active route preserves trustworthy scope and truth-state foundations but replaced the core user capability—graph exploration—with operational counters. Existing API and component pieces are insufficiently aligned to reconnect safely without first defining the contract.

## 4. Affected scope

### Product and planning

- Notion Work Items: Story 2.5, DASH-04, E2.4, and the completed “Epic 16: Operator Workspace and Command Center.”
- BMAD: archived Story 8.3 and Story 11.4; current Epic 25 map requirements; sprint-status entries and any route-parity claims that equate response/route existence with UX acceptance.
- Epic 30: preserve the bounded `/dashboard` My Work reader and its focused-lineage design; record that the latest Graph correction applies only to `/dashboard/graph` and is not Epic 30 acceptance evidence.
- Canonical requirements: REQ-DASH-001/006/007, REQ-GOV-007, REQ-RV-001, REQ-MAP-001..003, REQ-UX-003.
- Design: approved operator contract, preserved Command Center prototype, Epic 25 design authority.

### Implementation

- `src/app/dashboard/graph/page.tsx`
- `src/lib/dashboard/read-service.ts`
- `src/app/api/memory/graph/route.ts`
- a new/approved typed focused-subgraph contract and server-owned read seam
- `src/components/graph/*` after fit-gap review rather than blind reuse
- graph route, authority, accessibility, integration, and live-DB tests

### Architecture and security

- Preserve Clerk/DevAuth principal derivation, viewer-or-higher authorization, server-derived `group_id` and `workspace_id`, `withWorkspaceTransaction`, forced RLS, and fail-closed scope assertions.
- Preserve the corrected REQ-MAP → AD-64 trace and leave endpoint-isolation AD-59 unchanged.
- Decide the governed query seam: extend `IGraphAdapter` for read-only focused subgraphs or create a separate read repository explicitly authorized by a corrected ADR. Do not overload the existing memory CRUD adapter accidentally.
- Define evidence/provenance references without exposing cross-scope content.

### Out of scope for this correction

- Rebranding the Command Center.
- Reintroducing Neo4j as production authority.
- Direct browser database/Bolt access.
- Mock or hard-coded production graph content.
- 3D graph rendering.
- New graph libraries unless the approved implementation review proves the existing dependency cannot satisfy the contract.
- Changing promotion, mutation, or HITL policy.

### PRD/MVP and remaining-epic impact

- **Epic 30 conflict resolution:** Epic 30 explicitly excludes a graph canvas from its bounded `/dashboard` My Work reader. This correction does not modify that reader. The later 2026-10-12 human correction restores the distinct `/dashboard/graph` operator route, superseding the Epic 30 non-goal only for that route. Epic 30 stories, status, five-human protocol, and acceptance evidence remain unchanged.
- **Epic 25:** its design authority and governed console constraints remain inputs. This correction does not broaden dashboard authority or create a new authorization plane.
- **Epics 18–23:** graph cutover and Neo4j-sunset records remain historical architecture context. No backend reversal is proposed; active PostgreSQL/RuVector boundaries govern.
- **Epic 24:** its evidence-before-presentation gate is preserved. The graph cannot become release evidence until the requirement matrix is proven.
- **Epics 26–28:** source scanning, branchable learning, and documentation-consolidation scope are unchanged. Their shared server-derived authority and relational-authorization-first constraints remain dependencies, not new work in this correction.
- **Future epics and ordering:** no planned epic is invalidated, removed, or renumbered. The bounded Graph correction must be scheduled after the architecture trace/contract decision and before any claim that dashboard Graph parity is complete. No new product epic is required if the governed planning process accepts the four-story correction package.
- **MVP effect:** counters are not an acceptable reduction of the Graph capability. The correction adds no new product intent; it restores previously required interaction under current governance. Schedule impact is a contract/reconciliation slice before implementation, with no completion date asserted yet.

## 5. Surviving useful implementation

The correction should preserve and build on:

- server-owned dashboard principal derivation and workspace guard;
- viewer-or-higher API authorization and forged-scope denial;
- restricted `withWorkspaceTransaction` and RLS boundaries;
- RuVector/PostgreSQL graph tables and workspace-scope migrations;
- current truthful `SurfaceState` primitives, expanded for partial/denied/loading where necessary;
- the read-only graph API route as a routing surface, after its contract is replaced/reconciled;
- React Flow already present in the repository;
- surviving canvas controls/minimap, selection plumbing, filters, legend, and inspector components only after data/type/accessibility/brand fit-gap review;
- current graph authority tests as security regression seeds, not UX acceptance evidence.

Do not restore the old 514-line page wholesale. It contains obsolete Neo4j copy, hard-coded `allura-system` browser scope, incomplete accessibility, direct fetch assumptions, and contract drift.

## 6. Missing capability

1. Approved focused-subgraph request/response schema.
2. Governed node and relationship mapping across graph memories, supersession, structural nodes/edges, provenance, and evidence references.
3. Deterministic focused traversal with explicit budgets and completeness/partial status.
4. Visual node/edge canvas wired to the governed response.
5. Selection, relationship navigation, and inspector behavior.
6. Same-data textual relationship list and complete keyboard/screen-reader interaction.
7. Honest loading, empty, unauthorized/denied, partial, degraded, evidence-unavailable, and error presentations.
8. Design comparison against the exact preserved prototype revision.
9. Requirement-by-requirement evidence pack and human acceptance.
10. Tracker reconciliation so old “Done” claims cannot be mistaken for current completion.

## 7. Recommended approach

### Selected path: direct adjustment with bounded contract correction

Keep the useful auth, tenant isolation, RLS, and database work. Add a correction story/epic slice that first repairs the architecture trace and focused-subgraph contract, then reconnects the UI, then proves each acceptance requirement.

### Why not rollback

Rolling back to the June 17 graph page would reintroduce obsolete Neo4j language, hard-coded browser scope, and an earlier response model. Its interaction structure is useful reference code, but it is not safe as a complete solution.

### Why not reduce MVP to counters

Counters contradict the approved operator intent and the latest human decision. They may remain secondary context, but cannot be the Graph experience.

### Effort and risk

- **Effort:** Medium-to-high. UI composition is partly available; governed data contract, evidence mapping, accessibility, and live proof are the substantive work.
- **Risk:** High if UI is wired before the contract; medium under the proposed sequence.
- **Schedule effect:** Add a contract/reconciliation slice before frontend implementation. No completion date is asserted until the corrected story is estimated from the approved contract.

## 8. Proposed artifact changes (old → new)

### Notion Story 2.5

**OLD**

> `/dashboard/graph` consumes existing `/api/memory/graph`; no browser Neo4j/Bolt credentials; graph renders live nodes/edges with stable degraded-state handling. Status: Done.

**NEW / correction linkage**

> Historical delivery record. Superseded for current acceptance by “Graph Course Correction — Governed Interactive Knowledge Map.” The current route must render the approved interactive graph, not counts. Completion requires the GRAPH evidence matrix and explicit human acceptance. Do not delete prior evidence; link this item to the correction.

### Notion DASH-04

**OLD**

> Dark canvas renders at 680px height. Placeholder nodes visible on empty state. Status: Done.

**NEW / correction linkage**

> Historical prototype acceptance only. Placeholder nodes are prohibited in live/empty production states. Empty means the governed query completed with zero authorized records; otherwise render denied, degraded, partial, or error truthfully.

### Notion E2.4

**OLD**

> All 6 node types clickable. Keyboard navigation works (Enter/Space). ARIA labels correct. Detail panel opens on selection. Status: Not Started.

**NEW**

> Fold into or block on the correction story. Expand to all rendered node types, relationship-list navigation, visible focus, screen-reader names/descriptions, equivalent text data, reduced-motion behavior, and inspector focus management.

### Canonical requirements

**OLD**

> REQ-MAP-001..003 traced to AD-59, while canonical AD-59 concerns endpoint isolation.

**NEW / applied**

> AD-64 governs a dedicated PostgreSQL focused-subgraph read repository. `IGraphAdapter` remains the canonical-memory lifecycle/storage boundary. REQ-MAP-001..003 now trace to AD-64; AD-59 remains unchanged.

### BMAD delivery plan

Create a bounded correction package (story numbers assigned through the project’s governed planning process):

1. **Architecture/contract story:** correct ADR trace; define Zod-validated `SubgraphQuery`/`SubgraphResponse`, node/edge/evidence/state semantics, limits, ordering, continuation, and rollback.
2. **Data/API story:** implement the server-owned read seam, preserve auth/RLS, include isolated authorized nodes where appropriate, and add live-DB tenant/security tests.
3. **Interactive UI story:** implement canvas, labels, filters, controls, selection, navigation, inspector, same-data relationship list, and honest states against the typed contract.
4. **Acceptance/evidence story:** functional, visual, accessibility, security, performance-budget, and design-fidelity proof; reconcile Notion/sprint status only after evidence and human approval.

## 9. Acceptance contract

### Graph visualization

- Actual visible graph nodes are rendered from the authorized response.
- Actual visible relationships/edges are rendered from the same response.
- Relationship labels are visible on selection/focus and present in the text relationship list.
- Counts/summary tiles, if retained, are secondary and never substitute for the graph.
- No placeholder, seeded, or synthetic production-looking nodes appear in live, empty, denied, degraded, partial, or error states.

### Exploration

- A user can pan and zoom the 2D graph with accessible controls.
- A user can select/focus a node and clear selection.
- Filters operate on the authorized response and cannot reveal out-of-scope counts or hidden relationships.
- Selecting a relationship in the text list or inspector can navigate to the connected authorized node.
- The approved Hive/Security/Methodology modes are either backed by real contract semantics or listed as explicit approved variances/deferred capabilities. They are never simulated.

### Node inspection

- Selecting a memory node exposes governed memory content or an authorized summary.
- Provenance/source is shown when authorized; unavailable is explicit.
- Supporting evidence references and evidence availability are shown when authorized; absence and unavailable are distinct.
- Relationship direction/type and connected-node context are shown.
- Source, freshness, tenant/workspace context, version/deprecation state, and partial/degraded status are visible or available through technical details.

### Governed data and authorization

- Data comes from the current PostgreSQL/RuVector architecture through the approved server-owned contract.
- Scope derives from the authenticated server principal, never browser-selected `group_id`/workspace authority.
- A conflicting caller scope fails before querying.
- Reads execute with the restricted app role and enforced tenant/workspace RLS.
- No UI code imports database or graph drivers.
- Cross-tenant, cross-workspace, missing-scope, insufficient-role, and stale/invalid-continuation tests fail closed without leaking counts, labels, or existence.

### Truthful states

- Loading is visibly and semantically distinct from empty.
- Empty is shown only after a successful complete authorized query returns zero nodes/edges.
- Unauthorized/login-required and forbidden/insufficient-role outcomes are distinct and tested.
- Partial is distinct from complete and explains budget/continuation.
- Degraded fallback identifies its source and never claims semantic equivalence.
- Error does not expose secrets or backend detail and never renders a blank canvas as success.
- Missing/unavailable evidence is explicit.

### Accessibility and design fidelity

- The graph has an adjacent same-data textual relationship representation.
- Every node and relationship is keyboard reachable through the accessible representation; Enter/Space behavior is defined.
- Visible focus, accessible names, inspector focus management, and reduced motion are verified.
- Color is not the only carrier of category, state, risk, or relationship meaning.
- Layout, hierarchy, controls, navigation, interaction, graph representation, inspector behavior, and state handling are compared to the pinned prototype revision.
- Current approved brand tokens/assets are used; no new visual system is introduced.

## 10. Requirement-to-evidence traceability

No row may be marked PASS from source inspection alone. Until implementation evidence is attached, status is **NOT VERIFIED**.

| ID | Requirement | Planned implementation reference | Validation method | Required evidence | Status |
|---|---|---|---|---|---|
| GRAPH-01 | Visible real nodes | Graph page + typed response mapper | Visual + functional | Authenticated screenshot and DOM/test receipt with real scoped IDs redacted | NOT VERIFIED |
| GRAPH-02 | Visible real edges | Canvas edge renderer | Visual + functional | Screenshot plus response-to-render assertion | NOT VERIFIED |
| GRAPH-03 | Relationship labels | Edge renderer + text list | Interaction + accessibility | Selected/focused edge screenshot and ARIA/text assertion | NOT VERIFIED |
| GRAPH-04 | Node selection | Canvas/list selection state | Interaction | Browser recording or Playwright trace | NOT VERIFIED |
| GRAPH-05 | Pan/zoom/fit controls | 2D canvas controls | Interaction | Keyboard/pointer test and screenshot | NOT VERIFIED |
| GRAPH-06 | Filters | Governed response view model | Functional + leakage check | Tests proving filters do not query or reveal foreign scope | NOT VERIFIED |
| GRAPH-07 | Relationship navigation | Inspector/text list | Interaction | End-to-end node-to-node navigation trace | NOT VERIFIED |
| GRAPH-08 | Memory/content inspection | Inspector | Data/interaction | Screenshot plus API/DB identity correlation | NOT VERIFIED |
| GRAPH-09 | Provenance/source visible | Contract + inspector | Data check | Authorized response/test + screenshot | NOT VERIFIED |
| GRAPH-10 | Supporting evidence visible | Contract + inspector | Data check | Evidence-reference fixture/live proof + screenshot | NOT VERIFIED |
| GRAPH-11 | Relationship context | Contract + inspector/list | Functional | Directed relationship assertions | NOT VERIFIED |
| GRAPH-12 | Tenant/workspace real data | Auth + query seam | Live integration/security | Restricted-role live-DB receipt | NOT VERIFIED |
| GRAPH-13 | Forged scope denied before query | API/contract guard | Security test | `403` and zero query-call proof | NOT VERIFIED |
| GRAPH-14 | Cross-tenant/workspace isolation | RLS + contract | Live adversarial test | Zero-leak live-DB receipt | NOT VERIFIED |
| GRAPH-15 | Loading state | Route/client state | State test | Screenshot + semantic assertion | NOT VERIFIED |
| GRAPH-16 | Empty state | Complete-zero response | State test | Screenshot + response receipt | NOT VERIFIED |
| GRAPH-17 | Unauthorized/login state | Page/API auth | Auth journey | Redirect/401 browser and API evidence | NOT VERIFIED |
| GRAPH-18 | Forbidden role state | API/page policy | Auth journey | `403`/denied screen evidence without scope leakage | NOT VERIFIED |
| GRAPH-19 | Partial/continuation state | Subgraph contract | Budget test | Bounded response + continuation validation | NOT VERIFIED |
| GRAPH-20 | Degraded state | Contract + UI | Failure injection | Labeled source screenshot/test | NOT VERIFIED |
| GRAPH-21 | Error state | Contract + UI | Failure injection | Sanitized error screenshot/test | NOT VERIFIED |
| GRAPH-22 | Evidence unavailable state | Inspector | State test | Screenshot/test distinguishing absent vs unavailable | NOT VERIFIED |
| GRAPH-23 | Equivalent text relationship view | Adjacent list | Accessibility | DOM/ARIA snapshot + parity assertion with graph payload | NOT VERIFIED |
| GRAPH-24 | Keyboard navigation and focus | Canvas/list/inspector | Accessibility | Playwright keyboard trace + focused ARIA snapshots | NOT VERIFIED |
| GRAPH-25 | Deterministic budgets/order | Read seam | Contract/live test | Repeat-query equality and cap proof | NOT VERIFIED |
| GRAPH-26 | Isolated authorized nodes handled | Read seam | Data test | Fixture/live proof for node with zero edges | NOT VERIFIED |
| GRAPH-27 | Version/SUPERSEDES context | Contract + inspector | Data test | Version chain query/render proof | NOT VERIFIED |
| GRAPH-28 | No mocks/placeholders | Page, fixtures, build | Static + runtime audit | Source scan plus empty/degraded runtime captures | NOT VERIFIED |
| GRAPH-29 | Design fidelity | Final UI | Visual comparison | Before/reference/after comparison annotated by reviewer | NOT VERIFIED |
| GRAPH-30 | Responsive behavior | Graph workspace | Visual + interaction | Desktop/tablet/mobile captures and keyboard proof | NOT VERIFIED |
| GRAPH-31 | Approved-mode variance | Story/design decision | Human review | Signed list of implemented vs deferred prototype modes | NOT VERIFIED |
| GRAPH-32 | Human interactive exercise | Working local dashboard + evidence packet | Interactive walkthrough | Dated receipt showing the human owner personally exercised graph exploration, node/relationship navigation, inspection, controls, and representative truth states in the working local dashboard | NOT VERIFIED |
| GRAPH-33 | Pike design/interaction gate | Independent review | Interface/simplicity review | Signed findings and repair disposition covering visual fidelity, interaction fidelity, graph behavior, navigation, controls, node inspection, system states, preserved user intent, authorization surface, and accidental complexity | NOT VERIFIED |
| GRAPH-34 | Fowler maintainability gate | Independent review | Maintainability review | Signed findings and repair disposition covering architecture cleanliness, coupling, duplication, reuse, comprehensibility, and testability | NOT VERIFIED |
| GRAPH-35 | Hightower operational/security gate | Independent review | Runtime/security review | Signed findings and repair disposition covering deployment/runtime safety, tenant isolation, authorization, failure behavior, data integrity, observability, and regressions | NOT VERIFIED |
| GRAPH-36 | Human release-progression approval | Completed evidence matrix + interactive-exercise receipt | Explicit human decision after walkthrough | Dated approval reference and any conditions/variances; cannot be inferred from test, reviewer, build, HTTP, screenshot, or walkthrough completion alone | NOT VERIFIED |

## 11. Validation and evidence plan

1. **Contract tests:** Zod/schema validation, state discriminants, deterministic ordering, caps, continuation binding, source/evidence reference semantics.
2. **Security tests:** missing/forged scope, cross-tenant/workspace reads, role boundaries, restricted app role, RLS, continuation replay across scope, error redaction.
3. **Live-DB tests:** real PostgreSQL/RuVector graph memories, supersession, structural nodes/edges, isolated nodes, evidence references, empty scope, partial query.
4. **Component tests:** nodes, edges, labels, filters, inspector, text list, every state.
5. **Browser tests:** pointer and keyboard exploration, focus flow, unauthorized/forbidden journeys, responsive layout.
6. **Visual evidence:** pinned prototype/reference capture, current-before capture, after captures at agreed viewports, annotated variance list.
7. **Independent review:** Pike design/interaction and interface simplicity; Fowler maintainability; Hightower operational/runtime/security safety; Knuth data/query contract; Munari/accessibility/design consistency as appropriate. Pike, Fowler, and Hightower each produce a separate evidence record and repair disposition; one review cannot substitute for another.
8. **Human interactive gate:** after all technical/reviewer evidence is ready, the owner is shown the working local dashboard and personally exercises graph exploration, node/relationship navigation, inspection, controls, and representative truth states. Record the walkthrough receipt separately from approval.
9. **Human release gate:** only after that walkthrough does the owner review the complete matrix and explicitly approve release progression or request revision. Tests, reviewer sign-offs, screenshots, or walkthrough completion without the explicit decision do not complete the correction.

## 12. Checklist status

### 1. Understand the trigger and context

- [x] **1.1 Triggering story:** current `/dashboard/graph` plus the historical Story 2.5/DASH-04 `Done` claims reveal that route presence/counts were mistaken for current interactive acceptance.
- [x] **1.2 Core problem:** misunderstanding/loss of an accepted UX requirement during dashboard removal/restoration; this is not a request for a new visual concept.
- [x] **1.3 Supporting evidence:** current source, Git removal/restoration commits, governed memory, pinned design, canonical requirements, historical BMAD stories, and Notion records are cited above.

### 2. Epic impact assessment

- [x] **2.1 Trigger epic viability:** historical Epic 16/Story 2.5 evidence remains a delivery record but cannot stand as present acceptance; it needs correction linkage, not retroactive erasure.
- [x] **2.2 Epic-level change:** use the four-story bounded correction package. No existing epic is deleted or redefined wholesale.
- [x] **2.3 Remaining/future epics:** Epics 18–30 were checked for graph/dashboard overlap. Impacts and preserved boundaries are recorded under “PRD/MVP and remaining-epic impact.”
- [x] **2.4 Obsolescence/new epic:** no planned epic is made obsolete. A new epic is unnecessary if governance accepts the bounded correction package.
- [x] **2.5 Order/priority:** architecture trace and focused-subgraph contract precede data/API, then UI, then independent review/evidence/human acceptance.

### 3. Artifact conflict and impact analysis

- [x] **3.1 PRD/MVP:** Epic 30's graph-canvas non-goal is reconciled by route boundary; it remains binding for `/dashboard` My Work and is superseded only for `/dashboard/graph`. Counters are not a valid Graph MVP reduction.
- [x] **3.2 Architecture:** preserve PostgreSQL/RuVector, server principal, restricted role, workspace RLS, and fail-closed scope. AD-64 and the dedicated focused-subgraph read repository resolve the former REQ-MAP `AD-59` collision.
- [x] **3.3 UI/UX:** preserve the pinned Command Center interaction intent, operator-surface contract, equivalent text, keyboard/focus, truthful states, and approved Epic 25 visual tokens. Prototype data is illustrative only.
- [x] **3.4 Other artifacts:** correction linkage is required for Notion/sprint status; tests, live-DB proof, browser evidence, observability/failure review, and documentation traces are required. Deployment/IaC changes are not assumed and require Hightower review if introduced.

### 4. Path forward evaluation

- [x] **4.1 Direct adjustment:** viable and recommended; medium-to-high effort, medium risk under contract-first sequencing.
- [x] **4.2 Potential rollback:** not viable as a complete approach; the deleted route is reference only and would reintroduce obsolete scope/auth/data assumptions.
- [x] **4.3 PRD MVP review:** reduction to counters is not viable. Epic 30 stays bounded; `/dashboard/graph` restores the required capability without expanding My Work.
- [x] **4.4 Selected path:** Option 1, direct adjustment, because it retains trustworthy current foundations while restoring the lost operator capability with reversible slices and explicit evidence gates.

### 5. Sprint Change Proposal components

- [x] **5.1 Issue summary:** documented in Sections 1 and 3.
- [x] **5.2 Epic/artifact impact:** documented in Sections 2, 4, and 8, including Epic 30 and tracker conflicts.
- [x] **5.3 Recommendation/trade-offs:** documented in Section 7; rollback and counter-only reduction are explicitly rejected.
- [x] **5.4 PRD/MVP/action plan:** route-specific Epic 30 resolution, four-story package, dependencies, and sequence are documented.
- [x] **5.5 Agent handoff:** Brooks, Jobs, Knuth, Woz, Pike, Fowler, Hightower, accessibility/design reviewer, and human owner responsibilities are assigned below.

### 6. Final review and handoff

- [x] **6.1 Checklist review:** all applicable checklist items are addressed; remaining gated actions are explicit rather than hidden.
- [x] **6.2 Proposal accuracy:** Scout reconciliation plus Brooks read-only architecture review completed; the identified Epic 30, Hightower, and checklist omissions were repaired before requesting approval.
- [x] **6.3 Explicit user approval:** approved by the human owner in the originating Codex task on 2026-10-12.
- [ ] **6.4 Sprint-status update:** authorized and in progress; completion requires readback evidence.
- [x] **6.5 Next-step confirmation:** responsibilities and success criteria are defined; approved sequence is contract/trace, tracker reconciliation, implementation, reviews, evidence, walkthrough, and release decision.

## 13. Implementation handoff after approval

- **Brooks:** owns conceptual integrity, corrected ADR/contract choice, and sequence.
- **Jobs/Product owner:** confirms prototype-mode scope and accepts explicit variances.
- **Knuth:** owns focused-subgraph data/query design, evidence joins, budgets, deterministic ordering, RLS proof.
- **Woz:** implements only after the contract/story is approved and Scout context is attached.
- **Pike:** reviews visual fidelity, interaction fidelity, graph behavior, navigation, controls, node inspection, system states, preserved user intent, authorization surface, and accidental complexity.
- **Fowler:** reviews maintainability, incremental/reversible slices, and test quality.
- **Hightower:** reviews deployment/runtime safety, tenant isolation, authorization boundaries, failure behavior, data integrity, observability, and operational regressions.
- **Accessibility/design reviewer:** verifies same-data text, keyboard/focus, visual fidelity, and honest states.
- **Human owner:** approves the proposal before implementation and the evidence matrix before completion.

### Required sequence

```text
Human proposal approval
  → correct architecture trace and approve Subgraph contract
  → update/link governed stories and tracker
  → implement data/API slice with live security proof
  → implement interactive UI against the contract
  → independent review and repair
  → capture requirement evidence
  → human interactive walkthrough and exercise receipt
  → explicit human release-progression approval
  → only then mark complete
```

## 14. Approval request

Approval authorizes planning/tracker reconciliation and routing of the bounded implementation package. It does not authorize production deployment, bypass governance, accept unsupported prototype modes, or mark any GRAPH requirement PASS without evidence.

**Decision requested:** Approve, revise, or reject this Sprint Change Proposal.

**Human decision:** Approved  
**Approval reference:** Originating Codex task `01a1316a-8945-7293-8739-c0e0b4bfbe9d`, user message “approve”, 2026-10-12  
**Conditions / approved variances:** Proposal conditions remain binding. Security Path and Methodology/Catalog modes are deferred and omitted; one Knowledge Map experience is authorized. Deployment and final release progression still require their separate gates.

## 15. Owner-directed visual clarification — 2026-10-13

After rejecting the first visual candidate, the owner clarified that the default canvas should read as a connected knowledge brain made of compact nodes, not as a board of complete record cards. Selecting a compact node reveals the full governed record card in the evidence inspector.

This clarification supersedes only the preserved prototype's full-card node anatomy. The protected Allura shell, visual tokens, contextual hierarchy, left rail, warm dotted canvas, directed topology, responsive behavior, same-data text representation, and inspector remain binding. The repaired candidate must preserve all authorization, PostgreSQL/RuVector, evidence, truth-state, and accessibility requirements and must still pass the separate owner walkthrough and release-progression gates.
