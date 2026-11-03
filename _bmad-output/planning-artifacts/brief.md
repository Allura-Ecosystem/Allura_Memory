---
title: "Allura Memory Fresh-build Product Brief"
status: approved-rebuild-direction-applied-open-decisions-retained
created: 2026-10-25
updated: 2026-10-26
bmadWorkflow: bmad-product-brief
workflowMode: headless-source-synthesis
approval: "Fresh rebuild and documentation correction approved; unresolved choices not adopted"
sourceRevision: fcf4a33f025f69a5bc3fd120e974dd079dc65c52
---

# Product Brief: Allura Memory

> **Approved sequential rebuild, not product acceptance.** Execute Epic 1, then Epic 2 under the current catalog. Story 1.1's local foundation is verified; Epic 1 and the product are incomplete. Parent owns the pending clean baseline commit; legacy repair STOP stays intact. Retain BMAD/UX and unresolved decisions without historical delivery claims. See [Correct Course](sprint-change-proposal-2026-10-26.md).
>
> **Owner-approved operational routing:** Allura owns work status; Notion holds planning documents; Allura Brain provides governed continuity. No native Allura BMAD tracker adapter or actual status capability was available for this draft, so operational status remains unknown. This routing does not resolve product decision DOC-09.

## Executive summary

Allura Memory is a self-hosted, governed memory data plane for connected AI agents. Its core job is narrow: accept authorized evidence, preserve an append-only trace, let an independent authorized human decide what becomes reusable semantic knowledge, and return current, scope-safe context with provenance. PostgreSQL owns episodic evidence, proposal workflow, immutable semantic versions and graph relationships; pgvector/RuVector-backed paths support retrieval. Agents use MCP/API contracts. The optional Memory Command Center helps reviewers and operators inspect proposals, receipts, lineage and health without becoming the canonical data owner or an orchestration runtime.

The product exists because persistent agent context is useful only when people can determine what was stored, why it was trusted, which scope it belongs to, and which version is current. Allura's intended differentiation is governance by construction—authenticated tenant/workspace authority, append-only evidence, immutable semantic history, independent human promotion and truthful claim states—not an unverified claim of superior scale, accuracy, compliance or production readiness.

**Retained basis:** [Blueprint](../../docs/allura/BLUEPRINT.md), [Requirements Matrix](../../docs/allura/REQUIREMENTS-MATRIX.md), [Risks & Decisions](../../docs/allura/RISKS-AND-DECISIONS.md), [Design](../../docs/allura/DESIGN-ALLURA.md), [current PRD](prds/prd-Allura_Memory-2026-10-25/prd.md), and [BMAD architecture](architecture.md). The former Solution Architecture/Data Dictionary are purged; no detailed schema is silently reconstructed. Historical source references in retained documents are provenance, not runtime prerequisites.

## Problem and outcome

Connected agents otherwise accumulate fragmented, stale or over-broad context. A save may be duplicated after a lost acknowledgement; retrieval may silently cross a workspace boundary or return superseded knowledge; an automated score may be mistaken for approval; and local delivery may be reported as remote synchronization. Operators can also mistake a source file, green check or visual preview for live readiness.

Allura's required outcome is a demonstrable chain:

1. authenticated client captures evidence inside server-resolved tenant/workspace authority;
2. append-only evidence and provenance remain inspectable;
3. a curator creates a proposal but cannot activate it;
4. an independent authorized human reviews the exact proposal version;
5. approved content becomes a new immutable semantic version with lineage;
6. later retrieval returns only permitted current knowledge with source/review state;
7. operational and projection outcomes remain truthful (`failed`, `partial`, `unknown`, `confirmed`) and separately evidenced.

## Who this serves

| Audience statement | Classification | Evidence / decision needed |
|---|---|---|
| Developers and teams using connected AI agents are the primary readers/users of the engine interfaces. | **Existing source** | Blueprint lines 63–65 and 954–960. |
| AI agents capture/retrieve; independent human curators promote; operators inspect receipts and health. | **Retained intent** | Blueprint lines 30–32; current PRD §§1–4. Former Solution Architecture is absent. |
| Enterprise reviewers/operators may use an optional dashboard across explicit shared workspaces. | **Existing source, implementation/release unproven** | Blueprint lines 35–41; Design lines 55–74. |
| “Maya,” consumer/community positioning, and a broad personal-AI-OS audience are current primary personas. | **Historical, not current** | Blueprint lines 65 and 82–101; Appendix A lines 845–847. |
| Economic buyer, procurement owner, support owner, and commercial packaging. | **Owner decision required** | Not settled by the six-spec set; do not infer. |
| The initial customer segment is regulated enterprise. | **Assumption rejected for this draft** | The docs discuss enterprise/compliance use cases but do not establish a current go-to-market commitment or compliance claim. |

## Product boundaries

### Retained intended product boundary — not current implementation

- MCP/API-first governed memory engine with five registered core tools: `memory_add`, `memory_search`, `memory_get`, `memory_list`, `memory_delete`.
- PostgreSQL append-only evidence and proposal state; PostgreSQL semantic graph tables; pgvector/RuVector retrieval paths.
- Authenticated tenant and applicable workspace scope derived by the server; a valid `group_id` string is not authorization.
- Mandatory independent human promotion; scores and legacy mode names do not grant approval.
- Immutable semantic content versions and retained lineage.
- Optional review/operator surfaces and SDK/CLI consumers, each subject to their own acceptance evidence.

**State caveat:** the local `foundation/` package exists and is verified under 1.1; it is not an Allura memory runtime. Current BMAD tooling and protected UX remain. Product/deployed acceptance is outstanding; historical source observations describe a different baseline.

### Next — existing backlog, not newly promised scope

- [1.1](stories/1.1-local-executable-foundation.md) is locally verified; [1.2](stories/1.2-authority-and-service-contracts.md) is the lowest unfinished story, followed by 1.3 storage/security contracts and 1.4 foundation acceptance. The [Epic 1–14 catalog](epics.md) owns the complete sequence, dependencies and optional/deferred gates. No legacy delivery number is active; stable requirement IDs remain unchanged.
- Close affected proposal decisions AD-65–AD-68 and product decisions DOC-02/03/05/08/09 before dependent implementation.
- Apply the approved authority split: Allura owns operational work status, Notion holds planning documents, and Brain provides governed continuity. Reconcile existing Allura items only through an actual supported status capability; if unavailable, keep status unknown and do not create a parallel tracker.

### Later — explicitly deferred or decision-dependent

- Full governed run/product surface, PostgreSQL work plane, operator workspace and desktop shell (BP-F49–55).
- Native work board or board synchronization only after DOC-09 selects authority and conflict rules.
- Broader resource/agent/telemetry surfaces and optional modules only through explicit contracts and evidence.
- Personal AI OS vision remains direction, not an implemented commitment.

## Non-goals

- Agent orchestration or autonomous business decisions inside the memory data plane.
- Direct agent/dashboard database access or caller-minted tenant/workspace/reviewer authority.
- Autonomous semantic promotion, score-as-approval, in-place semantic edits or destructive trace/history rollback.
- Treating Notion projection, a UI toast, local outbox delivery, source presence, tests from another revision, or screenshots as release proof.
- A new sprint-status YAML, local parallel board or replacement Team RAM taxonomy.
- New scale, latency, accuracy, productivity, SOC 2, availability or compliance promises without accepted budgets and current evidence.

## Success criteria

These are **evidence classes**, not newly adopted numeric targets:

- one authorized capture is replay-safe; changed payload conflicts; lost acknowledgement reconciles the original receipt;
- cross-tenant/workspace reads and writes yield zero unauthorized results in restricted-role tests;
- each semantic version and approval remains traceable to source evidence, exact reviewed proposal version and independent actor;
- retrieval evaluation uses human-reviewed current/history/no-answer fixtures and reports relevance, freshness, p50/p95, failure/fallback and sample size;
- required package lanes discover nonzero suites and fail on deliberate exclusion;
- optional dashboard journey proves denial, revocation, stale review, responsive/accessibility behavior and revision-bound deployment separately;
- all published capability rows state intended/specified/implemented/verified/released with source date and limitation.

Targets/budgets remain owner decisions (DEV-AC09, PV-AC03/04). Counter-metric: do not increase capture or retrieval “success” by weakening isolation, bypassing review, hiding unknown states or deleting history.

## Open owner decisions

1. Approve/reject AD-65 capture identity, digest, retention and retry compatibility.
2. Approve/reject AD-66 vector authority signatures and deployed migration/role evidence.
3. Approve/reject AD-67 correction/conflict UX and single-head concurrency contract.
4. Complete AD-68 choices for authoritative lanes, telemetry/delivery details, budgets and staged compatibility changes.
5. Resolve DOC-02 visual reference, DOC-03 restore lineage, DOC-05 duplicate policy, DOC-08 curator-first provenance and DOC-09 native work-board/synchronization product behavior.
6. Confirm product buyer/packaging/support assumptions; none are adopted here.
