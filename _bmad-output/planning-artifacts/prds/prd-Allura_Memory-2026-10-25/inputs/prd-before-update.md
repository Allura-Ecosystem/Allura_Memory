---
title: "PRD: Allura Memory Brownfield Product Contract"
status: authoring-draft-unapproved
created: 2026-10-25
updated: 2026-10-25
bmadWorkflow: bmad-prd
workflowMode: headless-source-synthesis
approval: "Jobs/Sabir acceptance not recorded"
sourceRevision: fcf4a33f025f69a5bc3fd120e974dd079dc65c52
---

# PRD: Allura Memory

> **Unapproved authoring draft.** This compact PRD indexes existing canonical requirements; it does not assign new canonical IDs, change the six specifications, update Allura operational status or Notion planning documents, or assert implementation readiness. `[OWNER DECISION]` means no product choice was made in this noninteractive run. Source paths and tests were inspected; product tests were not executed.
>
> **Owner-approved operational routing:** Allura owns work status; Notion holds planning documents; Allura Brain provides governed continuity. No native Allura BMAD tracker adapter or actual status capability was available for this draft, so operational status remains unknown. This routing does not resolve product decision DOC-09.

## 0. Purpose and authority

This PRD gives product and engineering reviewers a coherent brownfield entry point for the full Allura product scope. The canonical authority remains the six files listed in Blueprint lines 851–876. Terms and stable requirement IDs below preserve the source namespaces: `BP-*` (Blueprint), `GM-*` (Matrix), `DS-*` (Design), `DEV-*` (development readiness), `CF-*`, `BE-*`, and canonical decisions. This PRD is a companion, not a seventh specification.

Claim states are: **intended → specified → source-present/implemented → verified → released**. Source presence never skips verification or release.

## 1. Vision and product boundary

Allura is an MCP/API-first, self-hosted governed memory data plane. It persists authorized evidence, turns evidence into proposals, requires independent human promotion, stores approved semantic versions immutably, and retrieves current knowledge inside authenticated tenant/workspace authority. The optional Memory Command Center is a governed view/request surface; orchestration, domain decisions and external projections remain outside the core engine.

### 1.1 Target users and jobs

- **Developer/team integrating agents — existing source:** save and retrieve persistent project context through stable MCP/API/SDK contracts without managing raw storage.
- **Connected agent — existing source:** capture scoped evidence and retrieve permitted context with provenance; cannot self-grant or promote.
- **Independent human curator/reviewer — existing source:** inspect evidence and exact proposal version, decide promotion, and receive an immutable receipt.
- **Operator/admin — existing source:** inspect scope, health, audit, lineage and degraded states without direct substrate mutation.
- **Enterprise employee/dashboard viewer — existing source, optional surface:** inspect only authorized workspace memories/relationships on desktop/tablet/phone.
- **Buyer/commercial owner — `[OWNER DECISION]`:** not defined by the canonical set.
- **Maya/community consumer — historical context, not the current primary persona.**

### 1.2 Key journeys

- **UJ-1 — Developer carries a reviewed decision into a later agent session.** An authenticated integration captures a decision and reason; an independent human reviews the proposal; a later authorized agent retrieves current approved knowledge with source and review state. Edge case: lost capture acknowledgement must reconcile the same receipt rather than duplicate evidence. Sources: BP-F1–7, BP-F26–40, GM-F1–15, DEV-AC01/04.
- **UJ-2 — Reviewer rejects stale material.** A human reviews proposal v3; the proposal becomes v4 before submit; the system rejects the stale decision with no approval writes and requires fresh review. A replay of a previously committed decision returns the original receipt. Source: DOC-06, BP-F62, DEV-AC04.
- **UJ-3 — Operator investigates a retrieval result.** An operator follows current knowledge to semantic version, supersession lineage, approval receipt and append-only source evidence inside the same scope. Missing or degraded source is explicit. Sources: DS-F18/41/42/47, GM-F3/7/8/9/15.
- **UJ-4 — Enterprise viewer is denied another workspace.** A viewer searches within an authorized workspace; vector and lexical paths return no foreign result; revoked/locked/missing authority fails closed. Source: BP-F60/68, DEV-AC02/10.
- **UJ-5 — Remote projection remains honest.** A committed approval may queue a Notion delivery, but only destination read-back can yield `synced`; timeout remains `unknown`, and the original decision receipt is unchanged. Source: DOC-07, BP-F63, DEV-AC05.

## 2. Glossary

- **Evidence:** append-only source record; not automatically reusable semantic knowledge.
- **Proposal:** mutable review-workflow row derived from evidence; pending until an authorized decision.
- **Semantic version:** immutable approved content row in `graph_memories`; new content creates a new row.
- **Lineage:** same-scope `graph_supersedes` links among semantic versions.
- **Governance receipt:** immutable decision evidence containing actor, scope, policy, evidence and decision-time outbox state.
- **Delivery observation:** separate current projection state (`queued|synced|failed|unknown`), not a mutation of a decision receipt.
- **Authority:** server-resolved principal, tenant, workspace and action permission; request fields are not authority.
- **Current knowledge:** nondeprecated, nonsuperseded semantic version permitted for the active scope.
- **Source-present:** implementation evidence exists in this dirty checkout; not tested/deployed proof.

## 3. Product requirements

### Feature A — Governed capture and evidence

- **FR-A1:** An authenticated client can append evidence through the five core memory contracts. Preserve BP-F1–5, BP-F20, BP-F26–28 and GM-F1–3/20/26–28.
- **FR-A2:** Every operation uses server-resolved tenant and applicable workspace authority; namespace validation alone grants nothing. Preserve B2, GM-F12/13/37/38 and architecture constraint §6.
- **FR-A3:** Retry-safe capture must bind one scoped operation key and canonical digest to one event/receipt/index intent; same-key changed payload conflicts. Preserve BP-F59 / DEV-AC01. **Implementation blocked by AD-65 decision.**

### Feature B — Proposal, independent review and immutable knowledge

- **FR-B1:** Curator processing may create evidence-linked proposals but never active knowledge. Preserve BP-F29–32, GM-F4–7/29–32.
- **FR-B2:** Every semantic promotion requires an independent authorized human in every mode. Preserve B7/B25, BP-F6/7/31, AD-04.
- **FR-B3:** Approval applies to the exact reviewed proposal version and successful replay returns the original receipt. Preserve DOC-06, BP-F62, DEV-AC04.
- **FR-B4:** Changed knowledge creates a new semantic version and same-scope lineage; no in-place content edit. Preserve B4/B26, BP-F9/33/34, GM-F8/9/33/34.
- **FR-B5:** Governed correction creates a pending correction and one approved current head while preserving prior content/edges. Preserve BP-F61 / DEV-AC03. **Blocked by AD-67; restore and cross-proposal duplicate work remain separately blocked by DOC-03/05.**

### Feature C — Scope-safe retrieval and graph inspection

- **FR-C1:** Agents retrieve through controlled MCP/API services, never direct database queries. Preserve BP-F2–4/20/35–39 and GM-F10–13/35–39.
- **FR-C2:** Vector and lexical paths carry verified workspace authority end to end; denial never widens fallback. Preserve BP-F60 / DEV-AC02. **Blocked by AD-66 and deployed migration/role evidence.**
- **FR-C3:** Current results exclude deprecated/superseded versions; history remains inspectable with provenance. Preserve Data Dictionary `graph_memories`/`graph_supersedes` contracts.

### Feature D — Truthful operations, projections and product claims

- **FR-D1:** Operational outcomes distinguish persistence, indexing, promotion and projection stages; timeouts report unknown where appropriate. Preserve BP-F66 / DEV-AC08.
- **FR-D2:** Remote `synced` requires authorized destination read-back; immutable approval receipt never changes. Preserve DOC-07, BP-F63 / DEV-AC05. **Implementation details/remote authority unresolved.**
- **FR-D3:** Required lanes use declared runtime/frozen lock, actual ESLint, separate typecheck and nonzero critical-suite discovery. Preserve BP-F64/65 / DEV-AC06/07.
- **FR-D4:** Retrieval quality uses versioned human labels and reports sample sizes, relevance, freshness, isolation, p50/p95 and fallback. Preserve BP-F67 / DEV-AC09; budgets are `[OWNER DECISION]`.
- **FR-D5:** Capability guidance labels evidence class/date/limits and does not overclaim SDK/CLI/Notion/Bumblebee, benchmarks or compliance. Preserve BP-F69/70 / DEV-AC11/12.

### Feature E — Optional human operator surface

- **FR-E1:** The optional Memory Command Center exposes governed memory, curator, governance, graph, audit, settings and health experiences through API/MCP contracts only. Preserve BP-F41/42/47/48 and DS-F17–19/41/42/47/48.
- **FR-E2:** The authenticated journey proves multi-user scope, denial, revocation, stale review, responsive/accessibility behavior and exact deployed revision. Preserve BP-F68 / DEV-AC10 and CF-AC01–05.
- **FR-E3:** Native work-item surfaces remain unavailable or explicitly nonauthoritative until DOC-09 resolves board/synchronization product behavior and conflict rules. This product decision does not alter the approved Allura operational-status authority.
- **FR-E4:** Dashboard claims no SOC 2 compliance or live health without actual evidence.

### Feature F — Distribution, integration and deferred platform scope

- **FR-F1:** Maintain stable MCP/API/SDK/CLI consumer compatibility through inventory and packed-consumer evidence before removal/deprecation. Preserve B1/B6/B14/B20 and BP-F20/21/69.
- **FR-F2:** Core deployment remains self-hosted/PostgreSQL-based; clean-machine and deployed readiness require separate evidence. Preserve B5/B20 and Blueprint historical readiness caveat.
- **FR-F3:** Governed runs (BP-F49–52) are partial/deferred; AI Office/work plane/operator workspace/desktop shell (BP-F53–55) are later scope, not this implementation pack.
- **FR-F4:** Bumblebee and modules retain their own read-only/proposal ceilings and must not expand authority through installation.

## 4. Cross-cutting nonfunctional requirements

- **NFR-1 Isolation:** zero unauthorized tenant/workspace results under restricted-role and pooled-connection tests.
- **NFR-2 Integrity:** append-only historical events and immutable semantic content/receipts; rollback preserves committed history.
- **NFR-3 Reliability:** idempotent replay/conflict behavior and explicit unknown outcomes at ambiguous boundaries.
- **NFR-4 Security:** fail closed on missing/forged/locked/revoked authority; human and machine identity routes remain distinct.
- **NFR-5 Observability:** stage-bound, redacted, low-cardinality signals; no raw content, credentials or foreign-scope identifiers.
- **NFR-6 Accessibility:** optional dashboard controls keyboard reachable, screen-reader readable and contrast safe; actual responsive evidence required.
- **NFR-7 Reproducibility:** exact source/diff, runtime/lock digests, named package lanes, nonzero discovery, counts and exit codes.
- **NFR-8 Truthfulness:** intended/specified/source-present/verified/released never conflated.

No numeric SLO, scale or compliance target is adopted in this draft.

## 5. Scope and sequencing

### Now (existing source/product boundary)

Core five-tool MCP/API memory path, authenticated scope, append-only evidence, proposals, human-gated approval, immutable semantic versions, controlled retrieval, audit/receipts, current PostgreSQL graph adapter, SDK/CLI integration points and optional operator views. **Source-present/tests-unverified in this run.**

### Next (existing DEV backlog)

DEV-00–10 as grouped in `epics.md`; first preparation sequence DEV-00 → DEV-01 → DEV-05B, while owners resolve AD-65–68. No implementation begins for decision-blocked stories. Dashboard/work-board acceptance waits on DOC-02/09 and enterprise role contracts.

### Later (existing deferred intent)

BP-F49–55 governed run and AI Office program; native work board/sync; broader resource/agent/telemetry surfaces; personal-AI-OS direction. These are not committed milestones.

## 6. Success evidence and counter-metrics

Use canonical DEV-AC01–12, CF-AC01–05 and affected BE-AC01–09. An acceptance row closes only with revision-bound command output, nonzero discovery, authorized environment, actual independent review and required read-back. Counter-metrics: no increase in success rate through broader fallback, bypassed review, fabricated scope, silent degradation, history deletion or relabeling local delivery as remote sync.

## 7. Dependencies, approvals and open questions

- **Operational routing:** Allura owns work status; Notion holds planning documents; Brain provides governed continuity. No native Allura tracker adapter or actual status capability was available, so status is unknown and no tracker update was made. DOC-09's native board/sync product decision remains unresolved.
- **Owner decisions:** AD-65–68, DOC-02/03/05/08/09, ENT-01–05 and metric budgets.
- **Environment:** disposable PostgreSQL/restricted role required for mutation, concurrency and isolation acceptance; remote writes require explicit transfer authority.
- **Roles retained:** Team RAM as defined in `.opencode/AGENTS.md` lines 123–149; assignment is future responsibility, not evidence of execution.
- **Assumptions index:** (1) this document is a review aid, not canonical replacement; (2) current primary audience follows the accepted developer/team decision; (3) source-present behavior may have changed in the dirty tree and remains unverified.
