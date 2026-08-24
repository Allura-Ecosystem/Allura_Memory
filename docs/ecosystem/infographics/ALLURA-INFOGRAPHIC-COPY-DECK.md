# Allura Infographic Collection — On-Canvas Copy Deck

**Owner:** Ogilvy, Team Durham copywriter
**Prepared:** 2026-08-15
**Status:** Revised after Kotler review — no unresolved copy corrections
**Strategy authority:** [ALLURA-INFOGRAPHIC-STRATEGY.md](./ALLURA-INFOGRAPHIC-STRATEGY.md)
**Production boundary:** Copy only. No visual direction, layouts, or images are approved by this document.

## Collection voice lock

- Evidence-first, calm, human-accountable, technically credible, and clear to nontechnical readers.
- **Allura Memory** is the governed memory service. **Allura Brain** is its functional alias.
- Activity is evidence, not automatically knowledge. Canonical semantic knowledge passes through governance.
- Human approval remains the explicit accountability boundary; automated curator and queued-materialization behavior must remain visible as unresolved implementation caveats.
- Operations are tenant-scoped. Updates preserve history through supersession.
- Plugins extend workflows; they do not bypass Allura Memory governance.
- A role perspective, prepared handoff, or example packet is not proof of runtime execution.

---

## 1. Allura Ecosystem at a Glance

**Kotler status:** Conditionally approved for conceptual copy
**Classification:** Public core with technical annotation
**Visible-copy count:** 160 words

### On-canvas copy

**Eyebrow:** Allura at a glance

**Headline:** One Brain. Three Workflows.

**Introduction:** Allura connects governed memory with focused workflows for coordination, brand production, and software delivery.

**Allura Memory**
The governed memory service captures evidence, supports review, and returns context within tenant scope.

**Allura Brain**
The functional name for Allura Memory—not a separate product or a second source of truth.

**Allura Plugins**
Three focused packages extend the system: Allura Cowork, Team Durham, and Team RAM Coding.

**Distinct runtimes**
Claude and Codex remain separate execution surfaces. A label alone does not prove either runtime acted.

**Governed flow**
Activity becomes evidence first. Governance determines what may become durable, reusable knowledge.

**Diagram labels:** Context and agents → Governed interfaces → Evidence → Review → Approved knowledge → Scoped retrieval; Allura Cowork; Team Durham; Team RAM Coding; Claude runtime; Codex runtime

**Required metric labels:** None

**Bottom-line takeaway:** Start with governed memory. Then choose the workflow that matches the work.

**Call to action:** Choose your Allura workflow.

### Editorial and evidence notes

**Accessibility alt-text draft:** Ecosystem map centered on Allura Memory, also called Allura Brain. A governed evidence-to-knowledge flow surrounds it, followed by three plugin workflows and separate Claude and Codex runtime surfaces.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 1.1 | Allura Memory is the canonical governed memory service; Allura Brain is its functional alias. | [`Allura-ecosystem/README.md:27-33`](../../README.md); [`Allura-ecosystem/README.md:99-113`](../../README.md) |
| 1.2 | Governed memory separates evidence, review, approved knowledge, scoped retrieval, and provenance. | [`Allura-ecosystem/README.md:50-97`](../../README.md); [`Allura_Memory/README.md:39-63`](../../../Allura_Memory/README.md) |
| 1.3 | Allura Plugins distributes Allura Cowork, Team Durham, and Team RAM Coding as three public packages. | [`allura-plugins/README.md:39-45`](../../../allura-plugins/README.md); [`allura-plugins/.claude-plugin/marketplace.json:9-30`](../../../allura-plugins/.claude-plugin/marketplace.json) |
| 1.4 | Claude and Codex are distinct runtime surfaces, and execution requires actual invocation evidence. | [`allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md:35-42`](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md); [`allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md:53-64`](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md) |

**[DATA NEEDED]:** Authoritative ecosystem inventory; approved outer-ring product relationships; repository visibility; current deployment status; approved client names; canonical Team Durham repository slug.

---

## 2. The Governed Memory Lifecycle

**Kotler status:** Approved with promotion caveats
**Classification:** Public core with technical/operator notes
**Visible-copy count:** 161 words

### On-canvas copy

**Eyebrow:** Governed memory lifecycle

**Headline:** How Evidence Becomes Knowledge

**Introduction:** Allura separates recorded activity from approved knowledge through a governed, tenant-scoped lifecycle.

**1. Capture evidence**
Activity is appended as an evidence event and projected for episodic search.

**2. Evaluate and propose**
Scoring may create a promotion proposal. A proposal is still evidence—not approved truth.

**3. Record the decision**
Governance records the actor, rationale, decision, and source. Human approval is the accountable boundary; automated curator behavior remains under review.

**4. Materialize knowledge**
Approval authorizes or queues a canonical semantic version. Materialization is not universally instantaneous.

**5. Retrieve and revise**
Approved knowledge is retrieved within tenant scope. Updates create a new version and preserve prior history through supersession.

**Process labels:** Capture → Score → Propose → Governance review → Authorize or queue → Canonical knowledge → Scoped retrieval → Supersede

**Required metric labels:** None

**Bottom-line takeaway:** Treat activity as evidence until governance authorizes durable knowledge.

**Call to action:** Check approval state before reuse.

### Editorial and evidence notes

**Accessibility alt-text draft:** Six-stage lifecycle showing captured activity becoming episodic evidence, a scored proposal, a governance decision, authorized or queued canonical knowledge, tenant-scoped retrieval, and a supersession loop preserving history.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 2.1 | `memory_add` appends an evidence event and creates an episodic vector projection. | [`Allura_Memory/src/mcp/canonical-tools.ts:163-216`](../../../Allura_Memory/src/mcp/canonical-tools.ts) |
| 2.2 | Eligible evidence can be queued in `canonical_proposals` with a source `trace_ref`. | [`Allura_Memory/src/mcp/canonical-tools.ts:302-322`](../../../Allura_Memory/src/mcp/canonical-tools.ts); [`Allura_Memory/docs/allura/DATA-DICTIONARY.md:152-167`](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md) |
| 2.3 | Governance decisions retain actor, rationale, trace reference, and resulting state. | [`Allura_Memory/src/lib/memory/approval-audit.ts:55-69`](../../../Allura_Memory/src/lib/memory/approval-audit.ts); [`Allura_Memory/src/lib/memory/approval-audit.ts:355-390`](../../../Allura_Memory/src/lib/memory/approval-audit.ts) |
| 2.4 | One approval surface reports queued/pending materialization rather than universal immediate synchronization. | [`Allura_Memory/src/app/api/curator/approve/route.ts:404`](../../../Allura_Memory/src/app/api/curator/approve/route.ts); [`Allura_Memory/scripts/drain-promotion-outbox.ts:1-8`](../../../Allura_Memory/scripts/drain-promotion-outbox.ts) |
| 2.5 | Canonical versions and supersession relationships use PostgreSQL graph tables. | [`Allura_Memory/docker/postgres-init/21-graph-adapter-tables.sql:30-109`](../../../Allura_Memory/docker/postgres-init/21-graph-adapter-tables.sql) |
| 2.6 | Current code contains an automated curator path described as a HITL bypass. | [`Allura_Memory/src/mcp/curator-tools.ts:457-520`](../../../Allura_Memory/src/mcp/curator-tools.ts); [`Allura_Memory/src/mcp/canonical-http-gateway.ts:709-714`](../../../Allura_Memory/src/mcp/canonical-http-gateway.ts) |

**[DATA NEEDED]:** Approved public wording for automated curator mode; end-to-end promotion behavior by interface; synchronous-versus-queued behavior for the target deployment.

---

## 3. Episodic Evidence vs. Semantic Knowledge

**Kotler status:** Approved
**Classification:** Shared public/technical structure
**Visible-copy count:** 149 words

### On-canvas copy

**Eyebrow:** Two governed logical layers

**Headline:** Evidence Is Not Knowledge

**Introduction:** One PostgreSQL engine supports two governed logical layers with different jobs and different trust states.

**Episodic evidence**
Records what happened: activity, context, runtime, scope, status, and outcome.

**Searchable, not canonical**
Fresh evidence can support retrieval without becoming approved semantic truth.

**Governance bridge**
Scoring and review determine whether evidence may become durable knowledge.

**Semantic knowledge**
Stores curated, approved meaning with provenance, versioning, and explicit relationships.

**History stays visible**
Updates create new semantic versions. Supersession preserves the earlier record instead of silently overwriting it.

**Comparison labels:** What happened / What is approved; Episodic / Semantic; Evidence event / Canonical memory; Search projection / Graph relationship; Fresh context / Durable reuse; Governance gate

**Required metric labels:** None

**Bottom-line takeaway:** Ask which layer a result came from before relying on it.

**Call to action:** Choose approved-only retrieval when canonical knowledge is required.

### Editorial and evidence notes

**Accessibility alt-text draft:** Side-by-side comparison. Episodic evidence records searchable activity and context. A governance gate separates it from semantic knowledge, which is curated, versioned, related, and preserved through supersession.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 3.1 | Allura distinguishes episodic evidence from approved semantic knowledge. | [`Allura_Memory/README.md:39-63`](../../../Allura_Memory/README.md) |
| 3.2 | Event records include tenant, agent, session, workflow, step, parent, runtime, status, outcome, and timestamps. | [`Allura_Memory/docs/allura/DATA-DICTIONARY.md:87-110`](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md) |
| 3.3 | The active semantic path uses PostgreSQL graph tables behind the RuVector adapter. | [`Allura_Memory/README.md:128-135`](../../../Allura_Memory/README.md); [`Allura_Memory/src/lib/graph-adapter/factory.ts:1-35`](../../../Allura_Memory/src/lib/graph-adapter/factory.ts) |
| 3.4 | Approved-only and default beta retrieval can include different record sets. | [`Allura_Memory/src/mcp/canonical-tools.ts:357-380`](../../../Allura_Memory/src/mcp/canonical-tools.ts); [`Allura_Memory/src/mcp/canonical-tools.ts:563-620`](../../../Allura_Memory/src/mcp/canonical-tools.ts) |
| 3.5 | Supersession records a newer semantic version pointing to the preserved earlier version. | [`Allura_Memory/docker/postgres-init/21-graph-adapter-tables.sql:87-109`](../../../Allura_Memory/docker/postgres-init/21-graph-adapter-tables.sql) |

**[DATA NEEDED]:** Native RuVector extension/crate readiness; target deployment’s retrieval default; database-level evidence that direct event mutation is physically prevented.

---

## 4. A Governed Memory Leaves Evidence

**Kotler status:** Evidence-safe fallback approved by owner
**Original blocked title:** Every Memory Comes With a Receipt
**Approved evidence-safe title:** A Governed Memory Leaves Evidence
**Classification:** Technical/internal pending receipt-coverage validation
**Visible-copy count:** 144 words

### On-canvas copy

**Eyebrow:** Provenance across the lifecycle

**Headline:** A Governed Memory Leaves Evidence

**Introduction:** Allura records inspectable context across capture, proposal, governance decision, and canonical lineage.

**Capture record**
Tenant, source, runtime context, workflow lineage, and timestamps show where the evidence began.

**Proposal record**
The candidate retains its source trace, score, reasoning, tier, and review status.

**Decision record**
Curator audit data records the decision, actor, rationale, time, prior state, and resulting state.

**Canonical record**
Approved knowledge retains provenance, version, lifecycle state, and links to superseded history.

**Inspect, then judge**
A receipt can make a claim inspectable. It cannot make the claim true.

**Diagram labels:** Source evidence → Proposal → Decision → Canonical version → Superseded version; Tenant; Actor; Rationale; Trace reference; Status; Provenance

**Required metric labels:** None

**Bottom-line takeaway:** Inspect provenance and approval state before treating a memory as canonical.

**Call to action:** Follow the evidence trail.

### Editorial and evidence notes

**Strategic resolution:** The owner approved the narrower title for copy development. The absolute original remains blocked, and the approved title does not imply universal, unified, or cryptographically chained receipts.

**Accessibility alt-text draft:** A four-stage evidence trail connects a capture record, proposal record, governance decision, and canonical version. Field callouts show tenant, actor, rationale, trace reference, status, provenance, and preserved history.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 4.1 | Evidence events record tenant and execution context, workflow lineage, source data, and timestamps. | [`Allura_Memory/docs/allura/DATA-DICTIONARY.md:87-110`](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md); [`Allura_Memory/src/mcp/canonical-tools.ts:163-198`](../../../Allura_Memory/src/mcp/canonical-tools.ts) |
| 4.2 | Promotion proposals carry a source `trace_ref`, scoring/reasoning, tier, status, and decision fields. | [`Allura_Memory/docs/allura/DATA-DICTIONARY.md:152-190`](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md) |
| 4.3 | The implemented curator receipt records proposal, tenant, decision, actor, rationale, time, trace reference, and prior/resulting state. | [`Allura_Memory/src/lib/memory/approval-audit.ts:55-69`](../../../Allura_Memory/src/lib/memory/approval-audit.ts); [`Allura_Memory/src/lib/memory/approval-audit.ts:355-390`](../../../Allura_Memory/src/lib/memory/approval-audit.ts) |
| 4.4 | Canonical memory stores provenance/version data, while supersession preserves lineage. | [`Allura_Memory/docs/allura/DATA-DICTIONARY.md:224-290`](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md) |
| 4.5 | Allura’s public ecosystem explanation says a receipt supports inspection rather than truth by itself. | [`Allura-ecosystem/README.md:84-97`](../../README.md) |

**[DATA NEEDED]:** Operation-by-operation receipt coverage; unified receipt-contract implementation status; complete field-population coverage; cryptographic or tamper-evident chain implementation and verification status.

---

## 5. The Allura Plugin System

**Kotler status:** Approved with versions and installation claims omitted
**Classification:** Public core with technical boundary notes
**Visible-copy count:** 158 words

### On-canvas copy

**Eyebrow:** Governed workflow extensions

**Headline:** Plugins Extend the Brain

**Introduction:** Allura Plugins packages focused workflows while preserving Allura Memory as the governed memory boundary.

**Three workflow packages**
Allura Cowork coordinates runtimes. Team Durham governs brand work. Team RAM Coding governs software delivery.

**Shared operating contract**
Each workflow starts with scoped context, keeps approval boundaries explicit, and reports validation status honestly.

**Memory remains governed**
Plugins can retrieve and record context. They do not replace or bypass Allura Memory governance.

**Runtimes stay distinct**
Claude and Codex are execution surfaces—not extra plugins and not one blended runtime.

**Evidence closes the loop**
Receipts distinguish planned work, performed work, validation, approval, and durable memory status.

**Diagram labels:** Allura Cowork; Team Durham; Team RAM Coding; Shared contract; Allura Memory / Allura Brain; Claude; Codex; Context; Approval; Validation; Receipt

**Required metric labels:** None

**Bottom-line takeaway:** Choose a workflow by responsibility; keep memory governance underneath every route.

**Call to action:** Match the plugin to the work.

### Editorial and evidence notes

**Accessibility alt-text draft:** Layered system with three plugin pillars—Allura Cowork, Team Durham, and Team RAM Coding—above a shared Allura Memory governance foundation, with Claude and Codex shown as separate runtime surfaces.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 5.1 | Allura Plugins owns workflow-package distribution, model governance, and release evidence; plugins do not replace Allura Brain. | [`allura-plugins/README.md:27-35`](../../../allura-plugins/README.md) |
| 5.2 | The public catalog contains Allura Cowork, Team Durham, and Team RAM Coding. | [`allura-plugins/README.md:39-45`](../../../allura-plugins/README.md); [`allura-plugins/.claude-plugin/marketplace.json:9-30`](../../../allura-plugins/.claude-plugin/marketplace.json) |
| 5.3 | The shared contract covers tenant scope, context retrieval, runtime attribution, validation, approval boundaries, and outcome receipts. | [`allura-plugins/README.md:105-128`](../../../allura-plugins/README.md) |
| 5.4 | Runtime guidance and real execution are explicitly different states. | [`allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md:35-42`](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md) |

**[DATA NEEDED]:** Reconciled package-version authority; current Claude and Codex install/load receipts; model registry reconciliation; verified optional-integration availability.

---

## 6. Meet the Three Core Plugins

**Kotler status:** Conditionally approved; package census omitted
**Classification:** Public
**Visible-copy count:** 158 words

### On-canvas copy

**Eyebrow:** Choose by responsibility

**Headline:** Three Plugins. Three Clear Jobs.

**Introduction:** Select the Allura plugin that owns the kind of work in front of you.

**Allura Cowork**
Use for cross-runtime coordination, context transfer, honest attribution, validation evidence, and durable handoff packets.

**Team Durham**
Use for governed brand work—from intent and strategy through copy, visual production, and independent QA.

**Team RAM Coding**
Use for Brooks-led software delivery across architecture, context, implementation, focused review, validation, and closeout.

**Shared boundary**
All three can work with Allura Memory. None replaces its tenant scope, approval, provenance, or history controls.

**Decision labels:** Coordinate runtimes → Allura Cowork; Build the brand → Team Durham; Deliver software → Team RAM Coding; Governed context → Allura Memory

**Required metric labels:** None. Package versions, agent counts, command counts, and skill counts are intentionally omitted.

**Bottom-line takeaway:** Route the task by responsibility instead of blending three different operating systems.

**Call to action:** What kind of work are you routing?

### Editorial and evidence notes

**Accessibility alt-text draft:** Three equal comparison cards explain when to use Allura Cowork, Team Durham, or Team RAM Coding. A shared footer shows that all three remain subject to Allura Memory governance.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 6.1 | Allura Cowork coordinates cross-runtime context, attribution, validation, and handoff. | [`allura-plugins/README.md:63-70`](../../../allura-plugins/README.md); [`allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md:11-19`](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md) |
| 6.2 | Team Durham governs brand work from strategy through production and QA. | [`allura-plugins/README.md:72-77`](../../../allura-plugins/README.md); [`allura-plugins/team-durham/skills/team-durham/SKILL.md:38-50`](../../../allura-plugins/team-durham/skills/team-durham/SKILL.md) |
| 6.3 | Team RAM Coding is a Brooks-led software-delivery workflow spanning context, build, review, and validation. | [`allura-plugins/README.md:79-87`](../../../allura-plugins/README.md); [`allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md:24-34`](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md) |
| 6.4 | Plugins extend workflows without replacing the governed memory boundary. | [`allura-plugins/README.md:27-35`](../../../allura-plugins/README.md); [`allura-plugins/README.md:89-103`](../../../allura-plugins/README.md) |

**[DATA NEEDED]:** Approved public package census; canonical Team Durham agent-definition count; reconciled Team RAM command count; package-version authority; current runtime-support matrix.

---

## 7. Team Durham Brand Workflow

**Kotler status:** Approved with Phase 3.5 and numeric QA threshold omitted
**Classification:** Internal/technical process; simplifiable for public use
**Visible-copy count:** 177 words

### On-canvas copy

**Eyebrow:** Strategy before production

**Headline:** Brand Work With Clear Gates

**Introduction:** Team Durham moves from evidence and intent to strategy, copy, visual production, QA, and factual closeout.

**1. Recon and intent**
Scout gathers evidence. Kotler defines the audience, problem, objective, scope, and approval boundary.

**2. Lock strategy**
Aaker sets positioning and strategy before copy or visual production.

**3. Build the expression**
Ogilvy develops verbal identity and copy. Glaser directs the visual system. Rand prepares production assets and the brand kit.

**4. Audit independently**
Munari reviews consistency, accessibility, and readiness. Findings return to the producing owner for correction.

**5. Record and report**
When Allura Brain is available, Kotler records the approved outcome, then closes with evidence, decisions, risks, and next actions.

**Process labels:** Recon → Intent gate → Strategy gate → Verbal identity → Visual direction → Production → QA gate → Record → Report

**Required metric labels:** None. The internal numeric QA threshold is omitted pending publication approval.

**Bottom-line takeaway:** Approve strategy before production; require QA evidence before calling work complete.

**Call to action:** Brief before pixels.

### Editorial and evidence notes

**Accessibility alt-text draft:** A gated Team Durham process moves from Scout reconnaissance and Kotler intent through Aaker strategy, Ogilvy copy, Glaser visual direction, Rand production, Munari QA, and Kotler closeout.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 7.1 | The Team Durham pipeline assigns intent to Kotler, strategy to Aaker, copy to Ogilvy, visual direction to Glaser, production to Rand, QA to Munari, and closeout to Kotler. | [`allura-plugins/team-durham/skills/team-durham/SKILL.md:38-50`](../../../allura-plugins/team-durham/skills/team-durham/SKILL.md) |
| 7.2 | Scout reconnaissance precedes routing and strategy precedes creative work. | [`allura-plugins/team-durham/agents/brand-orchestrator.md:104-130`](../../../allura-plugins/team-durham/agents/brand-orchestrator.md) |
| 7.3 | Munari is a read-only reviewer; fixes return to the producing role. | [`allura-plugins/team-durham/skills/team-durham/SKILL.md:52-57`](../../../allura-plugins/team-durham/skills/team-durham/SKILL.md); [`allura-plugins/team-durham/agents/qa-reviewer.md:93-104`](../../../allura-plugins/team-durham/agents/qa-reviewer.md) |
| 7.4 | The shared plugin contract distinguishes a named perspective from a real runtime or subagent execution. | [`allura-plugins/README.md:63-65`](../../../allura-plugins/README.md); [`allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md:35-42`](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md) |
| 7.5 | Team Durham assigns Allura Memory and reporting to Kotler; the shared contract requires a factual outcome receipt after substantive work when Allura Brain is available. | [`allura-plugins/team-durham/skills/team-durham/SKILL.md:49-50`](../../../allura-plugins/team-durham/skills/team-durham/SKILL.md); [`allura-plugins/README.md:105-115`](../../../allura-plugins/README.md) |

**[DATA NEEDED]:** Whether Asset Pipeline Phase 3.5 is nested or additional; whether the numeric QA threshold may be public; runtime-role availability; execution receipts for any case study.

---

## 8. Team RAM Software-Delivery Workflow

**Kotler status:** Approved as a normative workflow
**Classification:** Technical/internal
**Visible-copy count:** 168 words

### On-canvas copy

**Eyebrow:** Brooks-led software delivery

**Headline:** Context Before Code

**Introduction:** Team RAM Coding routes each change through explicit ownership, focused review, validation, and factual closeout.

**1. Frame the change**
Brooks owns architecture, conceptual integrity, task boundaries, and the final route.

**2. Hydrate context**
Scout searches the repository and available approved Allura Brain context before planning. If memory is unavailable, the workflow discloses that limitation and continues from local evidence.

**3. Build the scope**
Required skills are selected. Woz implements the smallest coherent change within the agreed boundaries.

**4. Review the change**
Pike examines interface simplicity. Fowler examines refactor safety, maintainability, and reversible structure.

**5. Prove and close**
Validation evidence comes before outcome logging or “done.” Unrun checks remain explicitly not run.

**Process labels:** Brooks → Scout → Allura Brain → Required skills → Woz → Pike → Fowler → Validate → Log; Architecture; Context; Build; Review; Evidence

**Required metric labels:** None

**Bottom-line takeaway:** Require context before implementation and validation before closeout.

**Call to action:** Show the evidence behind “done.”

### Editorial and evidence notes

**Accessibility alt-text draft:** A Brooks-led delivery flow moves from architecture framing to Scout context retrieval, skill selection, Woz implementation, Pike and Fowler review, validation evidence, and factual outcome logging.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 8.1 | Team RAM Coding uses a Brooks-led sequence of Scout, Allura Brain, skills, routing, build/review, validation, and logging. | [`allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md:24-34`](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md) |
| 8.2 | Brooks owns architecture, conceptual integrity, boundaries, and routing; Scout owns context discovery; Woz builds; Pike and Fowler provide focused review perspectives. | [`allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md:68-84`](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md) |
| 8.3 | Scout searches repository context and available approved Allura Brain context before planning; when memory is unavailable, the workflow discloses the limitation and continues with local evidence. | [`allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md:45-51`](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md); [`allura-plugins/team-ram-coding/agents/scout.md:105-124`](../../../allura-plugins/team-ram-coding/agents/scout.md); [`Allura_Memory/src/mcp/canonical-tools.ts:364-367`](../../../Allura_Memory/src/mcp/canonical-tools.ts) |
| 8.4 | Woz implements scoped work and reports validation evidence. | [`allura-plugins/team-ram-coding/agents/woz.md:113-139`](../../../allura-plugins/team-ram-coding/agents/woz.md) |
| 8.5 | Runtime honesty forbids claiming named agents ran without actual invocation. | [`allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md:53-64`](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md) |

**[DATA NEEDED]:** Runtime-support matrix; reconciled package version and command count; remediation status for legacy `roninmemory` and direct-memory paths; real execution receipts for examples.

---

## 9. Allura Cowork Runtime-Handoff Flow

**Kotler status:** Approved as an abstract contract flow
**Classification:** Technical/internal
**Visible-copy count:** 169 words

### On-canvas copy

**Eyebrow:** Cross-runtime coordination

**Headline:** A Handoff Is Not Execution

**Introduction:** Allura Cowork transfers verified context and responsibility while keeping runtime, approval, validation, and memory status explicit.

**1. Identify the runtime**
Name the current runtime and project overlay before retrieving context or routing work.

**2. Retrieve or disclose**
Search approved context. If memory is unavailable, say so; never present missing hydration as completed.

**3. Work and validate**
Assign an owner and reviewer, perform the scoped work, and record each validation state honestly.

**4. Prepare the handoff**
Package runtimes, context, files, decisions, risks, validation, next action, memory status, and approval state.

**5. Receive and close**
The packet instructs the receiving runtime. Only its acknowledgment, execution, and validation receipt proves what happened next.

**Process labels:** Runtime A → Context → Work → Validation → Handoff boundary → Not yet executed → Runtime B acknowledgment → Execution receipt → Close

**Required metric labels:** None

**Bottom-line takeaway:** Never treat a prepared handoff as completed work.

**Call to action:** Look for the receiving runtime’s receipt.

### Editorial and evidence notes

**Accessibility alt-text draft:** Two-runtime relay. Runtime A retrieves context, performs and validates work, then sends a handoff packet across a boundary marked “not yet executed.” Runtime B must acknowledge, execute, and validate before closeout.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 9.1 | Cowork’s contract starts with runtime/project identification, context retrieval or disclosure, routing, work, validation, receipt, and handoff or closeout. | [`allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md:11-19`](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md) |
| 9.2 | The handoff schema carries runtimes, context, files, decisions, risks, validation, next action, memory, and approval data. | [`allura-plugins/allura-cowork/schemas/handoff.schema.json:7-20`](../../../allura-plugins/allura-cowork/schemas/handoff.schema.json) |
| 9.3 | A role perspective or handoff packet is not evidence that another runtime executed. | [`allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md:35-42`](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md) |
| 9.4 | Unrun validation remains `not_run`, and approval boundaries remain explicit. | [`allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md:44-58`](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md) |

**[DATA NEEDED]:** Real cross-runtime execution receipts; current dual-runtime install/load evidence; actual CI coverage for schemas, examples, evals, and hooks; approved publication example.

---

## 10. The Six Allura Governance Policies

**Kotler status:** Conditionally approved for internal technical copy
**Classification:** Technical/internal; public release blocked pending namespace remediation
**Visible-copy count:** 161 words

### On-canvas copy

**Eyebrow:** Governance registry

**Headline:** Six Policies. One Control System.

**Introduction:** Allura’s governance registry protects scope, evidence history, versioned knowledge, promotion decisions, canonical access, and tenant naming.

**Scope — `pol-001`**
Every operation requires tenant scope through `group_id`.

**Evidence — `pol-002`**
The governance registry requires evidence events to be append-only; governance decisions add audit history.

**Knowledge — `pol-003` + `pol-004`**
Semantic updates create superseding versions. Promotion crosses an explicit approval gate, with automated curator behavior still requiring policy resolution.

**Access — `pol-005` + `pol-006`**
Canonical database access follows approved paths. Tenant identifiers must use the `allura-*` namespace.

**Namespace legend**
This graphic uses lowercase governance `pol-*`. Uppercase kernel `POL-*` and RuVix `RULE-*` are separate contracts with different meanings.

**Policy labels:** `pol-001` Tenant scope; `pol-002` Evidence history; `pol-003` Versioned knowledge; `pol-004` Promotion gate; `pol-005` Canonical access; `pol-006` Tenant namespace

**Required metric labels:** None

**Bottom-line takeaway:** Name the policy namespace and verify its enforcement path before claiming compliance.

**Call to action:** Cite the rule you mean.

### Editorial and evidence notes

**Accessibility alt-text draft:** Six governance policy segments surround governed memory. A legend separates lowercase governance `pol-*` from uppercase kernel `POL-*` and RuVix `RULE-*`, which use different meanings.

**Factual statement ledger:**

| ID | Factual statement | Precise repository source |
|---|---|---|
| 10.1 | The governance registry defines lowercase `pol-001` through `pol-006` for tenant scope, append-only events, versioning, promotion, canonical database access, and tenant namespace. | [`Allura_Memory/src/lib/governance/policies.ts:47-137`](../../../Allura_Memory/src/lib/governance/policies.ts) |
| 10.2 | The kernel separately uses uppercase `POL-001..006` for different controls. | [`Allura_Memory/src/kernel/policy.ts:323-423`](../../../Allura_Memory/src/kernel/policy.ts); [`Allura_Memory/src/kernel/policy.ts:582-602`](../../../Allura_Memory/src/kernel/policy.ts) |
| 10.3 | RuVix separately defines `RULE-001..012`. | [`Allura_Memory/docs/allura/SOLUTION-ARCHITECTURE.md:313-366`](../../../Allura_Memory/docs/allura/SOLUTION-ARCHITECTURE.md) |
| 10.4 | Current semantic persistence uses PostgreSQL graph tables, while registry copy for `pol-003` and `pol-004` still names Neo4j. | [`Allura_Memory/src/lib/governance/policies.ts:81-105`](../../../Allura_Memory/src/lib/governance/policies.ts); [`Allura_Memory/src/lib/graph-adapter/factory.ts:26-35`](../../../Allura_Memory/src/lib/graph-adapter/factory.ts) |
| 10.5 | An automated curator mode creates ambiguity around an absolute human-only interpretation of the promotion gate. | [`Allura_Memory/src/mcp/curator-tools.ts:457-520`](../../../Allura_Memory/src/mcp/curator-tools.ts); [`Allura_Memory/src/mcp/canonical-http-gateway.ts:709-714`](../../../Allura_Memory/src/mcp/canonical-http-gateway.ts) |
| 10.6 | Governance approval appends an explicit audit event in addition to recording the proposal decision. | [`Allura_Memory/src/mcp/curator-tools.ts:138-175`](../../../Allura_Memory/src/mcp/curator-tools.ts) |

**[DATA NEEDED]:** Policy-namespace remediation decision; updated `pol-003`/`pol-004` wording after Neo4j sunset; enforcement matrix across MCP, REST, batch, scripts, and direct database access; approved automated-curator interpretation.

---

## Cross-collection consistency check

| Check | Result | Notes |
|---|---|---|
| Product names | Pass | Canonical names used: Allura Memory, Allura Brain, Allura Plugins, Allura Cowork, Team Durham, Team RAM Coding. “Team RAM” is not substituted for the plugin name. |
| Capitalization | Pass | Product names remain title case. Lowercase `pol-*`, uppercase kernel `POL-*`, and RuVix `RULE-*` remain distinct. |
| Governance terminology | Conditional pass | “Evidence,” “proposal,” “approval,” “canonical knowledge,” “tenant scope,” “provenance,” and “supersession” are consistent. Human approval is framed as the accountability boundary; automated curator and queued-materialization caveats remain explicit. |
| Voice and tone | Pass | Copy is direct, restrained, evidence-first, and free of generic superlatives or invented outcomes. |
| Repeated/conflicting claims | Pass | #4 uses the owner-approved narrower title and preserves the original title’s block. Plugins never replace Allura Memory. Runtime guidance and execution are never conflated. |
| Unsupported facts | Pass | Versions, package counts, ports, production readiness, customers, live health, integrations, model costs, and adoption/performance claims are absent from visible copy. |
| Copy length | Pass | Measured visible-copy counts range from 144 to 177 words. Final layout must recount after any Visual Director edit. |
| Visual sequence | Pass | The collection moves from ecosystem orientation to lifecycle, layer distinction, evidence trail, plugin boundary, plugin choice, two domain workflows, runtime handoff, and policy controls. Production may follow Kotler’s dependency order even when publishing order differs. |
| Public/technical separation | Pass | Public pieces omit unstable implementation detail. #4 and #10 remain technical/internal pending approval gates. |
| Accessibility language | Pass | Alt-text drafts describe meaning and sequence without relying on color alone. |

## Ogilvy handoff to Kotler

The copy deck is **revised after Kotler review**. All four required corrections are incorporated, and no unresolved copy corrections remain. The deck is ready for layout under its existing classifications and `[DATA NEEDED]` publication gates.

- **Publication gates preserved:** #10 remains internal until the `pol-*`/`POL-*` collision and stale Neo4j wording are remediated or formally accepted with its namespace legend.
- **Conditional classifications preserved:** #1 remains conceptual and #6 remains count-free; neither requires further copy correction.
- **Visual Director boundary preserved:** Layout may begin. No visual treatment may add unsupported nodes, metrics, runtime executions, integrations, or status claims.

**Ogilvy recommendation:** Proceed to layout with the revised copy. Keep #10 internal until its namespace gate closes.
