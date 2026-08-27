# Requirements Matrix: Allura vs Competition

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, schemas, and team consensus.

---

## Executive Summary

**Current architecture authority:** PostgreSQL-only under AD-50; the Epic 25 initial route is `/dashboard/curator` under AD-57. Legacy dual-database, Neo4j-tool, broad-dashboard, benchmark, and consumer-UX claims below are historical/reconciliation debt unless a requirement is explicitly reintroduced in Section 6E. They are not implementation authority for new work.

mem0 has solved **distribution** (easy SDK, 6 deployment options, 50k+ GitHub stars). Allura solves **trust**.

**The Problem mem0 Has Not Solved:**

After 32 days in production with 10,134 stored memories, mem0 systems experience **97.8% junk rate** (GitHub issue #4573). Junk includes exact-hash duplicates, hallucinated categories, and 668 copies of the same false fact. Harvard research: "indiscriminate memory storage performs worse than using no memory at all."

**The Result:**  
mem0 achieves 49.0% accuracy on LongMemEval benchmark. Competing systems (Zep, Anthropic's own approaches) achieve 63.8%+. The gap isn't a feature issue—it's a data quality issue.

**Allura's Answer:**

Human-in-the-loop curation before facts enter the knowledge graph. Append-only PostgreSQL prevents junk rewrite. Schema-level multi-tenancy prevents cross-tenant data leaks. The trade-off is honest: slower to promote knowledge (requires curator click), but guaranteed trustworthiness.

---

## Competitive Comparison Matrix

### Data Quality

| Aspect | mem0 | Allura |
|--------|------|--------|
| **Storage Approach** | Autonomous scoring → vector storage | Autonomous scoring → PostgreSQL (episodic) → curator gate → pgvector (semantic, Neo4j sunset 2026-07) |
| **Deduplication** | Post-hoc (after storage) | Pre-promotion (before semantic write) |
| **Junk Rate (Production)** | 97.8% after 32 days | 0% (curator blocks junk) |
| **Correction Mechanism** | Edit existing memory | Create new node, link SUPERSEDES, mark old deprecated |
| **Audit Trail** | Limited (post-hoc logs) | Complete (append-only PostgreSQL) |
| **Recovery** | Depends on backup schedule | 30-day soft-delete window (always recoverable) |
| **UX Validation** | Developer-focused | 13-16-18 youth culture framework — benchmarked: **0.881** (exceeds 0.85 target) |

### Benchmarks

| System | Score | Method |
|--------|-------|--------|
| mem0 (vector-only) | 49.0% | Cosine similarity |
| Zep (with retrieval) | 63.8% | Graph + vector |
| Anthropic (dual-DB) | 68.5% | Semantic + episodic |
| **Allura (benchmarked)** | 0.867 P@5 / 0.933 R@5 / 0.833 MRR | PostgreSQL + pgvector + Retrieval Gateway (Neo4j sunset 2026-07) |

Allura's benchmark results (2026-05-01):
- **Precision@5:** 0.867 — 87% of top-5 results are relevant
- **Recall@5:** 0.933 — 93% of relevant memories found in top-5
- **MRR:** 0.833 — first relevant result ranks ~1.2 on average
- **Cross-group isolation:** 100% — zero cross-tenant data leaks across all test scenarios
- **UX benchmark (13-16-18 framework):** 0.881 — exceeds 0.85 target

**Reason for gap:** mem0's vector-only approach does not handle structural queries ("What entities has this user mentioned?"). Allura's dual-database design with retrieval gateway allows semantic graph queries + episodic full-text search with typed contract enforcement.

### Architecture

| Layer | mem0 | Allura |
|-------|------|--------|
| **Write** | Autonomous scoring (LLM-based) → vector embedding → storage | Autonomous scoring → PostgreSQL (episodic) |
| **Promotion** | N/A (no secondary layer) | Curator approval → pgvector semantic store (Neo4j sunset 2026-07) |
| **Versioning** | Edit-in-place | SUPERSEDES relationships (immutable history) |
| **Multi-Tenancy** | Application-layer row filtering | Schema-level CHECK constraints |
| **Compliance** | Audit logs (stored post-facto) | Append-only traces (governance by design) |

### Deployment

| Aspect | mem0 | Allura |
|--------|------|--------|
| **Hosting** | SaaS only | Self-hosted (Docker Compose, K8s, bare metal) |
| **Cost** | $50–300/user/month | Your infrastructure |
| **Data Residency** | mem0's servers | Your servers (BYOK encryption) |
| **Lock-in** | Complete (data in mem0's SaaS) | None (data is yours) |
| **SOC 2 Compliance** | mem0 certified | Enforced by schema design |

---

## Use Case Fit Analysis

### Enterprise: Loan Underwriting

**mem0 Risk:**
- 97.8% junk rate means loan officer queries return hallucinated borrower history
- Regulatory audit demands explanation of every decision
- mem0's edit-in-place history makes attribution impossible

**Allura Solution:**
- Curator approves high-confidence borrower facts before semantic write
- PostgreSQL append-only traces satisfy "why did the system know this?"
- SUPERSEDES relationships show entire version history
- Schema-level group_id prevents borrower data cross-contamination

**Outcome:** Allura fits; mem0 does not (unless heavily filtered upstream).

### Enterprise: HACCP Food Safety

**mem0 Risk:**
- Hazard pattern junk could lead to incorrect corrective actions
- CSV audit export required by regulators; can't justify "where did this come from?"
- No way to prove "this memory is stale"

**Allura Solution:**
- Append-only episodic layer is the audit trail
- Curator approval + deprecation flags satisfy regulatory questions
- CSV export includes full provenance (event_type, created_at, curator_id)

**Outcome:** Allura; mem0 requires significant post-processing to be compliant.

### Consumer: Developer Session Memory

**mem0 Fit:**
- Autonomous approach is "set and forget"
- 97.8% junk acceptable for low-stakes use case (IDE preferences, project notes)
- Performance advantage (49% vs 63%) irrelevant if user doesn't verify results

**Allura Fit:**
- Optional curator workflow (user opens memory viewer, swipe-to-promote)
- Still get the safety of append-only episodic layer
- User controls what becomes permanent

**Outcome:** Both viable; Allura offers more control, mem0 offers less friction.

---

## Decision Matrix

### Use mem0 if:
- [ ] User is a consumer/developer (low-stakes use case)
- [ ] You don't need compliance audit trails
- [ ] Performance > correctness (you'll accept 49% accuracy)
- [ ] You can pre-filter junk upstream (expensive)
- [ ] You want the simplest possible API

### Use Allura if:
- [ ] You're enterprise (regulated industry)
- [ ] Audit trail is non-negotiable
- [ ] You can tolerate curator latency
- [ ] You need correctness > raw speed
- [ ] You want data ownership
- [ ] You need schema-level multi-tenancy
- [ ] Compliance (SOC 2, HIPAA, PCI) is required

---

## Key Research Findings

**97.8% Junk Rate Root Cause:**

mem0's issue is **false confidence**. The scoring function returns 0.85+ for:
- "formal communication style" (hallucination)
- "software developer at Google" (copied 668 times)
- Exact-hash duplicates of single hallucinations

**The Solution:**

**Curator gate at the 0.85+ threshold:**

```
Scoring: 0.92 (high confidence)
  ↓
Routed to: Pending Review (SOC2 mode)
  ↓
Human curator sees: "Sabir uses Bun, not npm"
Curator verifies: ✓ Yes, this is from the conversation
Curator approves → Neo4j write
```

**This prevents:**
- Hallucinations entering the semantic layer
- Duplicates from multiplying
- Junk from being "learned" across future sessions

**Cost:** 30-50ms human latency per fact. **Benefit:** 100% junk elimination.

---

## References

- **mem0 Issue #4573** — Data quality degradation in production  
  https://github.com/mem0ai/mem0/issues/4573

- **Harvard Research: Memory Systems Trade-offs**  
  "Indiscriminate memory storage performs worse than using no memory at all" (2024)

- **LongMemEval Benchmark**  
  https://arxiv.org/abs/2407.02490

- **Allura Architecture**  
  See [.github/ARCHITECTURE.md](../../.github/ARCHITECTURE.md)

---

## Governed Memory Pipeline — Business → Functional Traceability

This section traces the governed memory pipeline requirements from business goals through functional behaviors to concrete satisfaction evidence. See [BLUEPRINT.md](./BLUEPRINT.md) and [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) for the full implementation design and the E2E readiness table in [BLUEPRINT.md §2](./BLUEPRINT.md#e2e-readiness-status-as-of-2026-06-14) for the acceptance gate status.

> **Note on B# numbering:** Section 0 below maps the BLUEPRINT's original B1–B7 (core API/infra requirements). Section 1 uses a legacy pipeline-level B1–B7 inherited from the pre-2026-04-19 matrix; these correspond to BLUEPRINT B23–B29. Both numbering systems are preserved for traceability; when a B# appears in both sections, the BLUEPRINT canonical definition takes precedence.

### Section 0: Core API and Infrastructure Requirements (BLUEPRINT B1–B7)

| ID | Business Requirement (BLUEPRINT) | Functional Requirements | Satisfied by |
|----|----------------------------------|------------------------|--------------|
| B1 | Developers integrate Allura with a 5-tool API matching mem0's UX | F1–F5 | `memory_add`, `memory_search`, `memory_get`, `memory_list`, `memory_delete` via MCP tools · AD-05 |
| B2 | All memory is isolated by tenant (`group_id`) at the schema level | F8 | PostgreSQL CHECK constraint `group_id ~ '^allura-'` · AD-06 · [BLUEPRINT.md](./BLUEPRINT.md#7-global-constraints) |
| B3 | Every write produces an immutable audit record in PostgreSQL | F1, F26, F27 | Append-only `events` table · `insertEvent()` · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-events) |
| B4 | Promoted knowledge is versioned and never mutated in Neo4j | F9, F33, F34 | `SUPERSEDES` relationship pattern · AD-02 · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#neo4j-relationships) |
| B5 | The system is deployable via a single `docker compose up` command for core infra and app services | F21, F56 | `docker-compose.yml` · AD-45 (Port Allocation Policy) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#81-deployment-scenarios) |
| B6 | Agents connect via MCP (Model Context Protocol) through Team RAM-selected packaged MCP servers | F20 | `neo4j-memory`, `database-server`, `neo4j-cypher` packaged MCP servers · AD-23 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-1-agent-memory-recall-primary-path) |
| B7 | Operators choose between human-gated (SOC2) and auto-promotion modes | F6, F7 | `PROMOTION_MODE` env var · AD-04 · [BLUEPRINT.md](./BLUEPRINT.md#6-execution-rules) |

### Section 1: Business Requirements → Functional Requirements

| ID | Business Requirement | Functional Requirements | Use Cases |
|----|----------------------|------------------------|-----------|
| B1 | Agents must persist all task activity as append-only raw traces so execution history is auditable and recoverable. | [F1](#f1), [F2](#f2), [F3](#f3), [F16](#f16) | MEM-UC1, MEM-UC2, MEM-UC9 |
| B2 | A curator process must turn raw traces into proposed insights with explicit evidence and confidence, without promoting them directly to active knowledge. | [F4](#f4), [F5](#f5) | MEM-UC3 |
| B3 | No insight may become active knowledge until it is approved by a human or policy-controlled approval flow, and that approval must be auditable. | [F6](#f6), [F7](#f7) | MEM-UC4 |
| B4 | Approved insights must be stored in Neo4j as immutable, versioned knowledge records with relationships such as `SUPERSEDES`, `DEPRECATED`, and `REVERTED`. | [F8](#f8), [F9](#f9) | MEM-UC5 |
| B5 | Agents must retrieve approved knowledge through a controlled retrieval layer that supports semantic and structured queries with project and global scope. | [F10](#f10), [F11](#f11) | MEM-UC6 |
| B6 | All reads and writes must pass through controlled APIs that enforce project-level access, agent permissions, and audit logging. | [F12](#f12), [F13](#f13) | MEM-UC7 |
| B7 | The full loop from agent execution to later knowledge reuse must be demonstrably end-to-end and reversible. | [F14](#f14), [F15](#f15) | MEM-UC8 |
| B8 | Consumer memory viewer: no sidebar, search dominant, swipe to forget | F5, F22 | — |
| B9 | Every memory shows provenance: "from conversation" or "added manually" | F3 | — |
| B10 | Memory usage indicator: "used N times this week" on expand | — | — |
| B11 | Undo: recently forgotten memories recoverable within 30 days | F5, `memory_restore` | — |
| B24 | A curator process must turn raw traces into proposed insights without promoting them directly | F4, F5, F29, F30 | MEM-UC3 |
| B25 | No insight may become active knowledge until approved by a human or policy-controlled flow | F6, F7, F31 | MEM-UC4 |
| B26 | Approved insights must be stored in Neo4j as immutable, versioned knowledge records | F8, F9, F33, F34 | MEM-UC5 |
| B27 | Agents must retrieve approved knowledge through a controlled retrieval layer | F10, F11, F35, F36 | MEM-UC6 |
| B28 | All reads/writes must pass through controlled APIs with project-level access and audit | F12, F13, F37, F38 | MEM-UC7 |
| B29 | The full loop from agent execution to knowledge reuse must be demonstrably end-to-end | F14, F15, F39, F40 | MEM-UC8 |
| B30 | Team RAM agents must integrate with BMAD planning and Allura Brain memory through a documented workflow, preserving `.opencode/agent/` as the live agent source of truth | F41, F42 | MEM-UC10 |
| B31 | Teams must define evidence-gated orchestration runs without exposing internal agent-routing details. | F49, F50, F51, F52 | MEM-UC13 |

### Section 2: Functional Requirements Detail

#### Trace Ingestion (F1–F3)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f1"></a>F1 | The system must persist agent task lifecycle events, tool calls, outputs, retries, and terminal status into a raw trace store. | `insertEvent()` · `src/lib/postgres/queries/insert-trace.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f2"></a>F2 | Raw trace storage must be append-only and must not overwrite prior events in place. | Append-only write policy · `events` table schema · `00-traces.sql` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |
| <a name="f3"></a>F3 | Raw traces must preserve provenance sufficient to link downstream insights back to source evidence. | `trace_ref` field on proposals · `evidence_refs` in promotion metadata · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) |

#### Curator Pipeline (F4–F5)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f4"></a>F4 | A curator service must read raw traces and generate proposed insights rather than active insights. | `src/curator/index.ts` · `curatorScore()` · `canonical_proposals` table · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f5"></a>F5 | Each proposed insight must include summary, evidence links, confidence score, timestamp, and status. | Proposal schema · `score`, `reasoning`, `tier`, `trace_ref` fields · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) |

#### Approval and Governance (F6–F7)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f6"></a>F6 | Proposed insights must enter an approval flow before they can become active. | `POST /api/curator/approve` · `status: pending` gate · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f7"></a>F7 | Every approval, rejection, or policy-based decision must be recorded as an audit event. | `proposal_approved` / `proposal_rejected` event types · witness hash · [BLUEPRINT.md](./BLUEPRINT.md) |

#### Knowledge Graph Versioning (F8–F9)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f8"></a>F8 | Approved insights must be written to Neo4j as immutable nodes and must never be updated in place. | `createInsight()` · `src/lib/neo4j/queries/insert-insight.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f9"></a>F9 | When an insight changes, the system must create a new insight node linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED`. | `createInsightVersion()` · `deprecateInsight()` · `revertInsightVersion()` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

#### Retrieval Layer (F10–F11)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f10"></a>F10 | Agents must retrieve knowledge through a retrieval service rather than by directly querying PostgreSQL or Neo4j. | `POST /api/memory/retrieval` · `src/lib/memory/retrieval-layer.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f11"></a>F11 | The retrieval service must support semantic and structured queries and return scoped context from approved insights, with optional raw-trace access. | `searchInsights()` · `getDualContextSemanticMemory()` · `queryTraces()` · [BLUEPRINT.md](./BLUEPRINT.md) |

#### Policy and Access Control (F12–F13)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f12"></a>F12 | All knowledge-system reads and writes must pass through controlled endpoints that enforce project-level access. | `requireRole()` · `validateGroupId()` · RBAC middleware · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) |
| <a name="f13"></a>F13 | The system must enforce agent permissions and audit all access to trace and knowledge resources. | Auth middleware · audit event logging · [BLUEPRINT.md](./BLUEPRINT.md#9-logging--audit) |

#### End-to-End Validation (F14–F16)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f14"></a>F14 | A second agent must be able to retrieve approved knowledge as context and use it in a later task correctly. | Retrieval endpoint · validation gate scenario MEM-UC8 · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#e2e-readiness-status-as-of-2026-06-14) |
| <a name="f15"></a>F15 | The full lifecycle from trace capture to knowledge reuse must be traceable, auditable, and reversible. | Evidence chain: trace → proposal → approval → Neo4j → retrieval · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#e2e-readiness-status-as-of-2026-06-14) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |
| <a name="f16"></a>F16 | The graph must include Agent, Team, and Project structural context nodes with relationships enabling traversal queries by ownership, project scope, and delegation path. | `scripts/neo4j-seed-agents.cypher` · [BLUEPRINT.md](./BLUEPRINT.md#5-data-model) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#neo4j-agent) |

### Section 3: Curator API/CLI (F17–F19)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f17"></a>F17 | Curator API restricted to authenticated users with `admin` role (engineers only) | `src/app/api/curator/` · RBAC middleware · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| <a name="f18"></a>F18 | Audit log endpoint: `GET /api/audit/events` — returns curator decisions with timestamps | `src/app/api/audit/events/` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f19"></a>F19 | API integrates RBAC (curator, admin, viewer roles) | Auth provider · `src/lib/auth/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |

### Section 4: Infrastructure (F20–F25)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f20"></a>F20 | Skills route agent work to packaged MCP servers (`neo4j-memory`, `database-server`, optional `neo4j-cypher`) rather than a custom all-in-one MCP runtime | `.opencode/skills/allura-memory-skill/` · `.opencode/skills/mcp-docker-memory-system/` · AD-23 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-1-agent-memory-recall-primary-path) |
| <a name="f21"></a>F21 | `docker compose up` starts core infra and app services; packaged MCP servers are attached as focused external capabilities | `docker-compose.yml` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#81-deployment-scenarios) |
| <a name="f22"></a>F22 | Memory API at `/api/memory` lists, searches, and retrieves memories | `src/app/api/memory/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#api-philosophy) |
| <a name="f23"></a>F23 | MCP HTTP gateway exposes backend engine via `CURATOR_ENGINE_URL` env var | `src/mcp/http-gateway.ts` · Docker deployment config · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#4-interface-catalogue) |
| <a name="f24"></a>F24 | API routes call Docker engine in VPC/cloud via HTTPS | `src/app/api/` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#4-interface-catalogue) |
| <a name="f25"></a>F25 | Error tracking: unhandled exceptions sent to Sentry; operator notified via email/Slack | `src/lib/observability/sentry.ts` · [BLUEPRINT.md](./BLUEPRINT.md#3-architecture) |
| <a name="f56"></a>F56 | Git-safety guardrail (GIT-EXEC-001): all `git` subprocesses spawned by the harness or Ralph must have `GIT_DIR` constrained to the project root; Ralph refuses to run if `cwd` is not under the expected project root | `scripts/git-exec-guard.ts` · `.ralph/ralph-loop.state.json` cwd check · AD-44 · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

### Section 5: Governed Memory Pipeline (F26–F40)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f26"></a>F26 | Agent task lifecycle events, tool calls, outputs, retries, and terminal status are persisted as append-only traces | `insertEvent()` · `src/lib/postgres/queries/insert-trace.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f27"></a>F27 | Raw trace storage is append-only; no UPDATE or DELETE on the `events` table | Append-only write policy · `events` table schema · `00-traces.sql` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f28"></a>F28 | Raw traces preserve provenance linking downstream insights back to source evidence | `trace_ref` field on proposals · `evidence_refs` in promotion metadata · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| <a name="f29"></a>F29 | Curator reads raw traces and generates proposed insights (not active insights) | `src/curator/index.ts` · `curatorScore()` · `canonical_proposals` table · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f30"></a>F30 | Each proposed insight includes summary, evidence links, confidence score, timestamp, and status | Proposal schema · `score`, `reasoning`, `tier`, `trace_ref` fields · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| <a name="f31"></a>F31 | Proposed insights enter an approval flow before becoming active knowledge | `POST /api/curator/approve` · `status: pending` gate · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f32"></a>F32 | Every approval, rejection, or policy decision is recorded as an audit event with actor and timestamp | `proposal_approved` / `proposal_rejected` event types · witness hash · `src/lib/memory/approval-audit.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f33"></a>F33 | Approved insights are written to Neo4j as immutable nodes; no in-place updates | `createInsight()` · `src/lib/neo4j/queries/insert-insight.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f34"></a>F34 | Changed insights create new nodes linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED` relationships | `createInsightVersion()` · `deprecateInsight()` · `revertInsightVersion()` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f35"></a>F35 | Agents retrieve knowledge through a controlled retrieval service, not by querying databases directly | `POST /api/memory/retrieval` · `src/lib/memory/retrieval-layer.ts` · AD-19 · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f36"></a>F36 | Retrieval supports semantic and structured queries with project and global scope | `searchInsights()` · `getDualContextSemanticMemory()` · `queryTraces()` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f37"></a>F37 | All knowledge-system reads/writes pass through controlled endpoints enforcing project-level access | `requireRole()` · `validateGroupId()` · RBAC middleware · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#6-key-architectural-constraints) |
| <a name="f38"></a>F38 | Agent permissions enforced and all access to trace/knowledge resources is audited | Auth middleware · audit event logging · [BLUEPRINT.md](./BLUEPRINT.md#9-logging--audit) |
| <a name="f39"></a>F39 | A second agent can retrieve approved knowledge and use it correctly in a later task | Retrieval endpoint · validation gate scenario MEM-UC8 · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#e2e-readiness-status-as-of-2026-06-14) |
| <a name="f40"></a>F40 | The full lifecycle from trace capture to knowledge reuse is traceable, auditable, and reversible | Evidence chain: trace → proposal → approval → Neo4j → retrieval · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#e2e-readiness-status-as-of-2026-06-14) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

### Section 5A: Evidence-Gated Run Records (F49–F52)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f49"></a>F49 | A governed run must capture a neutral `RunRecord` with tenant scope, owner, reviewer, goal, status, pinned definition ID/revision, journal path, and timestamps. | Partial: `src/lib/process-engine/` · AD-35 · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#runrecord-ad-35) |
| <a name="f50"></a>F50 | Run policy must declare allowed actions, approval breakpoints, measured quality gates, bounded attempts, and evidence required before Done. | Partial: gates/checkpoints exist; bounded quality convergence remains Epic 14 · AD-35/AD-41 |
| <a name="f51"></a>F51 | Run journals must record plan, steps, checks, approvals, failures, final evidence, memory writeback candidates, and enough state to continue without repeating completed side effects. | Partial: append-only events and replay exist; true continuation remains Story 12.2 correction |
| <a name="f52"></a>F52 | Doctor checks must report failed, stale, incomplete, definition-drifted, unrecoverable, or approval-blocked runs before work is marked complete. | Not implemented: Epic 14.3 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-7-governed-run-layer) |

### Section 5B: Governed AI Office (F53-F55)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f53"></a>F53 | Native projects and work items must use PostgreSQL operational state, audited transitions, dependencies, and links to runs, handoffs, evidence packets, and memory receipts. | Planned: Epic 15 · AD-41 |
| <a name="f54"></a>F54 | The operator workspace must provide mission-first navigation, Command Center behavior, a central work surface, and a right evidence/context inspector backed by live contracts. | Planned: Epic 16 · AD-31/AD-41 |
| <a name="f55"></a>F55 | Allura must ship one governed desktop shell with secure connection profiles, runtime supervision, updates, deep links, offline/read-only behavior, and reconnect recovery. | Planned: Epic 17 · AD-41 |

### Section 6: Admin Requirements (B12–B23)

| ID | Business Requirement | Functional Requirements | Use Cases | Satisfied by |
|----|----------------------|------------------------|-----------|--------------|
| B12 | Enterprise admin view: tenant overview, SOC2 pending queue, audit log via API | F17, F18, F19 | MEM-UC7 | `src/app/api/curator/` · `src/app/api/audit/events/` · RBAC · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B13 | Audit log exportable as CSV for compliance | F18 | MEM-UC7 | `/api/audit/events` CSV download · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B14 | TypeScript SDK (`@allura/sdk`) | F1–F5 | — | MCP tools are the SDK · AD-05 · 5-tool API surface |
| B15 | BYOK encryption | — | — | Planned · RK-04 |
| B16 | Curator CLI: three-state approval workflow (Traces, Approved, Pending) | F14, F17, F19 | MEM-UC4 | `src/app/api/curator/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B17 | Curator sees confidence scores (60-100%) with one-sentence reasoning for uncertain proposals | F10 | MEM-UC3 | `curatorScore()` · `canonical_proposals.tier` · [BLUEPRINT.md](./BLUEPRINT.md) |
| B18 | Approve/reject decisions logged to audit trail with curator ID and timestamp | F7, F32 | MEM-UC4 | `src/lib/memory/approval-audit.ts` · witness hash · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| B19 | Auto-promote proposals >85% confidence without curator review (configurable) | F6, F7 | MEM-UC4 | `AUTO_APPROVAL_THRESHOLD` env var · `PROMOTION_MODE=auto` · [BLUEPRINT.md](./BLUEPRINT.md#6-execution-rules) |
| B20 | MCP HTTP gateway deployable via Docker; backend engine in user's VPC/cloud | F23, F24 | — | Docker deployment config · `CURATOR_ENGINE_URL` env var · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#81-deployment-scenarios) |
| B21 | Authentication via API keys and RBAC (curator, admin, viewer roles) | F19 | MEM-UC7 | Auth provider · `src/lib/auth/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B22 | Error tracking via Sentry; operator alerted on engine failures | F25 | — | `src/lib/observability/sentry.ts` · `captureException` in curator approve route |
| B23 | Agents must persist all task activity as append-only raw traces for auditability | F1, F2, F3, F26, F27 | MEM-UC1, MEM-UC2 | `insertEvent()` · `events` table · [BLUEPRINT.md](./BLUEPRINT.md) |

### Section 6A: RuVix Governance Requirements (REQ-GOV-001–REQ-GOV-002)

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-GOV-001 | Admin rule visibility — display active control plane rules with status, threshold, and audit trail | `RUVIX_CONTROL_PLANE_CONTRACT_v1`, AD-XX, B12 / F17–F19 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-1-ruvix-control plane-governance-contract) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx-ruvix-control plane-contract) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| REQ-GOV-002 | Admin rule configuration — toggle promotion mode, set threshold, view audit log | `PROMOTION_MODE`, `AUTO_APPROVAL_THRESHOLD`, audit events, B12 / F17–F19 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-1-ruvix-control plane-governance-contract) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |

### Section 6A.1: Carlos/RuVector/RuVix Readiness Requirements (REQ-GOV-003–REQ-GOV-009)

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-GOV-003 | Team RAM lanes must perform Brain pre-search before implementation or documentation mutation. | B23, F26-F40 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#memory-lifecycle-and-done-gate) · [BLUEPRINT.md](./BLUEPRINT.md#engine-boundary-and-ruvectorruvix-posture) |
| REQ-GOV-004 | Substantive work must write a raw receipt with actor, evidence, validation, and audit reference. | B3, B18, F32 | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory-command-center-adapter-contracts) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#memory-lifecycle-and-done-gate) |
| REQ-GOV-005 | RuVix gates must return `Permit`, `Defer`, or `Deny` and include `gate_reason`. | AD-XX, RULE-010 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-1-ruvix-control plane-governance-contract) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) |
| REQ-GOV-006 | Runtime readiness labeling must say `pgvector bridge` until RuVector extension/functions and search/feedback health are proven. | AD-32, RK-21 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-0-current-ruvector-readiness-boundary) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-32-current-runtime-label-is-pgvector-bridge) |

### Section 6A.2: Agent Factory CI Requirements

| ID | Requirement | Satisfied by |
| --- | --- | --- |
| REQ-AF-CI-001 | Factory modules and workflows must be tracked in the canonical `Allura_Memory` repository. | `factory/` · `.github/workflows/factory-ci.yml` · AD-43 |
| REQ-AF-CI-002 | Every module must pass YAML, roster, tenant, BMad dependency, and Allura governance validation. | `factory/validate.sh` · `.github/workflows/factory-ci.yml` |
| REQ-AF-CI-003 | CI must prove PostgreSQL-first writes, own-tenant retrieval, and cross-tenant isolation against live PostgreSQL and Neo4j. | `scripts/factory-cross-team-smoke.ts` · `.github/workflows/factory-cross-team-smoke.yml` · RK-31 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3401-agent-factory-ci-topology) |
| REQ-AF-CI-004 | CI must preserve the `pgvector bridge` label and block native/upstream claims while required artifacts are absent. | `scripts/check-ruvector-readiness.ts` · `.github/workflows/ruvector-readiness.yml` · AD-32 · RK-21 |
| REQ-AF-CI-005 | Packaging must require an explicit validated team and produce a commit-addressed artifact. | `.github/workflows/factory-ci.yml` |
| REQ-GOV-007 | Dashboard and operator surfaces must consume API/MCP contracts only and must not write directly to PostgreSQL, Neo4j, or vector substrate. | AD-31, F37, F38 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#important-constraints) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-6-api-first-architecture-and-memory-command-center) |
| REQ-GOV-008 | Runtime/database/MCP/cron/live hook/RuVix enforcement/semantic promotion/Notion sync/Done status changes require explicit approval and `approval_required=true`. The `approval_ref` must be a well-formed UUID (canonical governed approval identity), and the gate emits `approval_required=true`, the gate decision, and the resolved `approval_ref` into the audit context. Resolution against the canonical approval store is the approval-lifecycle layer's responsibility. | AD-33 | `src/control-plane/syscalls.ts` `executeSyscall` approval gate · `src/lib/governance/policies.ts` `pol-007` · `src/mcp/audit-tools.ts` `audit_invariant_check` · `src/mcp/governance-tools.ts` `evaluateInvariants` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-33-approval-boundaries-for-engine-mutations) |
| REQ-GOV-009 | Planned RAM/Durham hook wrappers are governed support surfaces, not live enforcement until separately approved. | AD-33, RK-24 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-1-ruvix-control plane-governance-contract) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#risk-detail) |

### Section 6B: RuVix Brand Governance Requirements (REQ-DURHAM-001–REQ-DURHAM-005)

> **Note:** These requirements are active for the optional Memory Command Center and supporting terminal/API documentation. The engine remains MCP/API-first; the dashboard is a governed operator surface, not a bypass around policy.

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-DURHAM-001 | Token exclusivity — dashboard and terminal output use approved Allura/Durham tokens and real logo assets only; generated logo-like marks are forbidden | BRAND-001 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#durhamtokenaudit) |
| REQ-DURHAM-002 | Mission-control voice — dashboard and CLI copy are audited against unsupported certainty, marketing fluff, and unrelated project voice patterns | BRAND-002 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| REQ-DURHAM-003 | Evidence-gated completion — every dashboard or CLI feature PR includes tests, documentation, source receipts, and anti-drift audit | BRAND-003 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#dashboardclaim) |
| REQ-DURHAM-004 | Accessibility AA compliance — dashboard controls and terminal output are keyboard reachable, screen-reader readable, and high-contrast safe | BRAND-004 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-2-brand-governance-layer) |
| REQ-DURHAM-005 | Component consistency — reuse approved Allura/Durham UI and output patterns; ship only after Durham gate passes | BRAND-005, BRAND-006 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#durhamgateevent) |

### Section 6C: RuVector Graph Cutover Requirements (REQ-RV-001–REQ-RV-005)

> **Note:** These requirements trace the RuVector graph backend cutover story (AD-49). They govern the transition from Neo4j legacy backend to PostgreSQL-backed RuVector graph adapter. Completion gates ensure live-DB E2E and dual-read validation pass before full cutover.

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-RV-001 | IGraphAdapter seam must back all graph operations; no direct Neo4j/PG graph calls outside the adapter | AD-29, AD-49, RK-32 | `src/lib/graph-adapter/types.ts` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-0-2-graph-backend-cutover-path) |
| REQ-RV-002 | GRAPH_BACKEND flag must default to `neo4j` until live-DB E2E passes with `ruvector` | AD-49 | `src/lib/graph-adapter/factory.ts` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-49-ruvector-graph-cutover) |
| REQ-RV-003 | Parity test (`adapter-parity.test.ts`) must pass 14/14 before any cutover | AD-29 | `src/lib/graph-adapter/__tests__/adapter-parity.test.ts` · AD-29 |
| REQ-RV-004 | Dual-read validation must run for one release cycle before Neo4j goes read-only | AD-49, RK-32 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-0-2-graph-backend-cutover-path) |
| REQ-RV-005 | `runtime_readiness` label may upgrade from `pgvector_bridge` to `ruvector_graph` only after live-DB E2E + dual-read pass; to `full_ruvector` only after native extension activates | AD-49, AD-34, RK-21 | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) |

### Section 6D: Memory Command Center Requirements (REQ-DASH-001–REQ-DASH-009)

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-DASH-001 | Active `group_id` is visible on every dashboard page and included in every memory, curator, governance, graph, audit, and settings request | B2, F12, REQ-GOV-001 | [BLUEPRINT.md](./BLUEPRINT.md#ruvix-governed-memory-command-center) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-v2-condensed-ux-contract) |
| REQ-DASH-002 | Memories page supports search, filtering, detail inspection, provenance drawer, source, confidence, state, actor, and relationship context | B8-B13, F10-F15 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-architecture) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory-command-center-adapter-contracts) |
| REQ-DASH-003 | Curator page supports approve, reject, request evidence, request changes, and rationale capture through governed endpoints only | F6, F7, F31, F32 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx-ruvix-control plane-contract) |
| REQ-DASH-004 | Governance page surfaces RuVix policy mode, thresholds, role separation, tenant isolation, promotion locks, drift warnings, and mutation receipts | REQ-GOV-001, REQ-GOV-002 | `src/app/dashboard/governance/page.tsx` (lists the 6 canonical policies + severity/invariant + governance audit trail; read-only, overrides HITL-gated) · `src/lib/governance/policies.ts` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-4-1-ruvix-control plane-governance-contract) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) |
| REQ-DASH-005 | Audit page provides event filtering, receipt detail, CSV/export packet, and source lineage for compliance review | B13, F18, F32 | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-events) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#audit--health-requirements) |
| REQ-DASH-006 | Graph page renders real Neo4j data only, with source receipts and a fallback list when graph data is degraded or unavailable | F8, F9, F16 | `src/app/dashboard/graph/page.tsx` (placeholder nodes removed; honest empty state) · `src/app/dashboard/knowledge-graph/` · [BLUEPRINT.md](./BLUEPRINT.md#5-data-model) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-architecture) |
| REQ-DASH-007 | Every dashboard panel shows source of truth, freshness, degraded state, and no fabricated healthy/live claims | AD-14, AD-26 | `src/lib/operational-state/sources/header-source.ts` · `src/app/dashboard/overview/page.tsx` (live receipts + bounded Neo4j/Brain health probes) · [docs/design/command-center/DATA-SOURCES.md](../design/command-center/DATA-SOURCES.md) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-6-api-first-architecture-and-memory-command-center) |
| REQ-DASH-008 | Every mutation shows a governance receipt containing intent, actor, source, policy, validation, and audit trail before completion | AD-XX, REQ-GOV-001 | [BLUEPRINT.md](./BLUEPRINT.md#ruvix-governed-memory-command-center) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory-command-center-adapter-contracts) |
| REQ-DASH-009 | A non-coder admin manages team members and roles (admin/curator/viewer) entirely from the dashboard UI; group_id-scoped, soft-remove, append-only audit | AD-48, REQ-GOV-001 | `src/app/dashboard/members/page.tsx` + `members-client.tsx` (add/role/remove UI) · `docker/postgres-init/29-memberships.sql` · `src/lib/membership/repository.ts` · `src/app/api/members/route.ts` · `src/app/api/members/[userId]/route.ts` · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memberships) |

### Section 6E: Governed Curator Review Console (REQ-CUR-001–008)

| ID | Requirement | Trace | Status |
|----|-------------|-------|--------|
| REQ-CUR-001 | The sole initial browser route is `/dashboard/curator`; all rendered navigation targets pass route-smoke validation. | AD-46, AD-57, 25.1, 25.3 | Planned |
| REQ-CUR-002 | Proposal and retrieval scope is durably enforced by server-derived tenant/workspace identity; conflicting caller `group_id` or workspace assertion receives `403`. Migrations 39/40 preserve earlier policy predicates and add restrictive app-role workspace policies; legacy unscoped retained/promotion rows are quarantined. | 24.2, 24.3, 25.2a, 25.2 | Foundation Done (25.2a); downstream read contract dependency-blocked |
| REQ-CUR-003 | Queue/detail responses include a durable queryable evidence-request lifecycle, evidence version, source, freshness, degraded state, and server-derived allowed actions. | 25.2a, 25.2, 25.4, `ReviewItem` | Durable lifecycle foundation Done (25.2a); queue response planned |
| REQ-CUR-004 | A failed, forbidden, stale, degraded, empty, or conflict state is never represented as another state. | 25.3, 25.4 | Planned |
| REQ-CUR-005 | Only approve, reject, and request-evidence decisions exist; all require nonblank rationale and server receipt. | 24.4, 25.2a, 25.5 | Receipt/evidence foundation Done; decision release blocked by 24.4 |
| REQ-CUR-006 | Tenant forgery, role failure, missing rationale, missing evidence, segregation-of-duties, and concurrent decision behavior are live-DB tested. | 24.3, 24.4, 25.2a, 25.6 | Workspace/app-role foundation proven; remaining decision scenarios blocked |
| REQ-CUR-007 | Dialogs, forms, states, and navigation meet keyboard/focus/accessible-name requirements and are route/ARIA tested. | 25.3–25.6 | Planned |
| REQ-CUR-008 | Every story produces commit-bound evidence and has a documented MCP/API/CLI rollback. | AD-57, 25.1–25.6 | Planned |

| REQ-CUR-009 | A governed retrieval plan resolves tenant/workspace, relational facts, explicit entity IDs, role/membership, state, and time constraints before semantic/vector expansion. Semantic results may widen or rank only the authorized candidate set and must report provenance, freshness, and degraded state. | AD-58, 25.2a, 25.2, 25.4 | Relational-first foundation Done (25.2a); console read contract planned |
| REQ-CUR-010 | Relational entity families are embedded only through deterministic, redaction-aware Markdown `SemanticProjection` documents assembled from their meaningful header/detail relationships. Projections retain source references, version, hash, and embedding metadata; relational records remain authoritative and rebuildable. | AD-58, 25.2a | Proposal projection foundation Done (25.2a) |
| REQ-AST-001 | The dashboard assistant, SDK, MCP, and CLI share a typed, server-owned read contract that returns an answer, citations, `RetrievalPlan`, freshness/degraded state, and server-derived allowed actions. | 25.4a | Dependency-blocked |
| REQ-AST-002 | Connector integrations are capability-manifested, deny-by-default adapters. External writes require policy permission, audit, idempotency, and truthful receipt/outbox state; provider SDKs never become the authority plane. | 25.4a, 25.5 | Dependency-blocked |
| REQ-COP-001 | One canonical Allura Agent Skill source is packaged through thin adapters for Microsoft Copilot Cowork, Claude Code, and Codex. Every host consumes the same server-derived scope, RetrievalPlan, evidence, freshness, denial/degraded, human-review, and receipt contracts. | AD-61, 25.4b | Dependency-blocked |
| REQ-COP-002 | Cowork policy intake uses typed MCP elicitation with server revalidation and review-before-save. Skills, forms, widgets, Claude/Codex adapters, and host-visible roles cannot grant permission, choose tenant/workspace scope, persist policy directly, or issue receipts. | AD-61, 25.4b | Dependency-blocked |
| REQ-COP-003 | External research and connector output remains provisional evidence until an explicitly confirmed Allura action records source identity, revision/hash, workspace, classification/redaction, freshness, and audit context. Provider credentials never appear in host clients, skills, manifests, or browser state. | AD-61, 25.4b | Dependency-blocked |
| REQ-ID-001 | Validated Microsoft Entra tenant, user/object, group, and app-role claims map server-side to an internal Allura principal, memberships, allowed workspaces, and roles. Unknown, missing, overage, stale, disabled, audience/issuer-mismatched, and forged identity conditions fail closed without scope leakage. | AD-61, 25.4b | Dependency-blocked |
| REQ-MTG-001 | The vendor-neutral Mortgage Approval Gate demonstrates intake, document/OCR evidence, policy evaluation, required human rationale, atomic decision, and immutable receipt across Cowork, Claude Code, and Codex using sanitized deterministic fixtures. | AD-62, 25.5a | Dependency-blocked |
| REQ-MTG-002 | The mortgage demonstration has no Salesforce dependency and makes no automated underwriting, lending/credit decision, fair-lending, compliance certification, production mortgage, or employer/vendor endorsement claim. | AD-62, 25.5a, 25.6 | Dependency-blocked |
| REQ-MOD-001 | `/dashboard/curator` is a stable shell that receives a server-issued, allow-listed, versioned module registry and renders workflow modules only through approved shared intake/evidence/map/policy/review/receipt components. | AD-63, 25.3b | Dependency-blocked |
| REQ-MOD-002 | Workflow modules may define presentation and typed workflow descriptors but cannot load arbitrary client code, query storage, select scope, map identity, authorize, evaluate policy, mutate state, issue receipts, or redefine standard truth states. | AD-63, 25.3b | Dependency-blocked |
| REQ-MOD-003 | Unknown, duplicate, incompatible, untrusted, capability-missing, disabled, or failed modules fail closed and are independently rollbackable without affecting the shell, other modules, engine, SDK, API, MCP, CLI, or external host adapters. | AD-63, 25.3b, 25.6 | Dependency-blocked |
| REQ-MAP-001 | The 2D Knowledge Map uses one server-owned focused `SubgraphQuery`/`SubgraphResponse` contract. Scope is server-derived; nodes and edges carry evidence or versioned derived-rule references; empty, denied, partial, degraded, and complete are distinct states. | AD-59, 25.2, 25.3 | Dependency-blocked |
| REQ-MAP-002 | Subgraph traversal uses relational authorization first, deterministic ordering, signed opaque continuation bound to scope/query/policy/snapshot, and explicit budgets. Initial 200-node/400-edge/depth-2 limits are safety caps, not scale claims. | AD-59, 25.2, 25.6 | Dependency-blocked |
| REQ-MAP-003 | The map has an adjacent same-data text relationship list and complete keyboard/screen-reader interaction. 3D, if enabled later, is opt-in, flagged, rollbackable, and consumes the identical authorized response. | AD-59, 25.3, 25.3a, 25.6 | Planned |

### Section 6F: Bumblebee V1 Threat Intelligence Requirements (REQ-BMB-001–007)

| ID | Requirement | Trace | Status |
|----|-------------|-------|--------|
| REQ-BMB-001 | Advisory evidence preserves source identity, publisher, source URL, publication/fetch times, revision/hash, trust state, freshness state, classification/redaction policy, scope, and retention disposition. | 26.1, 26.4, B32, F56, AD-57 | Implemented (`src/lib/threat-ingestion/{osv,npm-audit,github-advisories}-adapter.ts`) |
| REQ-BMB-002 | Only reviewed allowlisted sources and approved internal events may enter the V1 intake path; each source has a documented verification rule. | 26.1, 26.4, AD-57 | Implemented: `src/lib/threat-ingestion/safe-fetch.ts` fixed host allowlist (`ALLOWED_HOSTS`), HTTPS-only, per-request validation |
| REQ-BMB-003 | Failed verification, stale input, schema failure, degraded retrieval, or scope conflict is represented distinctly and cannot become verified exposure evidence. | 26.1, 26.4, AD-57, REQ-DASH-007 | Implemented: each adapter fails closed (drops the advisory) on an unrecognized severity label or malformed response rather than guessing |
| REQ-BMB-004 | Exposure correlation is relationally scoped and deduplicated; an alert cites the authoritative inventory/artifact record and all supporting evidence identities. | 26.1, 26.3, 26.4, AD-57 | Implemented (`threat_alerts`, migration 42; `UNIQUE (group_id, workspace_id, dedup_key)`) |
| REQ-BMB-005 | Automatic V1 outputs are limited to a deduplicated alert and simulated mitigation proposal from verified evidence. | 26.1, 26.4, F56, AD-57 | Implemented for given advisories (`src/lib/threat-discovery/worker.ts`); external advisory fetching remains a separate follow-up |
| REQ-BMB-006 | V1 cannot scan endpoints, activate policy, block CI/packages, change schedules, revoke credentials, lock a workspace, or perform containment. | 26.1, 26.4, F56, AD-57 | Implemented by construction: `src/lib/threat-discovery/worker.ts` has no code path to any of these actions |
| REQ-BMB-007 | Source configuration and mitigation approval remain human-authorized, with actor, role, rationale, validation, evidence identity, and receipt recorded before any later enforcement workflow. | 26.1, AD-57, REQ-GOV-001 | Planned contract |

| REQ-UX-001 | Primary dashboard copy targets about a sixth-grade reading level: short sentences, common words, one idea at a time. Technical IDs and policy terms remain available through secondary labels or progressive disclosure. | `DESIGN.md`, 25.3–25.6 | Planned |
| REQ-UX-002 | Major two-pane desktop layouts target a 38.2% / 61.8% golden-ratio split and stack in logical reading order on smaller screens. | `DESIGN.md`, 25.3, 25.4 | Planned |
| REQ-UX-003 | The Memory Map presents governed lineage as labeled nodes and connections with an equivalent text description. It never fabricates relationships or makes the visual graph the only accessible source. | 25.4, 25.6 | Planned |

### Section 7: Use Case Index

| Use Case | Domain Area | Requirements |
|----------|-------------|-------------|
| MEM-UC1 | Trace Ingestion | Record agent execution trace | F1, F2, F3 |
| MEM-UC2 | Trace Ingestion | Reject non-append trace write | F2 |
| MEM-UC3 | Curation | Curate a proposed insight from traces | F4, F5 |
| MEM-UC4 | Approval | Approve a proposed insight | F6, F7 |
| MEM-UC5 | Knowledge Graph | Promote an approved insight to Neo4j | F8, F9 |
| MEM-UC6 | Retrieval | Retrieve approved knowledge for an agent | F10, F11 |
| MEM-UC7 | Access Control | Enforce access and audit on all reads/writes | F12, F13 |
| MEM-UC8 | E2E Validation | Reuse approved knowledge in a later agent run | F14, F15 |
| MEM-UC9 | Graph Context | Agent context retrieval (traverse from Agent through AUTHORED_BY to Memory) | F16 |
| MEM-UC10 | Curator CLI/API | Admin user authenticates via API key, reviews pending proposals, approves or rejects | F10, F11, F12, F13, F14, F17, F19 |
| MEM-UC11 | Audit Export | Operator exports curator decisions as CSV for compliance | F18 |
| MEM-UC12 | Infrastructure Deploy | Operator runs `docker compose up` and configures packaged MCP servers | F20, F21 |
| MEM-UC13 | Evidence-Gated Run | Team defines a run record, executes through governed skills, reviews evidence, and writes approved outcomes to Brain/Notion | F49, F50, F51, F52 |

---

*This document was compiled from COMPETITIVE-ANALYSIS.md (archived 2026-04-08). Governed pipeline traceability added 2026-04-19. F17–F40 and B12–B23 detail rows added 2026-04-28. Benchmark results updated with actual scores 2026-05-01.*
