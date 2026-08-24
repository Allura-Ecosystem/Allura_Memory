# Allura Infographic Collection — Strategic Content Plan

**Owner:** Kotler, Team Durham Brand Orchestrator
**Stage:** Strategy gate before copywriting
**Prepared:** 2026-08-15
**Scope:** Ten coordinated infographics; no on-canvas copy or visual production in this document

## Strategic frame

### Audience architecture

The collection serves three audiences that must not be collapsed into one message:

1. **Public and prospective builders** need a fast explanation of what Allura is, why governed memory matters, and how the three plugins divide responsibility.
2. **Technical evaluators and integrators** need the evidence-to-knowledge lifecycle, provenance model, logical data layers, tenant boundary, and runtime-handoff contract.
3. **Operators and internal teams** need policy identifiers, implementation caveats, approval semantics, validation status, and unresolved repository drift.

Public pieces should lead with concepts and outcomes that are demonstrably supported. Technical and internal pieces may expose implementation names and caveats, but must not turn plans or examples into claims of live capability.

### Collection-wide message hierarchy

1. **Allura Memory is the governed memory service; “Allura Brain” is its functional alias.**
2. **Activity is captured as evidence, not automatically accepted as knowledge.**
3. **Governance controls promotion, scope, lineage, and inspectability.**
4. **Allura Plugins extend coordinated workflows without bypassing Allura Memory governance.**
5. **Allura Cowork, Team Durham, and Team RAM Coding have distinct responsibilities.**
6. **A named runtime perspective is not proof that a runtime or subagent actually executed.**

### Evidence rule

Current code, schema, manifests, and measured repository contents take precedence over stale status prose. Contradictions remain visible as validation gates. No infographic may print a live-status, production-readiness, performance, adoption, customer, integration, or runtime-execution claim without current evidence.

---

## 1. Allura Ecosystem at a Glance

- **Working title:** Allura Ecosystem at a Glance
- **Priority:** High
- **Primary audience:** Public-facing builders, technical decision-makers, and new collaborators
- **Audience problem or question:** “What is Allura, which component is the Brain, and how do its memory, plugin, runtime, and product surfaces relate?”
- **Communication objective:** Establish a correct mental model of the ecosystem without implying that every adjacent repository is a production dependency or public product.
- **One-sentence core message:** Allura centers governed memory in Allura Memory and extends it through three purpose-built plugin workflows across distinct runtime and product contexts.
- **Supporting points:**
  1. Allura Memory is the canonical governed memory service; Allura Brain is its functional alias, not a separate product.
  2. Agents and client contexts reach memory through governed interfaces, while evidence, review, approved knowledge, retrieval, and receipts remain separate stages.
  3. Allura Plugins distributes Allura Cowork, Team Durham, and Team RAM Coding as distinct workflow packages.
  4. Claude and Codex are execution surfaces; they are not additional Allura plugins and should not be shown as one blended runtime.
  5. Product-context relationships must be labeled precisely: integration, customization, or development support—not universal production dependency.
- **Verified facts and source documents:**
  - The ecosystem README defines Allura Memory as the canonical Brain and distinguishes the ecosystem from the memory service ([Allura ecosystem README, “What Allura is”](../../README.md#what-allura-is); [ecosystem map](../../README.md#ecosystem-map)).
  - The current memory path uses PostgreSQL evidence plus PostgreSQL graph tables through the RuVector adapter; the active factory rejects Neo4j ([Allura Memory README, “At a glance”](../../../Allura_Memory/README.md#at-a-glance); [graph adapter factory](../../../Allura_Memory/src/lib/graph-adapter/factory.ts)).
  - The public plugin catalog contains Allura Cowork, Team Durham, and Team RAM Coding ([Allura Plugins README, “Catalog”](../../../allura-plugins/README.md#catalog); [marketplace manifest](../../../allura-plugins/.claude-plugin/marketplace.json)).
  - Open Design includes an Allura customization and Brain MCP template ([Open Design Allura deployment guide](../../../open-design/deploy/README-allura.md)).
  - Veridact’s canonical ADR describes Allura as development/session memory rather than a production dependency ([Veridact risks and decisions](<../../../mortagate/planning docs/RISKS-AND-DECISIONS.md>)).
- **Claims that require validation:**
  - Current organization inventory, repository count, and public/private visibility.
  - Whether Open Design is first-party, a fork, or an Allura-customized upstream project.
  - Any claim that named client or product systems currently connect to a live Allura deployment.
  - Any “production,” “live,” “healthy,” or current endpoint statement.
- **Recommended structure:** Hub-and-rings ecosystem map: Allura Memory at the center; governed memory flow as the inner ring; three plugin workflows as the extension ring; runtimes and approved product contexts as clearly labeled outer surfaces.
- **Recommended visualization type:** Ecosystem map with boundary legend and relationship labels
- **Desired viewer action or takeaway:** Know where to begin: evaluate Allura Memory for governed context, then choose the plugin aligned to coordination, brand, or software delivery.
- **[DATA NEEDED]:** Authoritative ecosystem inventory; visibility classification; approved product/client names; current deployment status; approved relationship label for Open Design; canonical Team Durham repository slug.
- **Classification:** Public, with a separate technical annotation panel

**Contradictions to preserve during production:** `ECOSYSTEM.md` and older architecture prose still show Neo4j, submodules, product/client paths, port `5888`, and “Production” status. Current code and checkout topology do not support those claims. The infographic must follow the current PostgreSQL/RuVector path and omit unverified status.

---

## 2. The Governed Memory Lifecycle

- **Working title:** The Governed Memory Lifecycle
- **Priority:** High
- **Primary audience:** Public-facing builders first; technical evaluators second
- **Audience problem or question:** “How does an interaction become trusted, reusable knowledge?”
- **Communication objective:** Make the governance path understandable in under one minute and make the human-accountability boundary explicit.
- **One-sentence core message:** Allura captures activity as evidence, evaluates it for promotion, records a governance decision, and retrieves approved knowledge within scope and lineage.
- **Supporting points:**
  1. Capture creates an append-only evidence event and an episodic search projection.
  2. Scoring can create a proposal, but a proposal is not approved knowledge.
  3. Review records a decision, actor, rationale, and source reference.
  4. Approval authorizes or queues canonical materialization; it must not be depicted as universally instantaneous.
  5. Retrieval is tenant-scoped, and updates preserve history through supersession rather than silent overwrite.
- **Verified facts and source documents:**
  - The public lifecycle distinguishes capture, scoring, proposal, review, semantic memory, retrieval, and supersession ([Allura Memory README, “Governed lifecycle”](../../../Allura_Memory/README.md#governed-lifecycle)).
  - `memory_add` appends an event and writes an episodic vector projection ([canonical MCP tools](../../../Allura_Memory/src/mcp/canonical-tools.ts)).
  - Promotion proposals use `canonical_proposals` and link to evidence through `trace_ref` ([data dictionary, canonical proposals](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md#canonical-proposals)).
  - Canonical memory and supersession lineage are represented in `graph_memories` and `graph_supersedes` ([graph adapter tables](../../../Allura_Memory/docker/postgres-init/21-graph-adapter-tables.sql)).
  - Approved-only retrieval uses the graph adapter, while the default beta retrieval path may include fresh episodic records ([canonical MCP tools](../../../Allura_Memory/src/mcp/canonical-tools.ts)).
- **Claims that require validation:**
  - “Every promotion receives individual human review.” An auto curator mode exists and is described by the gateway as a HITL bypass.
  - “Approval immediately creates canonical knowledge.” One REST path reports `promotion_sync: pending`, and a separate drain path exists.
  - A single, uniform promotion behavior across MCP, REST, and batch curator surfaces.
- **Recommended structure:** Six-stage left-to-right process: Capture → Evaluate → Propose → Review → Materialize → Retrieve/Update, with a visible approval boundary between proposal and canonical knowledge.
- **Recommended visualization type:** Lifecycle/process flow with a governance gate and a return loop for supersession
- **Desired viewer action or takeaway:** Treat new activity as evidence until governance promotes it; choose approved-only retrieval when canonical knowledge is required.
- **[DATA NEEDED]:** Approved wording for auto curator mode; current end-to-end promotion behavior by interface; whether canonical materialization is synchronous or queued in the target deployment.
- **Classification:** Public core with technical/operator footnotes

**Contradictions to preserve during production:** The Blueprint describes auto-promotion behavior that current `memory_add` does not perform; the current curator auto mode complicates an absolute human-review claim. Use “governance review” and show human approval as the intended explicit boundary, while flagging automated curator behavior for resolution.

---

## 3. Episodic Evidence vs. Semantic Knowledge

- **Working title:** Episodic Evidence vs. Semantic Knowledge
- **Priority:** High
- **Primary audience:** Public-facing builders, technical evaluators, and operators
- **Audience problem or question:** “Why isn’t every captured interaction immediately treated as memory truth?”
- **Communication objective:** Establish the collection’s most important conceptual distinction: recorded activity is evidence; canonical knowledge is governed.
- **One-sentence core message:** Episodic traces preserve what happened, while semantic knowledge represents what governance has approved for durable reuse.
- **Supporting points:**
  1. Episodic evidence captures activity, context, scope, runtime, and outcome.
  2. Episodic searchability does not make a record canonical.
  3. Semantic knowledge is curated, versioned, and connected through explicit relationships.
  4. Approved-only retrieval and default beta retrieval have different inclusion behavior.
  5. Both logical layers currently live in one PostgreSQL engine; they are not two separate databases.
- **Verified facts and source documents:**
  - The Memory README states that logs are not knowledge and defines episodic versus semantic roles ([Allura Memory README, “Core model”](../../../Allura_Memory/README.md#core-model)).
  - Events contain tenant, agent, session, workflow, step, parent, runtime, status, outcome, and timestamps ([data dictionary, events](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md#events)).
  - Canonical knowledge uses PostgreSQL graph tables through the RuVector adapter ([Allura Memory README, “RuVector boundary”](../../../Allura_Memory/README.md#ruvector-boundary); [graph tables](../../../Allura_Memory/docker/postgres-init/21-graph-adapter-tables.sql)).
  - Current code rejects `GRAPH_BACKEND=neo4j` ([graph adapter factory](../../../Allura_Memory/src/lib/graph-adapter/factory.ts)).
  - Retrieval modes differ in whether episodic records may be included ([canonical MCP tools](../../../Allura_Memory/src/mcp/canonical-tools.ts)).
- **Claims that require validation:**
  - Native RuVector extension or Rust-crate readiness; current “RuVector” is a PostgreSQL-table adapter.
  - Physical database-level prevention of direct updates/deletes to the events table.
  - Any statement that all retrieval is approved-only by default.
- **Recommended structure:** Side-by-side comparison with a narrow governance bridge: Evidence on the left, Promotion Gate in the center, Knowledge on the right.
- **Recommended visualization type:** Side-by-side comparison with logical-layer stack
- **Desired viewer action or takeaway:** Ask whether a result is episodic evidence or approved semantic knowledge before relying on it.
- **[DATA NEEDED]:** Native RuVector status; target retrieval-mode default; database-enforced immutability evidence.
- **Classification:** Public and technical variants from one shared structure

**Language lock:** Use “one PostgreSQL engine, two governed logical layers.” Do not say “two databases,” “Neo4j semantic layer,” or “full/native RuVector.”

---

## 4. A Governed Memory Leaves Evidence

- **Working title:** A Governed Memory Leaves Evidence
- **Priority:** High
- **Primary audience:** Technical evaluators, governance leaders, and operators; public adaptation only after scope is resolved
- **Audience problem or question:** “Can I inspect where a memory came from, who approved it, and how it changed?”
- **Communication objective:** Demonstrate inspectability without overstating the uniformity or cryptographic strength of the current receipt implementation.
- **One-sentence core message:** Allura records provenance across capture, proposal, decision, and canonical lineage so governed memory claims can be inspected against their source evidence.
- **Supporting points:**
  1. Capture records tenant, actor/runtime context, workflow lineage, source, and timestamps.
  2. Promotion proposals retain source evidence references, score/reasoning, and decision fields.
  3. Curator approval receipts record the proposal, decision, actor, rationale, trace reference, and resulting state.
  4. Canonical memories retain provenance, version, tags, lifecycle state, and supersession relationships.
  5. A receipt makes a claim inspectable; it does not prove that the claim is true.
- **Verified facts and source documents:**
  - Evidence-event and proposal provenance fields are specified in the current data dictionary ([data dictionary, events and proposals](../../../Allura_Memory/docs/allura/DATA-DICTIONARY.md)).
  - `memory_add` records memory/user identity, content, source, conversation, trace type, project, agent, and session metadata ([canonical MCP tools](../../../Allura_Memory/src/mcp/canonical-tools.ts)).
  - The implemented curator audit receipt includes proposal, tenant, decision, prior/resulting state, promoted memory, actor, rationale, time, trace reference, source event, and receipt status ([approval audit implementation](../../../Allura_Memory/src/lib/memory/approval-audit.ts)).
  - Canonical memories and supersession lineage are represented in current graph tables ([graph adapter tables](../../../Allura_Memory/docker/postgres-init/21-graph-adapter-tables.sql)).
  - The ecosystem README explicitly limits the promise: a receipt makes a claim inspectable, not true ([ecosystem README, “The memory receipt”](../../README.md#the-memory-receipt)).
- **Claims that require validation:**
  - A single unified `GovernanceReceipt` returned by every mutation and retrieval surface.
  - Cryptographically chained or tamper-evident audit history.
  - Complete population of all documented receipt fields in every current path.
- **Recommended structure:** One large receipt/evidence card connected to four small source stages: Capture, Proposal, Decision, Canonical Version.
- **Recommended visualization type:** Receipt or evidence card with field callouts and lineage strip
- **Desired viewer action or takeaway:** Inspect provenance and approval state before treating retrieved information as canonical.
- **[DATA NEEDED]:** Receipt coverage matrix by operation/interface; unified receipt contract status; hash-chain implementation and verification status; approved scope for the word “every.”
- **Classification:** Technical/internal; a public adaptation may use only the verified provenance fields

**Owner decision:** The evidence-safe fallback title **A Governed Memory Leaves Evidence** is approved. The documented `GovernanceReceipt` remains a design contract while implemented receipt shapes differ. Ogilvy must not reintroduce “every memory,” universal receipt coverage, or cryptographic-chain language without implementation evidence.

---

## 5. The Allura Plugin System

- **Working title:** The Allura Plugin System
- **Priority:** High
- **Primary audience:** Public-facing users choosing an Allura workflow; technical evaluators assessing boundaries
- **Audience problem or question:** “What does the plugin layer add, and does it replace Allura Memory?”
- **Communication objective:** Explain the plugin layer as workflow distribution and governance support around the Brain, not as a separate memory system.
- **One-sentence core message:** Allura Plugins packages coordinated roles, commands, and skills for cross-runtime collaboration, brand production, and software delivery while preserving Allura Memory governance.
- **Supporting points:**
  1. Allura Cowork coordinates runtime context, attribution, validation, and handoff.
  2. Team Durham governs brand strategy through production and QA.
  3. Team RAM Coding governs software delivery through architecture, recon, implementation, review, and validation.
  4. Allura Brain remains the shared governed memory boundary; plugins do not bypass it.
  5. Claude and Codex remain distinct execution surfaces, with capability and receipt evidence required for execution claims.
- **Verified facts and source documents:**
  - The repository owns plugin distribution, model governance, and release evidence; plugins add roles, commands, and skills without replacing the Brain ([Allura Plugins README, “What this repository owns”](../../../allura-plugins/README.md#what-this-repository-owns)).
  - The marketplace lists exactly three public packages at manifest version `0.2.0` ([marketplace manifest](../../../allura-plugins/.claude-plugin/marketplace.json)).
  - The shared contract requires tenant scoping, context retrieval, truthful runtime attribution, validation status, approval boundaries, and outcome receipts ([Allura Plugins README, “Shared operating contract”](../../../allura-plugins/README.md#shared-operating-contract)).
  - The local `allura/` Codex support pack is not one of the three public marketplace packages and contains manifest placeholders ([Allura Plugins README, “Catalog”](../../../allura-plugins/README.md#catalog); [local support-pack manifest](../../../allura-plugins/allura/.codex-plugin/plugin.json)).
- **Claims that require validation:**
  - Successful current install/load evidence for both Claude and Codex.
  - Marketplace/package version consistency.
  - Current model availability, aliases, pricing, and eval coverage.
  - Any statement that optional integrations are configured or operational.
- **Recommended structure:** Foundation-and-pillars: Allura Brain as an adjacent/foundation governance layer, three plugin pillars above it, and Claude/Codex as clearly separated runtime surfaces.
- **Recommended visualization type:** Layered architecture with responsibility boundaries
- **Desired viewer action or takeaway:** Select the workflow package that matches the work, then connect it to governed memory and validate the active runtime.
- **[DATA NEEDED]:** Cross-runtime install/load receipts; reconciled package versions; integration availability; model registry reconciliation.
- **Classification:** Public core with technical boundary notes

**Contradictions to preserve during production:** Marketplace and plugin manifests say `0.2.0`, while each package’s `package.json` says `0.1.0`. Do not print a version in a public infographic until reconciled.

---

## 6. Meet the Three Core Plugins

- **Working title:** Meet the Three Core Plugins
- **Priority:** Medium
- **Primary audience:** Public-facing builders, operators selecting a workflow, and collaborators onboarding to Allura
- **Audience problem or question:** “Which plugin should I use for this job?”
- **Communication objective:** Enable a fast role-based choice among Allura Cowork, Team Durham, and Team RAM Coding.
- **One-sentence core message:** Choose Allura Cowork for runtime coordination, Team Durham for brand work, and Team RAM Coding for software delivery.
- **Supporting points:**
  1. Allura Cowork owns context-aware cross-runtime routing, honest attribution, validation evidence, and durable handoff packets.
  2. Team Durham owns the brand pathway from intent and strategy through verbal/visual production and QA.
  3. Team RAM Coding owns Brooks-led engineering from architecture and recon through implementation, review, and validation.
  4. The packages cooperate through shared governance; none is a substitute for Allura Memory.
  5. Package counts describe source definitions, not concurrently running agents.
- **Verified facts and source documents:**
  - The current catalog defines the responsibility of each package ([Allura Plugins README, “Catalog”](../../../allura-plugins/README.md#catalog); [“How the plugins fit together”](../../../allura-plugins/README.md#how-the-plugins-fit-together)).
  - Current measured source definitions match the repository census: Cowork `1 agent / 4 commands / 1 skill`, Durham `13 / 21 / 77`, and Team RAM Coding `11 / 35 / 12` ([Allura Plugins README, catalog table](../../../allura-plugins/README.md#catalog)).
  - Claude manifests expose agent definitions, while Codex manifests expose skills/commands without an `agents` field ([Team Durham Claude manifest](../../../allura-plugins/team-durham/.claude-plugin/plugin.json); [Team Durham Codex manifest](../../../allura-plugins/team-durham/.codex-plugin/plugin.json)).
- **Claims that require validation:**
  - Whether source-definition counts should appear in public material at all.
  - Team Durham’s “12 canonical agents” versus 13 packaged definitions; likely fallback distinction is not documented clearly.
  - Team RAM README’s 34-command claim versus 35 current definitions.
  - Package version `0.2.0` versus `package.json` version `0.1.0`.
- **Recommended structure:** Three equal role cards with “Use when,” “Owns,” “Does not replace,” and a shared governance footer.
- **Recommended visualization type:** Role comparison / decision aid
- **Desired viewer action or takeaway:** Route the task to the correct plugin instead of blending brand, engineering, and runtime coordination into one ambiguous team.
- **[DATA NEEDED]:** Approved public census; canonical Durham agent-count definition; Team RAM command count; package-version authority; current runtime support matrix.
- **Classification:** Public, with counts omitted until reconciled

**Copy constraint for the next stage:** The plugin names are canonical and must appear exactly as **Allura Cowork**, **Team Durham**, and **Team RAM Coding**. “Team RAM” refers to the broader standalone harness and must not substitute for the plugin name.

---

## 7. Team Durham Brand Workflow

- **Working title:** Team Durham Brand Workflow
- **Priority:** Medium
- **Primary audience:** Internal brand operators, clients reviewing process, and collaborators preparing a brand assignment
- **Audience problem or question:** “How does Team Durham move from a request to a governed, reviewable brand deliverable?”
- **Communication objective:** Show that strategy and evidence precede creative production, with named ownership and a read-only QA gate.
- **One-sentence core message:** Team Durham turns a brand request into a governed deliverable by locking intent and strategy before copy, visual direction, production, and QA.
- **Supporting points:**
  1. Scout reconnaissance and Kotler intent framing precede routing.
  2. Aaker locks positioning and strategy before creative work begins.
  3. Ogilvy develops verbal identity and copy within the approved strategy.
  4. Glaser directs visuals; Rand builds the brand kit and production assets.
  5. Munari audits independently and reports issues without implementing the fixes; Kotler closes and records the outcome.
- **Verified facts and source documents:**
  - The Team Durham pipeline names Kotler, Aaker, Ogilvy, Glaser, Rand, Munari, memory, and final reporting ([Team Durham skill, “Pipeline”](../../../allura-plugins/team-durham/skills/team-durham/SKILL.md#pipeline)).
  - STP precedes creative work and Scout recon precedes routing ([brand orchestrator instructions](../../../allura-plugins/team-durham/agents/brand-orchestrator.md)).
  - Munari is a read-only QA role and the documented pass gate is 85%+ ([QA reviewer instructions](../../../allura-plugins/team-durham/agents/qa-reviewer.md)).
  - The plugin README defines the public route as strategy through production and QA ([Team Durham README](../../../allura-plugins/team-durham/README.md)).
- **Claims that require validation:**
  - Whether Asset Pipeline “Phase 3.5” is a nested subphase or an additional main phase.
  - Whether the 85% threshold is approved for public-facing publication or should remain internal.
  - Whether every named specialist is available in every runtime.
  - Whether a documented role perspective reflects an actual subagent execution in a given engagement.
- **Recommended structure:** Stage-gated workflow: Recon → Intent → Strategy → Verbal → Visual Direction → Production → QA → Record/Report, with decision diamonds at strategy and QA.
- **Recommended visualization type:** Lifecycle/process flow with role ownership lanes
- **Desired viewer action or takeaway:** Approve strategy before requesting visual production, and require QA evidence before declaring the work complete.
- **[DATA NEEDED]:** Phase 3.5 taxonomy; public/private status of the 85% QA threshold; current runtime-role support; execution receipts for any case study.
- **Classification:** Internal/technical process; a simplified public adaptation is possible

**Runtime-honesty constraint:** A role label means the current runtime follows that specialist’s guidance unless a real subagent invocation receipt proves separate execution.

---

## 8. Team RAM Software-Delivery Workflow

- **Working title:** Team RAM Software-Delivery Workflow
- **Priority:** Medium
- **Primary audience:** Technical operators, developers, and stakeholders reviewing how software work is governed
- **Audience problem or question:** “Who owns architecture, implementation, review, and proof that the change works?”
- **Communication objective:** Present the Brooks-led workflow as a sequence of explicit responsibilities and validation gates, not as a vague multi-agent swarm.
- **One-sentence core message:** Team RAM Coding preserves conceptual integrity by routing each change from Brooks and Scout through implementation, focused review, validation, and factual closeout.
- **Supporting points:**
  1. Brooks owns architecture, task framing, and routing.
  2. Scout retrieves repository and Allura Brain context before implementation planning.
  3. Required skills are selected before Woz implements the scoped change.
  4. Pike reviews interface simplicity; Fowler gates refactor safety and structural quality.
  5. Validation evidence precedes outcome logging and “done.”
- **Verified facts and source documents:**
  - The Team RAM Cowork skill defines the default Brooks-led startup and required sequence ([Team RAM Cowork skill, “Default Startup”](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md#default-startup)).
  - Scout’s role is context hydration and evidence gathering before planning ([Scout instructions](../../../allura-plugins/team-ram-coding/agents/scout.md)).
  - Woz implements scoped work and reports validation evidence ([Woz instructions](../../../allura-plugins/team-ram-coding/agents/woz.md)).
  - Runtime honesty and validation-state rules are explicit in the Team RAM Cowork contract ([Team RAM Cowork skill, “Runtime Honesty”](../../../allura-plugins/team-ram-coding/skills/team-ram-cowork/SKILL.md#runtime-honesty)).
- **Claims that require validation:**
  - Current role/model availability across supported runtimes.
  - Any implication that Brooks, Scout, Woz, Pike, or Fowler ran as independent subagents without execution receipts.
  - Full consistency of legacy commands with the current `allura-*` tenant namespace and governed memory tools.
  - Public package command count and version.
- **Recommended structure:** Swimlane workflow with Owner, Context, Build, Review, Validate, and Record lanes; use evidence gates rather than decorative agent portraits.
- **Recommended visualization type:** Role-based software-delivery process flow
- **Desired viewer action or takeaway:** Require context before code and validation before closeout; use receipts to distinguish guidance from actual execution.
- **[DATA NEEDED]:** Runtime support matrix; reconciled command/version census; remediation status for legacy `roninmemory`/direct-memory command paths; real execution receipt for any example.
- **Classification:** Technical/internal

**Contradiction to preserve during production:** The legacy `end-session` command uses `group_id='roninmemory'` and direct entity creation, which conflicts with the current `allura-*` tenant rule and governed memory pathway. Do not depict the full package as uniformly migrated until resolved.

---

## 9. Allura Cowork Runtime-Handoff Flow

- **Working title:** Allura Cowork Runtime-Handoff Flow
- **Priority:** Medium
- **Primary audience:** Technical collaborators and operators working across Claude and Codex
- **Audience problem or question:** “How can work move between runtimes without losing context or falsely implying that the next runtime already acted?”
- **Communication objective:** Define a durable handoff as an evidence packet with explicit runtime, validation, approval, and next-action state.
- **One-sentence core message:** Allura Cowork transfers verified context and responsibility between distinct runtimes while keeping execution, validation, approval, and memory status explicit.
- **Supporting points:**
  1. Identify the current runtime and project overlay before retrieving context or routing work.
  2. Search approved context or disclose that memory is unavailable; never fabricate hydration.
  3. Route a named owner and reviewer, perform the work, and record validation status honestly.
  4. The handoff packet includes runtimes, context, files, decisions, risks, validation, next action, memory status, and approval state.
  5. A handoff packet is an instruction and evidence bundle—not proof that the receiving runtime executed it.
- **Verified facts and source documents:**
  - The Cowork core contract defines runtime identification, hydration/disclosure, routing, work, validation, receipt, and handoff/closeout ([Allura Cowork skill, “Core Contract”](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md#core-contract)).
  - Runtime honesty distinguishes guidance, subagent invocation, cross-runtime handoff, and actual execution ([Allura Cowork skill, “Runtime Honesty”](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md#runtime-honesty)).
  - The handoff schema requires runtimes, context, files, decisions, risks, validation, next action, memory, and approval data ([handoff schema](../../../allura-plugins/allura-cowork/schemas/handoff.schema.json)).
  - Unrun validation must remain `not_run`, and promotion or other approval boundaries remain explicit ([Allura Cowork skill, “Approval Boundaries”](../../../allura-plugins/allura-cowork/skills/allura-cowork/SKILL.md#approval-boundaries)).
- **Claims that require validation:**
  - Any claim that a Claude-to-Codex or Codex-to-Claude handoff actually executed without a current receipt.
  - Current install/load status of Cowork on both runtimes.
  - Current CI coverage for schemas, examples, evals, and hooks.
  - Any claim that Cowork “prevents hallucinations.”
- **Recommended structure:** Two-runtime relay: Runtime A → Context/Work Receipt → Handoff Boundary → Runtime B Acknowledgment → Validation/Close, with a clear “not yet executed” state between send and acknowledgment.
- **Recommended visualization type:** Runtime-handoff process flow or state timeline
- **Desired viewer action or takeaway:** Never treat a prepared handoff as completed work; look for the receiving runtime’s execution and validation receipt.
- **[DATA NEEDED]:** Real cross-runtime execution receipts; current dual-runtime install/load evidence; actual CI coverage; approved example packet for publication.
- **Classification:** Technical/internal; public explanation can omit schema fields

**Language prohibition:** Do not say Cowork prevents hallucinations. The supported promise is that it reduces unsupported claims through context, evidence, validation, and receipts.

---

## 10. The Six Allura Governance Policies

- **Working title:** The Six Allura Governance Policies
- **Priority:** High
- **Primary audience:** Technical evaluators, operators, governance reviewers, and internal maintainers
- **Audience problem or question:** “Which rules define governed memory behavior, and how are they enforced?”
- **Communication objective:** Present the six governance-registry policies as a coherent control system while preventing collision with the separate kernel and RuVix rule namespaces.
- **One-sentence core message:** Allura’s governance registry protects tenant scope, evidence history, versioned knowledge, promotion approval, canonical access, and namespace integrity.
- **Supporting points:**
  1. `pol-001` requires tenant scope on every operation.
  2. `pol-002` preserves evidence events as append-only records.
  3. `pol-003` versions semantic knowledge through supersession rather than in-place overwrite.
  4. `pol-004` defines the promotion approval gate.
  5. `pol-005` and `pol-006` protect canonical database access and the `allura-*` tenant namespace.
- **Verified facts and source documents:**
  - The active six-policy governance registry is defined in [`src/lib/governance/policies.ts`](../../../Allura_Memory/src/lib/governance/policies.ts): `pol-001` tenant scope, `pol-002` append-only evidence, `pol-003` semantic versioning, `pol-004` promotion approval, `pol-005` canonical database access, and `pol-006` tenant namespace.
  - The runtime kernel separately defines uppercase `POL-001..006` with different meanings ([kernel policy implementation](../../../Allura_Memory/src/kernel/policy.ts)).
  - RuVix separately defines `RULE-001..012` ([solution architecture, RuVix policy contract](../../../Allura_Memory/docs/allura/SOLUTION-ARCHITECTURE.md)).
  - Current semantic persistence is PostgreSQL graph tables; the registry text for `pol-003` and `pol-004` still refers to Neo4j ([governance registry](../../../Allura_Memory/src/lib/governance/policies.ts); [graph adapter factory](../../../Allura_Memory/src/lib/graph-adapter/factory.ts)).
- **Claims that require validation:**
  - Whether the lowercase registry IDs are approved for durable public use before the namespace collision is remediated.
  - Updated canonical wording for `pol-003` and `pol-004` after Neo4j sunset.
  - Exact enforcement coverage for each policy across MCP, REST, batch, scripts, and direct database access.
  - Whether the promotion gate permits automated curator approval in the target policy interpretation.
- **Recommended structure:** Six-segment policy wheel around a center labeled “Governed Memory,” plus a technical namespace legend separating `pol-*`, `POL-*`, and `RULE-*`.
- **Recommended visualization type:** Policy wheel with enforcement boundary annotations
- **Desired viewer action or takeaway:** Use the correct policy namespace and verify the applicable enforcement path before claiming governance compliance.
- **[DATA NEEDED]:** Namespace remediation decision; updated `pol-003`/`pol-004` registry text; interface-by-interface enforcement matrix; approved interpretation of automated curator mode.
- **Classification:** Technical/internal until the policy namespace and stale registry wording are resolved

**Strategic risk:** Bare labels such as “Policy 4” are prohibited. Until remediation, write **governance `pol-004`** or **RuVix `RULE-004`** and never substitute uppercase kernel `POL-004`.

---

## Production sequence

This is the recommended **production order**, not the eventual publishing order. Foundation pieces come first so later pieces inherit approved terminology and architecture rather than redefining them.

| Rank | Infographic | Why it belongs here | Dependency or gate before Ogilvy |
|---:|---|---|---|
| 1 | The Governed Memory Lifecycle | Establishes the evidence-to-knowledge sequence used across the collection. | Resolve approved wording for human review versus auto curator mode and queued materialization. |
| 2 | Episodic Evidence vs. Semantic Knowledge | Locks the central conceptual distinction and “one engine, two logical layers” language. | Confirm retrieval-mode language and native RuVector status wording. |
| 3 | A Governed Memory Leaves Evidence | Defines the provenance vocabulary reused in workflows and handoffs. | Fallback title approved; keep receipt fields operation-specific and evidence-backed. |
| 4 | The Six Allura Governance Policies | Locks the control vocabulary for all remaining technical pieces. | Resolve or formally namespace `pol-*` versus `POL-*`; update stale Neo4j policy text. |
| 5 | The Allura Plugin System | Establishes the plugin/Brain/runtime boundary. | Reconcile package-version authority; omit versions if unresolved. |
| 6 | Meet the Three Core Plugins | Converts the system boundary into a choice architecture. | Reconcile or omit counts; confirm “three core/public packages” terminology. |
| 7 | Team Durham Brand Workflow | Applies shared governance to the brand domain. | Decide Phase 3.5 taxonomy and public status of QA threshold. |
| 8 | Team RAM Software-Delivery Workflow | Applies shared governance to the software domain. | Resolve legacy tenant/memory path before claiming uniform compliance. |
| 9 | Allura Cowork Runtime-Handoff Flow | Depends on approved receipt, runtime, and plugin-boundary language. | Provide a real cross-runtime receipt for any executed example; otherwise use an abstract flow. |
| 10 | Allura Ecosystem at a Glance | Synthesizes every prior decision into one public map. | Finalize inventory, product relationships, visibility, terminology, and deployment-status omissions. |

### Recommended publishing sequence after gates close

For a public audience, publish **Allura Ecosystem at a Glance** first, followed by **The Governed Memory Lifecycle**, **Episodic Evidence vs. Semantic Knowledge**, **The Allura Plugin System**, and **Meet the Three Core Plugins**. Publish receipt, policy, and workflow pieces as technical/operator follow-ons. Production order remains the reverse of this communication hierarchy because the synthesis depends on the underlying decisions.

## Cross-collection approval gates before copywriting

1. **Architecture lock:** Approve “PostgreSQL evidence + PostgreSQL graph tables through the RuVector adapter”; remove Neo4j from active-state depictions.
2. **Promotion semantics:** Decide how public copy distinguishes intended human accountability from the existing auto curator mode and queued REST materialization.
3. **Receipt scope:** The narrower title **A Governed Memory Leaves Evidence** is approved. Universal receipt coverage remains prohibited; every displayed field must be tied to its implemented operation or labeled `[DATA NEEDED]`.
4. **Policy namespace:** Resolve or explicitly separate lowercase governance `pol-*`, uppercase kernel `POL-*`, and RuVix `RULE-*`.
5. **Plugin census:** Reconcile `0.2.0` manifests with `0.1.0` package files, Team RAM 34/35 command drift, and Team Durham 12/13 agent-definition language.
6. **Runtime honesty:** Require execution receipts for any claim that Claude, Codex, or a named subagent actually ran; otherwise label the content as a role perspective, route, or illustrative flow.
7. **Status claims:** Omit production readiness, live endpoints, current health, customer usage, and client outcomes until verified with current evidence.
8. **Public naming:** Approve the ecosystem inventory, repository visibility, product relationship labels, and any named client before public layout.

## Kotler strategy approval

**Strategy decision:** The ten-piece collection is strategically coherent and may advance in controlled batches. Approval applies to the briefs and hierarchy in this document, not to unsupported implementation claims.

### Approved for Ogilvy

- **2. The Governed Memory Lifecycle** — Approved with the exact caveat that approval “authorizes or queues” canonical materialization; Ogilvy must not promise universal synchronous promotion or individual human action on every path.
- **3. Episodic Evidence vs. Semantic Knowledge** — Approved. The “one PostgreSQL engine, two governed logical layers” terminology is locked.
- **4. A Governed Memory Leaves Evidence** — Approved under the owner-authorized fallback title. Copy must describe verified provenance across capture, proposal, decision, and lineage without claiming that every operation returns one unified receipt.
- **5. The Allura Plugin System** — Approved if versions and unsupported installation claims are omitted.
- **7. Team Durham Brand Workflow** — Approved using the main stage sequence; Phase 3.5 and the numeric QA threshold remain internal annotations pending confirmation.
- **8. Team RAM Software-Delivery Workflow** — Approved as a normative workflow, with runtime execution and uniform migration claims prohibited.
- **9. Allura Cowork Runtime-Handoff Flow** — Approved as an abstract contract flow; no example may be presented as executed without a receipt.

### Conditionally approved for Ogilvy

- **1. Allura Ecosystem at a Glance** — Conditionally approved for conceptual copy. Final labels for outer-ring repositories, clients, visibility, and deployment status require owner approval; unverified nodes must be omitted or marked `[DATA NEEDED]`.
- **6. Meet the Three Core Plugins** — Conditionally approved. Responsibility copy may proceed, but version and census copy must wait for repository reconciliation or be omitted.
- **10. The Six Allura Governance Policies** — Conditionally approved for internal technical copy using lowercase `pol-*` labels and a namespace legend. Public release waits on namespace and Neo4j-text remediation.

### Prohibited claims

- **Universal receipt coverage remains blocked.** Ogilvy must not use “Every Memory Comes With a Receipt,” imply that all operations return one unified `GovernanceReceipt`, or describe the audit history as cryptographically chained without implementation evidence.

### Handoff instruction

Ogilvy may develop exact on-canvas copy only within the approved and conditional boundaries above, marking unresolved facts `[DATA NEEDED]` and escalating any strategy change to Kotler. Visual direction and image production remain paused until Kotler approves the completed copy deck and the blocking terminology decisions are recorded.
