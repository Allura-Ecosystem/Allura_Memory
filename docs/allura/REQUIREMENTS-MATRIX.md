# Requirements Matrix: Allura vs Competition

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with AI assistance; Codex prepared the 2026-10-20 development-readiness additions.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> Code and schemas evidence implementation; approved product decisions establish intent. Record disagreement for the owning decision rather than silently changing either.


**Integration evidence boundary — 2026-10-21:** This revision consolidates specifications and source-local assessments from `28d90e843` plus the dirty-file snapshot identified in the [source manifest](../reference/development-readiness-20261021/source-manifest.json), onto main base `c720aca2e` (PR #169 content head `51e421ca0`). Dashboard, Cloudflare authentication and preview implementation changes are excluded. Their “implemented” or test-count statements below are dated source-local observations, not verification of this branch, current main or deployment. Missing local receipts remain [unavailable supporting evidence](../reference/development-readiness-20261021/unavailable-evidence.md). [Story packets](../reference/development-readiness-20261021/story-packets.md) operationalize the canonical gates without approving proposed decisions.

**Development navigation:** [Development readiness traceability](#development-readiness-traceability--2026-10-20) · [acceptance and use cases](#acceptance-evidence-and-use-case-index) · [slices and handoff gates](#development-slices-and-handoff-gates).

**Reliability review:** [Preview acceptance PV-AC01–05](#preview-reliability-acceptance--2026-10-20) · [Backend acceptance BE-AC01–09](#backend-adversarial-acceptance--2026-10-20). All remain open; documentation validation is not remediation.

**Approved intended authentication migration (source-local implementation):** [Cloudflare Access migration acceptance](#cloudflare-access-migration-acceptance). The approved provider change is Cloudflare Access under [AD-69](RISKS-AND-DECISIONS.md#AD-69-cloudflare-access-replaces-clerk); the provider implementation remains a separate unmerged source-local change and is not current-main or deployment evidence.

## Bounded journey acceptance — 2026-10-18

This matrix demonstrates the repair's first vertical slice. **Intended** describes the outcome; **specified** names its contract; **implemented** cites inspected source; **verified** needs a passing result tied to the reviewed revision; **released** needs deployment and acceptance evidence. Existing dated benchmark/Done claims elsewhere are not fresh evidence for this slice. The proposed Agreement Before Implementation policy remains unadopted.

| ID | Demonstration required | Governing source / implementation evidence | Current claim state | Owner / reviewer |
|---|---|---|---|---|
| DOC-J01 | Capture produces an append-only event with authenticated tenant/workspace/principal; denied scope produces no accepted capture | Data Dictionary journey contract; `src/mcp/canonical-tools.ts` | Specified; source exists; transport-specific retry verification pending | RAM / independent correctness reviewer |
| DOC-J02 | Eligible content stays pending despite high score or legacy auto mode | Design bounded journey; `src/lib/curator/auto-promote.ts` | Implemented in inspected source; current-revision test receipt required | RAM / independent correctness reviewer |
| DOC-J03 | Independent curator/admin with `review:approve` can approve; requester, foreign scope and missing evidence cannot | `src/lib/memory/approve-proposal.ts` | Implemented in inspected source; acceptance run pending | RAM / independent correctness reviewer |
| DOC-J04 | Approval succeeds atomically; injected failures leave no partial durable approval state | `src/lib/memory/approve-proposal.ts`; `src/lib/memory/__tests__/atomic-promotion.e2e.test.ts` (direct service rollback/replay/concurrency tests) | Source-inspected coverage; current-revision live result pending. Existing test omits receipt-boundary failure injection, so that boundary needs additional acceptance evidence | RAM / independent correctness reviewer |
| DOC-J05 | Same scoped operation replays its original receipt; a new approval rejects a proposal version changed since human review, without mutation, then requires refreshed review | DOC-06; Design approval contract; `src/lib/memory/approve-proposal.ts`; `src/lib/memory/__tests__/atomic-promotion.e2e.test.ts`; `src/lib/memory/__tests__/knowledge-promotion-approval-guard.test.ts` | Current source candidate binds the reviewed version and fails closed the alternate legacy mutation exports before DB/remote access, including arbitrary-content and workspace replay. Source-only unit evidence is not production acceptance: the human-proof issuer, valid-human live fixture, migration `072` live verification and independent acceptance remain open | RAM / independent correctness reviewer |
| DOC-J06 | Approved current content is retrievable in scope; foreign, deprecated and superseded content is absent from current results | Data Dictionary; `src/lib/graph-adapter/ruvector-adapter.ts`; retrieval contracts | Implemented read filters; end-to-end verification pending | RAM / independent data reviewer |
| DOC-J09 | Report Notion `synced` only after confirmed remote delivery; preserve the immutable decision receipt and show current projection state separately | DOC-07; Data Dictionary outbox/projection contract; `src/lib/memory/promotion-outbox-worker.ts`; `src/curator/notion-sync-worker.ts` | Approved specification; local outbox delivery is implemented, verified remote handoff/status is an implementation gap | RAM / independent data reviewer |
| DOC-J07 | UI states match an exact approved visual reference and report pending, failure and unknown honestly | Design bounded journey; DOC-02 | Needs a decision: exact reference/revision and named reviewer | Sabir + Durham / independent Durham review |
| DOC-J08 | Repo and selected Notion documents have no active retired-backend instructions or corrupted field/class/path substitutions | Six documents; documentation regression checker | Documentation repair candidate; checker result recorded by delivery owner | Brooks / independent documentation review |

No row is marked released by this repair. Verify the read-back of each Notion edit separately; a local script result does not prove a remote page changed. The source file and verification receipt belong to the row they support.
---

## Enterprise dashboard slice evidence — 2026-10-19

| ID | Demonstration | Current evidence / remaining gate |
|---|---|---|
| ENT-READ-01 | Server-scoped bounded search and unknown metadata | Source-local implementation reported; 32 read-service unit tests plus page integration tests cover query bounds, scope inputs, escaping, pagination and error redaction. Live SQL/RLS and HR/Sales/shared identities pending |
| ENT-GRAPH-01 | Stored relationships, lineage and interactive inspection | Source-local implementation reported; graph interaction tests cover selection/filter/list/keyboard/pan/zoom/self-edge; independent Pike source review resolved lineage and indistinct-label findings. Live graph result verification pending |
| ENT-BRAND-01 | Cream semantic tokens, official mark, desktop/tablet/phone and denial states | Source-local implementation reported in bounded read surfaces and denial; isolated HTML design preview includes administration and embedding examples. Munari's read-only review returned Ready for design preview after link, border, navigation and phone administration fixes. Screenshots under `artifacts/enterprise-dashboard/screenshots/preview-final/`; this does not verify all live application screens |
| ENT-AUTH-01 | Real individual sign-in, permissions, revocation and isolation | Local Clerk development sign-in rendered after hostname correction; no authenticated multi-user walkthrough or production provider settings verified |
| ENT-JOURNEY-01 | Proposal → independent human review → immutable receipt | Intended full acceptance journey remains incomplete; reader tests do not demonstrate approval |
| ENT-OPS-01 | Embeddings, administration, authorized device/agent inventory and audit/recovery | Live implementation and evidence remain incomplete. Clearly labeled local examples are permitted in the HTML design preview requested on 2026-10-19; they do not prove real state or security |

The evidence tracker is `artifacts/enterprise-dashboard/acceptance-audit.json`. It is a delivery record, not a seventh governing specification. All rows remain unreleased. The current dirty working tree requires a final revision-bound receipt after integration.

## Executive Summary

**Current architecture authority:** PostgreSQL-only under AD-50; AD-57 governs Bumblebee V1, not curator-first routing. The curator-first route remains a traced planning claim requiring its actual approved decision source (DOC-08). Legacy dual-database, neo4j-tool, broad-dashboard, benchmark, and consumer-UX claims below are historical/reconciliation debt unless a requirement is explicitly reintroduced in Section 6E. They are not implementation authority for new work.

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
| **Storage Approach** | Autonomous scoring → vector storage | Autonomous scoring → PostgreSQL (episodic) → curator gate → PostgreSQL semantic graph tables (historical Neo4j sunset 2026-07) |
| **Deduplication** | Post-hoc (after storage) | Pre-promotion (before semantic write) |
| **Junk Rate (Production)** | 97.8% after 32 days | 0% (curator blocks junk) |
| **Correction Mechanism** | Edit existing memory | Create new node, link SUPERSEDES, mark old deprecated |
| **Audit Trail** | Limited (post-hoc logs) | Complete (append-only PostgreSQL) |
| **Recovery** | Depends on backup schedule | 30-day soft-delete window (always recoverable) |
| **UX Validation** | Developer-focused | 13-16-18 youth culture framework — benchmarked: **0.881** (exceeds 0.85 target) |

### Benchmarks

Historical reported comparison, not re-run for this documentation repair. Publication date/revision and reproducible result artifacts must be attached before using these values as a current performance claim.

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
| **Promotion** | N/A (no secondary layer) | Curator approval → PostgreSQL semantic graph tables (historical Neo4j sunset 2026-07) |
| **Versioning** | Edit-in-place | SUPERSEDES relationships (immutable history) |
| **Multi-Tenancy** | Application-layer row filtering | Authenticated scope, scoped operations and applicable RLS; CHECK validates namespace format only |
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
Routed to: Pending Review (both supported mode settings)
  ↓
Human curator sees: "Sabir uses Bun, not npm"
Curator verifies: ✓ Yes, this is from the conversation
Curator approves → PostgreSQL semantic tables write
```

**Intended risk reduction, not a guarantee:**
- Human evidence review reduces unsupported knowledge entering the semantic layer.
- Operation-specific deduplication reduces repeated proposals; canonical duplicate policy remains DOC-05.
- Review can reduce propagation of unsupported content, but cannot guarantee correctness.

**Measurement gap:** no validated human review latency or complete error-elimination result is established here. Measure review time and accepted error rates before making performance or quality claims.

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

## Requirement identifier crosswalk

**Mapping revision 2026-10-18:** an identifier is its namespace plus number. **BP-Fn** is defined in Blueprint, **GM-Fn** in this Matrix's legacy pipeline tables, and **DS-Fn** in Design. This preserves historical numbering without treating different requirements as interchangeable. A bare F-number in an old story is unresolved until its source document/meaning is identified. Existing `#fN` Matrix fragments are compatibility aliases only; new references use qualified labels/fragments. These identifiers organize specifications, not implementation completion.

| Matrix ID | Blueprint relationship | Meaning / limit |
|---|---|---|
| GM-F1 | BP-F26 | Raw activity evidence; shared intent, not proof of implementation |
| GM-F2 | BP-F27 | Append-only evidence; shared intent, not proof of implementation |
| GM-F3 | BP-F28 | Source provenance; shared intent, not proof of implementation |
| GM-F4 | BP-F29 | Proposal generation; shared intent, not proof of implementation |
| GM-F5 | BP-F30 | Proposal fields; shared intent, not proof of implementation |
| GM-F6 | BP-F31 | Human approval gate; shared intent, not proof of implementation |
| GM-F7 | BP-F32 | Decision audit; shared intent, not proof of implementation |
| GM-F8 | BP-F33 | Immutable content; shared intent, not proof of implementation |
| GM-F9 | BP-F34 | Content version lineage; shared intent, not proof of implementation |
| GM-F10 | BP-F35 | Controlled retrieval; shared intent, not proof of implementation |
| GM-F11 | BP-F36 | Retrieval modes and scope; shared intent, not proof of implementation |
| GM-F12 | BP-F37 | Controlled access boundary; shared intent, not proof of implementation |
| GM-F13 | BP-F38 | Permission and access audit; shared intent, not proof of implementation |
| GM-F14 | BP-F39 | Second-agent reuse; shared intent, not proof of implementation |
| GM-F15 | BP-F40 | Lifecycle traceability; restore unresolved under DOC-03; shared intent, not proof of implementation |
| GM-F16 | No identical Blueprint functional ID | Structural Agent/Team/Project graph model; BP-F16 instead means the approved knowledge tab |
| GM-F17 | No identical Blueprint functional ID | Historical admin-only curator-API requirement; superseded by the current Design curator/admin authorization contract. BP-F17 restricts the raw-trace tab, not all approval requests |
| GM-F18, GM-F19, GM-F20, GM-F21 | BP-F18, BP-F19, BP-F20, BP-F21 respectively | Audit endpoint, RBAC, authenticated MCP boundary and deployment intent |
| GM-F22 | Distinct from BP-F22 | Matrix describes a memory API; Blueprint describes the historical viewer UI |
| GM-F23 | Distinct from BP-F23 | Matrix describes gateway deployment; Blueprint's historical Vercel deployment disposition is not the same requirement |
| GM-F24, GM-F25 | BP-F24, BP-F25 respectively | Historical deployment and observability requirements; retained dispositions are not current release proof |
| GM-F26 → GM-F40 | BP-F26 → BP-F40, same numbers | Expanded pipeline requirements duplicate the related GM-F1 → GM-F15 intents; use BP identity for new cross-document stories and preserve GM aliases for historic traceability |
| BP-F41 → BP-F56 | Blueprint definitions only | Matrix extension/requirement rows reference these definitions; they do not establish a competing namespace |
| GM-F57 | No Blueprint definition | Git-execution guardrail; a reference must not imply BP-F57 exists |

### Design requirement crosswalk

These are scoped design elaborations, not permission to substitute an entire screen requirement for a narrower engine requirement. Design owns the state/API detail and its DS identifiers; Blueprint owns product intent. No equivalence is inferred for unlisted IDs.

| Design ID(s) | Blueprint relationship | Scope |
|---|---|---|
| DS-F6, DS-F7 | BP-F6, BP-F7 respectively | Human-gated proposal eligibility/mode behavior |
| DS-F10 through DS-F16 | BP-F10 through BP-F16, same number | Curator scoring/decision/listing and tab behavior; current decision contract includes DOC-06/07 |
| DS-F17 | Elaborates BP-F11–BP-F16 | Curator dashboard composition; not BP-F17 raw-trace authorization |
| DS-F18 | UI presentation related to BP-F18 | Audit viewer; not the audit endpoint itself |
| DS-F19 | No identical Blueprint functional ID | Health dashboard; not BP-F19 authentication |
| DS-F26, DS-F27, DS-F28, DS-F32, DS-F34, DS-F37, DS-F38 | Same-number BP counterparts | Evidence/provenance/audit/versioning/access behavior |
| DS-F41 through DS-F55 | Same-number BP counterparts | UI/run/workspace design elaboration; route/state acceptance still requires exact approved scope |
| DS-F56 | BP-F17 | Admin-only raw-trace tab |
| DS-F57 | BP-F19 | Authentication/RBAC; not Matrix GM-F57 Git safety |
| DS-F58 | BP-F18 | Audit endpoint, distinct from DS-F18 audit UI |

**Specific collisions:** BP-F8 is namespace validation; GM-F8 is immutable semantic content. BP-F14/15 are dashboard tab/sort behavior; GM-F14/15 are second-agent reuse and lifecycle traceability. DS IDs are design-local and must never be substituted merely because their numbers match.

## Governed Memory Pipeline — Business → Functional Traceability

This section traces the governed memory pipeline requirements from business goals through functional behaviors to concrete satisfaction evidence. See [BLUEPRINT.md](./BLUEPRINT.md) and [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) for the full implementation design and the E2E readiness table in [BLUEPRINT.md §2](./BLUEPRINT.md#historical-e2e-readiness-status-2026-06-14-later-cutover-notes-retained) for the acceptance gate status.

> **Note on B# numbering:** Section 0 below maps the BLUEPRINT's original B1–B7 (core API/infra requirements). Section 1 uses a legacy pipeline-level B1–B7 inherited from the pre-2026-04-19 matrix; these correspond to BLUEPRINT B23–B29. Both numbering systems are preserved for traceability; when a B# appears in both sections, the BLUEPRINT canonical definition takes precedence.

### Section 0: Core API and Infrastructure Requirements (BLUEPRINT B1–B7)

| ID | Business Requirement (BLUEPRINT) | Functional Requirements | Satisfied by |
|----|----------------------------------|------------------------|--------------|
| B1 | Developers integrate Allura with a 5-tool API matching mem0's UX | BP-F1–BP-F5 | `memory_add`, `memory_search`, `memory_get`, `memory_list`, `memory_delete` via MCP tools · AD-05 |
| B2 | All memory access must enforce authenticated tenant and applicable workspace scope | BP-F8 covers namespace format only; DOC-J06 covers cross-scope retrieval denial | AD-06 CHECK is not authorization evidence; verify authenticated scoping and applicable RLS independently · [BLUEPRINT.md](./BLUEPRINT.md#7-global-constraints) |
| B3 | Every write produces an immutable audit record in PostgreSQL | BP-F1, BP-F26, BP-F27 | Append-only `events` table · `insertEvent()` · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-events) |
| B4 | Promoted knowledge is versioned and never mutated in PostgreSQL semantic tables | BP-F9, BP-F33, BP-F34 | `SUPERSEDES` relationship pattern · AD-02 · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#logical-graph-relationships) |
| B5 | The system is deployable via a single `docker compose up` command for core infra and app services | BP-F21, GM-F57 | `docker-compose.yml` · AD-45 (Port Allocation Policy) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#81-deployment-boundary) |
| B6 | Agents connect via MCP (Model Context Protocol) through Team RAM-selected packaged MCP servers | BP-F20 | Authenticated Allura MCP with governed scope and provenance · AD-23 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#31-agent-memory-recall-primary-path) |
| B7 | Semantic promotion requires independent human approval in every mode | BP-F6, BP-F7 | `src/lib/curator/auto-promote.ts` · Design bounded journey |

### Section 1: Business Requirements → Functional Requirements

| ID | Business Requirement | Functional Requirements | Use Cases |
|----|----------------------|------------------------|-----------|
| B1 | Agents must persist all task activity as append-only raw traces so execution history is auditable and recoverable. | [GM-F1](#gm-f1), [GM-F2](#gm-f2), [GM-F3](#gm-f3), [GM-F16](#gm-f16) | MEM-UC1, MEM-UC2, MEM-UC9 |
| B2 | A curator process must turn raw traces into proposed insights with explicit evidence and confidence, without promoting them directly to active knowledge. | [GM-F4](#gm-f4), [GM-F5](#gm-f5) | MEM-UC3 |
| B3 | No insight may become active knowledge until it is approved by an independent authorized human through the governed approval flow, and that approval must be auditable. | [GM-F6](#gm-f6), [GM-F7](#gm-f7) | MEM-UC4 |
| B4 | Approved insights must be stored in `graph_memories` as immutable, versioned knowledge records with relationships such as `SUPERSEDES`, `DEPRECATED`, and `REVERTED`. | [GM-F8](#gm-f8), [GM-F9](#gm-f9) | MEM-UC5 |
| B5 | Agents must retrieve approved knowledge through a controlled retrieval layer that supports semantic and structured queries with project and global scope. | [GM-F10](#gm-f10), [GM-F11](#gm-f11) | MEM-UC6 |
| B6 | All reads and writes must pass through controlled APIs that enforce project-level access, agent permissions, and audit logging. | [GM-F12](#gm-f12), [GM-F13](#gm-f13) | MEM-UC7 |
| B7 | The full loop from agent execution to knowledge reuse must be demonstrably end-to-end, traceable and auditable; intended reversal/restore behavior remains blocked until DOC-03 resolves lineage preservation. | [GM-F14](#gm-f14), [GM-F15](#gm-f15) | MEM-UC8 |
| B8 | Consumer memory viewer: no sidebar, search dominant, swipe to forget | BP-F5, BP-F22 | — |
| B9 | Every memory shows provenance: "from conversation" or "added manually" | GM-F3 | — |
| B10 | Memory usage indicator: "used N times this week" on expand | — | — |
| B11 | Undo: recently forgotten memories recoverable within 30 days | BP-F5, `memory_restore` | — |
| B24 | A curator process must turn raw traces into proposed insights without promoting them directly | GM-F4, GM-F5, GM-F29, GM-F30 | MEM-UC3 |
| B25 | No insight may become active knowledge until approved by an independent authorized human through the governed approval flow | GM-F6, GM-F7, GM-F31 | MEM-UC4 |
| B26 | Approved insights must be stored in `graph_memories` as immutable, versioned knowledge records | GM-F8, GM-F9, GM-F33, GM-F34 | MEM-UC5 |
| B27 | Agents must retrieve approved knowledge through a controlled retrieval layer | GM-F10, GM-F11, GM-F35, GM-F36 | MEM-UC6 |
| B28 | All reads/writes must pass through controlled APIs with project-level access and audit | GM-F12, GM-F13, GM-F37, GM-F38 | MEM-UC7 |
| B29 | The full loop from agent execution to knowledge reuse must be demonstrably end-to-end | GM-F14, GM-F15, GM-F39, GM-F40 | MEM-UC8 |
| B30 | Team RAM agents must follow `guidelines/AI-GUIDELINES.md` and Allura Brain memory through a documented workflow, preserving `.opencode/agent/` as the live agent source of truth | No matching functional ID established; former unqualified 41/42 citation conflicts with Command Center definitions and is not acceptance evidence | Historical use-case mapping requires reconciliation |
| B31 | Teams must define evidence-gated orchestration runs without exposing internal agent-routing details. | BP-F49, BP-F50, BP-F51, BP-F52 | MEM-UC13 |

### Section 2: Functional Requirements Detail

#### Trace Ingestion (GM-F1–GM-F3)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f1"></a><a id="gm-f1"></a>GM-F1 | The system must persist agent task lifecycle events, tool calls, outputs, retries, and terminal status into a raw trace store. | `insertEvent()` · `src/lib/postgres/queries/insert-trace.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f2"></a><a id="gm-f2"></a>GM-F2 | Raw trace storage must be append-only and must not overwrite prior events in place. | Append-only write policy · `events` table schema · `00-traces.sql` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |
| <a name="f3"></a><a id="gm-f3"></a>GM-F3 | Raw traces must preserve provenance sufficient to link downstream insights back to source evidence. | `trace_ref` field on proposals · `evidence_refs` in promotion metadata · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) |

#### Curator Pipeline (GM-F4–GM-F5)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f4"></a><a id="gm-f4"></a>GM-F4 | A curator service must read raw traces and generate proposed insights rather than active insights. | `src/curator/index.ts` · `curatorScore()` · `canonical_proposals` table · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f5"></a><a id="gm-f5"></a>GM-F5 | Each proposed insight must include summary, evidence links, confidence score, timestamp, and status. | Proposal schema · `score`, `reasoning`, `tier`, `trace_ref` fields · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) |

#### Approval and Governance (GM-F6–GM-F7)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f6"></a><a id="gm-f6"></a>GM-F6 | Proposed insights must enter an approval flow before they can become active. | `POST /api/curator/approve` · `status: pending` gate · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f7"></a><a id="gm-f7"></a>GM-F7 | Every approval, rejection, or policy-based decision must be recorded as an audit event. | `proposal_approved` / `proposal_rejected` event types · witness hash · [BLUEPRINT.md](./BLUEPRINT.md) |

#### Knowledge Graph Versioning (GM-F8–GM-F9)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f8"></a><a id="gm-f8"></a>GM-F8 | Approved insights must be written to PostgreSQL semantic tables as immutable nodes and must never be updated in place. | `approveProposal()` · `src/lib/memory/approve-proposal.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f9"></a><a id="gm-f9"></a>GM-F9 | When an insight changes, the system must create a new insight node linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED`. | `createInsightVersion()` · `deprecateInsight()` · `revertInsightVersion()` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

#### Retrieval Layer (GM-F10–GM-F11)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f10"></a><a id="gm-f10"></a>GM-F10 | Agents must retrieve knowledge through a retrieval service rather than by directly querying PostgreSQL or PostgreSQL semantic tables. | `POST /api/memory/retrieval` · `src/lib/memory/retrieval-layer.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f11"></a><a id="gm-f11"></a>GM-F11 | The retrieval service must support semantic and structured queries and return scoped context from approved insights, with optional raw-trace access. | `searchInsights()` · `getDualContextSemanticMemory()` · `queryTraces()` · [BLUEPRINT.md](./BLUEPRINT.md) |

#### Policy and Access Control (GM-F12–GM-F13)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f12"></a><a id="gm-f12"></a>GM-F12 | All knowledge-system reads and writes must pass through controlled endpoints that enforce project-level access. | `requireRole()` · `validateGroupId()` · RBAC middleware · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md) |
| <a name="f13"></a><a id="gm-f13"></a>GM-F13 | The system must enforce agent permissions and audit all access to trace and knowledge resources. | Auth middleware · audit event logging · [BLUEPRINT.md](./BLUEPRINT.md#9-logging--audit) |

#### End-to-End Validation (GM-F14–GM-F16)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f14"></a><a id="gm-f14"></a>GM-F14 | A second agent must be able to retrieve approved knowledge as context and use it in a later task correctly. | Retrieval endpoint · validation gate scenario MEM-UC8 · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#historical-e2e-readiness-status-2026-06-14-later-cutover-notes-retained) |
| <a name="f15"></a><a id="gm-f15"></a>GM-F15 | The full lifecycle from trace capture to knowledge reuse must be traceable, auditable, and reversible. | Evidence chain: trace → proposal → approval → PostgreSQL semantic tables → retrieval · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#historical-e2e-readiness-status-2026-06-14-later-cutover-notes-retained) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |
| <a name="f16"></a><a id="gm-f16"></a>GM-F16 | The graph must include Agent, Team, and Project structural context nodes with relationships enabling traversal queries by ownership, project scope, and delegation path. | `src/lib/graph-adapter/ruvector-adapter.ts` · [BLUEPRINT.md](./BLUEPRINT.md#5-data-model) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#logical-graph-agent) |

### Section 3: Curator API/CLI (GM-F17–GM-F19)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f17"></a><a id="gm-f17"></a>GM-F17 | Historical admin-only curator API claim; superseded for approval by Design’s authorized curator/admin contract | `src/app/api/curator/` · RBAC middleware · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| <a name="f18"></a><a id="gm-f18"></a>GM-F18 | Audit log endpoint: `GET /api/audit/events` — returns curator decisions with timestamps | `src/app/api/audit/events/` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f19"></a><a id="gm-f19"></a>GM-F19 | API integrates RBAC (curator, admin, viewer roles) | Auth provider · `src/lib/auth/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |

### Section 4: Infrastructure (GM-F20–GM-F25)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f20"></a><a id="gm-f20"></a>GM-F20 | Agents access memory through authenticated Allura MCP/API contracts; server authority resolves tenant/workspace | `.opencode/skills/allura-memory-skill/` · `.opencode/skills/mcp-docker-memory-system/` · AD-23 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#31-agent-memory-recall-primary-path) |
| <a name="f21"></a><a id="gm-f21"></a>GM-F21 | `docker compose up` starts core infra and app services; packaged MCP servers are attached as focused external capabilities | `docker-compose.yml` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#81-deployment-boundary) |
| <a name="f22"></a><a id="gm-f22"></a>GM-F22 | Memory API at `/api/memory` lists, searches, and retrieves memories | `src/app/api/memory/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#api-reference) |
| <a name="f23"></a><a id="gm-f23"></a>GM-F23 | MCP HTTP gateway exposes backend engine via `CURATOR_ENGINE_URL` env var | `src/mcp/http-gateway.ts` · Docker deployment config · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#4-interface-catalogue) |
| <a name="f24"></a><a id="gm-f24"></a>GM-F24 | API routes call Docker engine in VPC/cloud via HTTPS | `src/app/api/` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#4-interface-catalogue) |
| <a name="f25"></a><a id="gm-f25"></a>GM-F25 | Error tracking: unhandled exceptions sent to Sentry; operator notified via email/Slack | `src/lib/observability/sentry.ts` · [BLUEPRINT.md](./BLUEPRINT.md#3-architecture) |
| <a name="f57"></a><a id="gm-f57"></a>GM-F57 | Git-safety guardrail (GIT-EXEC-001): all `git` subprocesses spawned by the harness or Ralph must have `GIT_DIR` constrained to the project root; Ralph refuses to run if `cwd` is not under the expected project root | `scripts/git-exec-guard.ts` · `.ralph/ralph-loop.state.json` cwd check · AD-44 · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

### Section 5: Governed Memory Pipeline (GM-F26–GM-F40)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f26"></a><a id="gm-f26"></a>GM-F26 | Agent task lifecycle events, tool calls, outputs, retries, and terminal status are persisted as append-only traces | `insertEvent()` · `src/lib/postgres/queries/insert-trace.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f27"></a><a id="gm-f27"></a>GM-F27 | Raw trace storage is append-only; no UPDATE or DELETE on the `events` table | Append-only write policy · `events` table schema · `00-traces.sql` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f28"></a><a id="gm-f28"></a>GM-F28 | Raw traces preserve provenance linking downstream insights back to source evidence | `trace_ref` field on proposals · `evidence_refs` in promotion metadata · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| <a name="f29"></a><a id="gm-f29"></a>GM-F29 | Curator reads raw traces and generates proposed insights (not active insights) | `src/curator/index.ts` · `curatorScore()` · `canonical_proposals` table · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f30"></a><a id="gm-f30"></a>GM-F30 | Each proposed insight includes summary, evidence links, confidence score, timestamp, and status | Proposal schema · `score`, `reasoning`, `tier`, `trace_ref` fields · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| <a name="f31"></a><a id="gm-f31"></a>GM-F31 | Proposed insights enter an approval flow before becoming active knowledge | `POST /api/curator/approve` · `status: pending` gate · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f32"></a><a id="gm-f32"></a>GM-F32 | Every approval, rejection, or policy decision is recorded as an audit event with actor and timestamp | `proposal_approved` / `proposal_rejected` event types · witness hash · `src/lib/memory/approval-audit.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f33"></a><a id="gm-f33"></a>GM-F33 | Approved insights are written to PostgreSQL semantic tables as immutable nodes; no in-place updates | `approveProposal()` · `src/lib/memory/approve-proposal.ts` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f34"></a><a id="gm-f34"></a>GM-F34 | Changed insights create new nodes linked with `SUPERSEDES`, `DEPRECATED`, or `REVERTED` relationships | `createInsightVersion()` · `deprecateInsight()` · `revertInsightVersion()` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f35"></a><a id="gm-f35"></a>GM-F35 | Agents retrieve knowledge through a controlled retrieval service, not by querying databases directly | `POST /api/memory/retrieval` · `src/lib/memory/retrieval-layer.ts` · AD-19 · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f36"></a><a id="gm-f36"></a>GM-F36 | Retrieval supports semantic and structured queries with project and global scope | `searchInsights()` · `getDualContextSemanticMemory()` · `queryTraces()` · [BLUEPRINT.md](./BLUEPRINT.md) |
| <a name="f37"></a><a id="gm-f37"></a>GM-F37 | All knowledge-system reads/writes pass through controlled endpoints enforcing project-level access | `requireRole()` · `validateGroupId()` · RBAC middleware · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#6-key-architectural-constraints) |
| <a name="f38"></a><a id="gm-f38"></a>GM-F38 | Agent permissions enforced and all access to trace/knowledge resources is audited | Auth middleware · audit event logging · [BLUEPRINT.md](./BLUEPRINT.md#9-logging--audit) |
| <a name="f39"></a><a id="gm-f39"></a>GM-F39 | A second agent can retrieve approved knowledge and use it correctly in a later task | Retrieval endpoint · validation gate scenario MEM-UC8 · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#historical-e2e-readiness-status-2026-06-14-later-cutover-notes-retained) |
| <a name="f40"></a><a id="gm-f40"></a>GM-F40 | The full lifecycle from trace capture to knowledge reuse is traceable, auditable, and reversible | Evidence chain: trace → proposal → approval → PostgreSQL semantic tables → retrieval · E2E gate table in [BLUEPRINT.md](./BLUEPRINT.md#historical-e2e-readiness-status-2026-06-14-later-cutover-notes-retained) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) |

### Section 5A: Evidence-Gated Run Records (BP-F49–BP-F52)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f49"></a><a id="bp-f49"></a>BP-F49 | A governed run must capture a neutral `RunRecord` with tenant scope, owner, reviewer, goal, status, pinned definition ID/revision, journal path, and timestamps. | Partial: `src/lib/process-engine/` · AD-35 · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#runrecord-ad-35) |
| <a name="f50"></a><a id="bp-f50"></a>BP-F50 | Run policy must declare allowed actions, approval breakpoints, measured quality gates, bounded attempts, and evidence required before Done. | Partial: gates/checkpoints exist; bounded quality convergence remains Epic 14 · AD-35/AD-41 |
| <a name="f51"></a><a id="bp-f51"></a>BP-F51 | Run journals must record plan, steps, checks, approvals, failures, final evidence, memory writeback candidates, and enough state to continue without repeating completed side effects. | Partial: append-only events and replay exist; true continuation remains Story 12.2 correction |
| <a name="f52"></a><a id="bp-f52"></a>BP-F52 | Doctor checks must report failed, stale, incomplete, definition-drifted, unrecoverable, or approval-blocked runs before work is marked complete. | Not implemented: Epic 14.3 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#37-governed-run-layer) |

### Section 5B: Governed AI Office (BP-F53-F55)

| ID | Requirement | Satisfied by |
|----|-------------|--------------|
| <a name="f53"></a><a id="bp-f53"></a>BP-F53 | Native projects and work items must use PostgreSQL operational state, audited transitions, dependencies, and links to runs, handoffs, evidence packets, and memory receipts. | Planned: Epic 15 · AD-41 |
| <a name="f54"></a><a id="bp-f54"></a>BP-F54 | The operator workspace must provide mission-first navigation, Command Center behavior, a central work surface, and a right evidence/context inspector backed by live contracts. | Planned: Epic 16 · AD-31/AD-41 |
| <a name="f55"></a><a id="bp-f55"></a>BP-F55 | Allura must ship one governed desktop shell with secure connection profiles, runtime supervision, updates, deep links, offline/read-only behavior, and reconnect recovery. | Planned: Epic 17 · AD-41 |

### Section 6: Admin Requirements (B12–B23)

| ID | Business Requirement | Functional Requirements | Use Cases | Satisfied by |
|----|----------------------|------------------------|-----------|--------------|
| B12 | Enterprise admin view: tenant overview, SOC2 pending queue, audit log via API | GM-F17, GM-F18, GM-F19 | MEM-UC7 | `src/app/api/curator/` · `src/app/api/audit/events/` · RBAC · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B13 | Audit log exportable as CSV for compliance | GM-F18 | MEM-UC7 | `/api/audit/events` CSV download · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B14 | TypeScript SDK (`@allura/sdk`) | BP-F1–BP-F5 | — | MCP tools are the SDK · AD-05 · 5-tool API surface |
| B15 | BYOK encryption | — | — | Planned · RK-04 |
| B16 | Curator CLI: three-state approval workflow (Traces, Approved, Pending) | BP-F14, BP-F17, BP-F19 | MEM-UC4 | `src/app/api/curator/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B17 | Curator sees confidence scores (60-100%) with one-sentence reasoning for uncertain proposals | BP-F10 | MEM-UC3 | `curatorScore()` · `canonical_proposals.tier` · [BLUEPRINT.md](./BLUEPRINT.md) |
| B18 | Approve/reject decisions logged to audit trail with curator ID and timestamp | GM-F7, GM-F32 | MEM-UC4 | `src/lib/memory/approval-audit.ts` · witness hash · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-canonical_proposals) |
| B19 | Historical auto-approval requirement is superseded by mandatory HITL | BP-F6, BP-F7 | MEM-UC4 | `src/lib/curator/auto-promote.ts`; thresholds do not authorize promotion |
| B20 | MCP HTTP gateway deployable via Docker; backend engine in user's VPC/cloud | GM-F23, GM-F24 | — | Docker deployment config · `CURATOR_ENGINE_URL` env var · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#81-deployment-boundary) |
| B21 | Authentication via API keys and RBAC (curator, admin, viewer roles) | GM-F19 | MEM-UC7 | Auth provider · `src/lib/auth/` · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| B22 | Error tracking via Sentry; operator alerted on engine failures | GM-F25 | — | `src/lib/observability/sentry.ts` · `captureException` in curator approve route |
| B23 | Agents must persist all task activity as append-only raw traces for auditability | GM-F1, GM-F2, GM-F3, GM-F26, GM-F27 | MEM-UC1, MEM-UC2 | `insertEvent()` · `events` table · [BLUEPRINT.md](./BLUEPRINT.md) |

### Section 6A: RuVix Governance Requirements (REQ-GOV-001–REQ-GOV-002)

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-GOV-001 | Admin rule visibility — display active control plane rules with status, threshold, and audit trail | `RUVIX_CONTROL_PLANE_CONTRACT_v1`, AD-XX, B12 / GM-F17–GM-F19 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#341-ruvix-control-plane-governance-contract) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx-ruvix-control-plane-contract) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| REQ-GOV-002 | Admin rule configuration — toggle promotion mode, set threshold, view audit log | `PROMOTION_MODE`, `AUTO_APPROVAL_THRESHOLD`, audit events, B12 / GM-F17–GM-F19 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#341-ruvix-control-plane-governance-contract) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |

### Section 6A.1: Carlos/RuVector/RuVix Readiness Requirements (REQ-GOV-003–REQ-GOV-009)

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-GOV-003 | Team RAM lanes must perform Brain pre-search before implementation or documentation mutation. | B23, GM-F26-F40 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#memory-lifecycle-and-done-gate) · [BLUEPRINT.md](./BLUEPRINT.md#engine-boundary-and-ruvectorruvix-posture) |
| REQ-GOV-004 | Substantive work must write a raw receipt with actor, evidence, validation, and audit reference. | B3, B18, GM-F32 | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory-command-center-adapter-contracts) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#memory-lifecycle-and-done-gate) |
| REQ-GOV-005 | RuVix gates must return `Permit`, `Defer`, or `Deny` and include `gate_reason`. | AD-XX, RULE-010 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#341-ruvix-control-plane-governance-contract) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) |
| REQ-GOV-006 | Runtime capability labels must follow a dated deployment receipt; graph adapter selection does not prove native extension readiness | AD-32, RK-21 | Architecture readiness boundary; current health evidence required |

### Section 6A.2: Agent Factory CI Requirements

| ID | Requirement | Satisfied by |
| --- | --- | --- |
| REQ-AF-CI-001 | Factory modules and workflows must be tracked in the canonical `Allura_Memory` repository. | `factory/` · `.github/workflows/factory-ci.yml` · AD-43 |
| REQ-AF-CI-002 | Every module must pass YAML, roster, tenant, documentation-authority, and Allura governance validation. | `factory/validate.sh` · `.github/workflows/factory-ci.yml` |
| REQ-AF-CI-003 | CI must prove PostgreSQL-first writes, own-tenant retrieval, and cross-tenant isolation against live PostgreSQL and PostgreSQL semantic tables. | `scripts/factory-cross-team-smoke.ts` · `.github/workflows/factory-cross-team-smoke.yml` · RK-31 · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3401-agent-factory-ci-topology) |
| REQ-AF-CI-004 | CI must block unsupported native/upstream capability claims; historical bridge labels are not current health evidence | `scripts/check-ruvector-readiness.ts` · `.github/workflows/ruvector-readiness.yml` · AD-32 · RK-21 |
| REQ-AF-CI-005 | Packaging must require an explicit validated team and produce a commit-addressed artifact. | `.github/workflows/factory-ci.yml` |
| REQ-GOV-007 | Dashboard and operator surfaces must consume API/MCP contracts only and must not write directly to PostgreSQL, PostgreSQL semantic tables, or vector substrate. | AD-31, GM-F37, GM-F38 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#important-constraints) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#36-api-first-architecture-and-memory-command-center) |
| REQ-GOV-008 | Runtime/database/MCP/cron/live hook/RuVix enforcement/semantic promotion/Notion sync/Done status changes require explicit approval and `approval_required=true`. The `approval_ref` must be a well-formed UUID (canonical governed approval identity), and the gate emits `approval_required=true`, the gate decision, and the resolved `approval_ref` into the audit context. Resolution against the canonical approval store is the approval-lifecycle layer's responsibility. | AD-33 | `src/control-plane/syscalls.ts` `executeSyscall` approval gate · `src/lib/governance/policies.ts` `pol-007` · `src/mcp/audit-tools.ts` `audit_invariant_check` · `src/mcp/governance-tools.ts` `evaluateInvariants` · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-33-approval-boundaries-for-engine-mutations) |
| REQ-GOV-009 | Planned RAM/Durham hook wrappers are governed support surfaces, not live enforcement until separately approved. | AD-33, RK-24 | [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#341-ruvix-control-plane-governance-contract) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#risk-detail) |

### Section 6B: RuVix Brand Governance Requirements (REQ-DURHAM-001–REQ-DURHAM-005)

> **Note:** These requirements are active for the optional Memory Command Center and supporting terminal/API documentation. The engine remains MCP/API-first; the dashboard is a governed operator surface, not a bypass around policy.

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-DURHAM-001 | Token exclusivity — dashboard and terminal output use approved Allura/Durham tokens and real logo assets only; generated logo-like marks are forbidden | BRAND-001 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#durhamtokenaudit) |
| REQ-DURHAM-002 | Mission-control voice — dashboard and CLI copy are audited against unsupported certainty, marketing fluff, and unrelated project voice patterns | BRAND-002 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) |
| REQ-DURHAM-003 | Evidence-gated completion — every dashboard or CLI feature PR includes tests, documentation, source receipts, and anti-drift audit | BRAND-003 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#dashboardclaim) |
| REQ-DURHAM-004 | Accessibility AA compliance — dashboard controls and terminal output are keyboard reachable, screen-reader readable, and high-contrast safe | BRAND-004 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#342-brand-governance-layer) |
| REQ-DURHAM-005 | Component consistency — reuse approved Allura/Durham UI and output patterns; ship only after Durham gate passes | BRAND-005, BRAND-006 | [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx1-ruvix-brand-governance-rules) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#durhamgateevent) |

### Section 6C: RuVector Graph Cutover Requirements (REQ-RV-001–REQ-RV-005)

> **Historical transition requirements:** AD-49 records migration from the retired separate graph service to PostgreSQL graph tables. Past dual-read gates are historical acceptance criteria, not permission to enable a fallback today. Current configuration behavior is evidenced separately by the factory.

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-RV-001 | IGraphAdapter seam must back all graph operations; no direct PostgreSQL semantic tables/PG graph calls outside the adapter | AD-29, AD-49, RK-32 | `src/lib/graph-adapter/types.ts` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#3402-graph-backend-cutover-path) |
| REQ-RV-002 | Graph selector defaults to `ruvector`; historical `neo4j` selector is rejected; `ruvector-crate` is opt-in | AD-49/AD-50 | `src/lib/graph-adapter/factory.ts`; deployment verification separate |
| REQ-RV-003 | Parity test (`adapter-parity.test.ts`) must pass 14/14 before any cutover | AD-29 | `src/lib/graph-adapter/__tests__/adapter-parity.test.ts` · AD-29 |
| REQ-RV-004 | Historical dual-read transition gate preceded the retirement in AD-50; do not re-enable a retired backend for new work | AD-49, AD-50, RK-32 | Current factory rejects the retired selector; new backend changes require separate scope and evidence |
| REQ-RV-005 | `runtime_readiness` label may upgrade from `pgvector_bridge` to `ruvector_graph` only after live-DB E2E + dual-read pass; to `full_ruvector` only after native extension activates | AD-49, AD-34, RK-21 | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) |

### Section 6D: Memory Command Center Requirements (REQ-DASH-001–REQ-DASH-009)

| ID | Requirement | Trace | Satisfied by |
|----|-------------|-------|--------------|
| REQ-DASH-001 | Active `group_id` is visible on every dashboard page and included in every memory, curator, governance, graph, audit, and settings request | B2, GM-F12, REQ-GOV-001 | [BLUEPRINT.md](./BLUEPRINT.md#ruvix-governed-memory-command-center) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-v2-condensed-ux-contract) |
| REQ-DASH-002 | Memories page supports search, filtering, detail inspection, provenance drawer, source, confidence, state, actor, and relationship context | B8-B13, GM-F10-F15 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#dashboard-architecture) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory-command-center-adapter-contracts) |
| REQ-DASH-003 | Curator page supports approve, reject, request evidence, request changes, and rationale capture through governed endpoints only | GM-F6, GM-F7, GM-F31, GM-F32 | [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#curator-requirements) · [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md#ad-xx-ruvix-control-plane-contract) |
| REQ-DASH-004 | Governance page surfaces RuVix policy mode, thresholds, role separation, tenant isolation, promotion locks, drift warnings, and mutation receipts | REQ-GOV-001, REQ-GOV-002 | `src/app/dashboard/governance/page.tsx` (lists the 6 canonical policies + severity/invariant + governance audit trail; read-only, overrides HITL-gated) · `src/lib/governance/policies.ts` · [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md#341-ruvix-control-plane-governance-contract) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#ruvix-governance-artifacts) |
| REQ-DASH-005 | Audit page provides event filtering, receipt detail, CSV/export packet, and source lineage for compliance review | B13, GM-F18, GM-F32 | [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#postgresql-events) · [DESIGN-ALLURA.md](./DESIGN-ALLURA.md#audit--health-requirements) |
| REQ-DASH-006 | Graph page must render permitted real semantic data with provenance and honest empty/degraded states | GM-F8, GM-F9, GM-F16 | Intended UI requirement; current graph-route implementation and visual acceptance require revision-specific evidence (DOC-02/DOC-04) |
| REQ-DASH-007 | Every dashboard panel must show source, freshness, degraded/unknown state and evidence for health/live claims | AD-14, AD-26 | Intended UI requirement; missing historical overview path is not implementation proof. See Design bounded journey and DOC-02/DOC-04 |
| REQ-DASH-008 | Every mutation shows a governance receipt containing intent, actor, source, policy, validation, and audit trail before completion | AD-XX, REQ-GOV-001 | [BLUEPRINT.md](./BLUEPRINT.md#ruvix-governed-memory-command-center) · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memory-command-center-adapter-contracts) |
| REQ-DASH-009 | A non-coder admin manages team members and roles (admin/curator/viewer) entirely from the dashboard UI; group_id-scoped, soft-remove, append-only audit | AD-48, REQ-GOV-001 | `src/app/dashboard/members/page.tsx` + `members-client.tsx` (add/role/remove UI) · `docker/postgres-init/29-memberships.sql` · `src/lib/membership/repository.ts` · `src/app/api/members/route.ts` · `src/app/api/members/[userId]/route.ts` · [DATA-DICTIONARY.md](./DATA-DICTIONARY.md#memberships) |

### Section 6E: Governed Curator Review Console (REQ-CUR-001–008)

| ID | Requirement | Trace | Status |
|----|-------------|-------|--------|
| REQ-CUR-001 | Intended initial browser route is `/dashboard/curator`; rendered navigation targets need route-smoke validation | Epic 25 planning reference; approved curator-first decision source unresolved (DOC-08). AD-57 is not authority | Planned; decision provenance missing |
| REQ-CUR-002 | Proposal and retrieval scope is durably enforced by server-derived tenant/workspace identity; conflicting caller `group_id` or workspace assertion receives `403`. Migrations 39/40 preserve earlier policy predicates and add restrictive app-role workspace policies; legacy unscoped retained/promotion rows are quarantined. | 24.2, 24.3, 25.2a, 25.2 | Foundation Done (25.2a); downstream read contract dependency-blocked |
| REQ-CUR-002a | `memory_add` authority is minted only inside authenticated MCP/stdio transport code after verified principal resolution. `user_id` is derived from that principal when omitted; mismatch, raw direct calls, plain `scope`, JSON copies, and object-spread copies fail closed. `POST /api/memory` remains a documented `403` fail-closed write endpoint. | 24.2 | Source-local implementation reported; transport-bound regression coverage required |
| REQ-CUR-003 | Queue/detail responses include a durable queryable evidence-request lifecycle, evidence version, source, freshness, degraded state, and server-derived allowed actions. | 25.2a, 25.2, 25.4, `ReviewItem` | Durable lifecycle foundation Done (25.2a); queue response planned |
| REQ-CUR-004 | A failed, forbidden, stale, degraded, empty, or conflict state is never represented as another state. | 25.3, 25.4 | Planned |
| REQ-CUR-005 | Only approve, reject, and request-evidence decisions exist; all require nonblank rationale and server receipt. | 24.4, 25.2a, 25.5 | Receipt/evidence foundation Done; decision release blocked by 24.4 |
| REQ-CUR-006 | Tenant forgery, role failure, missing rationale, missing evidence, segregation-of-duties, and concurrent decision behavior are live-DB tested. | 24.3, 24.4, 25.2a, 25.6 | Workspace/app-role foundation proven; remaining decision scenarios blocked |
| REQ-CUR-007 | Dialogs, forms, states, and navigation meet keyboard/focus/accessible-name requirements and are route/ARIA tested. | 25.3–25.6 | Planned |
| REQ-CUR-008 | Intended delivery requires commit-bound evidence and a documented MCP/API/CLI rollback | Epic 25 planning reference; applicable delivery approval must be linked (DOC-08), not AD-57 | Planned; decision provenance missing |

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
| REQ-MOD-001 | `/dashboard/curator` is a stable shell that receives a server-issued, allow-listed, versioned module registry and renders workflow modules only through approved shared intake/evidence/map/policy/review/receipt components. | AD-63, canonical 25.3b | Implemented in merged PR #124; independent acceptance/status reconciliation remains pending |
| REQ-MOD-002 | Workflow modules may define presentation and typed workflow descriptors but cannot load arbitrary client code, query storage, select scope, map identity, authorize, evaluate policy, mutate state, issue receipts, or redefine standard truth states. | AD-63, canonical 25.3b | Implemented in merged PR #124; independent acceptance/status reconciliation remains pending |
| REQ-MOD-003 | Unknown, duplicate, incompatible, untrusted, capability-missing, disabled, or failed modules fail closed and are independently rollbackable without affecting the shell, other modules, engine, SDK, API, MCP, CLI, or external host adapters. | AD-63, canonical 25.3b, 25.6 | Implemented in merged PR #124; independent acceptance/status reconciliation remains pending |
| REQ-MOD-004 | App releases declare identity/version, compatible core contracts, dependencies and requested capabilities; adding a conforming app uses the registry/shared components without changing unrelated apps. | Sabir modularity requirement, 2026-10-19; Architecture modular dashboard section | Intended; demonstrate two fixture apps, compatible upgrade and incompatible-version rejection before implementation acceptance |
| REQ-MOD-005 | Updates preserve configuration and data, expose permission differences, and have tested recovery appropriate to schema compatibility; no silent authority expansion or rewriting append-only evidence. | Sabir upgradeability requirement, 2026-10-19; extends REQ-MOD-003 | Intended; validate upgrade, failure and recovery with representative retained records; migration contract and engineering review outstanding |
| REQ-MOD-006 | Employees see task-oriented Apps; administrators see plain-language owner/version/compatibility/update-impact information. One failed app leaves other permitted apps and the shell usable. | Sabir nontechnical UX and modularity requirements, 2026-10-19 | Intended; preview and keyboard/responsive failure-state review required; no live isolation or upgrade proof claimed |
| REQ-MAP-001 | The 2D Knowledge Map uses one server-owned focused `SubgraphQuery`/`SubgraphResponse` contract. Scope is server-derived; nodes and edges carry evidence or versioned derived-rule references; empty, denied, partial, degraded, and complete are distinct states. | AD-59, 25.2, 25.3 | Dependency-blocked |
| REQ-MAP-002 | Subgraph traversal uses relational authorization first, deterministic ordering, signed opaque continuation bound to scope/query/policy/snapshot, and explicit budgets. Initial 200-node/400-edge/depth-2 limits are safety caps, not scale claims. | AD-59, 25.2, 25.6 | Dependency-blocked |
| REQ-MAP-003 | The map has an adjacent same-data text relationship list and complete keyboard/screen-reader interaction. 3D, if enabled later, is opt-in, flagged, rollbackable, and consumes the identical authorized response. | AD-59, 25.3, 25.3a, 25.6 | Planned |

### Section 6F: Bumblebee Plugin Requirements (REQ-BMB-001–016)

| ID | Requirement | Trace | Status |
|----|-------------|-------|--------|
| REQ-BMB-001 | Advisory evidence preserves source identity, publisher, source URL, publication/fetch times, revision/hash, trust state, freshness state, classification/redaction policy, scope, and retention disposition. | 26.1, 26.4, AD-57 | Implemented as downstream Allura advisory intake |
| REQ-BMB-002 | Only reviewed allowlisted advisory sources and approved internal events may enter the downstream Allura intake path; each source has a documented verification rule. | 26.1, 26.4, AD-57 | Implemented as downstream Allura advisory intake |
| REQ-BMB-003 | Failed verification, stale input, schema failure, degraded retrieval, or scope conflict is represented distinctly and cannot become verified exposure evidence. | 26.1, 26.4, AD-57, REQ-DASH-007 | Partial — fail-closed drops exist, but distinct source-health truth requires final reconciliation |
| REQ-BMB-004 | Exposure correlation is relationally scoped and deduplicated; every alert cites authoritative inventory and supporting evidence identities with matcher provenance. | 26.3, 26.4, AD-57 | Implemented for Allura-native inventory; upstream provenance lane pending 26.7 |
| REQ-BMB-005 | Automatic V1 outputs are limited to accepted inventory/exposure evidence, a deduplicated alert, and a simulated mitigation proposal. | 26.4, 26.5, AD-57 | Implemented downstream; upstream plugin handoff pending 26.7 |
| REQ-BMB-006 | The pinned upstream scanner may perform read-only endpoint metadata scans. Neither scanner nor plugin may execute packages, run package managers, activate policy, block CI/packages, change schedules, revoke credentials, lock workspaces, or perform containment. | Correct Course, 26.7, AD-57 | Ready for Dev — Correct Course accepted |
| REQ-BMB-007 | Source configuration and any mitigation/response approval remain human-authorized, with actor, role, rationale, validation, evidence identity, and receipt recorded before later enforcement. | 26.1, 26.5, 26.6, AD-57, REQ-GOV-001 | Implemented downstream; plugin source-enrollment receipt pending 26.7 |
| REQ-BMB-008 | The Allura plugin pins upstream `v0.1.2` / `cc57710eeaf685e7b89924a36c8583cad0a378fe`, artifact checksum/build provenance, Apache-2.0 attribution, emitted schema `0.1.0`, reviewed ecosystem/mode allowlist, and upgrade policy. Known code/schema enum drift is closed by restriction or a reviewed compatibility schema, never silent relaxation. | Correct Course, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-009 | A long-lived `bumblebee_runner` credential accepted only by the run-lease route and a short-lived `bumblebee_ingest` lease credential accepted only by ingest bind source/endpoint/population/profile to tenant/workspace server-side. Neither authenticates to the other route, MCP, browser, or other APIs. | Correct Course, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-010 | Production receiver transport is HTTPS-only with explicit trusted-proxy scheme handling. Authentication precedes decompression/parsing; bytes/lines/records are bounded; `2xx` follows only atomic sanitized-batch persistence and immutable receipt. Insecure override is isolated-loopback-test only. | Correct Course, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-011 | Raw wire bytes are not stored unqualified. Sanitized allowlisted records remain append-only evidence; only a matching complete scan for its server-bound population contract promotes routine inventory. Empty complete is valid; partial/error/timeout/missing-summary/deep/findings-only or unbound filtered populations cannot retire routine state. | Correct Course, pinned upstream state model, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-012 | The plugin issues a source-bound monotonic scan generation/lease before execution. Current state preserves baseline/project separation, server-owned ordering, clock-skew diagnostics, staleness, late-run handling, and exact/conflicting replay semantics over source/lease/body/run/record identity. | Correct Course, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-013 | Upstream findings remain provisional exact package-presence assertions. Findings-enabled source revisions and leases require an immutable scope-qualified catalog revision/entry ledger with canonical-content digest and approval provenance. Trusted exposure is recomputed against accepted package evidence and that exact revision. | Correct Course, 26.3, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-014 | A real pinned scanner self-test and leased scan pass through HTTPS ingestion, sanitized ledgers, complete bound-population promotion, current inventory, and headless exposure retrieval with cross-tenant, malformed, partial, stale, replay, population-forgery, and DB-failure proof. | Correct Course, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-015 | Hostnames, usernames, paths, roots, catalog text, error/evidence strings, environment values, credentials, private keys, URL user-info, and other sensitive values follow allowlisting, normalization, classification, redaction, retention, and telemetry rules before persistence. Verification uses canonical inputs and hashes with redaction provenance; secrets never appear in logs, responses, payloads, events, or receipts. | Correct Course, 26.7 | Ready for Dev — Correct Course accepted |
| REQ-BMB-016 | Runner and lease credentials have separate exclusive audiences and exact route authorization. Credential, source, catalog revision/entry, lease, batch, record, run-decision, and downstream evidence keys/FKs are scope-qualified; ledgers are immutable and proven under the non-owner app role. | Correct Course, 26.7 | Ready for Dev — Correct Course accepted |

| REQ-UX-001 | Primary dashboard copy targets about a sixth-grade reading level: short sentences, common words, one idea at a time. Technical IDs and policy terms remain available through secondary labels or progressive disclosure. | `DESIGN.md`, 25.3–25.6 | Planned |
| REQ-UX-002 | Major two-pane desktop layouts target a 38.2% / 61.8% golden-ratio split and stack in logical reading order on smaller screens. | `DESIGN.md`, 25.3, 25.4 | Planned |
| REQ-UX-003 | The Memory Map presents governed lineage as labeled nodes and connections with an equivalent text description. It never fabricates relationships or makes the visual graph the only accessible source. | 25.4, 25.6 | Planned |

### Section 6G: Epic 29 Desktop Device Pairing Traceability

| Acceptance Criterion | Story 29.1 contribution | Evidence | Status |
|----------------------|-------------------------|----------|--------|
| AC-06 | Schema stores device public keys and identifiers only; the enrollment and paired-device tables contain no private-key field. | `docker/postgres-init/60-device-enrollments.sql`; `61-paired-devices.sql`; `060-enrollments-schema.test.ts`; `061-paired-devices-schema.test.ts` | Partial — keystore/runtime proof remains in later Epic 29 stories. |
| AC-10 | `paired_devices` contains the approved-device count index and non-negative `grace_exchange_count`; the rotation idempotency key is cross-device unique. | `docker/postgres-init/61-paired-devices.sql`; `061-paired-devices-schema.test.ts` | Partial — service-level advisory locking and device-limit behavior remain in later Epic 29 stories. |
| AC-02 / AC-07 / AC-08 / AC-10 | Enrollment persists only a validated deep-link or loopback callback URI; approval resolves tenant authority server-side, validates PKCE state and callback allowlist, returns that exact URI with the one-time code/nonce, uses a transaction-scoped advisory lock before the device count, hashes the authorization code, and emits transactional lifecycle audit. Tenant lifecycle events carry a physical `events.workspace_id`; pre-human lifecycle events use a fixed-identity, event-allowlisted scoped function. Callback/audit fields are read only through the scoped approval-context function. | `enroll/route.ts`; `enrollment-service.ts`; `approve/route.ts`; `approval-service.ts`; `device-limit.ts`; migration 064; `enroll-route.test.ts`; `approve-route.test.ts`; `device-limit.test.ts`; `064-approval-context-function.test.ts` | Story 29.5 complete — independent review approved; focused 61 passed and live PostgreSQL 6 passed. |
| AC-06 / AC-08 / AC-09 / NFR5 | `/complete` locks approved enrollment authority, preserves the enrolled label, returns the configured absolute MCP gateway endpoint, rejects replay/expiry, verifies authorization code, nonce, PKCE, and RFC 9421 proof, revalidates membership/workspace, rechecks the advisory-locked device limit, then creates the device, linked first token, completion audit, and consumed enrollment in one app-role transaction. Expiry uses a wall-clock, transition-reporting scoped function so audit/commit occurs only after `EXPIRED` is actually persisted. Failure rolls back credentials and persists constrained denial evidence. Auth audit projection persists the safe `paired_device_id`. | `complete/route.ts`; `complete-service.ts`; migrations 065–066; `scope-derivation.ts`; `principal-context.ts`; `principal-audit.ts`; `mcp-authenticator.ts`; `complete-route.test.ts`; `complete-service.test.ts`; `principal-audit.test.ts`; `completion-transaction.live-db.test.ts` registered in `vitest.config.live-db.ts` | Story 29.6 implementation evidence — focused and real PostgreSQL receipts required before review. |
| AC-09 / AC-11 (partial) | `/challenge` accepts only device ID + purpose, resolves group authority server-side, sets locked-device RLS group/workspace/principal context, stores a 60-second base64url challenge with privacy-safe context, and emits a transactional issued audit. Unresolved devices receive 403 after a fixed-identity, failed `DEVICE_EXCHANGE_DENIED` audit; `PUBLIC` cannot execute that audit function. | `challenge/route.ts`; `challenge-service.ts`; migration 067; `challenge-route.test.ts`; `challenge-service.test.ts`; `challenge-service.live-db.test.ts` registered in `vitest.config.live-db.ts` | Story 29.7 implementation evidence — focused 37/37 and isolated PostgreSQL 2/2; independent review/governance/commit pending. |
| AC-20 | Database backstop allows at most one non-revoked MCP token per paired device. | `docker/postgres-init/62-mcp-tokens-paired-device.sql`; `062-agent-name-trigger.test.ts` | Schema foundation complete; exchange concurrency behavior remains in Story 29.19. |
| AC-26 | DEFERRABLE constraint trigger rejects device tokens whose `agent_name` differs from the linked device's human `principal_id`, while non-device tokens remain unaffected. | `docker/postgres-init/62-mcp-tokens-paired-device.sql`; live PostgreSQL COMMIT test in `062-agent-name-trigger.test.ts` | Story 29.1 schema evidence complete. |
| NFR3 tenant isolation | `paired_devices` and `device_challenges` use strict `group_id` checks, explicit `allura_app` grants, and forced RLS. Pre-auth `device_enrollments` has no direct app table access; approval uses scoped `device_enrollment_approval_context()`, tenant audits persist the physical workspace column, and pre-human audits are fixed-identity function calls. | Migrations 60, 61, 63, 64; live PostgreSQL RLS/privilege tests | Story 29.5 complete; independent review approved and app-role RLS/ACL contracts proven in disposable PostgreSQL. |

### Section 6H: allura device-first portal UI follow-up

These UI receipts do not close Epic 29 external runtime gates or authorize deployment.

| Requirement | Implementation | Evidence / limit |
|-------------|----------------|------------------|
| Device-first navigation, allura brand | `/portal`, `DeviceWorkspace`, shared `DashboardShell`; approved wordmark and scoped brand palette | `portal-page.test.ts`, `device-workspace.test.ts`; real-component browser preview, not live Clerk proof |
| Scoped inventory and lifecycle controls | Existing principal-only device list; confirmed revoke/mark-lost; API failures retain state | `device-workspace.test.ts`; existing auth/service contracts unchanged; no production mutation during validation |
| Device-bound versus account credentials | Exact `paired_device_id` UI filtering; expired/revoked rows excluded; unpaired keys shown separately | `token-inventory.test.ts`; no fabricated binding or app-installation claims |
| Reusable permission profiles | Built-in read-only/read-write presets; server authority remains decisive | `device-workspace.test.ts`; applies to new setup only; no saved custom profile storage |
| Truthful onboarding | Target-device proof remains required; generic token issuer absent in device-specific setup | `device-workspace.test.ts`; universal local adapter, per-client device credential model and OAuth integrations remain pending |

Detailed behavior and release limits: `docs/guides/portal-devices-and-profiles.md`. Exact current gate receipts: `docs/guides/portal-devices-execution.md`.

### Section 7: Use Case Index

| Use Case | Domain Area | Requirements |
|----------|-------------|-------------|
| MEM-UC1 | Trace Ingestion | Record agent execution trace | GM-F1, GM-F2, GM-F3 |
| MEM-UC2 | Trace Ingestion | Reject non-append trace write | GM-F2 |
| MEM-UC3 | Curation | Curate a proposed insight from traces | GM-F4, GM-F5 |
| MEM-UC4 | Approval | Approve a proposed insight | GM-F6, GM-F7 |
| MEM-UC5 | Knowledge Graph | Promote an approved insight to PostgreSQL semantic tables | GM-F8, GM-F9 |
| MEM-UC6 | Retrieval | Retrieve approved knowledge for an agent | GM-F10, GM-F11 |
| MEM-UC7 | Access Control | Enforce access and audit on all reads/writes | GM-F12, GM-F13 |
| MEM-UC8 | E2E Validation | Reuse approved knowledge in a later agent run | GM-F14, GM-F15 |
| MEM-UC9 | Graph Context | Agent context retrieval (traverse from Agent through AUTHORED_BY to Memory) | GM-F16 |
| MEM-UC10 | Curator CLI/API | Admin user authenticates via API key, reviews pending proposals, approves or rejects | GM-F10, GM-F11, GM-F12, GM-F13, GM-F14, GM-F17, GM-F19 |
| MEM-UC11 | Audit Export | Operator exports curator decisions as CSV for compliance | GM-F18 |
| MEM-UC12 | Infrastructure Deploy | Operator runs `docker compose up` and configures packaged MCP servers | GM-F20, GM-F21 |
| MEM-UC13 | Evidence-Gated Run | Team defines a run record, executes through governed skills, reviews evidence, and writes approved outcomes to Brain/Notion | BP-F49, BP-F50, BP-F51, BP-F52 |

---

*This document was compiled from COMPETITIVE-ANALYSIS.md (archived 2026-04-08). Governed pipeline traceability added 2026-04-19. GM-F17–GM-F40 and B12–B23 detail rows added 2026-04-28. Benchmark results updated with actual scores 2026-05-01.*

## Development readiness traceability — 2026-10-20

**AI-assisted delivery specification draft; no implementation or release status advanced.** Source: 2026-10-20 assessment of `28d90e843` plus dirty files. Exact current source/diff and test evidence must be refreshed per story. [Blueprint intent](BLUEPRINT.md#13-development-readiness-backlog--2026-10-20), [Design](DESIGN-ALLURA.md#development-readiness-design--2026-10-20), [Data Dictionary](DATA-DICTIONARY.md#proposed-development-contracts--2026-10-20) and [decisions](RISKS-AND-DECISIONS.md#development-readiness-decisions--2026-10-20) form one contract; the assessment is supporting evidence, not a seventh canonical specification.

### Business coverage

| Business requirement | Functional requirements | Use cases |
|---|---|---|
| [BP-B33](BLUEPRINT.md#bp-b33) | BP-F59–BP-F63, BP-F66–BP-F67 | DEV-UC01–05, DEV-UC08–09 |
| [BP-B34](BLUEPRINT.md#bp-b34) | BP-F64–BP-F65, BP-F68–BP-F69 | DEV-UC06–07, DEV-UC10–11 |
| [BP-B35](BLUEPRINT.md#bp-b35) | BP-F70 | DEV-UC12 |

### Functional coverage

| ID | Requirement | Satisfied by |
|---|---|---|
| [BP-F59](BLUEPRINT.md#bp-f59) | Retry-safe scoped capture | Proposed MCP `memory_add` / compatible `memory_get` receipt read-back · [capture design](DESIGN-ALLURA.md#retry-safe-capture-proposal) · [AD-65](RISKS-AND-DECISIONS.md#ad-65-capture-replay-and-projection-boundary) |
| [BP-F60](BLUEPRINT.md#bp-f60) | Workspace vector insert/search | Internal bridge and MCP `memory_search` / governed retrieval API · [vector seam](DESIGN-ALLURA.md#workspace-vector-seam-proposal) · [AD-66](RISKS-AND-DECISIONS.md#ad-66-workspace-authority-through-vector-paths) |
| [BP-F61](BLUEPRINT.md#bp-f61) | Governed immutable correction | Proposed `memory_update` vNext + existing approval service · [correction design](DESIGN-ALLURA.md#governed-semantic-correction-proposal) · [AD-67](RISKS-AND-DECISIONS.md#ad-67-governed-correction-and-semantic-head-concurrency) |
| [BP-F62](BLUEPRINT.md#bp-f62) | Reviewed revision precondition | `POST /api/curator/approve` · [review extension](DESIGN-ALLURA.md#reviewed-revision-and-delivery-extensions) · [DOC-06](RISKS-AND-DECISIONS.md#documentation-reconciliation-decisions--2026-10-18) |
| [BP-F63](BLUEPRINT.md#bp-f63) | Confirmed remote delivery | Outbox/Notion bridge + proposed observation reader · [delivery extension](DESIGN-ALLURA.md#reviewed-revision-and-delivery-extensions) · [DOC-07](RISKS-AND-DECISIONS.md#documentation-reconciliation-decisions--2026-10-18) · [AD-68](RISKS-AND-DECISIONS.md#ad-68-readiness-evidence-and-maintenance-plan) |
| [BP-F64](BLUEPRINT.md#bp-f64) | Behavioral tests and required discovery | Current package test lanes plus explicit suite inventory · [quality contracts](DESIGN-ALLURA.md#quality-operations-and-maintenance-contracts) · [RK-40](RISKS-AND-DECISIONS.md#rk-40) |
| [BP-F65](BLUEPRINT.md#bp-f65) | Reproducible lint/typecheck/test CI | Existing main/epic workflows and package scripts · [quality contracts](DESIGN-ALLURA.md#quality-operations-and-maintenance-contracts) · [AD-68](RISKS-AND-DECISIONS.md#ad-68-readiness-evidence-and-maintenance-plan) |
| [BP-F66](BLUEPRINT.md#bp-f66) | Truthful outcomes and safe correlation | Canonical memory tools, dashboard reader and metrics · [quality contracts](DESIGN-ALLURA.md#quality-operations-and-maintenance-contracts) · [AD-68](RISKS-AND-DECISIONS.md#ad-68-readiness-evidence-and-maintenance-plan) |
| [BP-F67](BLUEPRINT.md#bp-f67) | Labeled retrieval baseline | Existing evaluation/replay harness + proposed labeled set · [quality contracts](DESIGN-ALLURA.md#quality-operations-and-maintenance-contracts) · [AD-68](RISKS-AND-DECISIONS.md#ad-68-readiness-evidence-and-maintenance-plan) |
| [BP-F68](BLUEPRINT.md#bp-f68) | Authenticated dashboard acceptance | Existing read pages and full journey · [quality contracts](DESIGN-ALLURA.md#quality-operations-and-maintenance-contracts) · [ENT-01–ENT-05](RISKS-AND-DECISIONS.md#enterprise-dashboard-open-contracts--2026-10-19) / [DOC-02 and DOC-09](RISKS-AND-DECISIONS.md#documentation-reconciliation-decisions--2026-10-18) |
| [BP-F69](BLUEPRINT.md#bp-f69) | Dependency/SDK/dead-code cleanup | Root/public SDK and CLI consumers, package tooling · [quality contracts](DESIGN-ALLURA.md#quality-operations-and-maintenance-contracts) · [AD-68](RISKS-AND-DECISIONS.md#ad-68-readiness-evidence-and-maintenance-plan) |
| [BP-F70](BLUEPRINT.md#bp-f70) | Evidence-backed capabilities and usage | Existing agent/Cowork workflows and canonical guidance · [usage design](DESIGN-ALLURA.md#capability-and-usage-guidance) · [AD-68](RISKS-AND-DECISIONS.md#ad-68-readiness-evidence-and-maintenance-plan) |

### Acceptance evidence and use-case index

All DEV-UC labels are defined in [Design Use Cases](DESIGN-ALLURA.md#use-cases-1). The following acceptance criteria specify future evidence, not checks executed by this documentation update.

| Acceptance ID | Use case / requirement | Required positive and negative evidence |
|---|---|---|
| DEV-AC01 | DEV-UC01 / BP-F59 | Public transport concurrent same-key replay yields one `memory_add` event, one receipt and one index intent; changed payload conflicts; other principal/workspace cannot replay/read; crash before commit writes none, lost acknowledgement reconciles same receipt; provider outage leaves durable capture and retryable indexing |
| DEV-AC02 | DEV-UC02 / BP-F60 | Restricted-role integration vector and lexical queries isolate two workspaces; denied/missing/forged/legacy scope fails closed; pool reuse cannot retain authority; dimensions mismatch and provider timeout remain observable; superseded/deprecated absent from current results |
| DEV-AC03 | DEV-UC03 / BP-F61 | Correction enters pending review; self-approval denied; concurrent approved corrections create one current head; old content/edges preserved; stale base conflicts; inject each durable-write failure and prove rollback/replay through production service |
| DEV-AC04 | DEV-UC04 / BP-F62 | DOC-06 missing/malformed version fails; v3 review versus v4 conflicts with no new writes; original same-key successful replay remains byte-equivalent; persisted reviewed and resulting versions are distinct and accurate |
| DEV-AC05 | DEV-UC05 / BP-F63 | DOC-07 local delivered/HTTP success cannot show synced; eligible bridge enqueues once; retry-before-available is not claimed; timeout reconciles same destination and read-back digest; changed source/destination conflicts; revoked transfer stops; immutable decision receipt unchanged |
| DEV-AC06 | DEV-UC06 / BP-F64 | Inventory names each critical test file and lane; deliberate exclusion causes nonzero failure; real auth/approval/retrieval entrypoints deny foreign scope, requester approval and missing evidence; receipt-boundary failure is covered; replace obsolete source-text assertion with behavior |
| DEV-AC07 | DEV-UC07 / BP-F65 | Clean runner logs pinned runtime and lock digest, frozen install makes no lock change, actual ESLint and separate typecheck run, required suite counts are nonzero; induced lint/discovery failures fail main CI |
| DEV-AC08 | DEV-UC08 / BP-F66 | Inject write failure, partial indexing and dashboard error; correct stage/outcome counts and safe correlation join; no raw content/credentials/foreign scope in logs or high-cardinality metric labels; timeout reports unknown rather than disconnected |
| DEV-AC09 | DEV-UC09 / BP-F67 | Human-reviewed versioned current/history/no-answer/foreign-scope set; mode-labeled baseline with sample sizes, freshness and relevance metrics, p50/p95 and timeouts/fallback stages; zero unauthorized results; agreed budgets and holdout evaluation before tuning acceptance |
| DEV-AC10 | DEV-UC10 / BP-F68 | Authorized multi-user capture/review/receipt/retrieval journey plus denial, revocation, stale review and responsive/accessibility evidence; synthetic preview unmistakable; work items unavailable until ownership/board decision; deployment revision/target acceptance before released |
| DEV-AC11 | DEV-UC11 / BP-F69 | Import/export/runtime consumer inventory; Next/ESLint compatibility evidence, Vitest lane migration evidence and packed SDK/CLI smoke tests; removed code proven unused; historical migrations/fail-closed stubs preserved; official version/advisory evidence dated at implementation |
| DEV-AC12 | DEV-UC12 / BP-F70 | Capability table includes owner, source revision/date, evidence class, limitations and example requests; SDK/CLI/Notion/Bumblebee not overclaimed; no unmeasured usage claim; active unverifiable benchmarks/compliance/stability guarantees qualified and linked to evidence |

### Development slices and handoff gates

Execution packets: [DEV-00–10 handoffs and decision proposals](../reference/development-readiness-20261021/story-packets.md). These supporting packets preserve the canonical acceptance below; the integration inventory and source manifest identify exclusions and revision limits.


**Readiness vocabulary:** Ready = bounded story can be prepared/executed under already authorized scope and stated prerequisites; Needs a decision = owner must approve a listed proposal before the affected implementation; Blocked = concrete missing authority/evidence prevents that work. This documentation request authorizes preparation only; “Ready” below is not permission to mutate code/config/schema or publish. No row is Done, Approved or released.

| Slice / order | Concrete deliverable and requirement | Readiness and dependency | Accountable implementation owner / independent review |
|---|---|---|---|
| DEV-00 / A | Read-only deployment/migration/restricted-role inventory, active transport/tool catalogue, current diff manifest | Ready for accessible read-only evidence; deployed facts Blocked where operator access absent | Hightower with Scout evidence / Knuth + Brooks |
| DEV-01 / A | Critical suite discovery and production-behavior regression plan; BP-F64, DEV-AC06 | Ready for inventory/test-story preparation; actual DB mutation uses disposable environment only | Woz / Pike + Fowler |
| DEV-02 / A | Main CI pin/frozen install/real lint story; BP-F65, DEV-AC07 | Needs a decision: AD-68 authoritative lanes/runtime and config-change approval; depends DEV-01 | Hightower / Fowler |
| DEV-03 / B | Capture service/replay/receipt/index-intent; BP-F59, DEV-AC01 | Needs a decision: AD-65 API compatibility, canonicalization, transactional storage and retry policy; schema approval and DEV-00/01 | Woz / Knuth + Pike |
| DEV-04 / B | Workspace-authorized vector seam and failure-aware indexing; BP-F60, DEV-AC02 | Needs a decision: AD-66; deployed migration/role inventory, scoped fixtures and DEV-03 integration contract | Woz / Knuth + Pike |
| DEV-05A / B | Governed correction/new-head concurrency; BP-F61, DEV-AC03 | Needs a decision: AD-67; no restore or duplicate-policy work without DOC-03/05 decisions; DEV-03/04 | Woz / Knuth + Pike |
| DEV-05B / B | DOC-06 reviewed-version request/receipt implementation; BP-F62, DEV-AC04 | Ready for bounded story against approved behavior; additive schema/API details need ordinary review/approval; DEV-01, independent acceptance required | Woz / Knuth + Pike |
| DEV-06 / B | DOC-07 durable handoff, eligible retries and remote read-back; BP-F63, DEV-AC05 | Needs a decision: AD-68 implementation details and verified destination/transfer authority; absent grant blocks remote writes, not local design | Woz / Hightower + Knuth |
| DEV-07 / A then C | Outcome correctness diagnostics then proposed safe correlation; BP-F66, DEV-AC08 | Ready for read-only failure-path inventory; Needs a decision for new telemetry fields/retention/destinations under AD-68 | Woz / Hightower + Pike |
| DEV-08 / C | Labeled retrieval baseline then bounded tuning; BP-F67, DEV-AC09 | Ready for authorized fixture/label planning; Needs a decision for budgets under AD-68; tuning depends DEV-04 and accepted baseline | Bellard or Carmack / Knuth + human label reviewer |
| DEV-09 / C | Dependency/SDK/dead-code/claims cleanup and usage guide; BP-F69/70, DEV-AC11/12 | Ready for consumer inventory and canonical guidance drafting; Needs a decision for upgrades/removal/deprecations under AD-68 | Fowler + Woz / Pike + Hightower; Brooks owns claims |
| DEV-10 / C | Authenticated full dashboard journey; BP-F68, DEV-AC10 | Blocked for work-item stories by workspace ownership/DOC-09; Needs a decision for DOC-02/ENT contracts; memory acceptance depends DEV-03–06 | Woz / Pike + Munari (actual scoped invocation only) |

**Three highest-value implementation packets:** DEV-03/04 (capture-to-retrieval correctness), DEV-05A/05B (governed correction and reviewed approval), then DEV-01/02/07/08 (trustworthy checks and operational evidence). Phase A read-only/inventory slices can proceed while new design choices are reviewed; Phase B supplies disposable-environment contract evidence; Phase C tunes and completes daily-use surfaces after core correctness.

Every implementation handoff includes objective/non-goals, source SHA plus dirty-diff digest, tenant/workspace and authority provenance, owning B/F/UC/AC IDs, Proposed/approved decision references, exact touched files/schema versions, one writer and independent reviewers, test commands/lane inventory, negative cases, receipt/read-back expectations, rollback plan and approval boundary. Use the repository-owned `allura-dev-story` for implementation and `allura-code-review` for the reviewed actual diff, under AI-GUIDELINES workflow authority; retired methodology artifacts do not govern execution. Assigned roles are future responsibilities, not claims that specialists ran. Local `.opencode/DEVELOPMENT-READINESS.md` examples with old endpoints/adapters or completion markers are reconciliation debt, not current acceptance authority; use the canonical authenticated MCP endpoint and current package scripts.

**Evidence to collect per story:** current revision/diff, runtime/lockfile versions, exact package-script commands, discovered suite counts, pass/fail/skip counts and exit codes, scoped disposable-DB fixtures/migrations/role, injected failure results, actual reviewer verdict, permitted live read-back and separately authorized deployment evidence. Store logs/receipts/screenshots outside `docs/allura/`. Prior 200-pass/one-fail assessment numbers and source existence are baseline only. No code tests, production writes or release verification are implied by a documentation guard pass.

## Cloudflare Access migration acceptance

Sabir selected Clerk removal and Cloudflare Access replacement on 2026-10-20 ([AD-69](RISKS-AND-DECISIONS.md#AD-69-cloudflare-access-replaces-clerk)). The provider decision is accepted for repository implementation; live Access policy, grants, credentials and release are not changed by this decision. BP-B36 maps to BP-F71–BP-F74 and CF-UC01–04 in [Design](DESIGN-ALLURA.md#cloudflare-access-security-contract).

| ID | Requirement | Satisfied by |
|---|---|---|
| BP-F71 | Signed human Access identity | Shared Cloudflare verifier in proxy and server dashboard boundary; CF-AC01/02 |
| BP-F72 | Stable principal and live resource authority | Explicit issuer/subject binding plus restricted membership/workspace lookup; CF-AC03 |
| BP-F73 | Complete active provider replacement | Login/layout, source exports, device copy/harness, package/lock, example setup and canonical docs; CF-AC04 |
| BP-F74 | Security and compatibility acceptance | Current-revision cryptographic/authority/route/login/device regressions and independent review; CF-AC01–05 |

| Acceptance | Evidence required |
|---|---|
| CF-AC01 | Real local-key JWT tests: correct RS256 signature, issuer/AUD/time/app/human claims accepted; forged/unsigned/wrong key or audience, expiry/future issuance, missing claims, token conflict and service identity denied |
| CF-AC02 | Forged x-allura-* or email headers confer no authority; keyless/partial/invalid config and all production DevAuth flag combinations fail closed; same scope/action manifest continues to enforce 401/403; signed human unsafe requests with foreign/missing/opaque Origin or cross-site Fetch Metadata deny, exact same-origin succeeds; machine route authentication remains independent |
| CF-AC03 | Bound subject retains stable user ID; missing/removed membership, demotion, foreign/missing/locked workspace and lookup failure deny or reduce access on next resolution; no email linking/default grants |
| CF-AC04 | No active Clerk runtime dependency/import/widget/setup path; sanitized login return and no auth loop; provider-neutral pairing recovery and Access evidence; existing negative auth/device/MCP tests retained |
| CF-AC05 | Separately authorized live walkthrough proves Access application/issuer/AUD/bindings, origin protection, MFA/session policy and revocation, workspace isolation and human/device/MCP continuity on deployed revision |

**Readiness — historical source-local verification 2026-10-20:** Reported implemented and locally verified in the dirty source checkout, not this integrated revision for CF-AC01–04: signed JWT/authority/CSRF/auth regression suite 372 passing; full unit lane, production build, standalone typecheck, manifest and canonical-document guards passed. The unit lane uses a synthetic test-only secret and mocked/local services; skipped/live lanes are not release evidence. Pike found a cross-site mutation gap, now corrected and independently rechecked; Fowler found stale environment fixtures and fallback wording, now corrected. Exact final counts, source digests, commands, reviews and logs are in `artifacts/cloudflare-access-migration-20261020/receipt.json`. No deployed claim follows. Live release remains Blocked until CF-AC05 and actual operator configuration evidence. Brooks owns delivery; Woz built the authentication seam; Pike reviewed identity/interface/security boundaries; Fowler reviewed removal/compatibility.


## Preview reliability acceptance — 2026-10-20

**Approved documentation direction; implementation open.** These acceptance cases specialize existing [BP-F64/65](BLUEPRINT.md#bp-f64) quality/reproducibility and [BP-F68](BLUEPRINT.md#bp-f68) dashboard intent, alongside Sabir's direct preview-hardening approval. They do not approve unresolved backend contracts. See [Design](DESIGN-ALLURA.md#approved-preview-reliability-direction--2026-10-20), [AI Guidelines](../../guidelines/AI-GUIDELINES.md#approved-reliability-priorities--2026-10-20) and [RK-42–44](RISKS-AND-DECISIONS.md#preview-reliability-risks--2026-10-20).

| ID | Required evidence | Status / owner |
|---|---|---|
| PV-AC01 | Tracked app/adapters/assets/license/dependency/test inventory; clean checkout and frozen install build; actual critical tests discovered; deliberate missing-suite failure; independently verified React/HTML artifact identity | Open; Hightower + Woz, independent Fowler review |
| PV-AC02 | Actual route tests for fractional/negative/nonfinite/oversized/non-numeric record values and unknown IDs; injected render failure shows recoverable screen while shell/navigation and shared work remain usable | Open; Woz, independent Pike review |
| PV-AC03 | Indexed/cached graph model; List skips layout; search/selection do not rebuild unchanged layout; bounded expansion; paused/hidden behavior measured; browser CPU/memory/input timings on declared 100/500/2,000/5,000-node fixtures and device/network conditions against agreed budgets | Open; Woz + Carmack, independent review |
| PV-AC04 | With an approved real-data contract: server-enforced page/type/response bounds and filtering/sorting; 100,000-order disposable fixture; representative concurrent requests and slow-device measurements; no whole-dataset client fetch disguised as pagination | Open; Knuth + Woz; backend decision/release gates remain |
| PV-AC05 | With approved persistence/auth contracts: conflicting two-session edits, save acknowledgement loss and same-operation retry, duplicate/out-of-order connector delivery, access revocation and reload/recovery preserve scope and durable state; evidence distinguishes sample and real behavior | Open; Woz + Knuth/Pike; reuse DEV-AC01/02/04/05/10 |

Record measured acceptance budgets before marking PV-AC03/04 passed. The earlier isolated 5,000-node timing and 34-row store demo are baselines, not acceptance at scale. The documentation authoring/validation pass closes none of these rows.

## Backend adversarial acceptance — 2026-10-20

**Assessment and regression targets, not completed remediation or automatic approval of new security/schema/retry policy.** [Review evidence](../archive/allura/backend-adversarial-review-2026-10-20.md) records current-source probes and deployment uncertainty. Follow [AI Guidelines §12](../../guidelines/AI-GUIDELINES.md#12-reliability-and-backend-adversarial-review) and existing DEV/CF acceptance; the backend scope includes web/MCP ingress, authority, capture/retrieval, projections, workers, backup/restore and operational execution.

| ID | Review finding(s) | Required evidence before closure | Existing trace / owner |
|---|---|---|---|
| BE-AC01 | BE-01, BE-04 | Foreign tenant/workspace/actor selectors rejected before storage or replaced by server-issued authority; test each reachable web/server-action/MCP route; anonymous health returns only intended coarse status; restricted-role integration plus deployment origin/revocation proof | DEV-AC06/10, CF-AC02/03/05; Pike + Woz |
| BE-AC02 | BE-02, BE-03, BE-06 | Agree finite body/response/query/concurrency budgets; preauth oversized/chunked/slow requests rejected within bounds; forwarding headers cannot reset quotas outside an explicitly trusted proxy contract; limits reject invalid/negative/excessive inputs; large disposable fixture and memory/latency evidence | DEV-AC06/08/09; Hightower + Pike |
| BE-AC03 | BE-05 | Default and each supported retrieval mode tested with relevant/unrelated/no-answer queries and filters; distinguish confidence from query relevance; current/history and foreign-workspace fixtures; ranking/no-match semantics and p50/p95 baseline | DEV-AC02/09; Knuth + human relevance reviewer |
| BE-AC04 | BE-07 | Inject failure after durable capture and lost response; same approved operation key returns original identity/receipt, changed payload conflicts; projection/scoring status separate from persistence; test actual transaction boundary after AD-65 decisions | DEV-AC01, AD-65/RK-36; Knuth + Woz |
| BE-AC05 | BE-08 | Verified tenant/workspace/principal carried through all vector insert/search paths; migration/role inventory; restricted-role same-tenant foreign-workspace, missing-context and pooled-reuse negatives; denied scope never broadens fallback | DEV-AC02, AD-66/RK-37; Knuth + Pike |
| BE-AC06 | BE-09 | Future available_at rows not claimed; claims obey attempt/ownership policy; failure bookkeeping cannot reopen delivered work; deterministic two-worker rollback/success interleaving and restart tests; no duplicate delivery receipt | DEV-AC05, DOC-07/RK-39; Knuth + Hightower |
| BE-AC07 | BE-10 | One bounded streaming dump pipeline; non-secret command evidence; output above prior buffer threshold and representative DB sizes; partial-file/timeout cleanup and failure status; authorized disposable restore confirms usable output | DEV-AC08, existing recovery requirements; Hightower |
| BE-AC08 | BE-11, BE-12 | Hash actual selected archive bytes; reject missing/mismatching integrity evidence; immutable per-run identity; restore exactly the verified manifest artifact; two same-day backups with distinct data restore intended revision in disposable environment | Existing recovery requirements, RK-48; Hightower + Knuth |
| BE-AC09 | BE-13 | Step-start/persistence/handler rejection cannot produce completed run; allSettled rejection and terminal-state checks; bounded concurrency/cancellation evidence; confirm actual runtime callers before claiming deployed impact or remediation | DEV-AC06/08, RK-49; Woz + Pike |

All BE acceptance rows remain **Open**. Mock/offline reproductions establish the stated source behavior only; they do not prove an active production exploit, deployed database grants, backup recoverability, or live workload capacity.

## Proposed documentation and first-use acceptance — 2026-10-20

AI-assisted response to Sabir's Reddit-feedback review. These proposed checks extend REQ-UX-001; they are not approved product requirements or completed user research. The [audit and complete README/visual inventory](../reference/reddit-feedback-remediation-20261020.md) records the evidence, audience conflict, proposed ownership and rollout. Notion work-item state has not changed.

| ID | Proposed demonstration | Evidence state |
|---|---|---|
| UX-R01 | Four of five unfamiliar intended readers explain purpose, audience and next step after 30 seconds, without coaching | Open — human study not run |
| UX-R02 | Four of five intended evaluators complete setup, authenticated save and retrieval without facilitator help; retain time, errors and help requests | Open — shared guide repaired for a provisioned endpoint; clean-install and live round-trip tests not run |
| UX-R03 | All five distinguish saved evidence from approved knowledge and identify the human promotion decision | Open — misunderstanding requires revision and retest |
| UX-R04 | Root README has one primary action and at most one explanatory image; technical depth is reachable by task | Local task-focused README prepared; comprehension and publication pending |
| UX-R05 | Every retained graphic answers one named question and is legible at desktop and 390px phone width, with meaningful text equivalent | Independent QA passes for three new desktop/phone educational drafts; legacy assets dispositioned, human comprehension open |
| UX-R06 | Observe and report manual setup, operating/review effort and failure recovery; assign agent/service/human responsibilities explicitly | Open — no self-management or productivity claim established |
| UX-R07 | Current claim sources and revision states agree across README, source graphics, exports and demo; verify published links without credentials | Local source/export/link checks and scoped review recorded; published-revision check remains open |

Five participants provide formative usability evidence, not statistical proof of productivity gains. Agent reviews do not substitute for those people. Existing functional, tenant-boundary, human-approval and release requirements remain in force.

### Fresh-evidence search repair checks

[AD-70](RISKS-AND-DECISIONS.md#ad-70-bounded-candidate-eligibility-for-fresh-evidence-search) adds a bounded source repair under UX-R02/BE-AC03. Required offline regressions: full graph or vector candidate capacity still queries authorized raw events; matching event survives final truncation without score inflation; explicit minimum-confidence filter applies; ID/content duplicate resolution retains durable metadata; empty queries get no literal bonus; approved-only retrieval excludes raw events; final limit/workspace scope remain enforced; source-failure warnings, attempted stores and the response's degraded flag agree. Explicit all-mode defaults an omitted limit to 10, validates a supplied finite number in 1..100 before floor normalization, and rejects invalid input before any store call. State: **implemented and independently reviewed locally**. Producer verification: 66 search plus 17 contract tests pass; Pike and Fowler each independently reran 66/66 search tests and verified their findings corrected. The [review](../reference/reddit-remediation/technical-review.md) and [maintainability receipt](../reference/reddit-remediation/maintainability-review.md) identify final source hashes and process limitations. This response check is not a service-wide health guarantee. Configured-service exact-record search, two-session proof and the broader human-labeled relevance baseline remain open regardless of offline results.
