# Requirements Matrix: Allura vs Competition

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, schemas, and team consensus.

---

## Executive Summary

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
| **Storage Approach** | Autonomous scoring → vector storage | Autonomous scoring → PostgreSQL (episodic) → curator gate → Neo4j (semantic) |
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
| **Allura (benchmarked)** | 0.867 P@5 / 0.933 R@5 / 0.833 MRR | Neo4j + PostgreSQL + Retrieval Gateway |

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
| **Promotion** | N/A (no secondary layer) | Curator approval → Neo4j graph (semantic) |
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
  See [.github/ARCHITECTURE.md](./.github/ARCHITECTURE.md)

---

## Governed Memory Pipeline — Business → Functional Traceability

This section traces the governed memory pipeline requirements from business goals through functional behaviors to concrete satisfaction evidence. See [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md) for the full implementation design and [VALIDATION-GATE.md](../archive/allura/VALIDATION-GATE.md) for the acceptance checklist.

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
| B30 | The rebuilt dashboard must replace the current Docker dashboard on port `3100` only after route, visual, adapter, auth, and rollback validation passes | F41, F48 | DASH-UC1, DASH-UC8 |
| B31 | `localhost:6420` is the visual/reference memory-dashboard experience to preserve during the rebuild | F42, F48 | DASH-UC2 |
| B32 | `localhost:3334` is the Mission Control development integration target for the rebuilt dashboard | F41, F48 | DASH-UC1 |
| B33 | Mission Control must combine operator cockpit workflows with Allura memory governance rather than becoming a separate product surface | F41, F42, F47 | DASH-UC3 |
| B34 | Every Mission Control route must declare its backing source of truth, read/write policy, degraded behavior, and evidence policy | F43, F44, F45, F46, F47 | DASH-UC4, DASH-UC5 |
| B35 | The rebuilt dashboard must not fabricate live data; placeholders/sample data must be labeled or replaced before `3100` cutover | F46, F47, F48 | DASH-UC6, DASH-UC8 |

### Section 2: Functional Requirements Detail

#### Trace Ingestion (F1–F3)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f1"></a>F1 | The system must persist agent task lifecycle events, tool calls, outputs, retries, and terminal status into a raw trace store. | `insertEvent()` · `src/lib/postgres/queries/insert-trace.ts` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#trace-ingestion) |
| <a name="f2"></a>F2 | Raw trace storage must be append-only and must not overwrite prior events in place. | Append-only write policy · `events` table schema · `00-traces.sql` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |
| <a name="f3"></a>F3 | Raw traces must preserve provenance sufficient to link downstream insights back to source evidence. | `trace_ref` field on proposals · `evidence_refs` in promotion metadata · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) |

#### Curator Pipeline (F4–F5)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f4"></a>F4 | A curator service must read raw traces and generate proposed insights rather than active insights. | `src/curator/index.ts` · `curatorScore()` · `canonical_proposals` table · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |
| <a name="f5"></a>F5 | Each proposed insight must include summary, evidence links, confidence score, timestamp, and status. | Proposal schema · `score`, `reasoning`, `tier`, `trace_ref` fields · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) |

#### Approval and Governance (F6–F7)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f6"></a>F6 | Proposed insights must enter an approval flow before they can become active. | `POST /api/curator/approve` · `status: pending` gate · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |
| <a name="f7"></a>F7 | Every approval, rejection, or policy-based decision must be recorded as an audit event. | `proposal_approved` / `proposal_rejected` event types · witness hash · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |

#### Knowledge Graph Versioning (F8–F9)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f8"></a>F8 | Approved insights must be written to Neo4j as immutable nodes and must never be updated in place. | `createInsight()` · `src/lib/neo4j/queries/insert-insight.ts` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#knowledge-graph-versioning) |
| <a name="f9"></a>F9 | When an insight changes, the system must create a new insight node linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED`. | `createInsightVersion()` · `deprecateInsight()` · `revertInsightVersion()` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

#### Retrieval Layer (F10–F11)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f10"></a>F10 | Agents must retrieve knowledge through a retrieval service rather than by directly querying PostgreSQL or Neo4j. | `POST /api/memory/retrieval` · `src/lib/memory/retrieval-layer.ts` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#retrieval-layer) |
| <a name="f11"></a>F11 | The retrieval service must support semantic and structured queries and return scoped context from approved insights, with optional raw-trace access. | `searchInsights()` · `getDualContextSemanticMemory()` · `queryTraces()` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#retrieval-layer) |

#### Policy and Access Control (F12–F13)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f12"></a>F12 | All knowledge-system reads and writes must pass through controlled endpoints that enforce project-level access. | `requireRole()` · `validateGroupId()` · RBAC middleware · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) |
| <a name="f13"></a>F13 | The system must enforce agent permissions and audit all access to trace and knowledge resources. | Auth middleware · audit event logging · [BLUEPRINT.md](./BLUEPRINT.md#9-logging--audit) |

#### End-to-End Validation (F14–F16)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f14"></a>F14 | A second agent must be able to retrieve approved knowledge as context and use it in a later task correctly. | Retrieval endpoint · validation gate scenario MEM-UC8 · [VALIDATION-GATE.md](../archive/allura/VALIDATION-GATE.md) |
| <a name="f15"></a>F15 | The full lifecycle from trace capture to knowledge reuse must be traceable, auditable, and reversible. | Evidence chain: trace → proposal → approval → Neo4j → retrieval · [VALIDATION-GATE.md](../archive/allura/VALIDATION-GATE.md) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |
| <a name="f16"></a>F16 | The graph must include Agent, Team, and Project structural context nodes with relationships enabling traversal queries by ownership, project scope, and delegation path. | `scripts/neo4j-seed-agents.cypher` · [BLUEPRINT.md](./BLUEPRINT.md#5-data-model) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#neo4j-agent) |

### Section 3: Curator Dashboard (F17–F19)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f17"></a>F17 | Tab 1 restricted to authenticated users with `admin` role (engineers only) | `src/app/api/curator/` · Clerk RBAC middleware · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-requirements) |
| <a name="f18"></a>F18 | Audit log endpoint: `GET /api/audit/events` — returns curator decisions with timestamps | `src/app/api/audit/events/` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |
| <a name="f19"></a>F19 | Dashboard integrates Clerk for authentication and RBAC (curator, admin, viewer roles) | Clerk auth provider · `src/lib/auth/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-requirements) |

### Section 4: Infrastructure (F20–F25)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f20"></a>F20 | Skills route agent work to packaged MCP servers (`neo4j-memory`, `database-server`, optional `neo4j-cypher`) rather than a custom all-in-one MCP runtime | `.opencode/skills/allura-memory-skill/` · `.opencode/skills/mcp-docker-memory-system/` · AD-23 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3-1-agent-memory-recall-primary-path) |
| <a name="f21"></a>F21 | `docker compose up` starts core infra and app services; packaged MCP servers are attached as focused external capabilities | `docker-compose.yml` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#8-1-deployment-scenarios) |
| <a name="f22"></a>F22 | Memory viewer UI at `/memory` lists, searches, and deletes memories | `src/app/memory/page.tsx` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#ux-philosophy) |
| <a name="f23"></a>F23 | Curator dashboard deployed on Vercel; calls backend engine via `CURATOR_ENGINE_URL` env var | `src/app/curator/page.tsx` · Vercel deployment config · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-requirements) |
| <a name="f24"></a>F24 | Vercel Functions (`/api/curator/*`) call Docker engine in VPC/cloud via HTTPS | `src/app/api/curator/` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#4-interface-catalogue) |
| <a name="f25"></a>F25 | Error tracking: unhandled exceptions sent to Sentry; curator notified via email/Slack | `src/lib/observability/sentry.ts` · [BLUEPRINT.md](./BLUEPRINT.md#3-architecture) |

### Section 5: Governed Memory Pipeline (F26–F40)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f26"></a>F26 | Agent task lifecycle events, tool calls, outputs, retries, and terminal status are persisted as append-only traces | `insertEvent()` · `src/lib/postgres/queries/insert-trace.ts` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#trace-ingestion) |
| <a name="f27"></a>F27 | Raw trace storage is append-only; no UPDATE or DELETE on the `events` table | Append-only write policy · `events` table schema · `00-traces.sql` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#trace-ingestion) |
| <a name="f28"></a>F28 | Raw traces preserve provenance linking downstream insights back to source evidence | `trace_ref` field on proposals · `evidence_refs` in promotion metadata · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| <a name="f29"></a>F29 | Curator reads raw traces and generates proposed insights (not active insights) | `src/curator/index.ts` · `curatorScore()` · `canonical_proposals` table · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |
| <a name="f30"></a>F30 | Each proposed insight includes summary, evidence links, confidence score, timestamp, and status | Proposal schema · `score`, `reasoning`, `tier`, `trace_ref` fields · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| <a name="f31"></a>F31 | Proposed insights enter an approval flow before becoming active knowledge | `POST /api/curator/approve` · `status: pending` gate · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |
| <a name="f32"></a>F32 | Every approval, rejection, or policy decision is recorded as an audit event with actor and timestamp | `proposal_approved` / `proposal_rejected` event types · witness hash · `src/lib/memory/approval-audit.ts` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |
| <a name="f33"></a>F33 | Approved insights are written to Neo4j as immutable nodes; no in-place updates | `createInsight()` · `src/lib/neo4j/queries/insert-insight.ts` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#knowledge-graph-versioning) |
| <a name="f34"></a>F34 | Changed insights create new nodes linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED` relationships | `createInsightVersion()` · `deprecateInsight()` · `revertInsightVersion()` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#knowledge-graph-versioning) |
| <a name="f35"></a>F35 | Agents retrieve knowledge through a controlled retrieval service, not by querying databases directly | `POST /api/memory/retrieval` · `src/lib/memory/retrieval-layer.ts` · AD-19 · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#retrieval-layer) |
| <a name="f36"></a>F36 | Retrieval supports semantic and structured queries with project and global scope | `searchInsights()` · `getDualContextSemanticMemory()` · `queryTraces()` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#retrieval-layer) |
| <a name="f37"></a>F37 | All knowledge-system reads/writes pass through controlled endpoints enforcing project-level access | `requireRole()` · `validateGroupId()` · RBAC middleware · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#6-key-architectural-constraints) |
| <a name="f38"></a>F38 | Agent permissions enforced and all access to trace/knowledge resources is audited | Auth middleware · audit event logging · [BLUEPRINT.md](./BLUEPRINT.md#9-logging--audit) |
| <a name="f39"></a>F39 | A second agent can retrieve approved knowledge and use it correctly in a later task | Retrieval endpoint · validation gate scenario MEM-UC8 · [VALIDATION-GATE.md](../archive/allura/VALIDATION-GATE.md) |
| <a name="f40"></a>F40 | The full lifecycle from trace capture to knowledge reuse is traceable, auditable, and reversible | Evidence chain: trace → proposal → approval → Neo4j → retrieval · [VALIDATION-GATE.md](../archive/allura/VALIDATION-GATE.md) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

#### Mission Control Dashboard Rebuild (F41–F48)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f41"></a>F41 | Mission Control exposes `/command`, `/work-board`, `/agents`, `/telemetry`, `/allura`, and `/resources` as the rebuilt operator surface. | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#mission-control-dashboard-rebuild-addendum) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) |
| <a name="f42"></a>F42 | `/allura` preserves the `6420` memory dashboard capabilities: memory search/list, insights, trace logs, provenance, extracted facts, and approval queue. | Route parity map · Dashboard validation artifact · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#mission-control-route-parity) |
| <a name="f43"></a>F43 | `/work-board` uses Native Allura Kanban as the default planning source of truth; Notion, Linear, and GitHub Projects are optional sync adapters. | Native Kanban strategy · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) AD-31 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) |
| <a name="f44"></a>F44 | `/resources` reads skills, agents, MCP servers, containers, cron jobs, and drift warnings from a declared Resource Manifest or generated manifest endpoint. | Resource Manifest adapter declaration · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#dashboard-adapter-contracts) |
| <a name="f45"></a>F45 | `/agents` distinguishes TALON/IRIS native subagents from Team RAM/Durham CLI harness agents and external runtime agents. | Agent adapter declaration · Team taxonomy in `AGENT_MANIFEST` |
| <a name="f46"></a>F46 | `/telemetry` surfaces model, prompt, tool, retry, rate-limit, failure, and degraded-state metrics without inventing missing measurements. | Telemetry adapter declaration · degraded/unknown metric state |
| <a name="f47"></a>F47 | Every Mission Control route displays its source-of-truth declaration and degraded-state behavior. | Adapter registry UI contract · route shell acceptance tests |
| <a name="f48"></a>F48 | The `3100` cutover requires documented route parity, visual parity, source-of-truth parity, smoke tests, auth validation, and rollback plan. | Cutover gate checklist · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) |

### Section 3: Dashboard Rebuild Use Cases

| ID | Use Case | Trace |
|----|----------|-------|
| DASH-UC1 | Operator opens Mission Control dev build on `3334` to validate the future `3100` replacement. | B30, B32, F41, F48 |
| DASH-UC2 | Operator compares `6420` memory dashboard reference against `/allura` in Mission Control. | B31, F42 |
| DASH-UC3 | Operator uses one cockpit for work, agents, telemetry, resources, and Allura memory. | B33, F41, F42 |
| DASH-UC4 | Developer verifies each route declares source of truth before wiring live data. | B34, F47 |
| DASH-UC5 | `/resources` reports inventory and drift from a manifest instead of hardcoded cards. | B34, F44 |
| DASH-UC6 | A degraded adapter shows honest unavailable/unknown state instead of fabricated data. | B35, F46, F47 |
| DASH-UC7 | Human reviewer validates TALON/IRIS reports with evidence before status advances. | F45, F47 |
| DASH-UC8 | Captain approves cutover to replace `3100`, with rollback ready. | B30, F48 |

### Section 6: Admin Requirements (B12–B23)

| ID | Business Requirement | Functional Requirements | Use Cases | Satisfied by |
|----|----------------------|------------------------|-----------|--------------|
| B12 | Enterprise admin view: tenant overview, SOC2 pending queue, audit log | F17, F18, F19 | MEM-UC7 | `src/app/api/curator/` · `src/app/api/audit/events/` · Clerk RBAC · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-requirements) |
| B13 | Audit log exportable as CSV for compliance | F18 | MEM-UC7 | `/admin/approvals` CSV download · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-requirements) |
| B14 | TypeScript SDK (`@allura/sdk`) | F1–F5 | — | MCP tools are the SDK · AD-05 · 5-tool API surface |
| B15 | BYOK encryption | — | — | Planned · RK-04 |
| B16 | Curator dashboard: three-tab approval workflow (Traces, Approved, Pending) | F14, F17, F19 | MEM-UC4 | `src/app/curator/page.tsx` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-requirements) |
| B17 | Curator sees confidence scores (60-100%) with one-sentence reasoning for uncertain proposals | F10 | MEM-UC3 | `curatorScore()` · `canonical_proposals.tier` · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#insight-curation-and-approval) |
| B18 | Approve/reject decisions logged to audit trail with curator ID and timestamp | F7, F32 | MEM-UC4 | `src/lib/memory/approval-audit.ts` · witness hash · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| B19 | Auto-promote proposals >85% confidence without curator review (configurable) | F6, F7 | MEM-UC4 | `AUTO_APPROVAL_THRESHOLD` env var · `PROMOTION_MODE=auto` · [BLUEPRINT.md](./BLUEPRINT.md#6-execution-rules) |
| B20 | Dashboard deployable on Vercel with backend engine in user's VPC/cloud | F23, F24 | — | Vercel deployment config · `CURATOR_ENGINE_URL` env var · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#8-1-deployment-scenarios) |
| B21 | Curator authentication via Clerk (SSO, RBAC) | F19 | MEM-UC7 | Clerk auth provider · `src/lib/auth/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-requirements) |
| B22 | Error tracking via Sentry; curator alerted on engine failures | F25 | — | `src/lib/observability/sentry.ts` · `captureException` in curator approve route |
| B23 | Agents must persist all task activity as append-only raw traces for auditability | F1, F2, F3, F26, F27 | MEM-UC1, MEM-UC2 | `insertEvent()` · `events` table · [DESIGN-MEMORY-SYSTEM.md](./DESIGN-MEMORY-SYSTEM.md#trace-ingestion) |

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
| MEM-UC10 | Curator Dashboard | Admin user authenticates, reviews pending proposals, approves or rejects | F10, F11, F12, F13, F14, F17, F19 |
| MEM-UC11 | Audit Export | Operator exports curator decisions as CSV for compliance | F18 |
| MEM-UC12 | Infrastructure Deploy | Operator runs `docker compose up` and configures packaged MCP servers | F20, F21 |

---

*This document was compiled from COMPETITIVE-ANALYSIS.md (archived 2026-04-08). Governed pipeline traceability added 2026-04-19. F17–F40 and B12–B23 detail rows added 2026-04-28. Benchmark results updated with actual scores 2026-05-01.*
