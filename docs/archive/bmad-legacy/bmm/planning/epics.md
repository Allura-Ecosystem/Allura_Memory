---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - docs/goal.md
  - docs/plans/allura-memory-finish-plan.md
  - _bmad/FINISH-ALL-EPICS-WORKFLOW.md
  - _bmad/ALLURA-NAVIGATOR-WORKFLOW.md
  - _bmad/TEAM-RAM-INTEGRATION.md
  - .opencode/guidelines/AI-GUIDELINES.md
  - .opencode/guidelines/HOOKS.md
  - docs/allura/BLUEPRINT.md
  - docs/allura/SOLUTION-ARCHITECTURE.md
  - docs/allura/DESIGN-ALLURA.md
  - docs/design/DASHBOARD-VISUAL-SPEC-v2.md
  - _bmad/bmm/planning/source-docs/EPICS-dashboard-v2.md
  - _bmad/bmm/planning/source-docs/PRD-DESIGN-SYSTEM-v1.md
  - _bmad/bmm/planning/source-docs/PRD-TEAM-RAM-v1.md
---

# Allura Memory - Epic Breakdown

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD planning artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Overview

This document provides the BMAD requirements extraction baseline for finishing Allura Memory. It consolidates the confirmed planning inputs into functional requirements, non-functional requirements, architecture requirements, and UX/design requirements before epics and stories are finalized.

This BMAD plan is governed by the professor/Carlos documentation standard in [`.opencode/guidelines/AI-GUIDELINES.md`](../../../.opencode/guidelines/AI-GUIDELINES.md). That standard is essential context for all planning and implementation work: `docs/allura/` is restricted to the six canonical architecture artifacts, AI-shaped docs require disclosure, requirements must trace through Blueprint/Design/Requirements Matrix/Risks/Data Dictionary, and schema/API changes must update the relevant docs in the same work slice.

Allura Memory is a governed AI memory operating system. It must let an operator answer:

1. What does the Brain know?
2. Why does it believe that?
3. Who approved it?
4. What changed, and can we prove it?

## Requirements Inventory

### Functional Requirements

FR1: Agents can add memory through a controlled API/MCP path that records raw episodic traces in PostgreSQL before any semantic promotion.

FR2: Agents and operators can search memory through a controlled retrieval layer that preserves tenant scope via explicit `group_id`.

FR3: Operators can inspect individual memories, provenance, confidence, source, actor, status, evidence, and timestamps without relying on fabricated UI state.

FR4: Operators can list memories for a scoped user or tenant and distinguish episodic traces from approved semantic knowledge.

FR5: Operators can soft-delete or forget memory with append-only audit behavior and recover recently forgotten memories when policy allows.

FR6: Promotion mode supports SOC2/human-gated approval and policy-controlled auto-promotion, with no unreviewed raw trace becoming canonical truth.

FR7: Approved insights are stored as immutable, versioned Neo4j knowledge records using version relationships such as `SUPERSEDES` rather than in-place mutation.

FR8: Every read and write enforces tenant isolation with `group_id` matching the `allura-*` namespace boundary.

FR9: Curators can view pending proposals, inspect evidence, approve, reject, request changes/needs evidence, and see audit receipts for each decision.

FR10: Dashboard Phase 1 shows three operator surfaces: system status, hygiene/actions, and approvals queue.

FR11: The rebuilt `/dashboard` answers what is true now, what needs action, and what needs approval using real data or honest degraded/unknown states.

FR12: `/dashboard` preserves the approved visual target: warm cream background, search-first memory workspace, thin workflow navigation, right-side approvals/provenance, and bottom mission board strip.

FR13: `/dashboard/memory-space`, `/dashboard/agents`, `/dashboard/insights`, and `/dashboard/builder` exist or degrade explicitly according to Dashboard Visual Spec v2.

FR14: `/allura` remains a separate Mission Control surface until a deliberate cutover path is approved.

FR15: The dashboard must not replace the protected `3100` target until route parity, visual parity, adapter/source-of-truth declarations, auth validation, smoke tests, no-fabricated-data checks, and rollback documentation pass.

FR16: Native/adapter-backed work-board state is governed by Notion Work Board as the human/team source of truth until a replacement is explicitly approved.

FR17: Team RAM routes work through Jobs, Brooks, Scout, Woz, Pike/Fowler, validation, and Allura Brain logging.

FR18: Every meaningful project move follows the Allura Navigator loop: read board, hydrate context, route work, build/review, attest/remember.

FR19: BMAD artifacts map PRDs, architecture, epics, stories, owners, validation commands, and evidence expectations into executable story lifecycle work.

FR20: Story execution follows Backlog → Ready → In Progress → Review → Done and no card reaches Done without tests, acceptance criteria, review, validation, and evidence.

FR21: Phase 0 is closed and Phase 1 is unblocked; remaining project work proceeds through the finish-all-epics sequence rather than reopening historical Phase 0 blockers.

FR22: Remaining work is executed in the canonical order: current review debt, Epic 2 Frontend Tightening, E1 Host Stability, E2 Dashboard Quality, E3/E4 Hardening Deploy, E4 Kernel Completion, E5 Infrastructure Polish.

FR23: PRD and Team RAM planning artifacts must preserve `.opencode/agent/` as the live agent source of truth and treat `.claude` or other harness files as adapters/mirrors when present.

FR24: PRD-TEAM-RAM-v1 is treated as draft input until its path, authority, event/schema, and memory write-back issues are hardened.

FR25: Export/copy surfaces preserve provenance in human-readable form, including source, actor/creator/approver, timestamp, tenant scope, status, confidence, evidence IDs, and hash fields when present.

FR26: Governance MCP tools enforce policy gates, config management, and audit trail queries through 5 registered tools with group_id enforcement.

FR27: Audit MCP tools report system health, agent activity, and invariant compliance through 4 registered tools with append-only query behavior.

FR28: Every dashboard surface passes a 7-point Definition of Done gate: loading state, empty state, error state, ready state, real API usage, correct next action, and no fake status indicators.

FR29: Memory Add modal saves new memories to Brain through the governed memory_add MCP path with group_id, user_id, and content validation.

FR30: Settings surface shows real runtime capabilities (available MCP tools) and connected MCP server status rather than placeholder text.

FR31: Symphony orchestrator polls Notion board for Ready tasks, claims them with agent assignment, and routes work through Brooks-based intent classification.

FR32: Kanban surface displays real task status from Notion Symphony adapter with drag-drop state transitions that persist through updateStatus.

FR33: Scheduled tasks persist in Brain, execute on cron via Anthropic API, store results as Brain traces, and support pause/resume/run-now controls.

FR34: Chat supports multi-turn streaming conversations via Anthropic API proxy with Brain context augmentation, persistent history, and source attribution.

FR35: Command palette (Cmd+K) provides keyboard-first fuzzy search across pages, Brain memories, actions, and settings with ARIA accessibility.

FR36: Toast notification system provides non-blocking success/error/warning/info feedback with auto-dismiss, replacing all alert() calls.

FR37: Dark mode uses CSS custom properties with system preference detection, manual override persisted to localStorage, and WCAG 4.5:1 contrast compliance.

FR38: Mobile surfaces have minimum 44x44px touch targets, swipe navigation for sidebar, bottom nav at ≤720px, and no horizontal scroll at 320px.

FR42: Process Engine executes TypeScript workflow definitions with mandatory checkpoints, quality gates, budget enforcement, and append-only event journaling. All steps carry group_id, agent_id, process_id.

FR43: Replay Engine reconstructs process state from PostgreSQL event journal and resumes from the last incomplete step. Supports dry-run audit replay.

FR44: @allura/sdk TypeScript package published to npm providing governed memory CRUD, search, process execution, and type-safe contracts over HTTP.

FR45: Token compression layer reduces agent context by ≥40% through structural pruning, Brain-backed summarization, and semantic deduplication.

FR46: Headless process runner executes governed workflows via CLI without interactive agents, supporting CI/CD pipelines and scheduled automation.

FR47: DAG dependency resolver enables parallel step execution with declarative dependency declarations and cycle detection.

FR48: Harness adapter interface enables SDK and process engine to work across Claude Code, Codex, and Cursor with auto-detection.

### NonFunctional Requirements

NFR1: Tenant isolation is mandatory and enforced at schema/API boundaries; cross-tenant leakage is a P0 failure.

NFR2: Raw memory traces are append-only; audit events must not be rewritten to create a convenient story after the fact.

NFR3: Semantic knowledge is immutable/versioned; updates create new versions and relationships rather than mutating canonical nodes in place.

NFR4: All UI state must be truthful: no fake healthy state, fake live data, placeholder metrics, unlabeled samples, or fabricated provenance.

NFR5: Validation evidence, GitHub checks, source code, schemas, and Notion board receipts prove Done; Allura Brain is memory/audit, not proof of Done.

NFR6: The system remains deployable and recoverable through documented Docker/MCP/runtime paths.

NFR7: Security-sensitive, compliance, finance, owner, and irreversible scope decisions require human approval.

NFR8: UI surfaces meet WCAG 2.1 AA expectations, including keyboard-reachable approval actions and correct focus behavior for dialogs.

NFR9: Every significant architectural, API, schema, or governance change updates the required canonical docs and traceability artifacts in the same work slice.

NFR10: BMAD planning artifacts must not replace Notion board truth; they support execution and reconciliation.

NFR11: Changes are minimal, reversible, and validated with the lightest meaningful checks before completion claims.

NFR12: The dashboard rebuild must preserve approved Allura brand/tokens and avoid Difference Driven language, colors, and assumptions.

### Additional Requirements

- PostgreSQL remains the episodic/audit store; Neo4j remains the semantic/versioned knowledge store.
- MCP and API entry points must carry `group_id`, caller identity, and workflow/audit metadata where applicable.
- Dashboard UI contracts should consume mapped shapes from `src/lib/dashboard/` rather than raw Brain API envelopes.
- Promotion, approval, rejection, and request-changes flows must produce inspectable audit trails.
- Team RAM orchestration must begin with Scout/context hydration and Allura Brain lookup before implementation.
- Fowler/Pike review gates are required before a story reaches Done; if a named agent is unavailable, Brooks must approve documented gate equivalence.
- Ralph/Ultra loops execute bounded work only and provide no final governance authority.
- Current dashboard state is a blank slate reset; future dashboard cards require new approved spec, implementation evidence, review evidence, and validation evidence before Done.
- PRD-TEAM-RAM-v1 must be hardened before becoming an acceptance source because it currently contains path drift, event/schema risk, and stale write-back examples.
- BMAD setup requires project config, a formal epics artifact, story files, and sprint status tracking.

### UX Design Requirements

UX-DR1: `/dashboard` uses warm cream background `#F5F0E8`, white surfaces, charcoal primary text, orange primary CTA, and green approval CTA through semantic tokens.

UX-DR2: Dashboard typography uses IBM Plex Sans exclusively (Regular, Medium, SemiBold, Bold). Overrides prior Outfit/Inter references per 2026-06-11 readiness review — aligns with Figma Brand Identity and allura-app approved direction.

UX-DR3: `/dashboard` must be search-first: the center memory search and recent memory cards are the primary action, not health metrics or generic cards.

UX-DR4: `/dashboard` uses a thin workflow navigation rather than the old heavy/dark sidebar shell.

UX-DR5: The right column shows approvals queue and selected memory detail/provenance.

UX-DR6: A bottom mission board strip shows Intake, Ready, Doing, Review, Done, and Blocked in a minimal horizontal strip.

UX-DR7: Empty states use clear, warm copy for no memories, no pending approvals, and no search results.

UX-DR8: `/dashboard/memory-space` shows a warm graph/provenance experience and handles graph errors with friendly retry states rather than crashes.

UX-DR9: `/dashboard/agents` shows agent cards with live/unknown status and a clear empty state.

UX-DR10: `/dashboard/insights` provides All/Pending/Approved/Rejected tabs with clear approval/rejection receipts.

UX-DR11: `/dashboard/builder` provides compose and curator queue affordances while preserving HITL approval before promotion.

UX-DR12: Forbidden dashboard regressions include dark sidebar shell, generic card-grid hero, old Allura Memory branding, old logo lockup, system status as the primary product, and importing old `@/components/dashboard` route components.

UX-DR13: Visual completion requires screenshot comparison against `localhost:6420` or the approved spec, confirming warm cream, search-first flow, no dark shell, no old branding, and IRIS sign-off.

UX-DR14: Curator actions must be keyboard reachable, confirmation dialogs must trap/restore focus, and degraded states must be visible rather than hidden.

UX-DR15: `/dashboard/graph` renders a knowledge graph canvas with node cards positioned in a force-directed or manual layout. Each card shows avatar (color-coded by type), entity name, role/description, email or identifier, type badge, and connection count. Cards have warm cream canvas background, white card surfaces, 12px corner radius, and subtle shadow on hover.

UX-DR16: Knowledge Graph node types are color-coded: People (blue `#1D4ED8`), Organizations (orange `#FF5A2E`), Memories (green `#157A44`), Agents (purple `#7C3AED`), Projects (gold `#C89B3C`). Type badges use the overline pattern (uppercase, wide-tracked, small SemiBold) on tinted backgrounds matching the type color.

UX-DR17: Clicking a node card highlights its connections (blue lines), dims unrelated nodes, and opens a right-side detail panel showing full contact info, all connections with relationship labels (WORKS_AT, COLLABORATES_WITH, REVIEWED_BY, DECIDED, APPROVED, etc.), and related memory cards with overline tags (INSIGHT · PROMOTED, RAW MEMORY · EPISODIC).

UX-DR18: Knowledge Graph provides filter pills (All, People, Orgs, Memories, Agents, Projects), a search bar, view tabs (Graph, Table, Timeline, Clusters), stats bar (entity count, connection count, cluster count), and zoom controls. Node cards are draggable. SVG curved connection lines follow card positions.

### FR Coverage Map

FR1: Epic 1 - governed write path and trace creation
FR2: Epic 3 - scoped memory search
FR3: Epic 3 - memory detail and provenance inspection
FR4: Epic 3 - scoped memory listing and state distinction
FR5: Epic 1 - governed soft-delete/recovery behavior
FR6: Epic 4 - HITL and policy-controlled promotion gates
FR7: Epic 1 - immutable semantic versioning and `SUPERSEDES`
FR8: Epic 1 - `group_id` isolation at API/schema boundaries
FR9: Epic 4 - curator decision workflow and audit receipts
FR10: Epic 2 - dashboard system/action/approval panels
FR11: Epic 2 - truthful dashboard state model
FR12: Epic 2 - approved Dashboard Visual Spec v2 shell
FR13: Epic 2 - dashboard route availability/degraded states
FR14: Epic 2 - `/allura` remains separate until approved cutover
FR15: Epic 5 - cutover, rollback, parity, and final release evidence
FR16: Epic 1 - Notion-backed board/source-of-truth contract
FR17: Epic 1 - Team RAM routing lifecycle
FR18: Epic 1 - Allura Navigator loop enforcement
FR19: Epic 1 - BMAD story and validation artifact system
FR20: Epic 1 - story lifecycle gates and evidence requirements
FR21: Epic 5 - Phase 0 closure protection and Phase 1 finish criteria
FR22: Epic 5 - finish-all-epics order and final closeout
FR23: Epic 1 - `.opencode/agent/` live source-of-truth preservation
FR24: Epic 1 - draft PRD hardening before acceptance use
FR25: Epic 3 - provenance-preserving export/copy surfaces
FR26: Epic 9 - governance MCP tools (Story 9.1)
FR27: Epic 9 - audit MCP tools (Story 9.2)
FR28: Epic 9 - 7-point DoD test harness (Story 9.3)
FR29: Epic 9 - memory add modal wiring (Story 9.4)
FR30: Epic 9 - settings capabilities wiring (Story 9.5)
FR31: Epic 10 - Symphony orchestrator and Notion adapter (Story 10.1)
FR32: Epic 10 - Kanban surface with live status (Story 10.2)
FR33: Epic 10 - scheduled tasks with cron and Brain persistence (Stories 10.3a/b/c)
FR34: Epic 10 - multi-turn streaming chat with Brain context (Stories 10.4a/b/c)
FR35: Epic 11 - command palette (Story 11.1)
FR36: Epic 11 - toast notification system (Story 11.2)
FR37: Epic 11 - dark mode (Story 11.3)
FR38: Epic 11 - mobile polish (Story 11.6)
FR39: Epic 11 - knowledge graph interactive node cards with vendor details and connections (Story 11.4, Blueprint F49)
FR40: Epic 11 - dashboard route parity — restore all pages in Next.js App Router (Story 11.5)
FR41: Epic 11 - resources manifest and telemetry surfaces (Story 11.7, Blueprint F44+F46)
FR42: Epic 12 - Process-as-Code engine with checkpoints, gates, and event journaling (Story 12.1)
FR43: Epic 12 - event-sourced replay and resumption from PostgreSQL journal (Story 12.2)
FR44: Epic 12 - @allura/sdk npm package with governed memory + process engine (Story 12.3)
FR45: Epic 12 - token compression layer with Brain-backed summarization (Story 12.4)
FR46: Epic 12 - headless process runner for CI/CD (Story 12.5)
FR47: Epic 12 - DAG dependency resolver for parallel step execution (Story 12.6)
FR48: Epic 12 - multi-harness adapter interface (Story 12.7)

## Epic List

### Global Contracts for All Epics

- Notion Work Board is the planning/status/approval source of truth.
- Allura Brain is governed memory and audit context, not proof of Done.
- `group_id = allura-system` for this project work unless a story explicitly defines another valid `allura-*` tenant.
- HITL approval is required before semantic promotion in SOC2 mode.
- No agent autonomously promotes to Neo4j or edits semantic nodes in place.
- PostgreSQL traces/events are append-only.
- Neo4j knowledge changes use versioning relationships such as `SUPERSEDES`.
- Existing schema evidence for tenant isolation includes `docker/postgres-init/00-traces.sql` (`events.group_id VARCHAR(255) NOT NULL`), `docker/postgres-init/19-group-id-check-constraints.sql` (strict `^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$` CHECK constraints across tenant-scoped tables), `json-schema/event.schema.json`, `json-schema/memory.schema.json`, and `docker/neo4j-init/00-schema.cypher` (`memory_group_id_idx`, `memory_group_user_idx`).
- Existing runtime validation evidence includes `src/lib/validation/group-id.ts` (`validateGroupId` with strict pattern), `src/mcp/canonical-tools.ts` validating `group_id` before memory writes, `src/agents/memory-wrapper.ts` validating every agent memory operation, and curator routes such as `src/app/api/curator/approve/route.ts` validating `group_id` before scoped proposal queries.
- Existing migration/idempotency evidence includes `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `IF NOT EXISTS` constraint guards, and `schema_versions ... ON CONFLICT DO NOTHING` patterns in `docker/postgres-init/` plus `CREATE INDEX IF NOT EXISTS` in `docker/neo4j-init/00-schema.cypher`.
- Citable schema specification lives in `docs/allura/DATA-DICTIONARY.md`: PostgreSQL `events`, PostgreSQL `canonical_proposals`, Neo4j `Memory`, event metadata payloads, status values, required fields, indexes, triggers, and foreign keys. Story 1.1 must use this as the baseline and report any drift against SQL/JSON schema/code as a blocker or explicit follow-up.
- Professor/Carlos documentation standard: every story that changes architecture, API, schema, event contracts, data fields, or dashboard behavior must check [`.opencode/guidelines/AI-GUIDELINES.md`](../../../.opencode/guidelines/AI-GUIDELINES.md), preserve the six-document `docs/allura/` canonical surface (`BLUEPRINT.md`, `SOLUTION-ARCHITECTURE.md`, `DESIGN-*.md`, `REQUIREMENTS-MATRIX.md`, `RISKS-AND-DECISIONS.md`, `DATA-DICTIONARY.md`; `index.md` navigation-only exception), keep AI disclosure blocks where AI modified content, and update Requirements Matrix/Data Dictionary/Risks in the same work slice as schema/API changes.
- Runtime adapter and hook standard: every story that changes `.opencode/`, `.claude/`, `.codex/`, `.agents/`, hooks, plugins, commands, permissions, or runtime config must check [`.opencode/guidelines/HOOKS.md`](../../../.opencode/guidelines/HOOKS.md). `.opencode/` is canonical; `.claude/`, `.codex/`, and `.agents/` are adapters/bridges only.
- Guard validation: documentation/runtime stories must run `bash .github/scripts/docs-allura-canonical-guard.sh` and `bash .github/scripts/runtime-adapter-surface-guard.sh`, or record exact blocker output.
- Allura drift gate: before any story moves to Ready or Done, search Allura Brain with `group_id=allura-system` for `{story topic} blockers decisions outcomes`; compare returned memories against Notion board state, code, schemas, and this BMAD plan. Any contradiction is logged as `critical`, `major`, or `minor` drift and resolved or explicitly deferred.
- Every story must identify: `Epic -> Requirement -> Evidence -> Validation command`.
- Every epic must include implementation evidence, review evidence, validation evidence, and Brain/board traceability.

### Epic 1: Team RAM Execution and Semantic Integrity

**User outcome:** Team RAM can move work through BMAD/Notion/Allura safely while preserving group isolation, append-only traces, semantic versioning, and documented governance.

**Scope:** BMAD story lifecycle, Team RAM routing gates, Notion/Brain traceability, PRD hardening, `group_id` enforcement, append-only trace behavior, and semantic versioning contracts.

**Non-goal:** This epic does not replace Notion as the planning source of truth or allow direct DB/Neo4j mutation outside governed APIs and curator flow.

**Owner:** Brooks for architecture; Woz for implementation; Knuth for data invariants; Pike/Fowler for review.

**FRs covered:** FR1, FR5, FR7, FR8, FR16, FR17, FR18, FR19, FR20, FR23, FR24

**Done condition:** Story lifecycle, route gates, memory contracts, PRD corrections, and semantic integrity checks are documented, validated, and traceable to board/Brain evidence. Stories that touch memory, events, proposals, or graph state must cite the enforcing schema/constraint and runtime validation hook or add an architecture-gated validation story before implementation. Story 1.1 must verify deployment-path enforcement ordering: schema constraint -> index -> API/runtime validation -> targeted test evidence.

### Story 1.1: Verify Group Scope Enforcement Baseline

As a Team RAM builder,
I want a formal schema drift and enforcement-ordering report for governed memory scope,
So that all later memory, proposal, graph, and curator stories build on verified tenant-isolation guarantees instead of assumptions.

**Traceability:** Epic 1 -> FR1, FR5, FR7, FR8, FR16, FR20 -> schema drift report + targeted validation evidence -> split validation: `bun test src/lib/validation/group-id.test.ts src/lib/graph-adapter/neo4j-adapter.test.ts src/agents/memory-wrapper.test.ts src/lib/memory/__tests__/approval-audit.test.ts` and `bun run test -- src/__tests__/health-metrics-scope.test.ts`

**Acceptance Criteria:**

**Given** `docs/allura/DATA-DICTIONARY.md`, JSON schemas, PostgreSQL init SQL, Neo4j init Cypher, and runtime group validation code are the citable baseline,
**When** the story audits memory/events/proposals/graph enforcement,
**Then** it produces a field-by-field compliance matrix comparing DATA-DICTIONARY, SQL DDL, JSON schemas, Neo4j constraints/indexes, and runtime code.
**And** the report includes a drift log with severity values `critical`, `major`, or `minor` for every mismatch found.
**And** the report includes a reconciliation checklist linking each schema element to its enforcement layer: SQL `NOT NULL`/`CHECK`/FK/index, JSON schema, Neo4j constraint/index, and application validation hook.
**And** the report explicitly verifies deployment-path ordering: schema constraint -> index -> API/runtime validation -> targeted test evidence.
**And** any critical drift blocks implementation stories that touch memory, events, proposals, or graph state until resolved or explicitly deferred by Brooks and the data owner.
**And** the split validation commands above run, or any inability to run them is documented as a blocker with exact error output. The split is intentional: Bun-native tests cover the memory/scope units, while `health-metrics-scope.test.ts` uses Vitest `vi.hoisted` and must run through the Vitest script invoked by Bun.

### Story 1.2: Harden Team RAM Source-of-Truth and Routing Contracts

As a Team RAM operator,
I want the Team RAM PRD and BMAD routing contracts hardened against source-of-truth drift,
So that agents know which files, boards, skills, and memory paths are authoritative before executing work.

**Traceability:** Epic 1 -> FR16, FR17, FR18, FR23, FR24 -> updated PRD/routing contract + review evidence -> `git diff --check -- _bmad/bmm/planning/source-docs/PRD-TEAM-RAM-v1.md _bmad/bmm/planning/epics.md`

**Acceptance Criteria:**

**Given** `PRD-TEAM-RAM-v1.md` currently contains draft-level references and known path/source-of-truth drift,
**When** the story hardens Team RAM routing documentation,
**Then** it clearly states `.opencode/agent/` is the live agent source of truth and any `.claude` files are adapter/mirror surfaces.
**And** it states Notion Work Board is the planning/status/approval source of truth, while Allura Brain is governed memory/audit context and not proof of Done.
**And** it replaces or flags stale low-level memory write examples that bypass the governed `allura-brain_memory_*` interface.
**And** it preserves HITL, no autonomous Neo4j promotion, `group_id=allura-system`, append-only traces, and `SUPERSEDES` versioning as non-negotiable routing constraints.
**And** the document includes evidence/acceptance fields for Team RAM deliverables instead of unverified `Complete` claims.
**And** the change is reviewed by Pike/Fowler or a documented gate-equivalent review.
**And** validation runs, or any inability to run validation is recorded with exact blocker output.

### Story 1.3: Create BMAD Sprint Status and Story Lifecycle Gate

As a Team RAM operator,
I want BMAD sprint status and lifecycle gates generated from the approved epic/story plan,
So that work moves through Backlog -> Ready -> In Progress -> Review -> Done with evidence and validation instead of ad hoc progress claims.

**Traceability:** Epic 1 -> FR18, FR19, FR20 -> `sprint-status.yaml` + lifecycle gate documentation -> `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text())"`

**Acceptance Criteria:**

**Given** `_bmad/bmm/planning/epics.md` contains approved epics and stories,
**When** sprint tracking is generated,
**Then** `_bmad/bmm/stories/sprint-status.yaml` exists with entries for each approved epic, story, and retrospective.
**And** each story uses legal BMAD states only: `backlog`, `ready-for-dev`, `in-progress`, `review`, or `done`.
**And** the file states Notion Work Board is canonical and local sprint status is reconciliation support only.
**And** no story may move to `done` unless implementation evidence, review evidence, validation evidence, and board/Brain traceability exist.
**And** every status update includes an Allura drift gate note or link.

### Story 1.4: Add Allura Drift Gate to Story Readiness

As Brooks,
I want every story to run an Allura Brain drift check before Ready and before Done,
So that prior decisions, blockers, and source-of-truth rules catch contradictions before implementation claims are made.

**Traceability:** Epic 1 -> FR18, FR20 -> readiness checklist + drift report template -> `git diff --check -- _bmad/bmm/planning/epics.md`

**Acceptance Criteria:**

**Given** a story is being prepared for Ready,
**When** the readiness gate runs,
**Then** it searches Allura Brain using `group_id=allura-system` for `{story title} blockers decisions outcomes`.
**And** it compares memory results against Notion board state, code, schemas, and this BMAD plan.
**And** any mismatch is classified as `critical`, `major`, or `minor` drift.
**And** `critical` drift blocks work until resolved or explicitly deferred by Brooks and the relevant owner.
**And** Allura Brain is treated as audit/context, not proof of Done.

### Story 1.5: Define Review and Validation Evidence Packets

As a reviewer,
I want every story to declare implementation, review, validation, and board/Brain evidence expectations,
So that Done means evidence-backed completion rather than team optimism.

**Traceability:** Epic 1 -> FR20 -> evidence packet checklist -> `git diff --check -- _bmad/bmm/planning/epics.md`

**Acceptance Criteria:**

**Given** a story is moved to Review,
**When** the reviewer evaluates it,
**Then** the evidence packet includes changed files, validation command output, review notes, Notion/board status, and Allura Brain outcome receipt.
**And** Pike/Fowler or documented gate-equivalent review is required before Done.
**And** validation failures remain blockers, not warnings.
**And** if a required tool or runtime is unavailable, the blocker records exact command/output and proposed recovery.

### Epic 2: Governed Dashboard Foundation

**User outcome:** Operators can open `/dashboard` and immediately understand what is true now, what needs action, and what needs approval without fabricated data.

**Scope:** Build the thin dashboard foundation: shell, route contracts, layout, empty/degraded states, evidence hooks, and Dashboard Visual Spec v2 guardrails.

**Non-goal:** This epic does not implement direct memory mutation, full graph explorer, native Kanban replacement, production ops controls, or `3100` cutover.

**Owner:** Woz with Brooks route approval; Pike/Fowler review.

**FRs covered:** FR10, FR11, FR12, FR13, FR14

**Done condition:** Dashboard routes render honest states, preserve the approved visual contract, expose backing source/degraded behavior, and pass targeted route/UI validation with review evidence attached.

### Story 2.1: Build Thin Dashboard Shell and Route Contract

As an operator,
I want `/dashboard` to render the approved thin mission-control shell,
So that the dashboard has stable layout, route boundaries, and source declarations before feature panels are added.

**Traceability:** Epic 2 -> FR10, FR11, FR12, FR13 -> dashboard shell evidence -> `bun test src/__tests__/dashboard-schemas.test.ts src/lib/dashboard/__tests__/allura-route.test.ts`

**Acceptance Criteria:**

**Given** Dashboard Visual Spec v2 is active,
**When** `/dashboard` renders,
**Then** it uses warm cream background, thin workflow navigation, and search-first center area.
**And** it avoids the old dark sidebar, old logo lockup, generic card-grid hero, and system-status-as-product framing.
**And** every visible panel declares backing source and degraded behavior.
**And** the Allura drift gate confirms no newer design decision supersedes the visual spec.

### Story 2.2: Add Honest System, Hygiene, and Approval Panels

As an operator,
I want dashboard panels for system truth, hygiene/actions, and approvals,
So that I can see what is true, what needs action, and what needs approval without fake healthy states.

**Traceability:** Epic 2 -> FR10, FR11 -> panel validation evidence -> `bun test src/__tests__/dashboard-schemas.test.ts src/__tests__/health-metrics-scope.test.ts`

**Acceptance Criteria:**

**Given** dashboard data is unavailable, partial, or degraded,
**When** panels render,
**Then** they show `unknown`, `degraded`, `empty`, or `failed` states honestly.
**And** no placeholder metrics, fabricated counts, or unlabeled samples appear.
**And** data reads remain scoped by `group_id`.
**And** Allura drift checks compare panel claims against prior no-fabrication lessons.

### Story 2.3: Implement Dashboard Empty and Degraded States

As an operator,
I want clear empty and degraded states across dashboard routes,
So that absence of data is understandable and never disguised as success.

**Traceability:** Epic 2 -> FR11, FR13 -> route smoke evidence -> `bun test src/__tests__/dashboard-schemas.test.ts`

**Acceptance Criteria:**

**Given** memories, approvals, agents, or graph data are empty or unavailable,
**When** `/dashboard`, `/dashboard/memory-space`, `/dashboard/agents`, `/dashboard/insights`, or `/dashboard/builder` render,
**Then** each route shows a friendly state with retry or next-action guidance where appropriate.
**And** graph errors do not crash the page.
**And** all route states remain visually aligned to the v2 spec.

### Story 2.4: Preserve `/allura` Separation and Cutover Boundaries

As Brooks,
I want `/dashboard` and `/allura` route boundaries documented and enforced,
So that dashboard rebuild work does not accidentally replace Mission Control or the protected `3100` target.

**Traceability:** Epic 2 -> FR14, FR15 -> route boundary evidence -> `git diff --check -- docs/allura/DESIGN-ALLURA.md _bmad/bmm/planning/epics.md`

**Acceptance Criteria:**

**Given** `/allura` remains a separate Mission Control surface,
**When** dashboard work changes routes or navigation,
**Then** `/allura` remains unchanged unless a story explicitly owns that surface.
**And** `3100` replacement remains blocked until Epic 5 cutover evidence passes.
**And** Allura Brain drift checks catch any prior decision about route targets or cutover that conflicts with the change.

### Epic 3: Memory Provenance and Review

**User outcome:** Operators can search, inspect, copy/export, and verify memories with provenance, confidence, tenant scope, and evidence without performing approval mutations.

**Scope:** Read-side memory/provenance surfaces, detail inspection, evidence chains, export/copy provenance, and graph-safe inspection states.

**Non-goal:** This epic does not approve, reject, promote, deprecate, or otherwise mutate canonical knowledge.

**Owner:** Woz with Knuth data-contract review and Pike interface review.

**FRs covered:** FR2, FR3, FR4, FR25

**Done condition:** Memory inspection and provenance flows are read-only, scoped by `group_id`, preserve source/actor/timestamp/status/confidence/evidence fields, and pass targeted data/UI validation.

### Story 3.1: Provide Scoped Memory Search and Listing

As an operator,
I want to search and list governed memories within the active tenant scope,
So that I can inspect what the Brain knows without leaking cross-tenant data.

**Traceability:** Epic 3 -> FR2, FR4 -> scoped search/list evidence -> `bun test src/agents/memory-wrapper.test.ts src/__tests__/health-metrics-scope.test.ts`

**Acceptance Criteria:**

**Given** an active `group_id`,
**When** memory search or list runs,
**Then** queries validate and carry `group_id` through the controlled retrieval layer.
**And** results distinguish episodic traces from approved semantic knowledge.
**And** invalid or missing `group_id` is rejected before storage queries.
**And** Allura drift checks compare behavior against prior group-scope memories.

### Story 3.2: Show Memory Detail and Evidence Chain

As an operator,
I want a memory detail view with provenance and evidence chain,
So that I can understand why a memory exists and whether it is approved, pending, or deprecated.

**Traceability:** Epic 3 -> FR3 -> detail evidence -> `bun test src/lib/memory/api-schemas.test.ts src/agents/memory-wrapper.test.ts`

**Acceptance Criteria:**

**Given** a memory ID is selected,
**When** the detail view loads,
**Then** it shows content, source, actor/user, timestamp, status, confidence/score, `group_id`, source event/proposal references when present, and deprecated/version state.
**And** missing evidence is shown as unavailable, not invented.
**And** no approval or mutation action is exposed in this read-only story.

### Story 3.3: Preserve Provenance on Copy and Export

As an operator,
I want copy/export actions to include provenance metadata,
So that external review preserves source, actor, timestamp, tenant, status, confidence, and evidence/hash fields.

**Traceability:** Epic 3 -> FR25 -> export evidence -> `bun test src/lib/audit/__tests__/*.test.ts || bun test src/lib/audit/export.test.ts`

**Acceptance Criteria:**

**Given** a memory, audit, or evidence record is copied or exported,
**When** the export is produced,
**Then** it includes source, actor/creator/approver, timestamp, `group_id`, status, confidence/score, evidence IDs, and hash/previous-hash fields when present.
**And** export failures are explicit degraded states.
**And** copy/export remains read-only and does not mutate PostgreSQL or Neo4j.

### Story 3.4: Validate Provenance Drift Against Schema Baseline

As Knuth,
I want provenance fields checked against the Data Dictionary and runtime schemas,
So that UI provenance does not drift from stored evidence semantics.

**Traceability:** Epic 3 -> FR3, FR25 -> provenance drift report -> `bun test src/lib/memory/api-schemas.test.ts src/__tests__/dashboard-schemas.test.ts`

**Acceptance Criteria:**

**Given** provenance fields are displayed or exported,
**When** the drift check runs,
**Then** displayed field names map to DATA-DICTIONARY entries or explicitly documented derived labels.
**And** any missing required provenance field is logged as `critical` or `major` drift.
**And** Allura Brain memory is used to catch prior decisions about provenance/copy/export behavior.

### Epic 4: Curator Workflow and Promotion Gates

**User outcome:** Curators can safely review proposals, request evidence, approve, or reject with audit receipts and no bypass around HITL/policy gates.

**Scope:** Write-side curator proposal workflow, approval/rejection/request-changes actions, confirmation UX, state-machine rules, and audit receipt visibility.

**Non-goal:** This epic does not introduce autonomous Neo4j promotion, direct memory editing, or unreviewed semantic activation.

**Owner:** Woz with Knuth schema/invariant review and Pike interface review.

**FRs covered:** FR6, FR9

**Done condition:** Curator transitions are explicit, audited, role-safe, HITL-compliant, and validated by approval/audit tests plus review evidence.

### Story 4.1: Render Curator Proposal Queue Safely

As a curator,
I want a scoped proposal queue with evidence and status,
So that I can review pending proposals without accidentally promoting or rejecting them.

**Traceability:** Epic 4 -> FR6, FR9 -> queue evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts`

**Acceptance Criteria:**

**Given** canonical proposals exist for a `group_id`,
**When** the queue renders,
**Then** it shows proposal ID, content preview, score, reasoning, tier, status, trace reference, and created timestamp.
**And** queries are scoped by validated `group_id`.
**And** no promotion occurs by merely viewing the queue.
**And** Allura drift checks verify no autonomous promotion path has been reintroduced.

### Story 4.2: Implement HITL Approval and Rejection Actions

As a curator,
I want explicit approve and reject actions with rationale and audit receipts,
So that promotion decisions are human-gated and traceable.

**Traceability:** Epic 4 -> FR6, FR9 -> approval audit evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts`

**Acceptance Criteria:**

**Given** a pending proposal,
**When** a curator approves or rejects it,
**Then** the transition is explicit, scoped by `group_id`, and records actor, timestamp, rationale, proposal ID, and resulting status.
**And** approval may queue or perform governed promotion only through the curator flow.
**And** rejection never deletes source evidence.
**And** autonomous Neo4j promotion remains blocked.

### Story 4.3: Add Request Evidence / Request Changes Flow

As a curator,
I want to request evidence instead of only approving or rejecting,
So that uncertain proposals can remain auditable without being prematurely rejected.

**Traceability:** Epic 4 -> FR9 -> request-evidence audit evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts`

**Acceptance Criteria:**

**Given** a proposal lacks sufficient evidence,
**When** the curator requests evidence or changes,
**Then** the action records rationale and leaves the proposal out of active semantic knowledge.
**And** the UI label maps to documented backend behavior without inventing an unsupported state.
**And** Allura drift checks compare this behavior against the latest curator contract.

### Story 4.4: Show Curator Decision Receipts

As an auditor,
I want curator decisions to show inspectable receipts,
So that every promotion decision can be traced from proposal to actor to resulting memory state.

**Traceability:** Epic 4 -> FR9 -> decision receipt evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/dashboard-schemas.test.ts`

**Acceptance Criteria:**

**Given** a proposal has been approved, rejected, or returned for evidence,
**When** the decision receipt is viewed,
**Then** it shows actor, timestamp, rationale, prior status, new status, trace reference, and any promoted memory reference.
**And** missing receipts are shown as blockers or degraded states, never hidden.
**And** receipt data maps back to append-only events or proposal records.

### Epic 5: Runtime Reliability, Cutover, and Final Evidence

**User outcome:** The project can be finished with stable runtime behavior, clear rollback, validated cutover gates, no open blockers, and a final evidence packet.

**Scope:** Host/container reliability, deployment/runtime checks, final sprint status, regression validation, `3100` cutover readiness, rollback plan, freeze criteria, and final retrospective.

**Non-goal:** This epic does not add new product scope after feature freeze; unresolved enhancements become explicit deferrals.

**Owner:** Hightower for runtime/deployability; Bellard for diagnostics; Brooks for release decision; Woz for final fixes.

**FRs covered:** FR15, FR21, FR22

**Done condition:** All prior epics are approved or explicitly deferred, runtime checks pass or have accepted waivers, rollback is documented, final evidence is attached, and Brooks/Captain approve closeout.

### Story 5.1: Verify Runtime Health and Recovery Baseline

As Hightower,
I want runtime health and recovery checks documented and executable,
So that project closeout does not depend on an unstable host or container stack.

**Traceability:** Epic 5 -> FR15, FR21, FR22 -> runtime health evidence -> `bun test src/__tests__/health-metrics.test.ts src/__tests__/health-metrics-scope.test.ts`

**Acceptance Criteria:**

**Given** the system runs through Docker/MCP/runtime paths,
**When** health checks execute,
**Then** they report store availability, degraded state, scoped metrics, and recovery guidance.
**And** failures include exact command/output evidence.
**And** Allura drift checks compare runtime claims against recent blockers and waivers.

### Story 5.2: Package Final Regression and Sprint Evidence

As Brooks,
I want a final regression and sprint evidence packet,
So that project completion can be reviewed without relying on memory or optimism.

**Traceability:** Epic 5 -> FR21, FR22 -> evidence packet -> `bun run typecheck && bun test`

**Acceptance Criteria:**

**Given** all prior epics are done or explicitly deferred,
**When** final regression runs,
**Then** the evidence packet lists validation commands, pass/fail output, reviewed blockers, deferrals, and Notion board reconciliation.
**And** Allura Brain receipts are included as audit context only.
**And** any failing validation blocks closeout unless waived by Brooks and Captain.

### Story 5.3: Document `3100` Cutover and Rollback Gate

As an operator,
I want cutover and rollback criteria documented before replacing `3100`,
So that dashboard deployment is reversible and evidence-backed.

**Traceability:** Epic 5 -> FR15 -> cutover/rollback packet -> `git diff --check -- docs/allura/DESIGN-ALLURA.md docs/design/DASHBOARD-VISUAL-SPEC-v2.md _bmad/bmm/planning/epics.md`

**Acceptance Criteria:**

**Given** dashboard work is ready for release,
**When** cutover is evaluated,
**Then** route parity, visual parity, source-of-truth declarations, auth validation, smoke tests, no-fabricated-data checks, and rollback steps are all present.
**And** `3100` remains protected until the cutover packet is approved.
**And** Allura drift checks catch older route-target or waiver memories that conflict with current release intent.

### Story 5.4: Complete Final Team RAM Retrospective and Closeout Decision

As Captain and Brooks,
I want a final Team RAM retrospective and explicit closeout decision,
So that the project ends with lessons, deferrals, approvals, and next-product boundaries recorded.

**Traceability:** Epic 5 -> FR21, FR22 -> retrospective + closeout decision -> `git diff --check -- _bmad/bmm/planning/epics.md`

**Acceptance Criteria:**

**Given** all epics are complete, waived, or deferred,
**When** the retrospective runs,
**Then** it records what shipped, what was deferred, validation evidence, unresolved risks, lessons learned, and owner approvals.
**And** Allura Brain receives a final outcome memory with `group_id=allura-system`.
**And** no new product scope is opened during closeout.
