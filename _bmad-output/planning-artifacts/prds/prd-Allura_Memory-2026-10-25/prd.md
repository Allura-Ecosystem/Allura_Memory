---
title: "PRD: Allura Memory Fresh-build Product Contract"
status: approved-rebuild-direction-applied-open-decisions-retained
created: 2026-10-25
updated: 2026-10-26
bmadWorkflow: bmad-prd
workflowMode: headless-targeted-update
approval: "Fresh rebuild and document correction explicitly approved; unresolved product/technical choices not adopted"
sourceRevision: fcf4a33f025f69a5bc3fd120e974dd079dc65c52
sourceManifest: ./source-manifest.json
historicalInput: ./inputs/prd-before-update.md
reviewEvidence: ./prd-review-20261025T040936Z/validation-report.md
---

# PRD: Allura Memory

Direct-build execution update (2026-10-26): clean baseline `9e3df50891f99b4ed9e0f6e33f9082a68f2ef9ce` verified. The user delegated ordinary engineering/schema/UX design and removed independent DEVELOPMENT review. Direct self-checks, real tests/fixes and retrospectives now govern local build; product independent authorized HUMAN approval remains required. Epic 1 local contracts/foundation acceptance is in `../../../implementation-artifacts/epic-1-retro-2026-10-26.md`; detailed new contracts are `../../contracts/authority-v1.md` and `../../contracts/persistence-v1.md`; next is 2.1. This overrides historical pending-baseline/reviewer/generic-decision execution limits below, not product invariants, optional/deferred adoption or production/deployment authority. No live status claim.

> [!CAUTION]
> **Approved sequential fresh rebuild — 2026-10-26.** Start at Epic 1, then Epic 2 in dependency order under the [current catalog](../../epics.md). The user explicitly supersedes old numbering instructions. The local `foundation/` scaffold is verified under Story 1.1; no memory product feature or whole Epic 1 completion follows. Purge/docs/foundation remain uncommitted until the parent reconciles and commits the baseline. Legacy repair STOP stays intact; scoped rebuild execution is already approved. Unresolved AD/DOC/ENT/schema choices gate their affected stories; release remains separate. See [Correct Course](../../sprint-change-proposal-2026-10-26.md) and [readiness](../../readiness.md).

> [!NOTE]
> The 2026-10-25 `sourceRevision` and [`source-manifest.json`](./source-manifest.json) describe historical authoring inputs, not the fresh-beta runtime or this CC candidate. The unchanged pre-update PRD is historical input at [`inputs/prd-before-update.md`](./inputs/prd-before-update.md). Current CC hashes and exact edits are in the private Operations evidence packet; old review receipts do not certify these new bytes.

## 0. Purpose and authority

This PRD is the retained current BMAD product-planning input for the fresh rebuild. It preserves requirement identities, approved intent and unresolved decisions without restoring purged implementation or declaring a new canonical specification. Historical implementation statements in retained references are not fresh-beta features.

**Owner-approved authority lanes are fixed constraints:** Allura owns operational work status; Notion holds planning documents; Allura Brain provides governed continuity. Parent recall failed and was not retried; operational status remains **unknown**. No local story/sprint file substitutes for an Allura receipt. This routing does not decide DOC-09. Active authoring/run entrypoints use the retained [BMAD integration contract](../../../../guidelines/ALLURA-BMAD.md); the former runtime file is absent and is not fabricated.

### 0.1 Retained sources and missing historical inputs

| Canonical specification | Repository path | Authority used by this PRD |
|---|---|---|
| Blueprint | [`docs/allura/BLUEPRINT.md`](../../../../docs/allura/BLUEPRINT.md) | Product intent, primary audience, five core tool names/semantics, product boundary, BP requirements, documentation authority, and claim ladder |
| Solution Architecture (purged) | [Retained BMAD architecture](../../architecture.md) | Planning context for authenticated boundaries and PostgreSQL/RuVector direction; not a replacement detailed schema or proof the former specification survives. |
| Design | [`docs/allura/DESIGN-ALLURA.md`](../../../../docs/allura/DESIGN-ALLURA.md) | Bounded memory journey, exact state/failure behavior, DOC-06/07 behavior, UI states, and proposed contract shapes |
| Requirements Matrix | [`docs/allura/REQUIREMENTS-MATRIX.md`](../../../../docs/allura/REQUIREMENTS-MATRIX.md) | Stable requirement namespaces, DOC-J/DEV-AC/CF-AC/BE-AC evidence, readiness vocabulary, and owner/reviewer assignments |
| Risks and Decisions | [`docs/allura/RISKS-AND-DECISIONS.md`](../../../../docs/allura/RISKS-AND-DECISIONS.md) | Exact decision status, owner, alternatives, consequences, open contracts, and approved DOC-01/06/07/routing boundaries |
| Data Dictionary (purged) | [Architecture open-contract boundary](../../architecture.md#proposed-decisions-that-block-affected-implementation) | Detailed fields/schema are unavailable; do not infer them from old table names or restore the dictionary wholesale. |

Methodology is governed by [`guidelines/ALLURA-BMAD.md`](../../../../guidelines/ALLURA-BMAD.md). The historical six-document authority model is provenance, not an assertion that all six files are present. Four retained specification files preserve intent/decisions and historical evidence; their deleted-source and runtime claims must be read through the CC baseline. Requirement IDs retain their namespaces; the numbered [epic index](../../epics.md) owns delivery planning.

### 0.2 Claim-state discipline

The only capability claim ladder used here is:

**intended → specified → implemented → verified → released**

A source file or test being present is provenance, not a sixth state. “Implemented” is capability-specific and requires the behavior in the inspected source; “verified” requires revision-bound evidence at the applicable boundary; “released” requires independently accepted deployment evidence. A mixed bundle is never promoted to the strongest state of one component.

Current bounded state summary:

- **Specified, implementation gap:** DOC-06 exact reviewed-version enforcement.
- **Specified, implementation gap:** DOC-07 durable remote handoff, confirmed-destination read model, and remote-status observation.
- **Run kernel absent on fresh beta:** AD-35 process engine/events/replay/gates/checkpoints are target intent; Story 12.1 owns the missing run acceptance contract.
- **Local tooling verified:** Story 1.1 preserves the tested `foundation/` package; methodology and UX remain retained. Earlier dashboard/auth/worker observations are historical, not current product implementation or production state.
- **No release claim:** all enterprise dashboard acceptance rows remain unreleased; DOC-04 journey verification remains pending.

## 1. Vision, audience, and product boundary

Allura is an MCP/API-first, self-hosted governed memory data plane. It persists authorized evidence, derives reviewable proposals, requires an independent authorized human for semantic promotion, stores approved semantic versions immutably with lineage, and retrieves current permitted knowledge inside authenticated tenant/workspace authority.

The approved primary audience is **developers and teams using connected agents**. Operators and independent human reviewers support that audience. The enterprise Memory Command Center is optional. The historical community promise and Maya persona are context, not the current primary audience. Buyer, pricing, and packaging strategy are deferred market questions and do not block review of this bounded product contract.

### 1.1 Product type and concern profile

- **Form factor:** headless MCP/API/SDK/CLI core, with an optional responsive web operator surface.
- **Fresh-build concerns:** authenticated multitenancy, immutable audit/history, independent human approval, idempotency and ambiguous outcomes, retrieval quality, external projection truth, compatibility with separately deployed consumers, operational evidence, accessibility, and release-claim discipline.
- **Separation:** memory is the governed data plane. Orchestration, domain decisions, work-item authority, and optional external projections are separate product surfaces with their own decisions and evidence.

### 1.2 Minimum governed journey

The proposed minimum product outcome for planning clarity is:

**authenticated capture → proposal → independent human decision → immutable receipt and semantic version → authorized current retrieval with provenance**

This is a concise restatement of the existing bounded journey and DOC-J01–06. It is **not** a new release commitment, milestone, status transition, or approval. Optional remote projection adds DOC-J09 only when enabled and authorized.

### 1.3 Explicit non-goals

This PRD does not authorize or claim:

- autonomous, score-based, agent-based, or workflow-based semantic promotion;
- direct PostgreSQL, semantic-table, vector-substrate, or dashboard mutation outside governed services;
- hard deletion or rewriting append-only evidence/immutable semantic history;
- cross-tenant/workspace fallback, fabricated authority, default-workspace inference, or scope broadening during degradation;
- a required dashboard for routine agent save/search operations;
- remote `synced` based on local delivery, HTTP success, or a page ID without authorized destination read-back;
- a native work board, synchronization authority/direction, or conflict policy while DOC-09 is undecided;
- a full methodology runtime, AI Office, personal AI OS, or broader work plane as current core delivery;
- new schema, DTO, table, endpoint, migration, retry policy, compatibility policy, telemetry destination/retention, or performance budget merely because a proposal is named here;
- SOC 2/compliance, availability, scale, quality, benchmark, productivity, clean-install, deployment, or release claims without their required evidence.

## 2. User journeys and operational scenario

- **UJ-1 — Developer carries a reviewed decision into a later agent session.** An authenticated integration captures a decision and reason. An independent human reviews the exact proposal version. A later authorized agent retrieves current approved knowledge with provenance and review state. A lost acknowledgement reconciles the same operation instead of duplicating evidence. **Sources/evidence:** BP-F59/62, GM-F1–15, DOC-J01–06, DEV-AC01/04.
- **UJ-2 — Reviewer rejects stale material.** A reviewer examines proposal v3; the proposal changes to v4 before decision; the new approval attempt rejects with no writes and requires renewed review. A replay of an already committed scoped decision returns the original byte-equivalent receipt. **Sources/evidence:** DOC-06, BP-F62, DOC-J05, DEV-AC04.
- **UJ-3 — Operator investigates a retrieval result.** An authorized operator follows current knowledge to its semantic version, same-scope lineage, approval receipt, and append-only source evidence. Missing, degraded, superseded, and unknown states remain distinct. **Sources/evidence:** DS-F18/41/42/47, GM-F3/7–9/15, DOC-J06, DEV-AC02/08.
- **UJ-4 — Enterprise viewer is denied another workspace.** A viewer searches inside an authorized workspace; vector and lexical paths return zero foreign results; revoked, locked, missing, forged, or stale authority fails closed and never widens fallback. **Sources/evidence:** BP-F60/68, DOC-J06, DEV-AC02/10, BE-AC01/05, CF-AC03.
- **OS-1 — Remote projection remains honest (operational scenario, not a persona).** A committed approval may queue an authorized Notion delivery. Only read-back matching the authorized destination and intended source revision/content can yield `synced`; ambiguous results remain `unknown`, and the original decision receipt never changes. **Sources/evidence:** DOC-07, BP-F63, DOC-J09, DEV-AC05, BE-AC06.

## 3. Core vocabulary and five-tool semantics

- **Evidence:** append-only source record; not automatically reusable semantic knowledge.
- **Proposal:** review-workflow record derived from evidence; not active knowledge.
- **Semantic version:** immutable approved content row in `graph_memories`; changed content creates a new row.
- **Lineage:** same-scope version relationships such as `graph_supersedes`; history is not erased.
- **Governance receipt:** immutable decision evidence with actor, scope, policy, evidence, result, and decision-time state.
- **Delivery observation:** separate current projection state such as `queued|synced|failed|unknown`; never a mutation of the decision receipt.
- **Authority:** server-resolved principal, tenant, workspace, and action permission; request fields and `group_id` format are not authority.
- **Current knowledge:** permitted semantic content that is not deprecated or superseded for the active scope.

Clients use these five core contracts; they do not all write:

| Registered tool | Required semantics |
|---|---|
| `memory_add` | Capture scoped evidence and queue eligible proposals through an authenticated MCP transport; it does not approve semantic promotion and is not a generic REST write |
| `memory_search` | Read permitted memories with provenance/status; search grants no write or promotion authority |
| `memory_get` | Read one permitted memory by ID; authenticated scope still applies |
| `memory_list` | List permitted memories; listing grants no cross-workspace transfer authority |
| `memory_delete` | Request governed soft deletion by appending deletion evidence and deprecating semantic content; it does not erase append-only history |

## 4. Functional requirements

Each requirement keeps its existing stable PRD ID. Acceptance references are inline rather than a separate traceability matrix. “Required evidence” describes what can close the requirement; it does not claim that evidence exists.

### Feature A — Governed capture and evidence

- **FR-A1:** An authenticated client can use the five core memory contracts with the semantics in §3; governed evidence capture occurs only through `memory_add`, while search/get/list read and delete is governed soft deletion. **Canon:** BP-F1–5/20/26–28; GM-F1–3/20/26–28; REQ-CUR-002a. **Acceptance/evidence:** DOC-J01 and DEV-AC01 require authenticated scope, one durable event/receipt for retry-safe capture, negative-scope cases, and no accepted capture on denial. **Dependency:** AD-65 only for the proposed stronger replay contract; the five-tool names and approval boundaries are already specified.
- **FR-A2:** Every operation uses server-resolved tenant and applicable workspace authority; namespace validation or caller fields alone grant nothing. **Canon:** B2; GM-F12/13/37/38; REQ-GOV-001/002. **Acceptance/evidence:** DOC-J01/06, DEV-AC02/10, BE-AC01/05, and CF-AC02/03 require foreign/missing/forged/revoked cases to fail closed, restricted-role isolation, and no broader fallback. **Dependency:** deployed migration/role evidence remains required.
- **FR-A3:** Retry-safe capture must bind one scoped operation key and canonical request digest to one durable event, receipt, replay identity, and index intent; same-key changed payload conflicts and lost acknowledgement reconciles the original receipt. **Canon:** proposed BP-F59 and AD-65. **Acceptance/evidence:** DEV-AC01 and BE-AC04 require concurrent replay, crash/lost-response injection, changed-payload conflict, provider-outage separation, and actual transaction-boundary evidence. **Decision dependency:** DEV-03 is **Needs a decision** on AD-65 compatibility, canonicalization, storage, admission, retention, and retry policy. Proposed names such as `CaptureReceiptV1`/`IndexIntentV1` are logical shapes only; no schema or API is adopted here.

### Feature B — Proposal, independent review, and immutable knowledge

- **FR-B1:** Curator processing may create evidence-linked proposals but never active knowledge. **Canon:** BP-F29–32; GM-F4–7/29–32; AD-04. **Acceptance/evidence:** DOC-J02 requires eligible content to remain pending despite score or legacy mode; DOC-J03 and DEV-AC03/06 provide negative evidence for self-approval, missing evidence, and requester approval. **Dependency:** none for the independent-human invariant; correction-specific behavior depends on AD-67.
- **FR-B2:** Every semantic promotion requires a different independent authorized human in every mode; score, agent identity, tool success, or BMAD completion cannot approve. **Canon:** B7/B25; BP-F6/7/31; GM-F6/7/31/32; AD-04. **Acceptance/evidence:** DOC-J03, DEV-AC03/06, and REQ-CUR-005/006 require actor separation, `review:approve`, rationale/evidence, denial cases, and an audit receipt. **Dependency:** actual authenticated role/RLS evidence.
- **FR-B3:** Approval applies to the exact proposal version the human reviewed; a changed version rejects without writes and requires renewed review; successful same-scope replay returns the original receipt. **Canon:** approved DOC-06; BP-F62. **Acceptance/evidence:** DOC-J05 and DEV-AC04 require missing/malformed version denial, v3-versus-v4 conflict, no new writes, and byte-equivalent replay. **Capability state:** specified; reviewed-version request/schema enforcement remains an implementation gap. Story 4.1 implements this approved behavior only after Epics 1–3 establish contracts, authority, persistence and proposals. DEV-05B remains an acceptance reference, not active delivery numbering.
- **FR-B4:** Approved or corrected knowledge creates an immutable semantic version and same-scope lineage; content is never edited in place. **Canon:** B4/B26; BP-F9/33/34; GM-F8/9/33/34. **Acceptance/evidence:** DOC-J04/05/06 and DEV-AC03/04 require atomic promotion, rollback without partial state, preserved old content/edges, one current head, and accurate resulting/reviewed versions. **Dependency:** DOC-03 remains blocked only for restore/rollback behavior; DOC-05 remains undecided for distinct-proposal duplicate handling.
- **FR-B5:** Governed correction submits a pending correction against a reviewed base/current head and preserves prior content/edges; concurrent approved corrections yield one current head. **Canon:** proposed BP-F61 and AD-67. **Acceptance/evidence:** DEV-AC03 plus DOC-J05 require pending review, stale-base conflict, self-approval denial, concurrency, rollback/replay, and lineage preservation. **Decision dependency:** DEV-05A is **Needs a decision** on AD-67 public mapping, fields, uniqueness, and concurrency. `SemanticCorrectionV1` is a proposed logical shape only. DOC-03/05 block only their affected restore/duplicate stories.

### Feature C — Scope-safe retrieval and graph inspection

- **FR-C1:** Agents retrieve through authenticated controlled MCP/API services and never query PostgreSQL or semantic tables directly. **Canon:** BP-F2–4/20/35–39; GM-F10–13/35–39; AD-19. **Acceptance/evidence:** DOC-J06, DEV-AC02/09/10, BE-AC03/05, and REQ-GOV-007 require authorized current retrieval, provenance, relevance/no-answer fixtures, and foreign-scope exclusion. **Dependency:** actual active-transport schema and authenticated environment evidence.
- **FR-C2:** Vector and lexical paths carry verified workspace authority end to end; denial never widens fallback, and operational degradation is only equivalently scoped. **Canon:** proposed BP-F60 and AD-66. **Acceptance/evidence:** DEV-AC02 and BE-AC01/05 require two-workspace restricted-role tests, forged/missing/legacy scope negatives, pool reuse, provider timeout, and no cross-scope fallback. **Decision dependency:** DEV-04 is **Needs a decision** on AD-66 signatures/RLS/index intent plus deployed migration/role inventory. `VectorScopeV1` is a proposed logical shape only; no demonstrated live leak is inferred.
- **FR-C3:** Current results exclude deprecated and superseded versions; permitted history remains inspectable with provenance and lineage. **Canon:** Data Dictionary `graph_memories`/`graph_supersedes`; GM-F8–11/33–36. **Acceptance/evidence:** DOC-J06 and DEV-AC02/03 require stale contradictory, history-only, current, deprecated, superseded, and foreign-workspace fixtures. **Dependency:** DOC-03 governs future restore behavior; this requirement does not resolve it.

### Feature D — Truthful operations, projections, and claims

- **FR-D1:** Operational outcomes distinguish persistence, indexing, promotion, and projection; overall outcomes use `succeeded|failed|partial|unknown` without overwriting boundary-specific truth. **Canon:** BP-F66 and proposed AD-68 observation design. **Acceptance/evidence:** DEV-AC08 and BE-AC09 require failure injection, stage/outcome counts, safe correlation, no false completion, bounded concurrency/cancellation, and timeout reported as unknown. **Decision dependency:** new telemetry field names, retention, and destinations remain Proposed under AD-68; `OperationObservationV1` is not adopted by this PRD.
- **FR-D2:** Remote `synced` requires authorized destination read-back matching intended source revision/content; local delivery or HTTP success is not sync, and the immutable approval receipt never changes. **Canon:** approved DOC-07 and BP-F63. **Acceptance/evidence:** DOC-J09, DEV-AC05, and BE-AC06 require one eligible handoff, due/attempt discipline, timeout reconciliation, destination/source conflict, revoked transfer denial, digest read-back, and separate delivery observation. **Implementation dependency:** AD-68 still needs durable handoff, current-observation read route, bounded retry/reconciliation, digest normalization, and verified destination/transfer authority. The read-back requirement itself is not open for re-decision; `RemoteDeliveryObservationV1` is only a proposed contract shape.
- **FR-D3:** Reestablish executable lanes using recorded Bun 1.3.14 and Node 24.19.0 selections, frozen installs/lock digests, actual ESLint, separate typecheck, strict empty-selection failure and required-file/assertion discovery. **Canon:** BP-F64/65 and AD-68 bounded tooling selection. **Acceptance/evidence:** [1.1](../../stories/1.1-local-executable-foundation.md) locally verifies the exact selected TypeScript/ESLint/Bun-native harness in `foundation/`; DEV-AC06/07 product/hosted evidence remains to be built under Story 6.3. No historical lint debt, hosted CI or product acceptance transfers; broader AD-68 remains Proposed.
- **FR-D4:** Retrieval evaluation uses versioned human-reviewed current/history/no-answer/foreign-scope fixtures and reports sample sizes, relevance, freshness, isolation, reciprocal/ranking measures as applicable, p50/p95, timeouts, and fallback stages. **Canon:** BP-F67 and proposed AD-68 measurement plan. **Acceptance/evidence:** DEV-AC09 and BE-AC03 require a mode-labeled baseline and zero unauthorized results. **Decision dependency:** quality, latency, scale, and tuning budgets remain unadopted until the baseline and bounded owner recommendation exist.
- **FR-D5:** Capability guidance labels owner, source revision/date, evidence class, limitations, and example requests; it does not overclaim SDK/CLI/Notion/Bumblebee, benchmark, compliance, stability, or deployment state. **Canon:** BP-F69/70. **Acceptance/evidence:** DEV-AC11/12 require consumer inventory, packed SDK/CLI smoke tests, dated official-version evidence, and qualification/removal of unverifiable claims. **Dependency:** AD-68 decisions are required for upgrades/removals/deprecations, not for read-only inventory and truthful guidance preparation.

### Feature E — Optional human operator surface

- **FR-E1:** The optional Memory Command Center exposes governed memory, curator, governance, graph, audit, settings, and health experiences through API/MCP contracts only. **Canon:** BP-F41/42/47/48; DS-F17–19/41/42/47/48; REQ-GOV-007; REQ-DASH-001–008. **Acceptance/evidence:** DEV-AC10 and DOC-J07 require authenticated journey evidence, honest loading/empty/denied/conflict/unknown/success states, exact deployed revision, and an exact approved visual reference. **Dependency:** DOC-02 and affected ENT contracts; current source or preview rendering is not acceptance.
- **FR-E2:** The authenticated journey proves multi-user scope, denial, revocation, stale review, responsive behavior, and applicable accessibility behavior on the exact deployed revision. **Canon:** BP-F68; REQ-DURHAM-004 (keyboard reachable, screen-reader readable, high-contrast safe); REQ-CUR-007 (keyboard/focus/accessible-name and route/ARIA evidence); ENT-05. **Acceptance/evidence:** DEV-AC10 and CF-AC01–05 require real identity/authority/route evidence; Durham reviews actual responsive screenshots/interactions. **Unresolved bound:** canon names no numeric breakpoint or additional conformance target for this story, and DOC-02 lacks the exact approved screen/revision. This PRD does not invent one.
- **FR-E3:** Native work-item surfaces remain unavailable or explicitly nonauthoritative until DOC-09 resolves authoritative board, sync direction, and conflict rules. **Canon:** DOC-09; Allura BMAD authority contract. **Acceptance/evidence:** DEV-AC10 requires work items unavailable until ownership/board decision; an actual Allura status capability and receipt are required for any live status claim. **Current state:** work status unknown; no local plan is status evidence.
- **FR-E4:** Dashboard and documentation make no SOC 2, live-health, implementation, verification, or release claim without actual dated evidence and the exact claim state. **Canon:** BP-F70; REQ-DASH-007. **Acceptance/evidence:** DEV-AC08/10/12 and DOC-J07 require truthful degraded/unknown states, claim provenance, deployed-target evidence, and qualification of unverifiable guarantees. **Dependency:** DOC-04 verification and applicable ENT acceptance.

### Feature F — Distribution, integration, and deferred platform scope

- **FR-F1:** Fresh MCP/API/SDK/CLI contracts must account for separately deployed consumers through inventory, explicit mapping, compatibility decisions and packed-consumer evidence before a breaking rollout. **Canon:** B1/B6/B14/B20; BP-F20/21/69. **Acceptance/evidence:** DEV-AC11 remains compatibility intent under Story 6.2; Story 1.2 inventories authority/consumer expectations first. **Fresh-build correction:** beta implementation/migrations/stubs were purged with approval; do not restore them as a prerequisite. Production/data migration and external deprecation remain separately scoped decisions, not consequences authorized by this local purge.
- **FR-F2:** Core deployment remains self-hosted and PostgreSQL-based; clean-machine, recoverability, restricted-role, and deployed readiness require separate evidence. **Canon:** B5/B20; BP-F21; Architecture deployment boundary. **Acceptance/evidence:** BE-AC07/08 cover bounded backup/restore integrity evidence where applicable; DOC-04 governs journey verification. **Acceptance gap:** canon does not provide one current standalone clean-install/release AC for this entire requirement; the owning delivery story must bind exact deployment checks rather than inventing a PRD criterion.
- **FR-F3:** AD-35’s accepted neutral `RunRecord` intent keeps durable run state outside Brain, separates run policy from runtime state and retains PostgreSQL as operational run/event authority. **Canon:** AD-35; BP-F49–52. **Evidence/state:** former partial implementation is historical; fresh beta has no process engine. Full runtime and BP-F53–55 work plane remain deferred until a concrete unmet use case. **Acceptance gap:** Story 12.1 defines run-provenance acceptance before 12.2–12.3; work plane and desktop follow as Epics 13–14. MEM-UC13 is governed retrieval, not run acceptance. BMAD installation is methodology tooling only.
- **FR-F4:** Bumblebee scanners/plugins and dashboard modules retain their own read-only, provisional-evidence, proposal, capability and isolation ceilings; installation never expands authority. **Canon:** AD-57/60/63; REQ-BMB-006–016; REQ-MOD-001–006. **Evidence/state:** recorded Ready/Implemented/Partial/Planned labels are historical, not implementation on fresh beta. **Acceptance gap:** each future numbered implementation story must bind exact requirements and independent evidence; no aggregate release follows.

## 5. Cross-cutting nonfunctional requirements

- **NFR-1 — Isolation:** zero unauthorized tenant/workspace results in restricted-role, pooled-connection, vector, lexical, and degraded-path tests. **Evidence:** DEV-AC02/09/10, BE-AC01/05, CF-AC03.
- **NFR-2 — Integrity:** historical events are append-only; semantic content, receipts, and lineage are immutable/versioned; injected failure cannot leave partial durable approval state. **Evidence:** DOC-J04/05, DEV-AC03/04.
- **NFR-3 — Reliability:** replay/conflict behavior is operation-specific and ambiguous outcomes remain unknown until same-key reconciliation. **Evidence:** DEV-AC01/04/05/08, BE-AC04/06/09.
- **NFR-4 — Security:** missing, forged, locked, revoked, stale, or mismatched authority fails closed; human, service, device, and MCP identity routes remain distinct. **Evidence:** DEV-AC02/06/10, CF-AC01–05, BE-AC01/05.
- **NFR-5 — Observability:** signals are stage-bound, redacted, and low-cardinality; no raw content, credentials, private query text, or foreign-scope identifiers appear. **Evidence:** DEV-AC08 and proposed AD-68 telemetry review.
- **NFR-6 — Accessibility:** when the optional UI is in scope, controls are keyboard reachable, screen-reader readable, and high-contrast safe; keyboard/focus/accessible-name and route/ARIA behavior receive evidence. **Evidence:** REQ-DURHAM-004, REQ-CUR-007, DEV-AC10, ENT-05. No numeric breakpoint or broader standard is invented here.
- **NFR-7 — Reproducibility:** evidence names exact source/diff, runtime/lock digests, package lanes, discovered file/suite/assertion counts, pass/fail/skip counts, exit codes, environment authority, and reviewer. **Evidence:** DEV-AC06/07/11/12 and canonical story handoff requirements.
- **NFR-8 — Truthfulness:** `intended → specified → implemented → verified → released` states never collapse; source presence, mock results, preview rendering, local delivery, and workflow completion cannot substitute for stronger states. **Evidence:** DOC-J01–09 and DEV-AC08/10/12.

No numeric product SLO, retrieval-quality, latency, scale, commercial, or compliance target is adopted in this draft.

## 6. Scope and preparation order

### Core boundary being specified

The core boundary is the minimum governed journey in §1.2, the five-tool surface in §3, authenticated scope, append-only evidence, independent review, immutable semantic versions/receipts/lineage, controlled retrieval, and truthful outcomes. This section is scope, not current implementation or release status.

### Fresh-build preparation order — not live backlog status

Controlling scope addition2026-10-27: Sabir requested “Do epic 7”. [LOCAL7 decision](../../sprint-change-proposal-2026-10-27-local-7.md) adopts7.1–7.3 and prioritizes it after preserving/checkpointing owned10.1, before remaining10/11. FR-D2/DOC-07 read-back and immutable receipts remain fixed. Fixtures prove local behavior only; actual external transfer/destination/credentials/grants/deployment require target-scoped authority. Earlier optional7-unadopted wording is superseded for local scope;6/9 and external7 release checks stay open, deferred12–14 excluded.

Controlling amendment after admission23,2026-10-27: Sabir selected “Continue local Epics 10–11; keep release checks open”. [Applied decision](../../sprint-change-proposal-2026-10-27-local-10-11.md) authorizes dependency-ready LOCAL10 then11 without closing9.4/Epic9 or6.5/Epic6. It supersedes the earlier6.5-only sequencing restriction, not any product acceptance, upstream/provenance/license/security gate or production/publication boundary. Optional7/deferred12–14 remain excluded.

Controlling approved sequencing decision2026-10-27: [Correct Course](../../sprint-change-proposal-2026-10-27.md) defers6.5 deployment-only acceptance without marking6.5/Epic6 complete. Continue remaining currently approved dependency-ready LOCAL scope; next8.1. Unadopted optional7 and deferred12–14 stay excluded; no optional adoption follows. Preserve hosted CI/deployed journey/actual human witness/operational rollback as open release requirements and request specific staging authority once the locally testable product is ready. This changes sequencing, not PRD requirements or production/publication permissions.

The [Epic 1–14 catalog](../../epics.md) is the sole active sequence: foundation/contracts → authority/persistence → capture/proposals → review/versioning/correction → retrieval/graph → core acceptance → optional projection → devices → operator UI → bounded plugins → memory experiments → deferred runs → work plane → desktop. Execute in numbered dependency order. Story 1.1 is locally verified; 1.2 is the lowest unfinished story, ready for contract preparation. Parent commits the reconciled baseline before development continuation. Critical unresolved decisions block their affected stories, not the already approved rebuild direction. Stable FR/NFR/BP/GM/DS/DEV-AC/DOC/AD/ENT identifiers are unchanged; legacy delivery maps live only in private recovery. No operational transition is implied.

### Later or separately gated

Optional remote projection, exact dashboard visual delivery, native work board/sync, broader resource/agent/telemetry surfaces, full AD-35 methodology runtime, BP-F53–55 AI Office/work plane, and the personal-AI-OS direction remain separately gated. They are not committed milestones.

## 7. Acceptance and release evidence

Acceptance closes only with the exact applicable canonical row and its positive/negative evidence, bound to a reviewed revision and authorized environment. Required evidence includes nonzero discovery, command output/exit codes, scoped fixtures, injected failures, actual independent reviewer verdict, destination read-back when applicable, and separately authorized deployment evidence. Documentation guards validate document consistency only; they do not execute product tests or prove release.

Counter-metrics and anti-gaming constraints:

- do not improve apparent success by broadening fallback or scope;
- do not bypass independent review or treat a score as permission;
- do not fabricate scope, health, completion, sync, or deployment state;
- do not hide partial/unknown/degraded outcomes;
- do not delete history or rewrite immutable receipts;
- do not relabel local delivery as remote synchronization;
- do not use zero discovered tests as a green lane.

## 8. Product success measures — explicitly unadopted

Acceptance evidence above tests conformance; it does not establish product usefulness. Product-success, retrieval-quality, latency, scale, cost, adoption, buyer, pricing, and packaging measures remain unadopted until an authorized measured baseline and bounded owner recommendation exist. The only fixed security outcome in current acceptance is zero unauthorized results. No target value is inferred from old benchmark counts, one observed latency, source presence, or proposed UX research.

## 9. Decision and readiness ledger

| Record | Exact canonical state | Accountable owner(s) | Affected scope | Prerequisite / next gate |
|---|---|---|---|---|
| DOC-01 | **Approved publication/authority intent; six-file availability changed by purge** | Sabir; Brooks maintains map | Document authority | Use retained current BMAD/UX inputs and available specifications; no restoration or competing live status authority |
| DOC-06 | **Approved specification; implementation gap** | RAM implements; independent reviewer verifies | FR-B3, DEV-05B | Implement exact reviewed-version input/comparison and pass DEV-AC04; do not reopen behavior |
| DOC-07 | **Approved specification; implementation/evidence gap** | RAM implements; independent reviewer verifies | FR-D2, DEV-06 | Decide AD-68 implementation details/transfer authority; prove DEV-AC05/BE-AC06; do not reopen read-back requirement |
| DOC-02 | **Needs a decision** | Sabir + Durham | FR-E1/E2, UI part of DEV-10 | Name exact approved visual reference/revision/assets and required states |
| DOC-03 | **Blocked for restore/rollback stories** | Brooks + data owner; Sabir accepts intended behavior | Restore subset of FR-B4/C3 | Reconcile restore implementation with immutable lineage; does not block unrelated correction work |
| DOC-05 | **Needs a decision** | Brooks + data owner; Sabir accepts intended behavior | Cross-proposal duplicate subset of FR-B4/B5 | Define merge/link/reject/new-version behavior |
| DOC-08 | **Needs evidence** | Brooks locates approval; Sabir resolves if absent | Curator-first delivery references | Identify valid decision evidence; do not substitute AD-57 |
| DOC-09 | **Needs a decision** | Sabir product choice; Brooks boundaries | FR-E3, work-item stories | Decide operational board, sync direction, and conflict rules; routing remains unchanged |
| DOC-04 | **Verification pending** | RAM delivery owner + independent reviewer | Minimum governed journey | Produce current-revision and deployed-target DOC-J01–09 receipts |
| AD-35 | **Accepted intent; historical implementation absent; full runtime deferred** | Brooks / Story 12.1 owner | FR-F3 | Define run acceptance; then 12.2–12.3 durability/continuation/doctor/API evidence when scoped |
| AD-65 | **Proposed**; DEV-03 **Needs a decision** | Brooks proposal; Sabir approval boundary; Woz after decision; Pike/Knuth review | FR-A3 | Decide key/digest/compatibility/storage/admission/retention/retry policy and schema review |
| AD-66 | **Proposed**; DEV-04 **Needs a decision** | Brooks + Knuth; Pike review; Sabir approves security/schema/production change | FR-C2 | Decide signatures/RLS/index intent; inventory deployed migrations/roles; prove restricted-role isolation |
| AD-67 | **Proposed**; DEV-05A **Needs a decision** | Brooks + Knuth; Woz after decision; Pike review | FR-B5 | Decide public mapping/fields/uniqueness/concurrency; keep DOC-03/05 separate |
| AD-68 tooling subset | **Exact local tooling selected and verified in 1.1; hosted/product evidence outstanding** | RAM tooling; independent lane reviewers | FR-D3 | Preserve accepted foundation; Story 6.3 proves hosted lanes. Old lint debt is not fresh runtime state |
| AD-68 remainder | **Proposed** | Brooks coordinates; named tooling/measurement/delivery owners; Sabir for budgets/upgrades | FR-D1/D2/D4/D5/F1 | Decide delivery read route/digest/retry, telemetry/retention/destination, budgets, upgrades/removals, and release evidence |
| ENT-01–05 | **Open contracts** | Owners named in Risks and Decisions; Durham for ENT-05 | FR-E1/E2/E4, DEV-10 | Role/confidentiality, restricted-role/RLS, admin/device/audit, production identity/session, and actual responsive/accessibility evidence |

Approved DOC-01/06/07, the authority routing, and the AD-68 bounded tooling selection remain in force. Draft completion cannot change any ledger row.

## 10. Dependencies, constraints, and remaining questions

### Fixed constraints

- Team RAM routing uses the [active retained entrypoint contract](../../../../guidelines/ALLURA-BMAD.md); role assignment is responsibility, not evidence that a specialist ran. Deleted runtime Markdown is not a required live input.
- Retained specifications preserve intent/decision provenance. Current BMAD planning applies the explicitly approved rebuild correction; missing architecture/data files do not grant permission to invent contracts.
- Allura Brain continuity is governed and authenticated; unavailable or empty retrieval does not authorize another tenant or direct database access. No Brain write was made during this task; the standing write hold remains.
- Disposable PostgreSQL/restricted-role environments are required for mutation, concurrency, rollback, and isolation acceptance. Remote writes require explicit transfer authority.
- Proposed development DTO/storage names under AD-65–68 remain proposals. No schema/API/migration/compatibility contract is adopted here.

### Product choices (not decided here)

- DOC-02 exact approved visual reference and DOC-09 operational board, synchronization direction, and conflict rules.
- DOC-03 restore behavior and DOC-05 distinct-proposal duplicate behavior remain separate product choices from correction delivery.

### Engineering proposals (not adopted here)

- AD-65 capture key/digest normalization, compatibility, admission, retention, and retry/claim policy.
- AD-66 authority signatures, migration applicability, vector model/dimension/index identity, legacy-row quarantine, and worker lease/retry details.
- AD-67 correction mapping/fields, base/current-head uniqueness, and concurrency.
- AD-68 remote delivery read route/digest/retry/reconciliation, telemetry fields/retention/destination, and upgrades/removals/deprecations.

### Evidence gaps and open contracts

- DOC-08 curator-first approval evidence remains missing; collection of evidence does not substitute for an owner decision if no valid approval is found.
- AD-66 deployed role/RLS and migration-applicability proof, AD-68 release evidence, and the measurement baselines named in §§7–9 remain outstanding evidence.
- ENT-01–05 remain open contracts for role/confidentiality, restricted-role/RLS, admin/device/audit, production identity/session, and responsive/accessibility evidence.

### Deferred strategy and budgets

- Buyer and commercial strategy remain deferred.
- Product-success, retrieval-quality, latency, scale, and cost targets remain unadopted pending measured baselines and bounded owner recommendations.

### Snapshot limitation

The historical source manifest binds the pre-purge authoring snapshot only. Private reset manifests bind current edits and protected bytes. Purge/foundation/docs remain uncommitted pending the parent baseline commit. Only Story 1.1 local tooling is verified; no memory implementation, clean Git, main change, deployment or release is claimed.
