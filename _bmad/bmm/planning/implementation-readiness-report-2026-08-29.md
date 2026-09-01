# Implementation Readiness Assessment Report

**Date:** 2026-08-29
**Project:** allura-memory
**Assessor:** Brooks
**Config:** `_bmad/bmm/config.yaml`

---

## Step 1: Document Discovery

### PRD Documents

**Whole Documents:** None found in `{planning_artifacts}` (`_bmad/bmm/planning/`)
**Sharded Documents:** None found

**PRD-like documents found in `{project_knowledge}` (`docs/`):**
- `docs/allura/BLUEPRINT.md` (62KB, modified 2026-08-28) — "Allura Blueprint", declared as "single source of design intent"
- `docs/allura/REQUIREMENTS-MATRIX.md` (57KB, modified 2026-08-28) — requirements matrix with REQ-* entries

### Architecture Documents

**Whole Documents (in `docs/allura/`):**
- `docs/allura/SOLUTION-ARCHITECTURE.md` (33KB, modified 2026-08-28) — canonical solution architecture
- `docs/allura/BLUEPRINT.md` (62KB, modified 2026-08-28) — canonical blueprint / design intent
- `docs/allura/DATA-DICTIONARY.md` (86KB, modified 2026-08-29) — canonical data dictionary
- `docs/allura/RISKS-AND-DECISIONS.md` (78KB, modified 2026-08-28) — risks and decisions log
- `docs/allura/DESIGN-ALLURA.md` (44KB, modified 2026-08-28) — design specification

**No architecture documents found in `{planning_artifacts}` directly.**

### Epics & Stories Documents

**Whole Documents (in `_bmad/bmm/planning/`):**
- `epics.md` (2.5KB, modified 2026-08-28) — master epic register / index
- `epic-18-ruvector-documentation-sync.md` (2.5KB)
- `epic-19-ruvector-graph-cutover-execution.md` (1.7KB)
- `epic-20-subagent-memory-access.md` (3.7KB)
- `epic-21-retrieval-drift-audit-curation-scheduling.md` (3.7KB)
- `epic-22-enterprise-readiness-multi-tenant-hardening.md` (3.9KB)
- `epic-23-neo4j-sunset-completion.md` (3.2KB)
- `epic-24-portfolio-readiness.md` (8.4KB)
- `epic-25-governed-curator-review-console.md` (4.6KB)
- `epic-26-bumblebee-supply-chain-threat-intelligence.md` (10.2KB)
- `epic-26-correct-course-upstream-bumblebee-plugin.md` (12.9KB)
- `epic-27-governed-branchable-learning-memory.md` (10.3KB, modified 2026-08-29)
- `epic-28-enterprise-documentation-consolidation.md` (9.4KB, modified 2026-08-29)

**Sharded Documents:** None

**Story files (in `_bmad/bmm/stories/`):** Implementation artifacts, not planning — out of scope for discovery.

### UX Design Documents

**Whole Documents:** None found in `{planning_artifacts}`
**Sharded Documents:** None found

**UX-like documents in `docs/`:**
- `docs/allura/DESIGN-ALLURA.md` (44KB) — "Design Specification: Allura Memory Command Center" — closest to UX
- `docs/allura-hosted/DESIGN-CURATOR.md` (2.7KB) — curator design
- `docs/allura-hosted/DESIGN-MEMORY-COMMAND-CENTER.md` (3.3KB) — memory command center design

### Duplicate / Conflicting Documents

#### CRITICAL: `docs/allura-hosted/` vs `docs/allura/` — Unbannered Duplicate Architecture Set

**`docs/allura-hosted/`** contains a full set of architecture docs (BLUEPRINT, SOLUTION-ARCHITECTURE, DATA-DICTIONARY, REQUIREMENTS-MATRIX, RISKS-AND-DECISIONS, plus 7 DESIGN-*.md files) — all dated **2026-08-22**, none carrying a deprecation or `[!CAUTION] Not current` banner.

**`docs/allura/`** contains the canonical, more recently modified set (2026-08-28/29).

The `allura-hosted` set is **older and has NO deprecation banner**. A reader landing on `docs/allura-hosted/BLUEPRINT.md` first gets no signal it is superseded. Per the pitfalls section of this skill, unbannered deprecated docs in the live root is a **critical finding**, not cosmetic.

#### Duplicate Epic 26 Planning Documents

Two Epic 26 files exist:
- `epic-26-bumblebee-supply-chain-threat-intelligence.md` — the original plan (carries a `[!IMPORTANT] Correct Course` pointer)
- `epic-26-correct-course-upstream-bumblebee-plugin.md` — the accepted correction (2026-08-27)

This is **intentional** — the original carries a forward pointer to the correction. Not a true duplicate but a two-document planning correction pattern.

#### `epics.md` Master Index is STALE

The master index `epics.md` shows:
- Epic 25: "In progress" (sprint-status says **done** with retrospective)
- Epic 26: "In progress" (sprint-status says **done** with retrospective)
- Epic 27: "Planned" (sprint-status says **done** with retrospective)
- Epic 28: "In progress" (sprint-status says **done**, 28.8 exit-gate closure)

This is a **stale navigation file** — it contradicts the authoritative `sprint-status.yaml` on every active epic.

### Missing Documents

- **PRD:** No document named "PRD" exists anywhere. `BLUEPRINT.md` + `REQUIREMENTS-MATRIX.md` serve as the PRD equivalent. This is acceptable if the team treats BLUEPRINT as the PRD substitute.
- **UX:** No dedicated UX document in `{planning_artifacts}`. `DESIGN-ALLURA.md` in `docs/allura/` is the closest UX artifact.

### Document Inventory Summary

| Type | Location | Files | Status |
|------|----------|-------|--------|
| PRD (substitute) | `docs/allura/BLUEPRINT.md` + `REQUIREMENTS-MATRIX.md` | 2 | Present (canonical) |
| Architecture | `docs/allura/SOLUTION-ARCHITECTURE.md`, `BLUEPRINT.md`, `DATA-DICTIONARY.md`, `RISKS-AND-DECISIONS.md`, `DESIGN-ALLURA.md` | 5 | Present (canonical) |
| Epics | `_bmad/bmm/planning/epic-*.md` + `epics.md` | 13 | Present (stale index) |
| UX | `docs/allura/DESIGN-ALLURA.md` | 1 | Present (as design spec) |
| **Duplicate (critical)** | `docs/allura-hosted/` | 16 files | **Unbannered, superseded** |

### Issues Found

1. **CRITICAL:** `docs/allura-hosted/` contains 16 unbannered superseded architecture/design docs — no `[!CAUTION] Not current` banner on any file. Readers may treat these as current.
2. **MAJOR:** `epics.md` master index is stale — shows Epics 25–28 as in-progress/planned when sprint-status.yaml marks all as done with retrospectives.
3. **INFO:** No formal PRD document — BLUEPRINT + REQUIREMENTS-MATRIX serve as substitute.
4. **INFO:** No dedicated UX doc in planning artifacts — DESIGN-ALLURA.md in docs/allura/ serves as UX substitute.

### Required Actions

1. **Resolve `docs/allura-hosted/` duplicate:** Add `[!CAUTION] Not current` banners to all files, or move the directory to `docs/archive/allura-hosted/`. This must be resolved before proceeding to avoid analysis against stale architecture.
2. **Confirm which documents to use for assessment:**
   - PRD: `docs/allura/BLUEPRINT.md` + `docs/allura/REQUIREMENTS-MATRIX.md`
   - Architecture: `docs/allura/SOLUTION-ARCHITECTURE.md` + `docs/allura/BLUEPRINT.md`
   - Epics: all 13 `epic-*.md` files in `_bmad/bmm/planning/`
   - UX: `docs/allura/DESIGN-ALLURA.md`

3. **Update `epics.md` master index** to match sprint-status.yaml (all epics 18–28 done except backlog stories in Epic 24).

---

## Step 2: PRD Analysis

**PRD sources:** `docs/allura/BLUEPRINT.md` (1039 lines, 62KB) + `docs/allura/REQUIREMENTS-MATRIX.md` (510 lines, 57KB)

Both documents were read completely. Requirements extracted below with full text and original numbering.

### Functional Requirements

#### Memory Operations (BLUEPRINT §2)

| # | Requirement |
|---|-------------|
| F1 | `memory_add(content, userId, metadata?)` — writes to Postgres; conditionally promotes to `graph_memories` |
| F2 | `memory_search(query, userId, limit?)` — federated search across Postgres episodic + `graph_memories` semantic, merged by relevance |
| F3 | `memory_get(memoryId)` — returns a single memory record by ID |
| F4 | `memory_list(userId)` — returns all memories for a user within the tenant |
| F5 | `memory_delete(memoryId)` — soft-delete: appends a deletion event to Postgres, marks `graph_memories` row deprecated |

#### Governance (BLUEPRINT §2)

| # | Requirement |
|---|-------------|
| F6 | `PROMOTION_MODE=soc2` — score ≥ threshold queues for human approval; no autonomous semantic write |
| F7 | `PROMOTION_MODE=auto` — score ≥ `AUTO_APPROVAL_THRESHOLD` promotes immediately to `graph_memories` |
| F8 | `group_id` CHECK constraint blocks writes with invalid tenant namespaces |
| F9 | `SUPERSEDES` relationship created on every `graph_memories` row update |

#### Curator Dashboard (BLUEPRINT §2)

| # | Requirement |
|---|-------------|
| F10 | `POST /api/curator/score` — scores proposal, returns {confidence, reasoning, tier} |
| F11 | `POST /api/curator/approve` — moves proposal to approved knowledge, promotes to `graph_memories` if tier ≥ 85% |
| F12 | `POST /api/curator/reject` — archives proposal to 7-day undo, logs to audit trail |
| F13 | `GET /api/curator/proposals` — returns pending proposals (emerging + adoption tiers only) |
| F14 | Curator dashboard shows three tabs: Traces (raw), Approved (knowledge), Pending (decisions) |
| F15 | Pending tab sorts by confidence (descending); shows confidence badge + reasoning + buttons |
| F16 | Approved tab shows all approved knowledge (human + auto-promoted); sortable by date/confidence |
| F17 | Tab 1 restricted to authenticated users with `admin` role (engineers only) |
| F18 | Audit log endpoint: `GET /api/audit/events` — returns curator decisions with timestamps |
| F19 | Dashboard integrates Clerk for authentication and RBAC (curator, admin, viewer roles) |

#### Infrastructure (BLUEPRINT §2)

| # | Requirement |
|---|-------------|
| F20 | Skills route agent work to packaged MCP servers (`neo4j-memory`, `database-server`, optional `neo4j-cypher`) rather than a custom all-in-one MCP runtime |
| F21 | `docker compose up` starts core infra and app services; packaged MCP servers are attached as focused external capabilities |
| F22 | Memory viewer UI at `/memory` lists, searches, and deletes memories |
| F23 | Curator dashboard deployed on Vercel; calls backend engine via `CURATOR_ENGINE_URL` env var |
| F24 | Vercel Functions (`/api/curator/*`) call Docker engine in VPC/cloud via HTTPS |
| F25 | Error tracking: unhandled exceptions sent to Sentry; curator notified via email/Slack |

#### Governed Memory Pipeline (BLUEPRINT §2 + REQUIREMENTS-MATRIX §5)

| # | Requirement |
|---|-------------|
| F26 | Agent task lifecycle events, tool calls, outputs, retries, and terminal status are persisted as append-only traces |
| F27 | Raw trace storage is append-only; no UPDATE or DELETE on the `events` table |
| F28 | Raw traces preserve provenance linking downstream insights back to source evidence |
| F29 | Curator reads raw traces and generates proposed insights (not active insights) |
| F30 | Each proposed insight includes summary, evidence links, confidence score, timestamp, and status |
| F31 | Proposed insights enter an approval flow before becoming active knowledge |
| F32 | Every approval, rejection, or policy decision is recorded as an audit event with actor and timestamp |
| F33 | Approved insights are written to Neo4j as immutable nodes; no in-place updates |
| F34 | Changed insights create new nodes linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED` relationships |
| F35 | Agents retrieve knowledge through a controlled retrieval service, not by querying databases directly |
| F36 | Retrieval supports semantic and structured queries with project and global scope |
| F37 | All knowledge-system reads/writes pass through controlled endpoints enforcing project-level access |
| F38 | Agent permissions enforced and all access to trace/knowledge resources is audited |
| F39 | A second agent can retrieve approved knowledge and use it correctly in a later task |
| F40 | The full lifecycle from trace capture to knowledge reuse is traceable, auditable, and reversible |
| F56 | Bumblebee V1 may ingest allowlisted advisory evidence, correlate verified exposure, create deduplicated alerts, and prepare simulated mitigation proposals; it must not activate policy, block CI/packages, change schedules, or perform containment |

#### Memory Command Center (BLUEPRINT §2)

| # | Requirement |
|---|-------------|
| F41 | Memory Command Center exposes `/dashboard` (new chat), `/dashboard/search`, `/dashboard/scheduled-tasks`, `/dashboard/governance`, `/dashboard/kanban`, `/dashboard/graph`, `/dashboard/mission-control`, `/dashboard/settings` |
| F42 | `/dashboard/memories` preserves memory search/list, insights, trace logs, provenance, extracted facts, approval queue |
| F43 | `/work-board` uses Native Allura Kanban as default planning source of truth; Notion, Linear, GitHub Projects are optional sync adapters |
| F44 | `/resources` reads skills, agents, MCP servers, containers, cron jobs, drift warnings from declared Resource Manifest |
| F45 | `/agents` distinguishes TALON/IRIS native subagents from Team RAM/Durham CLI harness agents and external runtime agents |
| F46 | `/telemetry` surfaces model, prompt, tool, retry, rate-limit, failure, degraded-state metrics without inventing missing measurements |
| F47 | Every Memory Command Center route displays its source-of-truth declaration and degraded-state behavior |
| F48 | Dashboard launch requires documented route parity, visual parity, source-of-truth parity, smoke tests, auth validation, rollback plan |
| F49 | Governed runs capture a neutral tenant-scoped `RunRecord` and pin a process definition ID and immutable revision |
| F50 | Run policy declares allowed actions, approval breakpoints, measured quality gates, bounded attempts, evidence required before Done |
| F51 | Run journals persist append-only execution evidence and continue from the first incomplete eligible step after approval |
| F52 | Run doctor checks report stale, failed, incomplete, definition-drifted, unrecoverable, or approval-blocked runs before Done |
| F53 | Native projects and work items use PostgreSQL as operational state, link to runs/handoffs/evidence/memory receipts, move through audited transitions |
| F54 | Operator workspace provides mission-first navigation, Command Center behavior, central work surface, right evidence/context inspector |
| F55 | Allura ships one governed desktop shell with secure connections, runtime supervision, updates, deep links, offline/read-only, reconnect recovery |

#### Additional Functional Requirements (REQUIREMENTS-MATRIX)

| # | Requirement | Source |
|---|-------------|--------|
| F56 (dup) | Git-safety guardrail (GIT-EXEC-001): all `git` subprocesses spawned by the harness must have `GIT_DIR` constrained to project root | REQ-MATRIX §4, F56 — **NOTE: conflicts with BLUEPRINT F56 (Bumblebee)** |

**Total Functional Requirements: 56 (F1–F55 + F56 Bumblebee; plus F56 Git-guardrail in REQ-MATRIX — numbering collision)**

### Non-Functional Requirements

Extracted from BLUEPRINT §2 (Global Constraints, E2E Readiness) and REQUIREMENTS-MATRIX competitive/deployment sections:

| # | Category | Requirement |
|---|----------|-------------|
| NFR1 | Security | All memory isolated by tenant (`group_id`) at schema level — PostgreSQL CHECK constraint, no application-layer bypass |
| NFR2 | Security | Append-only `events` table — no UPDATE or DELETE under any circumstance |
| NFR3 | Security | `graph_memories` rows immutable — updates create new row with SUPERSEDES edge |
| NFR4 | Security | Circuit breaker trips at budget threshold — agent runaway cut off at infrastructure layer |
| NFR5 | Security | BYOK encryption (B15, planned, RK-04) |
| NFR6 | Security | Authentication via API keys and RBAC (curator, admin, viewer roles) — B21 |
| NFR7 | Compliance | Audit trail: every write produces immutable audit record in PostgreSQL — B3 |
| NFR8 | Compliance | Audit log exportable as CSV for compliance — B13 |
| NFR9 | Compliance | SOC 2 compliance enforced by schema design, not application layer |
| NFR10 | Performance | Score computation failure treated as score=0, Postgres-only write (graceful degradation) |
| NFR11 | Performance | Graph backend write failure logged, episodic-only result returned (non-fatal) |
| NFR12 | Reliability | 30-day soft-delete recovery window — memories always recoverable — B11 |
| NFR13 | Reliability | Error tracking via Sentry; alerts on engine failures — B22 |
| NFR14 | Scalability | Self-hosted deployment (Docker Compose, K8s, bare metal) — no SaaS lock-in |
| NFR15 | Data Quality | Pre-promotion deduplication (before semantic write) — 0% junk rate vs mem0's 97.8% |
| NFR16 | UX | Dashboard controls keyboard reachable, screen-reader readable, high-contrast safe (AA compliance) — REQ-DURHAM-004 |
| NFR17 | UX | Primary dashboard copy targets ~6th-grade reading level — REQ-UX-001 |
| NFR18 | UX | Major two-pane desktop layouts target 38.2%/61.8% golden-ratio split — REQ-UX-002 |
| NFR19 | Deployment | Single `docker compose up` for core infra and app services — B5 |
| NFR20 | Runtime | Runtime readiness label must say `pgvector bridge` until RuVector extension/functions proven — REQ-GOV-006 |

**Total NFRs: 20**

### Additional Requirements / Constraints

From BLUEPRINT §2 and §7:

1. **Engine Boundary:** Dashboard and operator surfaces visualize and request governed actions; they are not core engine components and must not own canonical engine state.
2. **API-First Scope:** Allura is MCP/API-first with an optional RuVix-governed Memory Command Center. Engine usable without a browser.
3. **Evidence-Gated Orchestration:** Allura stores run receipts, evidence, decisions, reusable knowledge; it does not become an autonomous project manager. Language: "evidence-gated, auditable, resumable runs" — never "hallucination-free."
4. **Agent Factory Boundary:** Factory modules live in canonical repo; shippable only after structural validation, roster/tenant consistency, live tenant-isolation smoke evidence, named team packaging.
5. **RuVix Governance:** Any runtime/database/MCP/cron/live hook/RuVix enforcement/semantic promotion/Notion sync/Done-Approved status change requires explicit approval and receipt with `approval_required`.
6. **Dashboard Mutation Rule:** Every dashboard mutation must produce a governance receipt with intent, actor, source, policy, validation, and audit trail.
7. **Documentation Authority:** Notion → repo sync contract; no auto-write back to Notion; canonical docs limited to approved authority-map files.
8. **E2E Readiness Gate:** Docker fresh-deploy on a new machine is UNVERIFIED — no doc/UI may claim "production-ready" until gate passes.
9. **Neo4j References Stale:** BLUEPRINT and REQUIREMENTS-MATRIX still reference Neo4j as the semantic store in multiple places (F33, F34, B4, diagrams, data model) — but AD-50 sunset Neo4j on 2026-07-17 and `graph_memories` (PostgreSQL) is the sole semantic store. This is a documentation drift finding.

### PRD Completeness Assessment

**Strengths:**
- FRs are numbered, specific, and trace to implementation files
- Business requirements (B1–B32) are comprehensive
- REQ-* sections (6A–6F) add granular governance, brand, RuVector, dashboard, curator, and Bumblebee requirements
- Use case index maps FRs to concrete scenarios
- Authority map prevents doc drift

**Weaknesses:**
- **F56 numbering collision** — BLUEPRINT F56 (Bumblebee V1 scope) vs REQ-MATRIX F56 (Git-safety guardrail). Two different requirements share the same ID.
- **Neo4j documentation drift** — F33/F34, B4, diagrams, data model, and multiple references still say "Neo4j" as the semantic store. AD-50 sunset Neo4j on 2026-07-17. PostgreSQL `graph_memories` is the sole semantic store. The BLUEPRINT §12 authority invariant #4 even says "Neo4j remains the canonical semantic knowledge graph" — directly contradicting AD-50 and Epic 23.
- **No formal NFR section** — Non-functional requirements are scattered across BLUEPRINT §2, §7, and REQ-MATRIX competitive tables. There is no dedicated NFR section with numbered requirements.
- **F53–F55 are "Planned"** — Governed AI Office requirements are explicitly marked as planned (Epic 15/16/17) but those epics do not exist in the planning directory.
- **Epic 14/15/16/17 referenced but not planned** — REQ-MATRIX cites Epic 14 for F50/F52, Epic 15 for F53, Epic 16 for F54, Epic 17 for F55. No epic files exist for 14–17 in `_bmad/bmm/planning/`. These appear to be historical references to earlier epic numbering that was later renumbered.
+- **Two B-numbering systems** — REQ-MATRIX §0 uses BLUEPRINT B1–B7 (core API), §1 uses a legacy pipeline B1–B7 (mapped to BLUEPRINT B23–B29). Both are preserved "for traceability" but create confusion.

---

## Step 3: Epic Coverage Validation

**Epic documents scanned:** 13 files (`epic-18-*.md` through `epic-28-*.md`) in `_bmad/bmm/planning/`
**Story files scanned:** 67 files in `_bmad/bmm/stories/`
**Sprint-status.yaml:** Scanned for FR references

### Critical Finding: No FR-to-Epic Traceability

**Zero epic files contain explicit FR references (F1, F2, etc.).** Epics describe their scope in prose goals and story lists but never map to the BLUEPRINT's numbered Functional Requirements.

Only **1 story file** (`24-2-authenticated-principal-context.md`) explicitly references FRs (F1–F5). The remaining 66 story files have no FR references.

The sprint-status.yaml (authoritative delivery tracker) contains **zero FR references**.

### Coverage Matrix (Topical Mapping)

Since no explicit FR traceability exists, coverage is assessed by topical match between epic scope and FR description:

| FR | PRD Requirement (summary) | Epic Coverage | Status |
|----|--------------------------|--------------|--------|
| F1 | memory_add | Epic 24 (Story 24.2 explicit) | ✓ Covered (explicit) |
| F2 | memory_search | Epic 24 (Story 24.2 explicit) | ✓ Covered (explicit) |
| F3 | memory_get | Epic 24 (Story 24.2 explicit) | ✓ Covered (explicit) |
| F4 | memory_list | Epic 24 (Story 24.2 explicit) | ✓ Covered (explicit) |
| F5 | memory_delete | Epic 24 (Story 24.2 explicit) | ✓ Covered (explicit) |
| F6 | PROMOTION_MODE=soc2 | Epic 22 (multi-tenant), Epic 24 (24.2) | ⚠️ Implicit |
| F7 | PROMOTION_MODE=auto | Epic 22, Epic 24 | ⚠️ Implicit |
| F8 | group_id CHECK constraint | Epic 22 (hardening), Epic 24 (24.3) | ⚠️ Implicit |
| F9 | SUPERSEDES relationship | Epic 18/19 (graph cutover), Epic 23 | ⚠️ Implicit |
| F10 | POST /api/curator/score | Epic 25 (curator console) | ⚠️ Implicit |
| F11 | POST /api/curator/approve | Epic 25 | ⚠️ Implicit |
| F12 | POST /api/curator/reject | Epic 25 | ⚠️ Implicit |
| F13 | GET /api/curator/proposals | Epic 25 | ⚠️ Implicit |
| F14 | Dashboard three tabs | Epic 25 | ⚠️ Implicit |
| F15 | Pending tab sort | Epic 25 | ⚠️ Implicit |
| F16 | Approved tab | Epic 25 | ⚠️ Implicit |
| F17 | Admin role restriction | Epic 24 (24.2), Epic 25 | ⚠️ Implicit |
| F18 | Audit log endpoint | Epic 24 (24.8), Epic 25 | ⚠️ Implicit |
| F19 | Clerk auth + RBAC | Epic 24 (24.2), Epic 25 | ⚠️ Implicit |
| F20 | MCP server routing | Epic 20 (subagent access) | ⚠️ Implicit |
| F21 | docker compose up | No dedicated epic | ❌ MISSING (backlog: 24.7) |
| F22 | Memory viewer UI /memory | No dedicated epic | ❌ MISSING |
| F23 | Curator on Vercel + CURATOR_ENGINE_URL | No dedicated epic | ❌ MISSING |
| F24 | Vercel Functions call Docker engine | No dedicated epic | ❌ MISSING |
| F25 | Sentry error tracking | No dedicated epic | ❌ MISSING |
| F26 | Append-only traces | Epic 24 (pipeline scope) | ⚠️ Implicit |
| F27 | events table append-only | Epic 24 | ⚠️ Implicit |
| F28 | Provenance linking | Epic 24 | ⚠️ Implicit |
| F29 | Curator generates proposals | Epic 24, Epic 25 | ⚠️ Implicit |
| F30 | Proposal schema fields | Epic 24, Epic 25 | ⚠️ Implicit |
| F31 | Approval flow | Epic 24, Epic 25 | ⚠️ Implicit |
| F32 | Audit event recording | Epic 24, Epic 25 | ⚠️ Implicit |
| F33 | Immutable nodes (says Neo4j) | Epic 23 (sunset) — **STALE REF: now PostgreSQL** | ⚠️ Implicit + Drift |
| F34 | SUPERSEDES/DEPRECATED/REVERTED | Epic 18/19, Epic 23 | ⚠️ Implicit |
| F35 | Controlled retrieval service | Epic 21 (drift audit), Epic 24 | ⚠️ Implicit |
| F36 | Semantic + structured queries | Epic 21, Epic 24 | ⚠️ Implicit |
| F37 | Controlled endpoints | Epic 24 (24.3), Epic 25 | ⚠️ Implicit |
| F38 | Agent permissions + audit | Epic 24 (24.3), Epic 25 | ⚠️ Implicit |
| F39 | Second agent retrieval | Epic 24 (E2E) | ⚠️ Implicit |
| F40 | Full lifecycle traceable | Epic 24 (E2E) | ⚠️ Implicit |
| F41 | MCC dashboard routes | Epic 25 (partial), no epic for full MCC | ❌ MISSING (partially) |
| F42 | /dashboard/memories | Epic 25 | ⚠️ Implicit |
| F43 | /work-board Kanban | No dedicated epic | ❌ MISSING |
| F44 | /resources manifest | No dedicated epic | ❌ MISSING |
| F45 | /agents distinction | No dedicated epic | ❌ MISSING |
| F46 | /telemetry metrics | No dedicated epic | ❌ MISSING |
| F47 | Source-of-truth display | Epic 25 (partial) | ⚠️ Implicit |
| F48 | Dashboard launch gates | Epic 25 (partial) | ⚠️ Implicit |
| F49 | RunRecord capture | No dedicated epic (AD-35 partial) | ❌ MISSING |
| F50 | Run policy | No dedicated epic | ❌ MISSING |
| F51 | Run journals | No dedicated epic | ❌ MISSING |
| F52 | Run doctor checks | No dedicated epic | ❌ MISSING |
| F53 | Native projects/work items | No dedicated epic (planned Epic 15 — not created) | ❌ MISSING |
| F54 | Operator workspace | No dedicated epic (planned Epic 16 — not created) | ❌ MISSING |
| F55 | Governed desktop shell | No dedicated epic (planned Epic 17 — not created) | ❌ MISSING |
| F56 | Bumblebee V1 scope | Epic 26 (covered by REQ-BMB-001..016) | ✓ Covered (implicit) |

### Missing FR Coverage

#### Critical Missing FRs (No epic, no story, no plan)

| FR | Requirement | Impact |
|----|-------------|--------|
| F21 | `docker compose up` starts services | Core deployment — listed as backlog in 24.7 but no epic |
| F22 | Memory viewer UI at `/memory` | Core user-facing surface, no epic |
| F23 | Curator on Vercel + CURATOR_ENGINE_URL | Deployment architecture, no epic |
| F24 | Vercel Functions call Docker engine | Deployment architecture, no epic |
| F25 | Sentry error tracking | Operations requirement, no epic |
| F43 | `/work-board` Kanban | MCC feature, no epic |
| F44 | `/resources` manifest | MCC feature, no epic |
| F45 | `/agents` distinction | MCC feature, no epic |
| F46 | `/telemetry` metrics | MCC feature, no epic |
| F49 | RunRecord capture | Evidence-gated runs, no epic (AD-35 partial impl) |
| F50 | Run policy | Evidence-gated runs, no epic |
| F51 | Run journals | Evidence-gated runs, no epic |
| F52 | Run doctor checks | Evidence-gated runs, no epic |
| F53 | Native projects/work items | Governed AI Office — planned Epic 15 (not created) |
| F54 | Operator workspace | Governed AI Office — planned Epic 16 (not created) |
| F55 | Governed desktop shell | Governed AI Office — planned Epic 17 (not created) |

#### Coverage Statistics

| Metric | Count | % |
|--------|-------|---|
| Total PRD FRs | 56 | 100% |
| Explicitly covered (FR number in story) | 5 | 8.9% |
| Implicitly covered (topical match) | 34 | 60.7% |
| Missing (no epic, no story, no plan) | 17 | 30.4% |
| **Total covered (explicit + implicit)** | **39** | **69.6%** |

### Orphan FRs (in epics but not in PRD)

None found — no epic references FR numbers, so no phantom references are possible. The REQ-* requirements in REQ-MATRIX sections 6A–6F ARE traceable to epics (REQ-BMB-* → Epic 26, REQ-CUR-* → Epic 25, REQ-RV-* → Epic 18/19, REQ-DASH-* → Epic 25, REQ-MOD-* → Epic 25.3b).

---

## Step 4: UX Alignment Assessment

### UX Document Status

**Found:** `docs/allura/DESIGN-ALLURA.md` (938 lines, 44KB) — "Design Specification: Allura Memory Command Center"

This is a comprehensive design document covering:
- Core surfaces (Overview, Memories, Curator, Governance, Graph, Audit, Settings, Runs)
- Functional requirements (F6–F55 listed with implementation source)
- API reference (health, memory operations, curator, audit)
- State machine for curator proposal lifecycle
- Business rules from architectural decisions
- UX philosophy (Sarah's Law, 13-16-18 validation framework)
- Memory lifecycle and done gate
- Bumblebee plugin planning contract
- Dashboard v2 condensed UX contract
- Command Center route parity table
- Cutover rules

No dedicated UX/wireframe document in `{planning_artifacts}`. DESIGN-ALLURA.md lives in `docs/allura/` and serves as both UX spec and functional design reference.

### UX ↔ PRD Alignment

| Area | Alignment | Finding |
|------|-----------|---------|
| Dashboard surfaces (F41–F48) | ✓ Aligned | DESIGN-ALLURA lists all MCC routes matching BLUEPRINT F41 |
| Curator workflow (F10–F19) | ✓ Aligned | Curator requirements section maps F10–F19 to implementation |
| Memory operations (F1–F5) | ✓ Aligned | API reference covers all 5 memory operations |
| Governance (F6–F9) | ✓ Aligned | Governance requirements section covers F6, F7, F34, F37, F38 |
| Pipeline (F26–F40) | ✓ Aligned | Audit/health section covers F26–F28, F32 |
| Run records (F49–F55) | ✓ Aligned | F49–F55 listed with "Planned" status and epic references |
| Bumblebee (F56) | ✓ Aligned | Accepted plugin contract section covers F56 scope |

### UX ↔ Architecture Alignment

| Area | Alignment | Finding |
|------|-----------|---------|
| API-first boundary | ✓ Aligned | UX doc states "MCP tools, API routes, and CLI scripts remain the primary engine path" |
| Adapter pattern | ✓ Aligned | "Every component consumes mapped UI contracts from `src/lib/dashboard/`; raw Brain API shapes stay behind `api.ts`, `queries.ts`, and `mappers.ts` (AD-26)" |
| Cutover gates | ✓ Aligned | UX doc enforces route parity, visual parity, smoke tests, auth validation, rollback before replacing legacy 3100 |
| Truthfulness rules | ✓ Aligned | No fabricated live data, no "healthy" without verification, unknown is first-class state |
| Governance receipts | ✓ Aligned | Every mutation shows intent, actor, source, policy, validation, audit trail, gate_decision, approval_required |

### Alignment Issues Found

1. **MAJOR — Neo4j references in UX doc:** DESIGN-ALLURA.md still references Neo4j in multiple places:
   - Line 44: "real data from Allura Brain (PostgreSQL + Neo4j)"
   - Line 146: "Allura Brain / Neo4j semantic layer through controlled API"
   - Health endpoint response examples include `neo4j` dependency status
   - AD-50 sunset Neo4j on 2026-07-17. These references are stale.

2. **MINOR — F-numbering drift between UX and PRD:** DESIGN-ALLURA.md assigns F-numbers (F17–F55) in a way that partially overlaps but doesn't exactly match the BLUEPRINT's numbering. For example, the UX doc's F17 = "Curator Dashboard view pending proposals" while BLUEPRINT F17 = "Tab 1 restricted to admin role". This creates confusion when cross-referencing.

3. **INFO — Runs surface marked "future":** The UX doc lists `/dashboard/runs` as a future surface. F49–F55 are listed as "Planned" with epic references (14/15/16/17) that don't exist as epic files. This is consistent with the Step 2 finding.

### Warnings

1. **WARNING — No wireframes/mockups:** DESIGN-ALLURA.md explicitly states it is NOT a component-level wireframe guide. No wireframe or mockup document exists in the planning artifacts. Visual design is referenced to BLUEPRINT §0 (brand identity) but no detailed UI mockups are available.
2. **WARNING — 3100 legacy cutover:** The UX doc references `localhost:3100` as the legacy dashboard that must pass cutover gates. This is operational debt — the cutover gate is documented but may not have been executed.

### UX Alignment Summary

The UX document (DESIGN-ALLURA.md) is well-aligned with the PRD (BLUEPRINT) and architecture (SOLUTION-ARCHITECTURE). It covers all dashboard surfaces, curator workflows, API references, and governance rules. The primary issues are stale Neo4j references and the absence of wireframes/mockups. The F-numbering drift between UX and PRD is a documentation hygiene issue, not a functional gap.

---

## Step 5: Epic Quality Review

**Epics reviewed:** 13 (Epics 18–28)
**Stories reviewed:** 67 story files in `_bmad/bmm/stories/`

### A. User Value Focus Check

| Epic | Title | User Value? | Verdict |
|------|-------|-------------|---------|
| 18 | RuVector Documentation Sync | No — documentation update only | 🟡 Technical milestone |
| 19 | RuVector Graph Cutover Execution | No — infrastructure migration | 🟡 Technical milestone |
| 20 | Subagent Memory Access | Partial — enables agent memory access | 🟡 Borderline |
| 21 | Retrieval Drift Audit + Curation Scheduling | Partial — improves search quality for operators | 🟡 Borderline |
| 22 | Enterprise Readiness — Multi-Tenant Hardening | Yes — enables multi-business deployment | ✓ Acceptable |
| 23 | Neo4j Sunset Completion | No — cleanup task | 🔴 Technical milestone |
| 24 | Portfolio Readiness | Yes — principal-engineer portfolio proof | ✓ Acceptable |
| 25 | Governed Curator Review Console | Yes — curator reviews/approves insights | ✓ Strong user value |
| 26 | Bumblebee Supply-Chain Intelligence | Yes — security operator sees threats | ✓ Acceptable |
| 27 | Governed Branchable Learning Memory | Partial — experiment-first, no user-facing outcome | 🟡 Experiment, not product |
| 28 | Enterprise Documentation Consolidation | No — documentation consolidation | 🟡 Technical milestone |

**Finding:** 5 of 13 epics are technical milestones (18, 19, 23, 27, 28) rather than user-value-driven epics. This is a structural concern — these should be framed as user outcomes ("operators can verify RuVector readiness") rather than technical tasks ("update docs", "sunset Neo4j").

### B. Epic Independence Validation

| Epic | Depends on | Direction | Verdict |
|------|-----------|-----------|---------|
| 18 | None | — | ✓ Independent |
| 19 | Epic 18 | Backward (18→19) | ✓ Correct |
| 20 | None | — | ✓ Independent |
| 21 | None | — | ✓ Independent |
| 22 | None | — | ✓ Independent |
| 23 | None (post-19) | Backward | ✓ Correct |
| 24 | None | — | ✓ Independent |
| 25 | Epic 24 (implicit) | Backward | ✓ Correct |
| 26 | Epic 24 | Backward | ✓ Correct |
| 27 | Epic 25 | Backward | ✓ Correct |
| 28 | Epics 23, 26, 27 | Backward | ✓ Correct |

**No forward dependencies found.** All epic-level dependencies are backward (depending on earlier epics). This is correct per best practices.

**No within-epic forward dependencies found** at the story level — all story-level "Depends on" references point to earlier or same-epic earlier stories.

### C. Story Quality Assessment

#### Story Sizing

| Epic | Story Count | Avg Size | Assessment |
|------|-------------|----------|------------|
| 18 | 6 stories | ~400 chars each | 🟡 Too small — doc updates, not stories |
| 19 | 5 stories | ~300 chars each | 🟡 Small — infra tasks |
| 20 | 5 stories | ~700 chars each | ✓ Reasonable |
| 21 | 5 stories | ~700 chars each | ✓ Reasonable |
| 22 | 6 stories | ~600 chars each | ✓ Reasonable |
| 23 | 5 stories | ~600 chars each | 🟡 Cleanup tasks, not stories |
| 24 | 10 stories | ~800 chars each | ✓ Well-sized |
| 25 | 5 stories (25.1, 25.2a/b, 25.3a/b) | Variable | ✓ Well-sized |
| 26 | 7 stories | ~1200 chars each | ✓ Well-sized |
| 27 | 6 stories | ~1500 chars each | ✓ Well-sized |
| 28 | 8 stories | ~1100 chars each | ✓ Well-sized |

#### Acceptance Criteria

| Check | Result |
|-------|--------|
| ACs referenced in epic files | **0** — no epic file contains AC-# references |
| Story files with ACs | Need to check individual stories |

**Finding:** Epic files contain zero AC references. ACs live only in individual story files, which is acceptable but means the epic-level view has no acceptance criteria visibility.

#### FR Traceability in Stories

| Check | Result |
|-------|--------|
| Story files with explicit FR references | 1 of 67 (`24-2` references F1–F5) |
| Story files with REQ-* references | 11 of 67 |
| Sprint-status.yaml FR references | 0 |

**Finding:** FR traceability is essentially non-existent at the story level. The REQ-* system has better traceability (11/67 stories) but is still sparse.

### D. Database/Entity Creation Timing

**Not assessed** — this is a brownfield project with established migrations (00–53). Database creation timing is managed through numbered SQL migration files, not per-story table creation. This is appropriate for the project's maturity.

### E. In-Scope/Out-of-Scope Documentation

| Epic | Has In-Scope | Has Out-of-Scope |
|------|-------------|------------------|
| 18 | No | No |
| 19 | No | No |
| 20 | No | No |
| 21 | No | No |
| 22 | No | No |
| 23 | No | No |
| 24 | Yes | Yes |
| 25 | No | No |
| 26 | Yes | No |
| 27 | No | Yes |
| 28 | No | No |

**Finding:** Only 2 of 13 epics have explicit in-scope sections (24, 26). Only 2 have out-of-scope sections (24, 27). Most epics lack explicit scope boundaries, making it hard to determine what is intentionally excluded.

### F. Quality Violations Summary

#### 🔴 Critical Violations

1. **5 technical-milestone epics** (18, 19, 23, 27, 28) deliver no direct user value — they are documentation updates, infrastructure migrations, code cleanup, experiments, and doc consolidation. Per best practices, epics should describe user outcomes.

2. **Zero FR traceability** in epic files — no epic references any FR number. Only 1 of 67 stories references FRs. This means requirements-to-implementation traceability is effectively non-existent for the BLUEPRINT FR system.

#### 🟠 Major Issues

1. **F56 numbering collision** — two different requirements share F56 in BLUEPRINT vs REQ-MATRIX.
2. **Neo4j documentation drift** — BLUEPRINT F33/F34, B4, diagrams, BLUEPRINT §12 invariant #4, and DESIGN-ALLURA.md still reference Neo4j as the semantic store. AD-50 sunset it 2026-07-17.
3. **Phantom epic references** — F49–F55 reference Epics 14–17 which don't exist in the planning directory. These appear to be old epic numbers that were renumbered.
4. **Missing in-scope/out-of-scope** in 11 of 13 epics — scope boundaries are unclear.
5. **Stale `epics.md` master index** — contradicts sprint-status.yaml on every active epic.

#### 🟡 Minor Concerns

1. Stories in Epics 18, 19, 23 are very small (doc updates, infra tasks) — better tracked as tasks than stories.
2. F-numbering drift between DESIGN-ALLURA.md and BLUEPRINT.md for the same FR numbers.
3. No wireframes/mockups exist for the Memory Command Center UX.
4. `docs/allura-hosted/` contains 16 unbannered superseded docs — no `[!CAUTION] Not current` banners.
5. Two B-numbering systems in REQ-MATRIX (BLUEPRINT B1–B7 vs legacy pipeline B1–B7) create confusion.

---

## Step 6: Final Assessment — Summary and Recommendations

### Overall Readiness Status

## ⚠️ NEEDS WORK

The project has a strong architectural foundation, comprehensive requirements (56 FRs, 20 NFRs, 32 business requirements, 50+ REQ-* granular requirements), and a mature delivery track record (Epics 18–28 all complete with retrospectives). However, several critical documentation and traceability issues must be resolved before the planning artifacts can be considered implementation-ready for future work.

### Critical Issues Requiring Immediate Action

| # | Issue | Severity | Impact |
|---|-------|----------|--------|
| 1 | **Unbannered duplicate docs** in `docs/allura-hosted/` (16 files, no deprecation banners) | CRITICAL | Readers may build against superseded architecture |
| 2 | **Zero FR-to-epic traceability** — no epic references any FR number; only 1 of 67 stories references FRs | CRITICAL | Cannot verify requirements coverage; 17 FRs have no planned implementation path |
| 3 | **17 missing FRs** (F21–F25, F43–F46, F49–F55) — no epic, no story, no plan | CRITICAL | 30.4% of functional requirements are unplanned |
| 4 | **Neo4j documentation drift** — BLUEPRINT, REQ-MATRIX, and DESIGN-ALLURA still reference Neo4j as canonical semantic store; AD-50 sunset it 2026-07-17 | MAJOR | Contradicts architecture decisions; misleads implementers |
| 5 | **Stale `epics.md` master index** — shows Epics 25–28 as in-progress/planned; sprint-status says all done | MAJOR | Navigation file contradicts authoritative delivery tracker |
| 6 | **F56 numbering collision** — two different requirements share F56 | MAJOR | Ambiguous requirement reference |
| 7. | **Phantom epic references** — F49–F55 cite Epics 14–17 that don't exist in planning directory | MAJOR | Requirements point to non-existent planning artifacts |
| 8 | **5 technical-milestone epics** (18, 19, 23, 27, 28) lack user-value framing | MINOR | Structural concern; epics should describe user outcomes |

### Recommended Next Steps

1. **Banner or archive `docs/allura-hosted/`** — Add `[!CAUTION] Not current` to all 16 files, or move to `docs/archive/allura-hosted/`. This is the single highest-risk item — a reader landing on the superseded BLUEPRINT first gets wrong architecture.

2. **Fix Neo4j documentation drift** — Update BLUEPRINT F33/F34, B4, diagrams, data model, §12 invariant #4, and DESIGN-ALLURA.md to say PostgreSQL `graph_memories` instead of Neo4j. AD-50 (2026-07-17) is the authority.

3. **Update `epics.md` master index** to match sprint-status.yaml — all Epics 18–28 are done with retrospectives.

4. **Resolve F56 collision** — Renumber one of the two F56 requirements (Bumblebee V1 scope vs Git-safety guardrail).

5. **Create FR-to-epic coverage map** — Add an "FR Coverage" section to each epic file listing which FRs it addresses. This is the most impactful improvement for traceability.

6. **Resolve the 17 missing FRs** — Either create epics for F21–F25 (infrastructure), F43–F46 (MCC features), and F49–F55 (evidence-gated runs + governed AI office), or explicitly mark them as out-of-scope/deferred in the BLUEPRINT.

7. **Resolve phantom epic references** — Either create placeholder epic files for Epics 14–17 (referenced by F49–F55), or update the REQ-MATRIX to reference the correct current epic numbers.

8. **Add in-scope/out-of-scope sections** to the 11 epics that lack them — scope boundaries prevent scope creep and clarify what is intentionally excluded.

### What's Working Well

- **No forward dependencies** — all epic and story dependencies are backward. This is correct and rare.
- **REQ-* granular requirements** are well-traced to epics (REQ-BMB → 26, REQ-CUR → 25, REQ-RV → 18/19, REQ-DASH → 25).
- **Retrospective discipline** — every completed epic has an accepted retrospective with action items.
- **Authority map** in BLUEPRINT §12 prevents unauthorized doc creation.
- **Cutover gates** in DESIGN-ALLURA.md prevent premature dashboard replacement.
- **Sprint-status.yaml** is the authoritative delivery tracker and is kept current.

### Final Note

This assessment identified **8 issues** across **4 categories** (documentation drift, traceability gaps, missing coverage, structural concerns). The project has delivered 11 epics (18–28) successfully, but the planning artifacts have accumulated drift: Neo4j references that contradict AD-50, a stale epic index, unbannered duplicate docs, and no FR-to-epic traceability. The most impactful fix is adding FR coverage maps to epics — this would close the traceability gap and surface the 17 unplanned FRs for explicit decision. Address the critical issues (1–3) before starting new implementation work; the major issues (4–7) should be addressed in the next sprint planning cycle.

---

**Report generated:** 2026-08-29
**Report location:** `_bmad/bmm/planning/implementation-readiness-report-2026-08-29.md`
**Assessor:** Brooks
