---
stepsCompleted: [document-discovery, prd-analysis, epic-coverage-validation, ux-alignment, epic-quality-review, final-assessment]
filesIncluded:
  prd: docs/allura/BLUEPRINT.md
  architecture:
    - docs/allura/SOLUTION-ARCHITECTURE.md
    - docs/allura/DESIGN-ALLURA.md
    - docs/allura/REQUIREMENTS-MATRIX.md
    - docs/allura/RISKS-AND-DECISIONS.md
    - docs/allura/DATA-DICTIONARY.md
  epics:
    - _bmad/bmm/planning/epics.md
    - _bmad/bmm/planning/epic-24-portfolio-readiness.md
    - _bmad/bmm/planning/epic-26-bumblebee-supply-chain-threat-intelligence.md
    - _bmad/bmm/planning/epic-27-enterprise-documentation-consolidation.md
  stories: _bmad/bmm/stories/*.md (64 files)
  ux: none
---

# Implementation Readiness Assessment Report

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Date:** 2026-08-28
**Project:** allura-memory

## Step 1: Document Discovery

**Configured search location** (`_bmad-output/planning-artifacts/*`, per skill defaults): empty. This project does not use that ephemeral, gitignored path for its planning documents.

**Resolution (confirmed by user):** assessment proceeds against this project's actual tracked planning surfaces.

### PRD

**Whole Documents:**
- `docs/allura/BLUEPRINT.md` — used as this project's PRD-equivalent per `guidelines/AI-GUIDELINES.md` (Business/Functional Requirements live here, labeled B#/F#).

No sharded version exists. No duplicates.

### Architecture

**Whole Documents (canonical six, minus BLUEPRINT which is counted as PRD above):**
- `docs/allura/SOLUTION-ARCHITECTURE.md`
- `docs/allura/DESIGN-ALLURA.md`
- `docs/allura/REQUIREMENTS-MATRIX.md`
- `docs/allura/RISKS-AND-DECISIONS.md`
- `docs/allura/DATA-DICTIONARY.md`

No sharded versions exist. No duplicates.

### Epics & Stories

**Whole Documents:**
- `_bmad/bmm/planning/epics.md` — index/log (Epics 18–24 inline, Epic 24 marked current active)
- `_bmad/bmm/planning/epic-24-portfolio-readiness.md` — standalone, linked from epics.md
- `_bmad/bmm/planning/epic-26-bumblebee-supply-chain-threat-intelligence.md` — standalone, not linked from epics.md (Notion-canonical, repo file is a mirror)
- `_bmad/bmm/planning/epic-27-enterprise-documentation-consolidation.md` — standalone, not linked from epics.md (created this session)

**Stories:** `_bmad/bmm/stories/*.md` — 64 files.

No sharded duplicates. Note: three epics (24, 26, 27) are simultaneously "current" by different signals — `epics.md` names only Epic 24 as "Current Active Epic," while 26 and 27 are active/in-flight per their own status fields but never indexed centrally. This is not a blocking duplicate, but an indexing gap worth resolving in a later step.

### UX Design

**Not found.** Only `docs/archive/bmad-legacy/bmm/planning/epic-11-ux-polish.md` exists, explicitly archived/legacy. No active, unique UX specification for the current product.

⚠️ **Accepted gap (per user confirmation):** proceeding without a UX document. This will be noted in the final readiness verdict rather than blocking the assessment.

### Issues Log

| Issue | Severity | Status |
|---|---|---|
| Configured `planning_artifacts` path unused by this project | Critical (process, not content) | Resolved — assessment redirected to `docs/allura/` + `_bmad/bmm/planning/` |
| No active UX specification | Warning | Accepted gap, carried forward |
| Epics 24/26/27 not centrally indexed in `epics.md` | Info | Carried forward, non-blocking |

**Files included in this assessment:** see `filesIncluded` in frontmatter above.

## PRD Analysis

Source: `docs/allura/BLUEPRINT.md` (read in full — 1041 lines). This document uses "Business Requirements" (B#) and "Functional Requirements" (F#) rather than the generic "FR/NFR" split; there is no separately labeled NFR section, so non-functional requirements below are synthesized from §6 Execution Rules, §7 Global Constraints, §9 Logging & Audit, and NFR-flavored Business Requirements, with sourcing noted per item.

### Business Requirements (treated as top-level product requirements)

B1: Developers integrate Allura with a 5-tool API matching mem0's UX
B2: All memory is isolated by tenant (`group_id`) at the schema level
B3: Every write produces an immutable audit record in PostgreSQL
B4: Promoted knowledge is versioned and never mutated in Neo4j
B5: The system is deployable via a single `docker compose up` command for core infra and app services
B6: Agents connect via MCP (Model Context Protocol) through Team RAM-selected packaged MCP servers
B7: Operators choose between human-gated (SOC2) and auto-promotion modes
B8: Consumer memory viewer: no sidebar, search dominant, swipe to forget
B9: Every memory shows provenance: "from conversation" or "added manually"
B10: Memory usage indicator: "used N times this week" on expand
B11: Undo: recently forgotten memories recoverable within 30 days
B12: Enterprise admin view: tenant overview, SOC2 pending queue, audit log via API
B13: Audit log exportable as CSV for compliance
B14: TypeScript SDK (`@allura/sdk`)
B15: BYOK encryption
B16: Curator CLI: three-state approval workflow (Traces, Approved, Pending)
B17: Curator sees confidence scores (60-100%) with one-sentence reasoning for uncertain proposals
B18: Approve/reject decisions logged to audit trail with curator ID and timestamp
B19: Auto-promote proposals >85% confidence without curator review (configurable)
B20: MCP HTTP gateway deployable via Docker; backend engine in user's VPC/cloud
B21: Authentication via API keys and RBAC (curator, admin, viewer roles)
B22: Error tracking via Sentry; alerts on engine failures
B23: Agents must persist all task activity as append-only raw traces for auditability
B24: A curator process must turn raw traces into proposed insights without promoting them directly
B25: No insight may become active knowledge until approved by a human or policy-controlled flow
B26: Approved insights must be stored in Neo4j as immutable, versioned knowledge records
B27: Agents must retrieve approved knowledge through a controlled retrieval layer
B28: All reads/writes must pass through controlled APIs with project-level access and audit
B29: The full loop from agent execution to knowledge reuse must be demonstrably end-to-end
B30: Team RAM agents must integrate with BMAD planning and Allura Brain memory through a documented workflow, preserving `.opencode/agent/` as the live agent source of truth
B31: Teams must be able to define evidence-gated orchestration runs that map familiar work ceremonies to governed Allura receipts without exposing internal agent-routing details
B32: Supply-chain threat intelligence must preserve source provenance, tenant/workspace scope, evidence freshness, and human authority while remaining read-only toward inventoried endpoints and external enforcement systems

**Total Business Requirements: 32 (B1–B32)**

### Functional Requirements Extracted

**Memory Operations**
F1: `memory_add(content, userId, metadata?)` — writes to Postgres; conditionally promotes to Neo4j
F2: `memory_search(query, userId, limit?)` — federated search across Postgres + Neo4j, merged by relevance
F3: `memory_get(memoryId)` — returns a single memory record by ID
F4: `memory_list(userId)` — returns all memories for a user within the tenant
F5: `memory_delete(memoryId)` — soft-delete: appends a deletion event to Postgres, marks Neo4j node deprecated

**Governance**
F6: `PROMOTION_MODE=soc2` — score ≥ threshold queues for human approval; no autonomous Neo4j write
F7: `PROMOTION_MODE=auto` — score ≥ `AUTO_APPROVAL_THRESHOLD` promotes immediately to Neo4j
F8: `group_id` CHECK constraint blocks writes with invalid tenant namespaces
F9: `SUPERSEDES` relationship created on every Neo4j node update

**Curator Dashboard**
F10: `POST /api/curator/score` — scores proposal, returns {confidence, reasoning, tier}
F11: `POST /api/curator/approve` — moves proposal to approved knowledge, promotes to Neo4j if tier ≥ 85%
F12: `POST /api/curator/reject` — archives proposal to 7-day undo, logs to audit trail
F13: `GET /api/curator/proposals` — returns pending proposals (emerging + adoption tiers only)
F14: Curator dashboard shows three tabs: Traces (raw), Approved (knowledge), Pending (decisions)
F15: Pending tab sorts by confidence (descending); shows confidence badge + reasoning + buttons
F16: Approved tab shows all approved knowledge (human + auto-promoted); sortable by date/confidence
F17: Tab 1 restricted to authenticated users with `admin` role (engineers only)
F18: Audit log endpoint: `GET /api/audit/events` — returns curator decisions with timestamps
F19: Dashboard integrates Clerk for authentication and RBAC (curator, admin, viewer roles)

**Infrastructure**
F20: Skills route agent work to packaged MCP servers (`neo4j-memory`, `database-server`, optional `neo4j-cypher`) rather than a custom all-in-one MCP runtime
F21: `docker compose up` starts core infra and app services; packaged MCP servers are attached as focused external capabilities
F22: Memory viewer UI at `/memory` lists, searches, and deletes memories
F23: Curator dashboard deployed on Vercel; calls backend engine via `CURATOR_ENGINE_URL` env var
F24: Vercel Functions (`/api/curator/*`) call Docker engine in VPC/cloud via HTTPS
F25: Error tracking: unhandled exceptions sent to Sentry; curator notified via email/Slack

**Governed Memory Pipeline**
F26: Agent task lifecycle events, tool calls, outputs, retries, and terminal status are persisted as append-only traces
F27: Raw trace storage is append-only; no UPDATE or DELETE on the `events` table
F28: Raw traces preserve provenance linking downstream insights back to source evidence
F29: Curator reads raw traces and generates proposed insights (not active insights)
F30: Each proposed insight includes summary, evidence links, confidence score, timestamp, and status
F31: Proposed insights enter an approval flow before becoming active knowledge
F32: Every approval, rejection, or policy decision is recorded as an audit event with actor and timestamp
F33: Approved insights are written to Neo4j as immutable nodes; no in-place updates
F34: Changed insights create new nodes linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED` relationships
F35: Agents retrieve knowledge through a controlled retrieval service, not by querying databases directly
F36: Retrieval supports semantic and structured queries with project and global scope
F37: All knowledge-system reads/writes pass through controlled endpoints enforcing project-level access
F38: Agent permissions enforced and all access to trace/knowledge resources is audited
F39: A second agent can retrieve approved knowledge and use it correctly in a later task
F40: The full lifecycle from trace capture to knowledge reuse is traceable, auditable, and reversible
F56: Bumblebee V1 may ingest allowlisted advisory evidence, correlate verified exposure, create deduplicated alerts, and prepare simulated mitigation proposals; it must not activate policy, block CI/packages, change schedules, or perform containment

**Memory Command Center**
F41: Memory Command Center exposes `/dashboard` (new chat), `/dashboard/search` (memory search), `/dashboard/scheduled-tasks` (dreams), `/dashboard/governance` (policy gates), `/dashboard/kanban` (work board), `/dashboard/graph` (knowledge graph), `/dashboard/mission-control` (ops console), and `/dashboard/settings` as the governed operator surface
F42: `/dashboard/memories` preserves useful reference memory capabilities: memory search/list, insights, trace logs, provenance, extracted facts, and approval queue
F43: `/work-board` uses Native Allura Kanban as the default planning source of truth; Notion, Linear, and GitHub Projects are optional sync adapters
F44: `/resources` reads skills, agents, MCP servers, containers, cron jobs, and drift warnings from a declared Resource Manifest or generated manifest endpoint
F45: `/agents` distinguishes TALON/IRIS native subagents from Team RAM/Durham CLI harness agents and external runtime agents
F46: `/telemetry` surfaces model, prompt, tool, retry, rate-limit, failure, and degraded-state metrics without inventing missing measurements
F47: Every Memory Command Center route displays its source-of-truth declaration and degraded-state behavior
F48: Dashboard launch requires documented route parity, visual parity, source-of-truth parity, smoke tests, auth validation, and rollback plan
F49: Governed runs capture a neutral tenant-scoped `RunRecord` and pin a process definition ID and immutable revision
F50: Run policy declares allowed actions, approval breakpoints, measured quality gates, bounded attempts, and evidence required before Done
F51: Run journals persist append-only execution evidence and continue from the first incomplete eligible step after approval without repeating completed side effects
F52: Run doctor checks report stale, failed, incomplete, definition-drifted, unrecoverable, or approval-blocked runs before Done
F53: Native projects and work items use PostgreSQL as operational state, link to runs, handoffs, evidence packets, and memory receipts, and move through audited transitions
F54: The operator workspace provides mission-first navigation, Command Center behavior, a central work surface, and a right evidence/context inspector
F55: Allura ships one governed desktop shell with secure connections, runtime supervision, updates, deep links, offline/read-only behavior, and reconnect recovery

**Total FRs: 56 (F1–F56, numbered F1–F55 plus F56; no duplicates, no gaps)**

### Non-Functional Requirements Extracted

*Synthesized from §6 Execution Rules, §7 Global Constraints, §9 Logging & Audit, and NFR-flavored Business Requirements — this document has no separately labeled NFR section.*

NFR1 (Security/Tenant isolation): `group_id` MUST match `^allura-`, enforced by PostgreSQL CHECK constraint; failure is a schema error, not an application error. (§7; B2)
NFR2 (Data integrity/Reliability): Postgres `events` rows are append-only — no UPDATE or DELETE under any circumstance. (§7, §6 Failure Semantics; B3)
NFR3 (Data integrity): Neo4j nodes are immutable — updates create a new node with a `SUPERSEDES` edge to the prior node, never edited in place. (§7; B4)
NFR4 (Reliability/Resource protection): Circuit breaker trips at budget threshold at the infrastructure layer, cutting off agent runaway before application-layer failure. (§7)
NFR5 (Reliability/Failure semantics): Postgres write failure is terminal (500, nothing promoted); Neo4j write failure is non-fatal and logged as `promotion_failed`, returning an episodic-only result; score computation failure defaults to score 0, Postgres-only write. (§6)
NFR6 (Security/Secrets handling): Passwords, API keys, and raw credentials must never appear in the `metadata` JSONB field of any event. (§9)
NFR7 (Security/Encryption): BYOK (bring-your-own-key) encryption. (B15)
NFR8 (Security/AuthZ): Authentication via API keys and RBAC with curator/admin/viewer role separation. (B21)
NFR9 (Reliability/Observability): Error tracking via Sentry with alerting on engine failures. (B22)
NFR10 (Compliance/Auditability): Audit log must be exportable as CSV for compliance review. (B13)
NFR11 (Reliability/Data retention): Soft-deleted ("forgotten") memories must remain recoverable within a 30-day undo window. (B11)
NFR12 (Operability/Deployability): The system must be deployable via a single `docker compose up` command for core infra and app services. (B5)
NFR13 (Compliance/Immutability): Every write must produce an immutable audit record; approved knowledge must be versioned and never mutated. (B3, B4 — restated as NFRs since they are system-wide invariants, not one-off features)

**Total NFRs: 13 (synthesized; not natively numbered in source)**

### Additional Requirements / Constraints Found

- **Port allocation constraint (AD-45):** the 3000–3999 port band is banned repo-wide; new services allocate by tier (UI 4000+, API 6000+, tools/workers 7000+), infra ports exempt. Governed by a PR that updates both the Blueprint port table and `docker-compose.yml`.
- **Documentation Authority & Sync Contract (§12):** Notion is upstream for policy/templates; `docs/allura/` is downstream implementation canon; agents must not auto-write repo content back to Notion template pages; a preflight gate requires checking the authority map before any doc write, and no net-new file may land in `docs/allura/` without updating the authority map and receiving explicit human approval. **This directly governs Epic 27's scope** (see `_bmad/bmm/planning/epic-27-enterprise-documentation-consolidation.md`).
- **Canonical-now alignment constraint (§12):** PostgreSQL is the append-only episodic store; Neo4j is stated here as still canonical semantic graph, with RuVector-derived capabilities as selective augmentation only, pending formal migration benchmark approval.
- **⚠️ Internal contradiction found:** the Blueprint's opening paragraph (line 9) states "*unified PostgreSQL architecture (pgvector for both episodic traces and semantic knowledge — Neo4j sunset 2026-07, see AD-50)*" — i.e., Neo4j is already sunset. But §2 "Graph Adapter Posture," §3 Architecture components table, §5 Data Model, and §12 Authority Invariants all still describe Neo4j 5.26 as an active, canonical semantic store with `SUPERSEDES` versioning, and the `.claude/rules/semantic-graph-best-practices.md` project rule likewise still governs Neo4j access. This is a direct content contradiction within the PRD itself — the top-line summary and the detailed body disagree on whether Neo4j is retired. This must be resolved before requirements coverage against Epics can be trusted, since several F# (F1, F2, F5, F9, F33, F34, F35) and B# (B4, B26) requirements are written against a Neo4j-based architecture that the doc's own opening line says is already gone.
- **Non-goals (§2):** explicitly out of scope — ungated direct database editing, fabricated live metrics, decorative dashboard charts without source evidence, bulk approval without rationale, generated logo marks, any dashboard action bypassing MCP/API governance.

### PRD Completeness Assessment

The Blueprint is structurally complete — it has Business Requirements, Functional Requirements, Architecture, Data Model, Execution Rules, Global Constraints, API Surface, Logging/Audit, an Event-Driven Architecture section, and a Documentation Authority contract. Numbering is internally consistent (no duplicate B# or F# IDs found).

However, it carries a **live, unresolved architectural contradiction** (PostgreSQL-only per the opening line and AD-50, vs. Neo4j-as-canonical throughout the rest of the document and in a project rule file) that materially affects requirements coverage validation in the next step, since roughly a dozen requirements are written against the Neo4j-based architecture. This is flagged for the Epic Coverage Validation step rather than resolved here, per this step's scope (extraction only, no validation).

## Epic Coverage Validation

This project does not track FR coverage inside its epic files (`_bmad/bmm/planning/epic-*.md` contain Goal/Stories/Exit-gate only, no F# references — confirmed by full-text scan of `epic-24-portfolio-readiness.md` and `epics.md`). The actual FR→implementation/epic traceability document is `docs/allura/REQUIREMENTS-MATRIX.md`, per this project's own documentation convention (`guidelines/AI-GUIDELINES.md` names it the "coverage map" for exactly this purpose). It was loaded and read in full (502 lines) and used as the coverage source below, cross-checked against the epic files and canonical docs for every epic it cites.

### Epic FR Coverage Extracted

- F1–F16, F17–F19, F20–F25, F26–F40: each has an explicit "Satisfied by" entry citing source code/schema (Sections 2–5 of the matrix) — these are already implemented, not epic-tracked.
- F41, F42: appear only inside a B30 mapping row; no dedicated "Satisfied by" detail entry anywhere in the matrix.
- F43–F48: **zero occurrences** anywhere in `REQUIREMENTS-MATRIX.md` — confirmed by a per-ID grep across the full file.
- F49–F52: Section 5A, status "Partial" or "Not implemented," pointing to **Epic 14** / **Epic 14.3** / **Story 12.2 correction**.
- F53–F55: Section 5B, status "Planned," pointing to **Epic 15**, **Epic 16**, **Epic 17** respectively.
- F56 (BLUEPRINT numbering, Bumblebee V1): the matrix's own F56 (Section 4) is a **different requirement** — "Git-safety guardrail (GIT-EXEC-001)." The Bumblebee content is separately tracked as REQ-BMB-001–007 (Section 6F), one of which (REQ-BMB-005) also cites "F56" — so the ID `F56` is claimed by two unrelated requirements inside the matrix itself.

**Epic file cross-check:**
- Epics 14, 15, 16, 17 (cited for F49–F55): **no file exists** for any of them in `_bmad/bmm/planning/`, and none appear in `epics.md`'s inline Epic 18–24 log or its "Current Active Epic" pointer. They are cited by number only, in `REQUIREMENTS-MATRIX.md` and `DESIGN-ALLURA.md`.
- Epic 12 (cited for F51's "Story 12.2 correction"): exists, but only as an **archived** file — `docs/archive/bmad-legacy/bmm/planning/epic-12-process-engine-sdk.md` plus a retrospective. It is retired, not an active plan.

### FR Coverage Analysis

| FR Number | PRD Requirement (paraphrased) | Epic/Implementation Coverage | Status |
|---|---|---|---|
| F1–F5 | Memory Operations (add/search/get/list/delete) | `src/mcp/canonical-tools.ts` et al., cited in Matrix §2 | ✓ Covered (implemented) |
| F6–F9 | Governance (promotion modes, group_id CHECK, SUPERSEDES) | Cited in Matrix §2 | ✓ Covered (implemented) |
| F10–F19 | Curator Dashboard (score/approve/reject/proposals/tabs/RBAC/audit) | Cited in Matrix §2–3 | ✓ Covered (implemented) |
| F20–F25 | Infrastructure (MCP routing, docker compose, viewer, Vercel, Sentry) | Cited in Matrix §4 | ✓ Covered (implemented) |
| F26–F40 | Governed Memory Pipeline (traces → curation → approval → Neo4j → retrieval → E2E) | Cited in Matrix §5 | ✓ Covered (implemented) |
| F41 | Memory Command Center route map | Only inside B30 row, no detail entry | ⚠️ Weak — no dedicated coverage entry |
| F42 | `/dashboard/memories` capabilities | Only inside B30 row, no detail entry | ⚠️ Weak — no dedicated coverage entry |
| F43 | `/work-board` Native Kanban + sync adapters | **NOT FOUND** | ❌ MISSING |
| F44 | `/resources` Resource Manifest reader | **NOT FOUND** | ❌ MISSING |
| F45 | `/agents` subagent-type distinction | **NOT FOUND** | ❌ MISSING |
| F46 | `/telemetry` metrics surface | **NOT FOUND** | ❌ MISSING |
| F47 | Per-route source-of-truth/degraded-state declaration | **NOT FOUND** | ❌ MISSING |
| F48 | Dashboard launch parity/smoke/auth/rollback gate | **NOT FOUND** | ❌ MISSING |
| F49 | Governed `RunRecord` capture | Matrix §5A: Partial (`src/lib/process-engine/`, AD-35) | ⚠️ Partial, no active epic |
| F50 | Run policy (actions/breakpoints/gates/attempts/evidence) | Matrix §5A: Partial — **Epic 14 (does not exist)** | ❌ Epic missing |
| F51 | Run journal continuation without repeating side effects | Matrix §5A: Partial — **Story 12.2 correction (Epic 12 is archived)** | ❌ Epic archived/retired |
| F52 | Doctor checks before Done | Matrix §5A: Not implemented — **Epic 14.3 (does not exist)** | ❌ Epic missing |
| F53 | PostgreSQL-backed projects/work items | Matrix §5B: Planned — **Epic 15 (does not exist)** | ❌ Epic missing |
| F54 | Mission-first operator workspace | Matrix §5B: Planned — **Epic 16 (does not exist)** | ❌ Epic missing |
| F55 | Governed desktop shell | Matrix §5B: Planned — **Epic 17 (does not exist)** | ❌ Epic missing |
| F56 (Bumblebee) | Bumblebee V1 alert+proposal authority | Epic 26 (`epic-26-bumblebee-supply-chain-threat-intelligence.md`, full story map 26.1–26.7) — but **ID collides** with the matrix's own F56 | ⚠️ Covered by Epic 26, but under a colliding ID |

### Missing FR Coverage

#### Critical Missing FRs

**F43–F48 — six Memory Command Center requirements with zero traceability.**
- Impact: `/work-board`, `/resources`, `/agents`, `/telemetry` route requirements, the per-route source-of-truth contract, and the dashboard launch gate itself have no cited implementation, test, or epic anywhere in the canonical docs. If these routes exist in `src/app/dashboard/`, the matrix simply never recorded it — traceability, not necessarily functionality, is missing. If they don't exist, six B30-adjacent product requirements are simply unbuilt and unplanned.
- Recommendation: either add "Satisfied by" entries pointing at existing code (fast, if the routes already exist), or open a tracked epic for the remaining Memory Command Center surface — there currently is none.

**F50, F52, F53, F54, F55 — five requirements assigned to epics that don't exist as tracked artifacts (Epic 14, 14.3, 15, 16, 17).**
- Impact: these aren't just "not started" — they're requirements pointing at a plan that was never written down anywhere this session could find. Anyone reading the Requirements Matrix would reasonably believe "Epic 15" is a real, findable planning document. It isn't.
- Recommendation: either write the four missing epic files (matching the `epic-24`/`epic-26`/`epic-27` pattern already established) or update the matrix to say "Planned, not yet scoped" instead of citing a nonexistent epic number — the current phrasing overstates planning maturity.

**F51 — remaining work assigned to an archived epic.**
- Impact: "Story 12.2 correction" points at Epic 12, which is in `docs/archive/bmad-legacy/` — retired. There is currently no active plan to finish F51.
- Recommendation: either re-open the relevant story under an active epic, or explicitly mark F51 as deferred/deprioritized rather than implying archived work will resume.

**F56 ID collision.**
- Impact: `docs/allura/REQUIREMENTS-MATRIX.md` uses the identifier `F56` for two unrelated requirements — the Git-safety guardrail (GIT-EXEC-001, Section 4) and, via REQ-BMB-005's trace column, the Bumblebee V1 authority requirement that BLUEPRINT.md itself labels F56. AI-GUIDELINES.md's own rule states field/requirement identifiers must exactly match across documents — this violates that rule inside a single document.
- Recommendation: renumber one of the two (the Bumblebee requirement is the newer addition per Epic 26 and is the better candidate to renumber, e.g., to F57) and update both BLUEPRINT.md and REQUIREMENTS-MATRIX.md in the same change.

### High Priority Missing FRs

- F41, F42: present only as a citation inside a Business Requirement row (B30), never given their own "Satisfied by" detail row in Section 2–5B like every other F# has. Low risk (likely just an oversight in an otherwise-complete matrix) but breaks the matrix's own stated rule that "every F# ID must appear in exactly one design document section."

### Coverage Statistics

- Total PRD FRs: 56 (F1–F56)
- FRs with explicit, unambiguous coverage: 41 (F1–F40, plus F56-as-Bumblebee-via-Epic-26 counted once despite the ID collision)
- FRs with partial/weak coverage (cited but incomplete, or cited without a detail row): 3 (F41, F42, F49)
- FRs with no coverage or coverage pointing at a nonexistent/archived epic: 12 (F43, F44, F45, F46, F47, F48, F50, F51, F52, F53, F54, F55)
- **FRs requiring action before this project can claim complete coverage: 15** (the 3 partial + the 12 missing/defunct-epic), plus the F56 ID collision as a 16th, separate defect (a data-integrity problem inside the matrix itself, not a coverage gap).
- Coverage percentage (fully and unambiguously covered / total): **73%** (41/56)

## UX Alignment Assessment

### UX Document Status

**Not Found** as a dedicated artifact — confirmed by the Step 1 filename search — but this needs a correction to that initial finding. UX-relevant content is not absent; it is fragmented across three canonical documents with no single wireframe/user-flow artifact tying them together:

- `docs/allura/BLUEPRINT.md` §0 — Brand Identity (persona "Maya," voice, values, brand tokens)
- `docs/allura/DESIGN-ALLURA.md` — "Dashboard v2 condensed UX contract" (panel/state tables, required action surface, truthfulness rules) and a short "UX Philosophy" subsection (Sarah's Law, 13-16-18 validation framework, "consumer mental model")
- `docs/allura/REQUIREMENTS-MATRIX.md` §6D end — REQ-UX-001 (reading level), REQ-UX-002 (golden-ratio layout), REQ-UX-003 (Memory Map accessibility)

Critically, `DESIGN-ALLURA.md` **explicitly disclaims** being a UX document in its own text (line 166-169): *"What this document is not: A UI style guide... Component-level wireframes... An implementation roadmap."* It states it is functional requirements, an API reference, state machines, and business rules. So this project has UX *principles* and UX *requirements*, but genuinely no wireframes, user flows, or interaction-design artifact — the original "not found" finding stands, just with more precision than a bare filename search gave it.

### Alignment Issues

1. **Dead cross-reference:** REQ-UX-001, REQ-UX-002, and REQ-UX-003 in `REQUIREMENTS-MATRIX.md` §6D all cite `` `DESIGN.md` `` as their trace source. **No file named `DESIGN.md` exists in this repository** — only `DESIGN-ALLURA.md` (the AI-GUIDELINES-approved name). Either these three UX requirements point at a file that was never created, or the citation should read `DESIGN-ALLURA.md` and was never corrected. Either way, three requirements currently have a broken pointer.
2. **UX requirements status:** all three (REQ-UX-001–003) are marked "Planned" in the matrix, tied to Stories 25.3–25.6 — these belong to Epic 25 (Governed Curator Review Console), which does exist as a tracked file, so unlike the F50–F55 gap above, this pointer at least resolves to a real epic.
3. **Brand vs. functional-UX split:** Brand Identity (Blueprint §0) targets "Maya," a warm/community-organizer consumer persona with informal voice ("Community · Connection · Belonging"), while `DESIGN-ALLURA.md`'s actual dashboard contract is an enterprise governance console (approval queues, RuVix policy panels, audit receipts, `gate_decision: Permit|Defer|Deny`). Nothing in either document reconciles a consumer-warmth brand voice with an enterprise-governance operator UI — this isn't necessarily wrong (different surfaces can have different tones) but it is unaddressed, and no document says which persona the Memory Command Center is actually designed for.

### Warnings

⚠️ **UX documentation is architecturally implied and required, but not delivered as a coherent artifact.** The PRD (Blueprint) commits to a full "Memory Command Center" with seven operator surfaces (F41–F48) and consumer-facing memory viewer requirements (B8–B11: swipe-to-forget, no sidebar, usage indicators) — these are UI-heavy commitments. The closest things to UX documentation are a functional-contract document that explicitly says it isn't one, and three requirements pointing at a nonexistent file. This is consistent with — and now sharper than — the plain "no unique UX specification" gap already logged in Step 1 and in Epic 27's Known Gaps.

⚠️ Given the Epic Coverage findings above (F43–F48 have zero implementation traceability and are exactly the routes DESIGN-ALLURA.md's route-parity table would need to cover), the missing UX artifact and the missing FR coverage for those same six routes are very likely the same underlying gap, not two independent problems.

### Correction — a real UX specimen exists, but outside this repository

Mid-review, the user pointed to `file:///mnt/projects/git/nexu-io/open-design/.od/projects/allura-enterprise-dashboard-brandlocked/index.html` — a working HTML mockup built with the Open Design tool and Hermes, authored by the user personally. It was read in full (110 lines, single-file HTML/CSS/JS). This materially changes the finding above: **a real wireframe/interaction-design artifact does exist.**

**What it covers:** Command Center (review queue, evidence path, mortgage module, and receipt-contract tabs), Governance, Evidence, Receipts, Module Registry, Mortgage Approval Gate, Organization Admin, and Platform Settings — explicitly labeled throughout as "Epic 25 UI simulation," "illustrative / specimen / not checked."

**Alignment with REQUIREMENTS-MATRIX.md §6D/6E (spot-checked, not exhaustive):**
- **Strong match — REQ-MTG-001/002** (Mortgage Approval Gate demo): the mockup's intake → evidence (source vs. OCR derivative, confidence kept visible, never normalized into fact) → cited policy observation (never a decision) → human-only review gate → receipt sequence is close to a direct implementation of these two requirements, including the explicit "no automated underwriting/eligibility/pricing/lending decision" disclaimers REQ-MTG-002 requires.
- **Strong match — REQ-MOD-001/002/003** (module registry, fail-closed modules): the Module Registry and Admin views show exactly the "may provide / may not provide" boundary (labels/evidence/policy references only; no code, secrets, SQL, authorization, or receipt authority), trust-admission checks (signature, compatibility, capability grants, lifecycle), and independent enable/disable/rollback — matches the requirement text closely.
- **Good match — accessibility (REQ-DURHAM-004):** real skip-link, ARIA tab roles with arrow/Home/End keyboard navigation, `focus-visible` outlines, `prefers-reduced-motion` handling. This is genuine accessibility engineering, not decorative.
- **Partial/unclear — REQ-DASH-004** (governance page: policy mode, thresholds, role separation, drift warnings): the mockup's Governance view is a "curator workbench" framing without a visible policy-mode/threshold control surface.
- **Naming mismatch — REQ-CUR-001** (sole initial route is `/dashboard/curator`): the mockup's primary view is `command` (Command Center), not literally `curator` — conceptually adjacent (both are the review-queue landing surface) but not a naming match.
- **Scope mismatch — REQ-DASH-009** (non-coder admin manages team members/roles): the mockup's Organization Admin page governs *module* lifecycle (enable/disable/rollback), not *member/role* management — these are different requirements that happen to share a page name.

**The actual defect this surfaces:** not "no UX work exists," but that this UX work is **completely disconnected from Allura_Memory's documentation trail**. It lives in a different repository (`nexu-io/open-design`), under a different tool's project-storage convention (`.od/projects/`), with its own asset references (`allura-brand-renewal.css`, `allura-wordmark.png`) that don't resolve inside this repo. Nothing in `BLUEPRINT.md`, `DESIGN-ALLURA.md`, `REQUIREMENTS-MATRIX.md`, or `epics.md` references it — and REQ-UX-001–003's dead `DESIGN.md` citation certainly doesn't point here either. A reviewer following this project's own canonical docs would never find it.

**Revised warning:** the UX gap is a **linkage gap, not a content gap**. Real, well-executed UX work exists (confirmed this session) but is orphaned relative to the documentation authority chain this project has committed to (`§12 Documentation Authority & Sync Contract` in BLUEPRINT.md). Recommendation: add this mockup as a cited reference in `DESIGN-ALLURA.md` and/or `REQUIREMENTS-MATRIX.md` §6E (Epic 25/REQ-MTG/REQ-MOD rows), or formally import/mirror it into this repo's tracked docs, so the authority map stays true.

## Epic Quality Review

Reviewed against `create-epics-and-stories` best practices: user value, epic independence, story sizing, forward dependencies, acceptance-criteria quality. Scope: `epic-24-portfolio-readiness.md`, `epic-26-bumblebee-supply-chain-threat-intelligence.md`, `epic-27-enterprise-documentation-consolidation.md` (each read in full), plus a dependency check that pulled Epic 25's Notion page directly (`3c41d9be`), since three separate threads in this review point at it: the F49–F55 epic gap (Step 3), Epic 26 Story 26.7's dependency, and the `DESIGN.md` dead reference (Step 4).

### 🔴 Critical — Epic 25 has no repository mirror, and its own canonical source says it should

Epic 25 ("Governed Curator Review Console") is not a minor or speculative epic — it has 6 active/historical local worktrees (`epic-25-bmad-closure`, `epic-25-25.2a-integration`, `epic-25-reconcile`, `epic-25-foundation-integration-v2`, plus 2 more branches), commit-bound evidence already archived at `docs/archive/allura/evidence/epic-25/25.2a/`, and is the target of dozens of requirements in `REQUIREMENTS-MATRIX.md` §6E (REQ-CUR-001–010, most of REQ-DASH-*, REQ-MTG-*, REQ-MOD-*, REQ-MAP-*, REQ-AST-*, REQ-COP-*, REQ-ID-*). Yet **no `_bmad/bmm/planning/epic-25-*.md` file exists**, and it is absent from `epics.md`.

This is not a guess — Epic 25's own Notion page states directly: *"Notion is the canonical scope, acceptance, and decision source for Epic 25. The repository is the versioned implementation, test, and commit-bound evidence mirror... Repository artifacts: `_bmad/bmm/planning/epic-25-governed-curator-review-console.md`, `DESIGN.md`, `docs/archive/allura/NEO4J-SUNSET-INTEGRITY-GATE.md`."* Two of those three named artifacts do not exist in this repository. This is the same class of defect as the missing Epic 14/15/16/17 files from Step 3, but with far higher confidence and severity, since Epic 25 is demonstrably the project's most active current epic (more worktrees than Epic 24 or 26 combined) and its own source of truth names the exact missing file.

**This also resolves the Step 4 `DESIGN.md` finding**: it is not a typo for `DESIGN-ALLURA.md` — Epic 25's Notion page independently names `DESIGN.md` as an expected repo artifact too, and it likewise does not exist. Two independent canonical sources (Notion Epic 25, and `REQUIREMENTS-MATRIX.md`'s REQ-UX rows) expect a file that was apparently planned but never created.

**A third related defect surfaces from the same fetch:** `BLUEPRINT.md`'s "Dashboard strategy supersession" note tells readers to see *"the repository `docs/allura/DEVELOPMENT-LOOP.md` for the active plan."* Epic 25's own Notion page explicitly states the opposite: *"`docs/allura/DEVELOPMENT-LOOP.md` is intentionally not a canonical artifact: it does not exist and creating it would violate the repository's closed six-document rule."* `BLUEPRINT.md` is directing readers to a file its own governing epic says must never exist.

**Status discrepancy (Major, bundled here since it's the same source):** `REQUIREMENTS-MATRIX.md` marks several REQ-CUR rows "Foundation Done (25.2a)". Epic 25's Notion page — the canonical status source — states Story 25.2a is *"changes-requested with remediation underway,"* not done. The matrix overstates completion relative to its own declared authority.

**Recommendation:** write `_bmad/bmm/planning/epic-25-governed-curator-review-console.md` from the Notion content (seven stories, ownership, guardrails, AD-58 detail — all captured above), matching the `epic-24`/`epic-26`/`epic-27` file pattern; correct the `25.2a` status in `REQUIREMENTS-MATRIX.md`; and remove or correct the `DEVELOPMENT-LOOP.md` pointer in `BLUEPRINT.md`. Given the scale (dozens of dependent requirements), this is arguably higher priority than Epic 27's own open Task 8.

### Epic 24 — Agentic AI Framework and Harness Portfolio Readiness

- **User value framing:** Title and goal read as technical-milestone language ("Portfolio Readiness," "Harness") rather than classic end-user value — a red-flag pattern per the checklist. However, the Goal section does name a concrete actor and observable outcomes ("*A reviewer must be able to install the project, run an agent scenario, observe policy enforcement, attempt an unauthorized operation, replay the run, execute evaluations, and inspect an audit receipt*"). For a portfolio/trust-proof epic where the "user" is a technical evaluator, this is a defensible, if unconventional, application of user-value framing. Noted, not scored as a violation.
- **Epic independence:** N/A (only active greenfield-style epic at time of writing) — but internally, story dependencies (24.2→24.1, 24.3→24.2, 24.4→24.3, 24.5→24.2+24.4, 24.6→24.4+24.5, 24.7→24.5+24.6, 24.8→24.2-24.7, 24.9→24.8, 24.10→24.1) are all **backward-pointing only**. No forward dependencies found — clean.
- **Story sizing:** 10 stories, each scoped to one architectural boundary (per the epic's own stated risk guardrail: *"Each story owns one architectural boundary and has explicit out-of-scope items"*). Appropriately sized for infrastructure/trust work.
- **Database timing:** Tenant isolation and ledger tables are introduced in Story 24.3 specifically, not front-loaded into Story 24.1. Correct pattern.
- **Acceptance criteria format:** The 12-item "Cross-Epic Acceptance Criteria" list is declarative assertions, not Given/When/Then BDD. Each is independently falsifiable and specific, so this is a **Minor** formatting deviation, not a quality defect.

### Epic 26 — Bumblebee Supply-Chain Threat Intelligence & Governed Mitigation

- **User value framing:** Goal is outcome-focused for a security-operator user ("*identifies newly disclosed threats..., creates evidence-backed exposure alerts, and prepares governed mitigation policy drafts*") — passes the check cleanly.
- **Epic independence / dependency analysis:** Story 26.7 ("Operator module, adversarial tests, and demo gate") lists a dependency on *"Epic 25 module registry."* Epic 25 has no repo file (see Critical finding above), and even its Notion page's "seven stories" summary doesn't list a story plainly named "module registry" — that work appears to live in sub-stories (25.3b per `REQUIREMENTS-MATRIX.md`'s REQ-MOD rows) not reflected in the Notion summary fetched this session. **This is an unresolvable forward dependency as currently documented** — 26.7 depends on work that cannot currently be located or verified in either the repo or the one Notion page checked.
- Story 26.5 depends on "Epic 24 mutation-boundary remediation" — Epic 24 is tracked and resolvable, though no Epic 24 story is titled exactly that (closest: 24.4 "Atomic Human-Governed Promotion"). Soft/implicit reference, not blocking, but imprecise.
- **Story sizing:** 7 stories (26.1–26.7), each with an explicit "Ship condition" — well-scoped.
- **Acceptance criteria format:** Same declarative (non-BDD) pattern as Epic 24 — Minor, consistent style across the project.

### Epic 27 — Enterprise Documentation Consolidation

Self-review of the epic authored earlier this session:

- **User value framing:** This is the epic most exposed to the "technical epic, no user value" red flag — its goal is about documentation-authority hygiene, closer to "Infrastructure Setup" than a user-facing outcome. It does serve a real constituency (anyone, human or agent, consuming project docs) but doesn't name them as concretely as Epic 24 or 26 do. **Self-flagged as a Minor/Major concern** rather than defended away.
- **Story 27.8 fails every quality check by definition** — it has no title beyond "Undefined," so user value, sizing, independence, and acceptance criteria cannot be assessed at all. This isn't a new finding (Epic 27's own "Known Gaps" section already says this) but it's worth restating here as a formal Epic Quality Review violation, not just a documentation footnote.
- **Structural note (not a defect):** Stories 27.1–27.7 are retrospective — documenting already-completed commits rather than planning forward work. This is a legitimate epic pattern (consolidation/reconciliation epics differ from greenfield feature epics) but is qualitatively different from Epic 24/26, worth naming so a reader doesn't expect the same forward-looking structure.

### Best Practices Compliance Checklist

| Check | Epic 24 | Epic 26 | Epic 27 |
|---|---|---|---|
| Delivers user/actor value | ⚠️ Technical framing, defensible | ✅ | ⚠️ Technical framing, self-flagged |
| Functions independently of later epics | ✅ (no other epic active yet) | ❌ (26.7 → unresolvable Epic 25 dependency) | ✅ |
| Stories appropriately sized | ✅ | ✅ | ✅ (retrospective sizing) |
| No forward dependencies | ✅ | ❌ (26.7) | ✅ |
| Tables created only when needed | ✅ (24.3) | ✅ (26.2) | N/A (no schema) |
| Clear acceptance criteria | ⚠️ Declarative, not BDD, but specific | ⚠️ Same | ⚠️ Same |
| Traceability to FRs maintained | N/A (no F# citations in any epic file — see Step 3) | N/A | N/A |

### Quality Assessment — Findings by Severity

#### 🔴 Critical Violations
1. Epic 25 has no repository planning file, despite its own Notion source explicitly mandating one and being the project's most active epic by worktree count.
2. `BLUEPRINT.md` directs readers to `docs/allura/DEVELOPMENT-LOOP.md` as "the active plan" — a file Epic 25's own governance note says must never exist.
3. Epic 26 Story 26.7 has an unresolvable forward dependency on "Epic 25 module registry," which cannot currently be located in the repo or in Epic 25's fetched Notion summary.
4. Epic 27 Story 27.8 is undefined — fails every quality dimension by definition (carried forward from Epic 27's own Known Gaps, restated here as a formal violation).

#### 🟠 Major Issues
5. `REQUIREMENTS-MATRIX.md` claims Story 25.2a is "Foundation Done" in multiple REQ-CUR rows; Epic 25's canonical Notion status says "changes-requested with remediation underway" — the matrix overstates completion against its own declared source of truth.
6. No epic file (24, 26, or 27) traces its stories back to BLUEPRINT F# IDs — `REQUIREMENTS-MATRIX.md` is doing 100% of FR traceability with none of it cross-checked at the epic level (compounds the Step 3 coverage gaps).

#### 🟡 Minor Concerns
7. All three epics use declarative acceptance-criteria checklists rather than Given/When/Then BDD format. Consistent across the project (a house style, not an isolated lapse), and each item remains specific and independently falsifiable — low risk, but worth standardizing if this project ever adopts stricter BDD tooling.
8. Epic 24 and Epic 27's titles/goals read as technical milestones rather than classic end-user value statements; both are defensible given the project's actual nature (portfolio-proof and documentation-hygiene work respectively) but neither should be treated as the default pattern for future epics.
9. Epic 26 Story 26.5's dependency label ("Epic 24 mutation-boundary remediation") doesn't exactly match any Epic 24 story title — imprecise but resolvable by inference (24.4).

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK.**

Not NOT READY: the parts of this project that are implemented are solidly built — F1–F40 (40 of 56 FRs) have explicit code-level traceability, Epic 24 and Epic 26 are well-structured with clean backward-only dependencies and appropriately sized stories, and the active engineering (per this session's earlier PR #126 merge) is genuinely shipping. This is not a project in disarray.

Not READY: five distinct, evidence-backed defects sit between this project and a trustworthy Phase 4 gate, and one of them (Epic 25) affects the project's single most active body of work. Proceeding to new implementation without resolving at least the two Critical root causes below risks building on specs that contradict each other or don't exist.

### Root Causes (the ~20 individual findings above cluster into five)

1. **Epic 25 documentation debt (🔴 Critical, highest priority).** The project's most active epic (6 worktrees, archived commit evidence, dozens of dependent requirements) has no tracked planning file, even though its own canonical Notion source explicitly names one that should exist. This single gap cascades into three other findings: a dead `DESIGN.md` reference in the Requirements Matrix, a `BLUEPRINT.md` pointer to a file (`DEVELOPMENT-LOOP.md`) that Epic 25's own governance note forbids from existing, and an unresolvable forward dependency in Epic 26 Story 26.7. Fixing this one root cause resolves four separate findings at once.
2. **Neo4j/PostgreSQL architectural contradiction (🔴 Critical).** `BLUEPRINT.md`'s own opening line declares Neo4j sunset under AD-50, but the rest of the same document — architecture components, data model, ~12 F#/B# requirements, and a project rule file (`.claude/rules/semantic-graph-best-practices.md`) — is written as if Neo4j is still canonical. `Epic 23` (Neo4j Sunset Completion) exists to clean this up in code, but the PRD itself was never reconciled. Every requirements-coverage judgment involving Neo4j in this report inherits this uncertainty.
3. **Memory Command Center under-specification (🟠 Major).** F43–F48 (six FRs: `/work-board`, `/resources`, `/agents`, `/telemetry`, per-route source-of-truth, launch gate) have zero traceability anywhere in the canonical docs. The one artifact that could plausibly specify them — a real, well-built UX mockup — exists but lives in an entirely different repository with no cross-reference from this project's docs.
4. **`F56` identifier collision (🟡 Minor but a genuine data-integrity defect).** `REQUIREMENTS-MATRIX.md` uses `F56` for two unrelated requirements (Git-safety guardrail vs. Bumblebee V1 authority) — a direct violation of this project's own `AI-GUIDELINES.md` rule that field/requirement IDs must match exactly across documents.
5. **Epics 14, 15, 16, 17 don't exist as files (🟡 Minor — lower urgency than #1).** Unlike Epic 25, these are honestly marked "Planned"/"Not implemented" in the matrix, so no one is misled about their status — the gap is real but not actively misleading anyone the way the Epic 25 gap is.

### Critical Issues Requiring Immediate Action

1. Write `_bmad/bmm/planning/epic-25-governed-curator-review-console.md` from the Notion content already retrieved this session (seven stories, ownership, guardrails, AD-58 detail) — resolves root cause #1 and three downstream findings in one action.
2. Resolve the Neo4j/PostgreSQL contradiction in `BLUEPRINT.md` — either update the opening line/architecture sections to match AD-50 (if Epic 23's sunset is in fact complete) or correct AD-50/the opening line if Neo4j is still genuinely in use. This is a factual question about the current codebase state, not a documentation-style question, and it should be answered by checking `GRAPH_BACKEND` runtime state before editing prose.
3. Correct the `F56` collision — renumber the Bumblebee requirement (e.g., to F57) in both `BLUEPRINT.md` and `REQUIREMENTS-MATRIX.md` in the same change.

### Recommended Next Steps

1. **Immediate:** action the three Critical items above — all three are documentation-only changes with no code risk, and together they resolve 7 of the ~20 findings in this report.
2. **Near-term:** either add "Satisfied by" traceability rows for F43–F48 (if the routes already exist in `src/app/dashboard/`) or open a tracked epic for the remaining Memory Command Center surface, and cross-reference the `nexu-io/open-design` mockup from `DESIGN-ALLURA.md`/`REQUIREMENTS-MATRIX.md` §6E so it's discoverable from this repo.
3. **Near-term:** correct the `REQUIREMENTS-MATRIX.md` claim that Story 25.2a is "Foundation Done" — Epic 25's own Notion status says "changes-requested with remediation underway."
4. **Lower priority:** write the missing Epic 14/15/16/17 files, or explicitly downgrade their matrix citations to "Planned, not yet scoped" until they are.
5. **Lower priority:** resolve Epic 27's own Task 8 (its scope is still unrecovered — see `_bmad/bmm/planning/epic-27-enterprise-documentation-consolidation.md` Known Gaps).
6. **Process note:** none of the three active epic files (24, 26, 27) cite BLUEPRINT F# IDs directly — `REQUIREMENTS-MATRIX.md` is the sole source of FR↔epic traceability with no cross-check at the epic level. Consider adding an "FRs addressed" line to the epic file template so future epics are self-traceable without needing this kind of forensic reconstruction.

### Final Note

This assessment identified **20 distinct issues clustering into 5 root causes**, across 5 categories (document discovery, PRD analysis, epic coverage, UX alignment, epic quality). FR coverage stands at 73% (41/56) with clear, named gaps rather than vague uncertainty. The two Critical root causes are both resolvable without touching a line of application code — this is a documentation-integrity problem, not an implementation-readiness-of-the-codebase problem. Address at minimum the Epic 25 write-up and the Neo4j/PostgreSQL contradiction before treating this project's planning surface as a reliable foundation for new Phase 4 work; the findings above can otherwise be worked through incrementally alongside implementation.

---
**Assessment completed:** 2026-08-28
**Assessor:** Claude Sonnet 5, via `bmad-check-implementation-readiness` skill
**Documents reviewed:** `docs/allura/BLUEPRINT.md`, `docs/allura/REQUIREMENTS-MATRIX.md`, `docs/allura/DESIGN-ALLURA.md`, `_bmad/bmm/planning/epics.md`, `_bmad/bmm/planning/epic-24-portfolio-readiness.md`, `_bmad/bmm/planning/epic-26-bumblebee-supply-chain-threat-intelligence.md`, `_bmad/bmm/planning/epic-27-enterprise-documentation-consolidation.md`, Notion "Epic 25 — Governed Curator Review Console," and `file:///mnt/projects/git/nexu-io/open-design/.od/projects/allura-enterprise-dashboard-brandlocked/index.html`
