# Risks and Decisions: Allura

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> When in doubt, defer to the source code, schemas, and team consensus.

---

## Architectural Decisions

| ID    | Decision                                                          | Status   | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ----------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD-01 | PostgreSQL for episodic memory                                    | Decided  | Append-only, ACID, mature tooling. Audit trail is non-negotiable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| AD-02 | Neo4j for semantic memory                                         | Superseded by AD-44 | Native graph relationships, SUPERSEDES lineage is idiomatic, semantic search via Cypher. **Sunset 2026-07 — Neo4j container stopped. All semantic storage now PostgreSQL pgvector (see AD-44).**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AD-03 | MCP as primary agent interface                                    | Decided  | Adopted standard. Works with Claude, GPT-4, any MCP-compatible runtime. No vendor lock-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AD-04 | `PROMOTION_MODE` env var governs Neo4j writes                     | Decided  | Architectural gate. `soc2` mode requires human approval — enforced in code, not policy. `auto` mode uses score threshold.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AD-05 | 5-tool public API surface (`add/search/get/list/delete`)          | Decided  | mem0 UX parity. Developers see five tools. All internal complexity is hidden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AD-06 | `group_id ~ '^allura-'` CHECK constraint in Postgres              | Decided  | Tenant isolation at schema level. Cannot be bypassed by application code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AD-07 | No ADAS, domain workflows            | Decided  | Essential complexity only. All removed 2026-04-07. Allura is a memory engine — nothing else. Dashboard and operator surfaces are optional governed control planes over MCP/API contracts, not core engine components and not separate sources of engine truth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AD-08 | Soft-delete only — no hard deletes                                | Decided  | Append-only audit trail. Deletion records are events, not erasures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AD-09 | Neo4j write failure is non-fatal                                  | Superseded by AD-44 | Postgres write is the source of truth. Neo4j was a promotion layer — its failure should degrade gracefully. **Neo4j sunset 2026-07 — this decision is now moot. All storage is PostgreSQL.** |                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AD-10 | RalphLoop for bounded validation tasks only                       | Decided  | RalphLoop is designed for slice-by-slice validation, not full project execution. Bounded by `--max-iterations` flag and timeout guards. Prevents runaway validation loops.                                                                                                                                                                                                                                                                                                                                                                                                  |
| AD-11 | Human-in-the-loop gating for validation evidence                  | Decided  | Every RalphLoop slice requires human review before proceeding. Judge reviews all evidence; no automatic progression to next slice without explicit approval.                                                                                                                                                                                                                                                                                                                                                                                                                |
| AD-12 | Slice-by-slice approach (no parallel slice definition)            | Decided  | Sequential slice execution ensures clear causation and evidence trails. Parallel slices would introduce race conditions and obscure failure attribution.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AD-13 | Canonical API validation uses bounded RalphLoop slices            | Decided  | Validate `/api/memory` with bounded, repeatable slices to preserve fast feedback, clear causality, and low architectural risk.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AD-14 | PostgreSQL required, Neo4j degradable at runtime                  | Superseded by AD-44 | Canonical memory contract remains available when PostgreSQL is healthy. Neo4j was optional-at-runtime. **Neo4j sunset 2026-07 — PostgreSQL is now the sole storage engine. All graph/semantic operations use pgvector.** |                                                                                                                                                                                                                                                                                                                              |
| AD-15 | Unified agent taxonomy (AGENT_MANIFEST as single source of truth) | Decided  | Three conflicting agent taxonomies (.opencode/agent/, scripts/agents/, agent-routing.md) unified into AGENT_MANIFEST (src/lib/agents/agent-manifest.ts). Team RAM persona names (brooks, jobs, pike, fowler, scout, woz, bellard, carmack, knuth, hightower) are canonical. Legacy OmO names (turing, hopper, etc.) removed from active manifest. CI routing driven by manifest data via dynamic-router.ts, replacing static bash case statement.                                                                                                                                                           |
| AD-16 | Ralph is an installed tool, not a built component                 | Decided  | Ralph (`@th0rgal/ralph-wiggum`) is a CLI tool that wraps any AI coding agent in a self-correcting loop. We install it; we do not implement it. Our `ralph-loop.ts` is a thin harness: resolves the binary, constructs the command with Allura defaults, logs start/end to PostgreSQL, and passes through to the real `ralph` CLI. Previous `github-models` / `GITHUB_TOKEN` references were incorrect and have been removed. What model Ralph's agent uses (OpenCode default, Claude Code, Codex, Copilot) is configured via `--agent` and `--model` flags — not hardcoded. |
| AD-17 | 13-16-18 youth culture UX validation framework                    | Decided  | Marketing principle: 13-year-olds spot emerging trends, 16-year-olds identify popularity gaps, 18-year-olds confirm mainstream readiness. Applied to Allura consumer UI review. Target score: 0.85+. Framework validates emotional resonance, not just functional correctness.                                                                                                                                                                                                                                                                                              |
| AD-18 | Merge `/dashboard/traces` into `/dashboard/audit`                 | Decided  | Traces merged into audit page in codebase. Doc now matches reality. See `docs/allura/AD-18-traces-vs-audit.md`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AD-19 | Controlled retrieval layer as sole agent read path                | Decided  | Agents MUST NOT query PostgreSQL or Neo4j directly. All reads go through `POST /api/memory/retrieval`. This enforces scoping, audit logging, and policy at the service boundary rather than relying on agent compliance. See [BLUEPRINT.md](./BLUEPRINT.md).                                                                                                                                                                                                                                                                          |
| AD-20 | Curator marks events as promoted after proposal creation          | Decided  | Without marking events as promoted, the curator re-scores the same traces on every run, creating duplicate proposals. Events with `status = 'promoted'` are excluded from future curator queries. See [BLUEPRINT.md](./BLUEPRINT.md).                                                                                                                                                                                                                                                                                |
| AD-21 | Single consolidated governed memory design surface                 | Decided  | One design doc covers the full governed pipeline (F1–F15). Splitting into five thin design docs too early creates maintenance overhead without ownership clarity. Split later only if subsystem complexity forces it. See [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md).                                                                                                                                                                                                                                                                                           |
| AD-22 | VALIDATION-GATE.md in docs/archive/allura/, not docs/allura/       | Decided  | The validation gate is an operational artifact, not one of the six canonical architecture documents. Per the canonical surface rule, it belongs in `docs/archive/allura/`. Cross-linked from BLUEPRINT.md, REQUIREMENTS-MATRIX.md, and RISKS-AND-DECISIONS.md. (VALIDATION-GATE.md pending creation at `docs/archive/allura/VALIDATION-GATE.md`; E2E readiness status is tracked in [BLUEPRINT.md](./BLUEPRINT.md#e2e-readiness-status-as-of-2026-06-14) until the gate file is authored.)                                                                                                                                                                                                                                           |
| AD-23 | Skills-first packaged MCP architecture for memory access          | Decided  | Brooks / Team RAM orchestrates skills first. Skills encode routing and guardrails, then call focused packaged MCP servers: `neo4j-memory` for approved-memory recall, `database-server` for trace/audit evidence, and `neo4j-cypher` only for read-only graph inspection when memory recall is insufficient. No custom all-in-one MCP runtime is canonical. Skills enforce read-only + tenant-scope guardrails for inspection flows, while governed write paths remain controlled by application services and approval policy. (MIGRATION-TRACKER.md is not yet created; track migration progress in Allura Brain events and [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md).) |
| AD-24 | Agent/Project/Team graph model as structural context layer          | Decided  | A graph without structure is just a list. Agent, Team, and Project nodes provide the structural context that makes Memory nodes retrievable by ownership, project, and delegation path. Eliminates the shadow Memory Framework agent hierarchy in favor of the existing surgical team pattern. Alternatives: (1) Memory-only graph with metadata properties — rejected because flat metadata doesn't support traversal queries across team structure. (2) Separate knowledge base for agents — rejected because it creates sync burden between two surfaces. |
| AD-25 | Phase 6 Closure — all deliverables shipped | Decided  | See Phase 6 Closure Decision Detail section below. |
| AD-26 | Real-data API uses query/mapper boundary and read-only graph endpoint | Decided | Issue #25 makes `/api/memory` a trust surface over real Allura Brain data, not a mock endpoint. API consumers use mapped contracts from `src/lib/api/`; raw Brain API shapes stay behind `api.ts`, `queries.ts`, and `mappers.ts`. `/api/memory/graph` is read-only, tenant-scoped by `group_id`, returns a capped display sample plus `total_edges`, and performs no Neo4j mutations. Alternatives rejected: mock data, client-inferred relationships, and raw API responses in consumers. |
| AD-27 | Budget enforcer TTL auto-expiry for halted sessions | Decided | Halted budget sessions auto-expire after `haltTtlMs` (default: 1 hour). `DEFAULT_HALT_TTL_MS = 60 * 60 * 1000` in `src/lib/budget/enforcer.ts`. Admin can reset manually via `POST /api/admin/reset-budget`. Auto-expiry prevents indefinite lockout of agents after a budget breach. Alternatives: (1) No auto-expiry — rejected because agents would require manual reset after every breach. (2) Immediate reset — rejected because it defeats the purpose of budget enforcement. |
| AD-28 | Sync contract mapping table for relationship wiring | Decided | `src/lib/graph-adapter/sync-contract-mappings.ts` provides deterministic user_id→Agent and group_id→Project mappings. Used by curator approve and auto-promote paths to wire AUTHORED_BY and CONTRIBUTES_TO relationships on promoted memories. Alternatives: (1) Dynamic agent/project discovery from Neo4j — rejected because it adds latency and requires graph queries during promotion. (2) Convention-based naming (user_id = agent name) — rejected because it's fragile and breaks when names diverge. |
| DDR-004 | Token Authority — Two-path design system | Enforced | CSS custom properties (`var(--allura-*)`) for Tailwind/HTML contexts; `tokens.ts` for Canvas/JS runtime. Raw hex and generic shadcn utilities (`text-muted-foreground`, `bg-muted`) are prohibited in active CLI scope. Committed 2026-04-30. |
| AD-29 | API-first architecture — MCP/API remains primary engine path | Superseded by AD-31 | Earlier terminal-only language correctly protected the MCP-native engine from dashboard drift, but it over-constrained the approved operator experience. MCP, API, and CLI remain canonical engine paths; the Memory Command Center is an optional governed operator surface. |
| AD-31 | RuVix-governed Memory Command Center operator surface | Accepted | 2026-05-29: Ronin approved a branded Memory Command Center to manage memories, RuVix governance, curator decisions, audit/evidence, graph exploration, and settings. It is not a decorative dashboard and not a bypass around MCP/API governance. Every page exposes `group_id`, source, freshness, degraded state, and evidence. Every mutation requires a governance receipt. Alternatives rejected: (1) terminal/API-only surface — rejected because memory governance needs human inspection and curation; (2) decorative dashboard — rejected because it creates trust theater; (3) direct substrate admin UI — rejected because it bypasses RuVix policy. |
| AD-30 | Email-derived content is external untrusted evidence | Decided | Email/Gmail/IMAP content may enter Allura only as raw episodic evidence with `trust_zone=external_untrusted`. It cannot issue agent instructions, trigger privileged actions, or auto-promote to canonical Neo4j memory. RuVix policies POL-EMAIL-001 through POL-EMAIL-005 enforce instruction blocking, action approval, high-risk quarantine, HITL promotion, and attachment sandboxing. (EMAIL-ALLURA-ENFORCEMENT.md pending — route to `docs/archive/allura/` when created.) |
| AD-XX | RuVix Control Plane Contract | Accepted | The 12 RuVix rules are the control plane invariants governing Allura Brain. Every existing gap — HITL approval, append-only history, tenant isolation, fail-closed tool use, and evidence-backed completion — is formalized as a testable boundary rule. Canonical contract: `RUVIX_CONTROL_PLANE_CONTRACT_v1`. |
| AD-32 | Current runtime label is pgvector bridge | Decided | TALON evidence on 2026-06-02 observed PostgreSQL `vector` extension `0.8.2`, `ruvector_function_count=0`, and `allura_memories_count` around `3392`. Therefore canon must say `pgvector bridge`, not full RuVector, until extension/function and search/feedback health checks prove otherwise. |
| AD-33 | Approval boundaries for engine mutations | Decided | Runtime/database changes, MCP config mutation, cron mutation, live RAM/Durham hook installation, RuVix enforcement changes, canonical semantic promotion, Notion sync, and Done/Approved status moves require explicit Captain or lane-owner approval and receipt fields including `approval_required`. |
| AD-34 | RVF MCP and Cognitum Gate — Level 4 self-evolution approved | Accepted | ~~Deferred~~ — **Unparked 2026-07-17 by Captain.** SONA feedback loops, coherence monitor, genesis engine, self-healing, and pattern learning are approved for native build in allura-memory repo. HITL gates remain on all self-modification. See epic: `_bmad-output/planning-artifacts/epic-level-4-pattern-learning.md`. | |
| AD-35 | RunRecord template before methodology runtime | Accepted | Allura should add a governed orchestration run record/template before building a full methodology runtime. The durable contract is a neutral `RunRecord` plus separated policy and runtime-state blocks, not a new memory engine role. Babysitter/BMAD patterns are inspiration only: copy process-as-code, quality gates, approval breakpoints, run journals, resume/replay, doctor checks, short user/project profiles, and lane routing; reject yolo/forever modes, hallucination-free claims, foreign runtimes, marketplace assumptions, and external process libraries as canon. Decision to implement deferred until a concrete RunRecord use case emerges that cannot be served by the existing Team RAM + Notion/Brain workflow. |
| AD-XX+1 | RuVix Brand Governance Rules | Accepted | The 6 RuVix brand rules are enforceable control plane invariants for Allura Dashboard surfaces. Durham token exclusivity, mission-control voice, evidence-gated completion, accessibility, component consistency, and the Durham gate before ship are treated as release boundaries — not style suggestions. (BRAND-RULES-dashboard-v2.md pending — route to `docs/archive/allura/governance/` when created; until then canonical detail is in [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md).) |
| AD-36 | Public catalog and docs surface (`catalog/`, `docs/user-guide/`, `docs/plugins/`, `docs/reference/`) | Decided | A newcomer landing on GitHub must understand what Allura is, which plugin path to use, how to install, how to verify memory works, and where canonical docs live without reading internal architecture docs first. The public surface is a navigation layer only; canonical governance truth remains in `docs/allura/`. |
| AD-37 | Public workflow library chooser (`library/`) | Decided | The `library/` surface is for external builders choosing workflows, adapters, and governance levels for their own Allura-based systems. It must not be framed primarily as an internal Team RAM skill catalog. |
| AD-38 | Allura public positioning as governed memory + evidence control plane | Decided | Public README positioning targets builders creating their own governed AI memory/workflow systems. Archon is treated as a workflow-runner reference, Babysitter as a process-enforcement reference, and Allura as the governed memory, evidence, approval, and receipt layer. |
| AD-39 | Allura Scout context-packet plugin before vertical workflow templates | Decided | Add Allura Scout as a public read-only context discovery plugin before building mortgage/HACCP/medical billing workflow templates. Scout reduces token cost and context drift by returning a compact `ContextPacket` with goal, summary, relevant files, relevant memories, risks, token budget, and recommended route. Mortgage remains paused by Ronin direction. |
| AD-40 | Control Plane as single write gate for all DB operations | Decided | syscall_mutate and syscall_query are now the only path to PostgreSQL and Neo4j. agentMemory (MCP) and memory() (internal graph) both route through the control plane's proof→policy→audit pipeline. Direct DB backends available via MEMORY_BYPASS_CONTROL_PLANE=true for migration (renamed 2026-08-20 from MEMORY_BYPASS_KERNEL, which is still read as a deprecated fallback with a warning). Target resolver enforces append-only on pg:events, group_id on all ops, label allowlist on Neo4j. Satisfies F1, F8, F26, F27, F33, F35, F37, F38. |
| AD-41 | Governed AI office delivery sequence | Accepted | Deliver product truth, production run control plane, PostgreSQL work plane, operator workspace, then one desktop shell. This keeps Allura Brain as the memory/evidence layer and prevents packaging placeholder state or unstable contracts. |
| AD-42 | Governed API middleware — identity, scope, per-request audit | Decided | HTTP-plane counterpart of AD-40's control plane write gate: every dashboard/API route passes governed middleware. Contract: (1) no identity → 401; (2) insufficient role/scope → 403 (admin > curator > viewer via Clerk RBAC, DevAuthProvider in dev); (3) exactly one append-only `api_request_gated` audit event per gated request (group_id stamped and allura-* validated; no payload bodies logged); (4) every route declares its required scope in a static route-scope manifest — CI fails any route missing a declaration, so an unguarded route is a build error, not a runtime discovery. Alternatives rejected: per-route ad-hoc checks (drift-prone, unauditable); gateway-only enforcement (bypassable in dev, no per-request evidence). Consequence: blocks Phase 0 surfaces (Scheduled Tasks, Settings, Teams, Dreams) until implemented; satisfies release criterion 2. Owner: Sabir (sign-off), Woz (implement), Pike (review). |
| AD-43 | Agent Factory CI belongs in canonical `Allura_Memory` repository | Decided | Factory validators and workflows must be tracked by the repository whose GitHub Actions are expected to execute them. The prior ecosystem-root draft was outside the canonical Git boundary and could not provide CI evidence. The canonical workflow validates module structure, roster, tenant scope, BMad dependencies, and Allura governance; live smoke proves tenant isolation; packaging requires an explicit team. RuVector readiness remains fail-closed and does not imply native migration or upstream publication. Alternatives rejected: retain untracked ecosystem workflow; duplicate CI across repositories; claim native/upstream readiness from placeholder jobs. |
| AD-44 | GIT-EXEC-001 — gitdir-contamination guardrail on git-exec wrapper and ralph cwd guard | Decided | Any `git` subprocess spawned by the harness or Ralph must have its `GIT_DIR` constrained to the project root. Unconstrained git commands can read or write to a parent `.git` directory when invoked from a nested working directory, silently corrupting history. The guardrail is a single git-exec choke point (`src/lib/git/exec.ts`) all agents route through: it refuses any working-tree git command when (A) the resolved cwd contains `/.git/`, or (B) `git rev-parse --git-dir` equals `--show-toplevel` (gitdir == worktree). Every invocation is stamped with a `GIT_EXEC_WRAPPER` trace token, and a static CI scanner (`scripts/validate-git-exec-choke-point.ts`, wired into the lint job) fails the build if any bare `git` call exists outside the wrapper — making the invariant's absence detectable. `scripts/agents/ralph-loop.ts` imports the cwd assertion before spawning the external ralph loop. Alternatives rejected: rely on operator discipline — rejected because git contamination is silent and catastrophic; whitelist specific commands — rejected because the attack surface is the path, not the command. Satisfies F20 (infra safety) and REQ-AF-CI-001 (canonical repo boundary). |
| AD-45 | Port Allocation Policy — canonical port registry for all Allura services | Decided | Each service running in the Docker Compose stack or as a dev server must register a port in a canonical table rather than picking one ad hoc. Collisions produce silent service failures that are hard to diagnose. Port-band policy: the entire 3000–3999 band is BANNED (Next.js/React default — caused repeated 3100 collisions and orphaned containers). Allocate by tier, incrementing +1 per new service: UI/frontends 4000+ (Allura Control Center UI = 4001), APIs/backends 6000+ (Control Center API = 6001), tools/workers/aux 7000+. Existing infrastructure is unchanged and exempt: PostgreSQL 5432, RuVector PG 5433, MCP HTTP gateway 5888, Neo4j bolt 7687, Neo4j HTTP 7474. The legacy dashboard on 3100 is sunset and its port retired with the band. New services must claim a port via a PR that updates `docs/allura/BLUEPRINT.md` §8 and `docker-compose.yml` before the service is deployed. Alternatives rejected: runtime port discovery — rejected because it requires coordination across all harness scripts and increases cold-start complexity; no policy — rejected because port collisions have already caused incorrect service routing in prior development cycles. |
| AD-46 | Allura Control Center pivot — dashboard repositioned as governed operator surface | Proposed | The Allura dashboard is proposed to be repositioned from a decorative product dashboard to a governed Memory Control Center: every route backed by live Allura Brain data, every mutation requiring a governance receipt, every panel showing source, freshness, and degraded state. The pivot eliminates fabricated-data claims and unverified health indicators. Implementation is gated on AD-42 middleware, AD-41 delivery sequence, and a live-DB smoke test for each Control Center route. Status: Proposed — not Decided. No route launches without route-parity evidence, source-of-truth declaration, auth validation, and rollback plan per AD-31. |
| AD-49 | RuVector Graph Cutover — default to `GRAPH_BACKEND=ruvector` (PG tables) | Decided | Removes per-person graph-auth wall (Neo4j Community = 1 user), collapses two stores toward one engine, self-hosted, no license tier. Two paths: Path A (PG tables, ship now — recommended for beta), Path B (ruvnet Rust crate, upstreamable — Sabir's choice, spike passed 2026-06-24). Naming: Allura's `ruvector` backend is a PG-table implementation named after the concept, NOT a binding to the ruvnet Rust crate. Story 19.3 executed the flip (2026-07-12); Neo4j remains as fallback for one release. Related: AD-29 (graph adapter pattern), AD-34 (defers full RuVector-Postgres migration — this activates it). |
| AD-50 | Neo4j sunset — PostgreSQL-only architecture | Decided | 2026-07-17: Captain confirmed Neo4j is sunset. All memory operations (episodic + semantic) are now PostgreSQL + pgvector only. Neo4j container is stopped. This supersedes AD-02 (Neo4j for semantic memory), AD-09 (Neo4j write failure non-fatal), and AD-14 (PostgreSQL required, Neo4j degradable). AD-49 RuVector cutover (2026-07-12) was the operational transition; this AD formalizes the sunset. All graph operations, SUPERSEDES lineage, and semantic search now use pgvector tables in PostgreSQL. No code should write to or read from Neo4j. |
| AD-51 | SONA trajectory recording — native Level 4 pattern learning | Accepted | 2026-07-17: Captain approved Level 4 build. SONA trajectory engine records every agent action (memory_add, memory_search, curator operations) as a trajectory in PostgreSQL. Trajectories are the raw dataset for pattern detection. All writes through control plane syscall_mutate (AD-40). Async write — trajectory logging must not block the operation being recorded. See epic: `epic-level-4-pattern-learning.md`, Story 1.3. |
| AD-52 | Skill usage tracking — telemetry for pattern detection | Accepted | 2026-07-17: Every skill load logged with skill name, success/fail, token count, duration. Stored in `skill_usage_events` table (append-only, group_id stamped). Feeds into weekly audit and genesis engine pattern detection. All writes through control plane syscall_mutate (AD-40). See epic: `epic-level-4-pattern-learning.md`, Story 1.2. |
| AD-53 | Coherence monitor — contradiction detection in memory | Accepted | 2026-07-17: Scans recent memories for semantic conflicts (entity-attribute, temporal contradictions, duplicate-with-different-fact). Uses pgvector cosine similarity to find semantically similar memories, then compares extracted facts. Conflicts stored in `coherence_conflicts` table with severity score. HITL review for all high-severity conflicts. See epic: `epic-level-4-pattern-learning.md`, Story 2.1. |
| AD-54 | Genesis engine — pattern-based skill proposal | Accepted | 2026-07-17: Analyzes trajectories and skill usage to detect repeated patterns (3+ identical action sequences, 10+ same task_type, failed-then-succeeded). Generates proposals with confidence score. HITL gate: approved proposals create skill template drafts (markdown), never auto-deployed. See epic: `epic-level-4-pattern-learning.md`, Story 2.2. |
| AD-55 | Self-healing — auto-recovery with HITL alert escalation | Accepted | 2026-07-17: Health monitor checks PostgreSQL, MCP container, disk, memory. Auto-recovery: restart containers, run recovery scripts. Max 3 attempts per component before alerting Captain via Brain memory_add (event_type=ALERT). Recovery attempts logged in `recovery_events` table. See epic: `epic-level-4-pattern-learning.md`, Story 2.3. |
| AD-56 | Dev auth bypass cannot activate in production, unconditionally | Accepted | 2026-08-21: `isDevAuthActive()` evaluated `ALLURA_DEV_AUTH_ENABLED && (!isClerkEnabled(c) \|\| NODE_ENV !== "production")`. The `\|\|` made "Clerk not configured" sufficient on its own, so a production deployment with no Clerk keys and the flag set true returned an authenticated principal carrying `ALLURA_DEV_AUTH_ROLE` (default `admin`) with no credential presented. Production is now short-circuited to `false` before any flag is consulted. Scope was web auth only — the MCP gateway runs `mcp_token` mode and never consumed these flags, so the principal path was unaffected and Gate B identity enforcement held. Commit 96f7ae0a. |
| AD-57 | Epic 25 scope discipline — one browser route, evidence-bound stories | Proposed | 2026-08-23, recorded by Story 25.1: `/dashboard/curator` is the sole initial browser route for the Curator Review Console, and every Epic 25 story must produce commit-bound evidence and a documented MCP/API/CLI rollback path. **The rationale for this decision is not captured anywhere in the repository.** AD-57 was cited by `REQUIREMENTS-MATRIX.md` (header line and REQ-CUR-001, REQ-CUR-008) without ever being recorded here. The decision text above is reconstructed from those citations only. Alternatives considered: unknown — not recorded. Do not treat as ratified. |
| AD-58 | Relational facts before semantic expansion | Accepted | 2026-08-23, propagated by Story 25.1 from `_bmad/bmm/planning/epic-25-governed-curator-review-console.md`. Allura resolves server-derived tenant/workspace scope, memberships/roles, explicit IDs, proposal/evidence/receipt state, actor, and time filters in PostgreSQL **before** semantic/vector expansion. Semantic retrieval may widen or rank only the already-authorized candidate set; it can neither bypass a relational boundary nor substitute for a factual lookup. Implementation addition: relational entity families are embedded only via deterministic, redaction-aware Markdown `SemanticProjection` documents. See detail section below. |
| AD-59 | Server-owned focused subgraph contract for the Knowledge Map | Proposed | 2026-08-23, recorded by Story 25.1. The 2D Knowledge Map uses one server-owned `SubgraphQuery`/`SubgraphResponse` contract with server-derived scope, relational-authorization-first traversal, deterministic ordering, signed opaque continuation bound to scope/query/policy/snapshot, and explicit 200-node/400-edge/depth-2 safety caps. **Rationale and alternatives are not captured anywhere in the repository.** Reconstructed from REQ-MAP-001..003 trace citations only. The stories it targets (25.2, 25.3a) have no story files. Do not treat as ratified. |
| AD-60 | (reserved — no decision content exists) | Proposed | 2026-08-23, recorded by Story 25.1 to close the AD-57..AD-63 numbering gap. **AD-60 is cited nowhere in this repository** — not in `REQUIREMENTS-MATRIX.md`, not in any `_bmad/` planning doc or story, not in source. No decision, rationale, or alternatives exist to record. The number is reserved so that a future author does not silently reuse it for unrelated content. |
| AD-61 | One canonical Agent Skill source with thin host adapters; Entra claims map server-side | Proposed | 2026-08-23, recorded by Story 25.1. One canonical Allura Agent Skill source is packaged through thin adapters for Microsoft Copilot Cowork, Claude Code, and Codex; every host consumes the same server-derived scope, RetrievalPlan, evidence, freshness, denial/degraded, human-review, and receipt contracts. Validated Microsoft Entra tenant/user/group/app-role claims map server-side to an internal Allura principal; unknown, stale, overage, disabled, or forged identity conditions fail closed. **Rationale and alternatives are not captured anywhere in the repository.** Reconstructed from REQ-COP-001..003 and REQ-ID-001 trace citations only. The story it targets (25.4b) has no story file. Do not treat as ratified. |
| AD-62 | Vendor-neutral Mortgage Approval Gate as the demonstration workload | Proposed | 2026-08-23, recorded by Story 25.1. A vendor-neutral Mortgage Approval Gate demonstrates intake, document/OCR evidence, policy evaluation, required human rationale, atomic decision, and immutable receipt across Cowork, Claude Code, and Codex using sanitized deterministic fixtures — with no Salesforce dependency and no automated-underwriting, lending/credit, fair-lending, compliance-certification, production-mortgage, or employer/vendor-endorsement claim. **Rationale and alternatives are not captured anywhere in the repository.** Reconstructed from REQ-MTG-001..002 trace citations only. The story it targets (25.5a) has no story file. Do not treat as ratified. |
| AD-63 | `/dashboard/curator` is a shell over an allow-listed, versioned module registry | Proposed | 2026-08-23, recorded by Story 25.1. `/dashboard/curator` is a stable shell receiving a server-issued, allow-listed, versioned module registry; workflow modules may define presentation and typed workflow descriptors but cannot load arbitrary client code, query storage, select scope, map identity, authorize, evaluate policy, mutate state, issue receipts, or redefine truth states. Unknown, duplicate, incompatible, untrusted, capability-missing, disabled, or failed modules fail closed and are independently rollbackable. **Rationale and alternatives are not captured anywhere in the repository.** Reconstructed from REQ-MOD-001..003 trace citations only. The story it targets (25.3b) has no story file. Do not treat as ratified. |

---

## Decision Detail: Canonical API Validation Approach (merged)

**Context:** The Allura API validation strategy needed a scalable, maintainable approach to ensure contract compliance without slowing development velocity.

**Decision:** Adopted RalphLoop validation slices — atomic, bounded validation tasks that run sequentially with human-in-the-loop gating.

**Alternatives Rejected:**

- **Manual testing**: Too slow, error-prone, doesn't scale with API surface growth
- **Full test suites**: Overwhelming output, hard to diagnose failures, no incremental progress
- **Parallel validation**: Race conditions, unclear causation, difficult to attribute failures

**Consequences:**

- Validation is incremental and observable
- Human judgment gates each slice progression
- Clear audit trail of what was validated and by whom

---

## Risks

### Risk Summary

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| RK-01 | Neo4j graph bloat from duplicate promotions | Medium | Active |
| RK-02 | Cross-tenant data leakage | High | Mitigated |
| RK-03 | Auto-mode promotes low-quality memories | Medium | Active |
| RK-04 | No BYOK — hosted cloud exposes memory data | High | Mitigated |
| RK-05 | Packaged MCP server coordination failures | Medium | Accepted |
| RK-06 | Postgres append-only table grows unbounded | Low | Active |
| RK-07 | Schema drift between Postgres and Neo4j | High | Active |
| RK-08 | Embedding provider latency spikes | Medium | Active |
| RK-09 | Neo4j promotion conflicts (concurrent writes) | High | Mitigated |
| RK-10 | Validation slice false positives | Medium | Active |
| RK-11 | RalphLoop runaway (infinite loops) | Medium | Mitigated |
| RK-12 | Retrieval layer bypass — agents query DBs directly | High | Active |
| RK-13 | Curator re-scores already-promoted traces | Medium | Mitigated |
| RK-14 | E2E validation gap — pipeline not proven | High | Active |
| RK-15 | Approve route connection leak | Medium | ✅ Resolved |
| RK-16 | Graph-Notion sync drift | Medium | ✅ Resolved — 2026-04-30 |
| RK-17 | Dashboard API shape drift hides Brain data gaps | Medium | Active |
| RK-18 | WCAG contrast failures in token system | Medium | Active |
| RK-19 | Memory Command Center route/source-of-truth drift before launch | High | Active |
| RK-20 | Email prompt injection/phishing drives agent actions | High | Mitigated |
| RK-21 | Full RuVector overclaim creates false runtime trust | High | Active |
| RK-22 | SONA feedback before clean receipts creates false learning | High | Active |
| RK-23 | Duplicate MCP configs create harness drift | Medium | Active |
| RK-24 | Live hook enforcement without approval mutates governance unexpectedly | High | Active |
| RK-25 | Methodology layer becomes a second orchestration religion | High | Active |
| RK-26 | Corporate users see Team RAM internals and bounce | Medium | Active |
| RK-27 | Agents claim Done without evidence gates | High | Active |
| RK-28 | Run journals drift from Brain/Notion state | Medium | Active |
| RK-29 | BMAD/Notion/story status drift causes false Done or false backlog | Medium | Active |
| RK-30 | Resume against changed definitions repeats or corrupts work | High | Active |
| RK-31 | Factory CI outside canonical Git boundary creates false green status | High | Mitigated |
| RK-32 | RuVector Graph Cutover Risk | Medium | ✅ Resolved — Story 19.3 flip executed (2026-07-12): `GRAPH_BACKEND=ruvector` default, live-DB E2E passed (14/14), dual-read validated, parity test 14/14 green. Neo4j remains as fallback for one release as per AD-49. 5 sub-risks: R1 Cypher-subset (✅ Resolved for Path A), R2 SUPERSEDES immutability (✅ Resolved), R3 Maturity/breaking changes (✅ N/A Path A), R4 Fulltext+constraints (✅ Resolved Path A), R5 Live-DB E2E proof (✅ Resolved — 2026-07-12). |
| RK-33 | Dev-auth flags remain in the production runtime env | Medium | Mitigated in code by AD-56; the flags are now inert but still present. Remove `ALLURA_DEV_AUTH_ENABLED` and `ALLURA_DEV_AUTH_ROLE` from the deployment environment for defence in depth |
| RK-34 | Default test config omits the adversarial auth suite | High | Active — `src/__tests__/mcp-auth-adversarial.test.ts` (61 tests) is not collected by the default vitest config, which backs the `test` npm script, so `bun run test` reports green without executing it. It runs only under `vitest.config.unit.ts`. Same false-green family as RK-31 |

### Risk Detail

| ID | Risk | Impact | Mitigation | Status |
| ---- | ------------- | ------ | --------- | -------- |
| RK-01 | Neo4j graph bloat from duplicate promotions   | Medium | Dedup check before every Neo4j write (`src/lib/dedup/`)                                                                | Active    |
| RK-02 | Cross-tenant data leakage                     | High   | `group_id` CHECK constraint + scoped queries on every Postgres + Neo4j operation                                       | Mitigated |
| RK-03 | Auto-mode promotes low-quality memories       | Medium | Tunable `AUTO_APPROVAL_THRESHOLD`. Score logged for observability.                                                     | Active    |
| RK-04 | No BYOK — hosted cloud exposes memory data    | High   | Self-hosted deployment makes BYOK unnecessary at infrastructure level — tenants bring their own encryption by definition. | Mitigated |
| RK-05 | Packaged MCP server coordination failures     | Medium | Use focused packaged MCP servers with memory-first routing: `neo4j-memory` first, `database-server` second, `neo4j-cypher` only when needed. Failure of one inspection server should degrade to remaining available surfaces; Postgres + Neo4j remain the durable stores. | Accepted  |
| RK-06 | Postgres append-only table grows unbounded    | Low    | `TRACE_RETENTION_DAYS` env var controls retention. TTL cleanup planned.                                                | Active    |
| RK-07 | Schema drift between Postgres and Neo4j       | High   | Sync validation in health check endpoint. Schema version field in both stores. Alert on mismatch.                      | Active    |
| RK-08 | Embedding provider latency spikes             | Medium | Circuit breaker pattern + fallback caching. Timeout after 5s. Return cached embeddings on provider failure.            | Active    |
| RK-09 | Neo4j promotion conflicts (concurrent writes) | High   | Optimistic locking via `version` field. Retry on `SUPERSEDES` conflict. Max 3 retries.                                 | Mitigated |
| RK-10 | Validation slice false positives              | Medium | Human judge reviews all evidence before approving next slice. No automatic progression without explicit sign-off.      | Active    |
| RK-11 | RalphLoop runaway (infinite loops)            | Medium | `--max-iterations` flag (default: 100) + hard timeout (30 min). Slice counter enforced. Graceful degradation on limit. | Mitigated |
| RK-12 | Retrieval layer bypass — agents query DBs directly | High | AD-19: Controlled retrieval layer enforced as sole read path. Code review gate checks for direct PG/Neo4j imports in agent-facing code. Control Plane `direct-access-blocker.ts` detects violations. | Active |
| RK-13 | Curator re-scores already-promoted traces      | Medium | AD-20: Events marked as `status = 'promoted'` after proposal creation. Curator query excludes promoted events. | Mitigated |
| RK-14 | E2E validation gap — pipeline not proven       | High | VALIDATION-GATE.md defines 12 acceptance checks with hard gates. E2E validation script (`scripts/e2e-validation-gate.ts`) runs all checks. | Active |
| RK-15 | Approve route connection leak                  | Medium | Route uses `getPool()` singleton from `src/lib/postgres/connection.ts` (line 246 of `approve/route.ts`). No per-request Pool instantiation. | ✅ Resolved |
| RK-16 | Graph-Notion sync drift | Medium | Sync contract mapping table (`src/lib/graph-adapter/sync-contract-mappings.ts`) now resolves user_id→Agent and group_id→Project relationships automatically. Notion sync worker uses mappings on approve/promote. | ✅ Resolved — 2026-04-30 |
| RK-17 | Dashboard API shape drift hides Brain data gaps | Medium | Use `DashboardResult<T>` and mapped contracts from `src/lib/dashboard/`; every panel must expose source, freshness, degraded state, and `group_id`. | Active |
| RK-18 | WCAG contrast failures in token system | Medium | Brand gate requires approved Allura/Durham tokens, keyboard checks, screen-reader labels, and high-contrast review before dashboard launch. | Active |
| RK-19 | Memory Command Center route/source-of-truth drift before launch | High | AD-31 requires route/source declarations, no-fabricated-data checks, auth validation, smoke tests, screenshots, and rollback docs before launch. | Active |
| RK-20 | Email prompt injection/phishing drives agent actions | High | AD-30 + RuVix POL-EMAIL-001..005: email is external_untrusted evidence only; privileged actions require approval; high-risk mail quarantined; canonical memory promotion requires HITL; attachments require sandbox/quarantine. | Mitigated |
| RK-21 | Full RuVector overclaim creates false runtime trust | High | Two-stage graduation path: Stage 1 (`pgvector_bridge` → `ruvector_graph`): live-DB E2E passes with `GRAPH_BACKEND=ruvector`, dual-read validation clean for one release, parity test 14/14 green, TALON sign-off (AD-49). **Stage 1 graduated 2026-07-12 (Story 19.3): live-DB E2E achieved, dual-read validated, factory parity 14/14 green.** Stage 2 (`ruvector_graph` → `full_ruvector`): native RuVector extension installed, `ruvector_function_count > 0`, HNSW index health validated, search/feedback health validated, TALON sign-off (AD-34). REQ-RV-005 governs these transitions. TALON evidence: `vector=0.8.2`, `ruvector_function_count=0`, memory count around `3392`. | Active |
| RK-22 | SONA feedback before clean receipts creates false learning | High | SONA feedback remains parked until receipts are clean, traceable, and approved. Feedback-generated learning cannot promote without HITL/policy path. | Active |
| RK-23 | Duplicate MCP configs create harness drift | Medium | MCP config mutation is approval-required; use a single governed catalog path and record receipts for additions. | Active |
| RK-24 | Live hook enforcement without approval mutates governance unexpectedly | High | RAM/Durham hook wrappers remain proposed support. Do not enable live hooks or RuVix enforcement changes without separate approval. | Active |
| RK-25 | Methodology layer becomes a second orchestration religion | High | Keep AD-35 as a thin RunRecord/template contract over existing Team RAM skills. Do not introduce a foreign runtime or second agent taxonomy. | Active |
| RK-26 | Corporate users see Team RAM internals and bounce | Medium | Corporate-facing surfaces use familiar terms — run, story, approval, evidence, review, retrospective — while Team RAM remains an internal routing implementation detail. | Active |
| RK-27 | Agents claim Done without evidence gates | High | RunRecord policy requires explicit quality gates and evidence before Done. Brain receipts are audit context, not proof by themselves. | Active |
| RK-28 | Run journals drift from Brain/Notion state | Medium | Run journals are receipt trails; Notion remains planning/decision source of truth when reachable, and Brain stores append-only run outcomes and blockers. | Active |
| RK-29 | BMAD/Notion/story status drift causes false Done or false backlog | Medium | Epic 7 retrospective found local BMAD story files still marked `backlog` after prior completion evidence, while Notion remains the canonical board but was unavailable in the runtime. Require Scout reconciliation before dev/review/retro: check Notion when available, Brain outcome memories, local story artifacts, and validation evidence; record any source mismatch as a blocker or explicit caveat before marking Done. | Active |
| RK-30 | Resume against changed definitions repeats or corrupts work | High | Pin an immutable process-definition revision at run start; refuse continuation when the revision is unavailable or mismatched; report a doctor finding instead of guessing. | Active |
| RK-31 | Factory CI outside canonical Git boundary creates false green status | High | Keep factory modules, validators, smoke scripts, and workflows inside `Allura_Memory`; verify workflows parse and run locally where possible; require GitHub evidence before Done. | Mitigated |
| RK-32 | RuVector Graph Cutover Risk | Medium | Flag-gated; Neo4j authoritative until live-DB E2E passes with GRAPH_BACKEND=ruvector; dual-read for one release; no canonical promotion until sign-off. 5 sub-risks: R1 Cypher-subset (✅ Resolved for Path A), R2 SUPERSEDES immutability (✅ Resolved), R3 Maturity/breaking changes (✅ N/A Path A, 🔴 Path B), R4 Fulltext+constraints (✅ Resolved Path A), R5 No live-DB E2E proof (🔴 Open). Full draft: `docs/archive/allura/AD-49-ruvector-graph-cutover.md`. | 🟡 Open — gated on live-DB E2E |

| AD-25 | Phase 6 Closure — all deliverables shipped | Decided | DLQ shipped (curator watchdog). Knowledge Hub Bridge shipped (Notion sync worker). Auth layer shipped (dev-auth + config). CSV Export shipped (/admin/approvals CSV download). SDK not separately shipped — MCP tools are the SDK. CORS shipped (next.config). Sentry shipped (captureException in curator approve). Phase 6 scope is complete. Decision: close Phase 6 and record it. Alternatives rejected: (1) Continue tracking as open — rejected because all deliverables exist in code and pass tests. (2) Extend Phase 6 for k6 load testing — rejected because load testing is a separate concern (tracked as RK-14). Consequences: Phase 6 ADR is now closed. Next phases focus on Curator pipeline E2E (Sprint 1), Skills layer (Sprint 2), and MCP Catalog governance (Sprint 3). |

---

## Phase 6 Closure Decision Detail

**Context:** Phase 6 was defined in the Goal & Outcome prompt (2026-04-13) as requiring: DLQ, Knowledge Hub Bridge, Auth layer, CSV Export, SDK, CORS, and Sentry integration. All items have shipped in code and pass their respective tests.

**Deliverable Status:**

| Deliverable | Status | Evidence |
|-------------|--------|----------|
| Dead Letter Queue | ✅ Shipped | `src/curator/watchdog.ts` — polls pending proposals, marks stale ones as expired |
| Knowledge Hub Bridge | ✅ Shipped | `src/curator/notion-sync-worker.ts` + `notion-sync.ts` — syncs approved proposals to Notion |
| Auth layer | ✅ Shipped | `src/lib/auth/config.ts` + `dev-auth.ts` — validates API keys, dev mode bypass |
| CSV Export | ✅ Shipped | `/admin/approvals` page includes CSV download |
| SDK | ✅ Shipped (as MCP) | MCP tools are the SDK — 10 tools via `allura-memory-core` skill |
| CORS | ✅ Shipped | `next.config.ts` — CORS headers configured |
| Sentry | ✅ Shipped | `src/lib/observability/sentry.ts` — captureException in curator approve route |

**Not shipped in Phase 6 (tracked separately):**
- k6 load validation (RK-14) — needs stable Curator pipeline first
- Phase 10 architecture ADRs — not Phase 6 scope
- RuVector migration — B6/B7, separate initiative |

**Decision:** Close Phase 6. All deliverables exist, pass tests, and are deployed in the Docker stack.

### AD-XX: RuVix Control Plane Contract

**Decision:** The 12 RuVix rules are the control plane invariants governing Allura Brain.

**Rationale:** The architecture already enforces the core behaviors — HITL promotion, append-only episodic storage, tenant isolation, fail-closed boundaries, and evidence-first completion. RuVix codifies those behaviors as one explicit control plane contract instead of scattering them across module-local policies.

**Alternatives considered:**

- **Per-module policies**: easier to localize, but too easy to drift and miss a boundary.
- **Monolithic engine**: simpler to name, but harder to test and too much blast radius.

**Tradeoffs:**

- Twelve discrete rules are individually testable.
- Enforcement must remain consistent at every boundary.
- Rule drift becomes a release blocker, not a background concern.

**Status:** accepted, documented 2026-05-28, auto-promotion threshold 0.85.

> **Provenance Note (added 2026-08-19):** The RuVix governance concept — 6 primitives, 12 syscalls, proof-gated mutation — originates from the **RuVix Cognition Kernel** (ADR-087) within the **RuVector** open-source project by **rUv** (GitHub: `ruvnet`, 4,400 stars, MIT licensed). Allura uses RuVector as its semantic execution layer (verified imports: `src/lib/ruvector/`). Allura's `src/control-plane/ruvix.ts` is a **TypeScript adaptation** of the RuVix governance pattern, not the bare-metal Rust kernel. Allura did not create RuVix or RuVector; it adopted the governance concept and implemented it as an application-layer control plane. The governance layer Allura adds (HITL promotion, policy enforcement, append-only audit, evidence-first dashboard, curator pipeline) is Allura's value-add and is not provided by RuVector or Ruflo. See skill: `.opencode/skills/ruvector-ruvix-attribution/SKILL.md`.

### AD-XX+1: RuVix Brand Governance Rules

**Decision:** The 6 brand rules are enforceable control plane invariants for Allura Dashboard surfaces.

**Rationale:** Allura Dashboard is mission-control software, not a marketing site. Brand coherence depends on Durham token exclusivity and a governed release gate. Difference Driven contamination is a real risk at the control plane boundary, so brand drift must fail closed before ship.

**Alternatives considered:**

- **Post-hoc brand audits**: useful for cleanup, but too late to prevent drift from reaching review.
- **Code-review-only enforcement**: insufficient because brand violations can be subtle and repeated across components.
- **Free theme switching**: rejected because it fragments the governed dashboard surface.

**Tradeoffs:**

- Locks dashboard surfaces to the Durham preset.
- Slows velocity with a pre-build gate.
- Appropriate for a governed operator tool where trust beats novelty.

**Status:** accepted, documented 2026-05-28.

---

### AD-31: RuVix-Governed Memory Command Center Operator Surface

**Decision:** Build the branded Memory Command Center as an optional human control plane over the MCP/API-first Allura engine.

**Rationale:** Memory governance requires a place for people to inspect memories, understand source evidence, review proposed knowledge, see RuVix policy status, export audit packets, and verify graph relationships. CLI and MCP remain essential, but they do not provide enough spatial context for high-confidence review and compliance work.

**Scope:**

- Memories: search, inspect, filter, provenance, relationship context.
- RuVix Governance: policy mode, thresholds, role separation, tenant isolation, promotion locks, drift warnings, mutation receipts.
- Curator: pending proposals, approve, reject, request evidence, request changes, rationale capture.
- Audit/Evidence: event log, receipt detail, export packet, source lineage.
- Governance receipt drawer: every mutation and approval shows intent, actor, source, policy, validation, and audit trail.
- Graph: real Neo4j data only, source receipts, fallback list when degraded.
- Settings: read-mostly tenant and policy visibility unless governed write endpoints exist.

**Non-negotiables:**

- No fake healthy state.
- No fake live data.
- Every page shows active `group_id`.
- Every mutation creates an audit receipt.
- Every approval shows source evidence first.
- Every graph node links back to provenance.
- Every degraded state is visible.
- Real Allura branding only; no generated logos.

**Tradeoffs:**

- Adds UI maintenance cost, but keeps dashboard logic behind typed adapters.
- Slows feature shipping with brand, accessibility, and governance gates.
- Improves review quality and reduces policy blind spots.

**Status:** accepted, documented 2026-05-29.

### AD-35: RunRecord Template Before Methodology Runtime

**Decision:** Add a governed `RunRecord` template before building a full Allura methodology runtime.

**Rationale:** Babysitter's process library and BMAD workflow builder expose a useful missing layer: repeatable, evidence-gated runs that compose smaller skills into recognizable workflows. Allura should adopt the pattern without importing the runtime. A neutral `RunRecord` preserves the engine boundary: Allura Brain remains the memory data plane; methodology runs are optional governed orchestration records over Team RAM skills and Notion/Brain receipts.

**Contract boundary:**

- **RunRecord:** durable identifiers, goal, teams, status, journal path, timestamps.
- **RunPolicy:** allowed actions, approval breakpoints, quality gates, evidence required.
- **RunRuntimeState:** resume state, doctor checks, and writeback candidacy; runtime-only until implementation proves stable.

**Alternatives considered:**

- **Adopt Babysitter process library directly:** rejected because it makes an external process library canonical and brings runtime/security/licensing uncertainty.
- **Adopt BMAD workflow builder as the workflow layer:** rejected because it creates a parallel ecosystem and Python/uv dependency that conflicts with the one-runtime direction.
- **Build full methodology runtime immediately:** deferred because templates and receipt discipline must prove value before execution machinery is added.

**Consequences:**

- Corporate teams can consume familiar run/story/review/evidence language without seeing Team RAM internals.
- Every run can specify approval breakpoints, quality gates, and evidence before Done.
- Docker and public onboarding must truthfully state current local-dev limits until a stranger-friendly compose profile exists.

**Status:** accepted and implementation started. As of 2026-06-12 the repository
contains process-engine, replay, DAG, runner, and SDK primitives. The contract is
not complete until definitions are version-pinned, checkpoint resume continues
execution, doctor checks exist, and the full lifecycle passes integration proof.

### AD-41: Governed AI Office Delivery Sequence

**Decision:** Deliver Allura's operator product in one dependency chain:
product truth, production run control plane, PostgreSQL work plane, operator workspace,
then one desktop shell.

**Rationale:** The June 12 product audit found strong memory/governance
foundations but weak workflow product behavior, absent operational project
state, placeholder command-center surfaces, and no governed desktop product.
Packaging the current UI first would harden contract drift and static claims
into a desktop application.

**Boundaries:**

- PostgreSQL owns project, work-item, transition, run, breakpoint, handoff, and
  evidence-packet operational state.
- Allura Brain owns governed memory, receipts, decisions, and approved
  writeback candidates.
- Neo4j owns semantic relationships and approved projections, not board state.
- Allura is the visible product identity. AionUi may be credited only as
  framework attribution.
- One desktop shell is selected and governed; parallel product shells are
  prohibited.

**Status:** accepted 2026-06-12 through the approved Phase 0 correction package.

---

### AD-47: NanoClaw + Vercel AI Gateway as Control Center Agent Runtime

- **Status**: Proposed
- **Decision**: The Allura Control Center uses **NanoClaw v2** (MIT, ~500 LOC TypeScript) as its agent runtime and **Vercel AI Gateway** as the multi-provider model router. The FastAPI backend (:6001) retains auth, conversation persistence, and user management. NanoClaw runs as a sibling Node.js service with per-session Docker container isolation. The Control Center frontend (:4001) connects to NanoClaw via its built-in **Chat SDK bridge** channel adapter.
- **Rationale**: Three concerns require three tools:
  1. **Agent execution security** — NanoClaw provides OS-level container isolation per session, credential vaulting (secrets never enter the container), confined blast radius per channel, and a codebase small enough to audit in 8 minutes. This matches Allura's governance-first philosophy.
  2. **Model provider freedom** — Vercel AI Gateway provides a single endpoint to hundreds of models with BYOK, automatic failover, <20ms routing latency, spend tracking, and no token markup. Users configure their preferred `provider/model` string (e.g., `ollama-cloud/deepseek-v4-pro`, `anthropic/claude-sonnet-4-6`, `openai/gpt-5.5`). The operator (Sabir) defaults to Ollama Cloud.
  3. **CLI runtime flexibility** — NanoClaw's provider registry supports multiple CLI runtimes (Claude Code, OpenCode, Codex) inside containers. Users choose their runtime AND their model independently.
  4. **Memory governance** — Allura Brain connects via MCP (`.mcp.json` → `localhost:5888/mcp`), giving agents governed `memory_search`, `memory_add`, `governance_check_gate`, and curator tools with `group_id` isolation.
- **Alternatives Considered**:
  - **PydanticAI direct (current)**: No container isolation, single-provider (Anthropic), no MCP tools, no approval gates. Insufficient for governed execution.
  - **OpenClaw**: 400K LOC, over-engineered for this use case. NanoClaw is its security-focused successor by design.
  - **Raw Vercel AI SDK in FastAPI**: Good model routing but no container isolation, no credential vaulting, no scheduling, no agent-to-agent. Would require rebuilding NanoClaw's security model from scratch.
  - **NanoClaw without AI Gateway**: Locks users to Anthropic/Claude Agent SDK. Violates the multi-provider requirement.
- **Consequences**:
  - New sibling service: `allura-nanoclaw/` or NanoClaw installed into `allura_control_center/`
  - Port allocation: NanoClaw host process needs a port (proposed: 7001, per AD-45 tools band 7000+)
  - Docker dependency: NanoClaw requires Docker for container isolation (already present in the ecosystem)
  - Chat SDK bridge replaces the existing FastAPI WebSocket agent route (`/ws/agent`); FastAPI keeps REST API duties
  - `ANTHROPIC_API_KEY` in backend `.env` becomes optional — users bring their own key via gateway config
- **Architecture**:

```
┌─────────────────────────────────────────────────────┐
│ Control Center Frontend (Next.js :4001)             │
│   Chat page ──► Chat SDK bridge                     │
│   Settings ──► model/provider selector              │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket / HTTP
┌──────────────────────▼──────────────────────────────┐
│ NanoClaw Host (Node.js :7001)                       │
│   router.ts → session-manager → container-runner    │
│   channels: Chat SDK bridge (Control Center)        │
│   providers: Vercel AI Gateway, Ollama Cloud, etc.  │
│   .mcp.json → Allura Brain (:5888)                  │
│                                                     │
│   ┌─────────────────────────────────────────┐       │
│   │ Per-Session Docker Containers           │       │
│   │  ├── inbound.db (host writes)           │       │
│   │  ├── outbound.db (container writes)     │       │
│   │  ├── Runtime: Claude Code / OpenCode    │       │
│   │  ├── Model: via AI Gateway endpoint     │       │
│   │  └── MCP tools: Allura Brain            │       │
│   └─────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ FastAPI Backend (:6001)                             │
│   Auth (JWT), Users, Conversations, Files           │
│   /api/health, /api/admin/*                         │
│   Connects to knowledge-postgres                    │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ Vercel AI Gateway (remote)                          │
│   Single endpoint → ollama-cloud, anthropic,        │
│   openai, google, mistral, etc.                     │
│   BYOK, failover, spend tracking                    │
└─────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ Allura Brain MCP (:5888)                            │
│   memory_search, memory_add, memory_list            │
│   governance_check_gate, audit_query_events          │
│   PostgreSQL + Neo4j + embeddings                   │
└─────────────────────────────────────────────────────┘
```

- **Port Registry Update**:
  - NanoClaw host: **7001** (tools band, per AD-45)
- **Owner**: Brooks (architecture), Woz (implementation)
- **References**: AD-45 (Port Policy), AD-46 (Control Center), `nanoclaw.dev`, `github.com/nanocoai/nanoclaw`, Troy TALON/IRIS review (Brain trace 898f37a5)

---

### AD-48: Human Membership as a Postgres Table (admin-managed from UI)

- **Status**: Decided
- **Decision**: Model human team membership in a Postgres `memberships` table
  (`group_id` + `user_id` + `role` ∈ admin/curator/viewer), one row per (org, user), as a
  current-state table: role changes UPDATE, removal is a soft-delete (`removed_at`). Every
  change is mirrored as an append-only audit event (`membership_added` /
  `membership_role_changed` / `membership_removed`). The admin manages members and roles
  entirely from the dashboard UI (`/api/members`), never via code/CLI.
- **Rationale**: Consistent with the existing Postgres-native, group_id-scoped Hosted tables
  (`workspaces`, `mcp_tokens`); works in dev (DevAuthProvider) and prod (Clerk); keeps the
  tenant boundary on `group_id` rather than coupling membership to a Clerk org. Satisfies the
  non-coder-admin requirement (Gabe) without weakening governance: the events audit trail
  preserves the append-only invariant (POL-002).
- **Alternatives considered**: Clerk Organizations (rejected — couples membership to the auth
  provider, no dev-fallback parity, and splits the tenant boundary from `group_id`).
- **Consequences**: Authoring NEW enforced control plane policies still stays a reviewed code path;
  the admin proposes/approves via UI. Migration `docker/postgres-init/29-memberships.sql`
  (additive, idempotent). Requirement REQ-DASH-009.
- **Owner**: Brooks (architecture), Woz (implementation)
- **References**: REQ-DASH-009, DATA-DICTIONARY `memberships`, ARCHITECTURE_DECISION Brain trace ab8cdd06

---

### AD-49: RuVector Graph Cutover

- **Status**: Proposed
- **Decision**: Make `GRAPH_BACKEND=ruvector` the default, retiring Neo4j 5.26 Community as the semantic/knowledge-graph layer. The RuVector backend stores the graph in PostgreSQL tables (`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`) behind the same `IGraphAdapter` seam.
- **Rationale**:
  - **Removes the per-person graph-auth wall.** Neo4j Community supports exactly one user (`neo4j`); per-partner graph logins require paid Enterprise. PG tables have no separate login surface — access is governed by *our* control plane + MCP tokens.
  - **Collapses two stores toward one engine.** Graph + vector both live in Postgres; removes the Neo4j + cross-store consistency burden.
  - **Self-hosted, no license tier** — fits the compliance-grade, self-hosted posture.
- **Two paths**:
  - **Path A (ship what's built)**: Make `GRAPH_BACKEND=ruvector` the PG-table default. Fast, governed, reversible. Nothing to upstream — it's our own code.
  - **Path B (the Rust crate)**: Re-implement the adapter over ruvnet's `ruvector-graph` crate and upstream gaps as PRs. Larger, v0.1.x churn, but matches the link literally and gives an upstreamable artifact.
- **Naming reconciliation note**: Allura's `ruvector` backend is a PostgreSQL-table implementation named after the concept, *not* a binding to the ruvnet Rust crate. These are materially different programs of work — Path A is recommended for the beta (steady, low-risk), with Path B tracked as a follow-on behind the *same* `IGraphAdapter` seam.
- **Consequences**:
  - The `neo4j-adapter.ts` / `ruvector-adapter.ts` seam is the migration boundary; nothing else knows which engine backs it.
  - SUPERSEDES immutability is enforced by **adapter discipline**, not the engine — already implemented transactionally in `ruvector-adapter.ts`.
  - Neo4j stays as read-only fallback for one release after the flip.
- **Owner**: Sabir (decision), Knuth (data), Brooks (architecture)
- **References**: AD-29 (graph adapter pattern — the build), AD-34 (Deferred "full RuVector-Postgres migration" — this activates it), full draft at `docs/archive/allura/AD-49-ruvector-graph-cutover.md`

---

| Signal                      | Source                       | Alert Threshold       |
| --------------------------- | ---------------------------- | --------------------- |
| Neo4j promotion failures    | `src/lib/neo4j/promotion.ts` | > 5 failures in 5 min |
| Embedding latency           | Provider response time       | p99 > 3s              |
| Schema drift detection      | Health check endpoint        | Version mismatch      |
| RalphLoop iterations        | Slice counter log            | > 80 per session      |
| Cross-tenant query attempts | Query middleware             | Any occurrence        |
| Postgres trace growth       | Table size metric            | > 100GB               |

---

### AD-56: Dev Auth Cannot Activate in Production

**Context.** `ALLURA_DEV_AUTH_ENABLED=true` and `ALLURA_DEV_AUTH_ROLE=admin` were present in the production
runtime environment. The schema default at `src/lib/auth/config.ts` already resolves the flag to `false` in
production when unset, but an explicit `true` in the environment overrides that default.

**Defect.** `isDevAuthActive()` read:

```ts
return c.ALLURA_DEV_AUTH_ENABLED && (!isClerkEnabled(c) || c.NODE_ENV !== "production");
```

The `||` made "Clerk is not configured" sufficient on its own. In production without Clerk keys the disjunction
short-circuits true, and dev auth activates with the configured role. A condition written as a safety check was
what granted the bypass.

**Second defect, found by test rather than inspection.** The same condition returned `true` in development when
Clerk *was* properly configured, because `NODE_ENV !== "production"` held. Dev auth overrode real configured auth
outside production as well.

**Decision.** Production is checked first and unconditionally:

```ts
if (c.NODE_ENV === "production") return false;
return c.ALLURA_DEV_AUTH_ENABLED && !isClerkEnabled(c);
```

No combination of flags, missing Clerk keys, or role configuration can re-enable the bypass.

**Blast radius.** Web auth only. The live MCP gateway runs `mcp_token` mode — `ALLURA_MCP_TOKEN_SECRET` is set,
`ALLURA_MCP_DEV_AUTH` is empty, and startup logs confirm `Auth mode: mcp_token`. The gateway never consumed these
flags, so the principal model and Epic 24 Gate B identity enforcement were not affected. The dashboard is retired,
making the exposure latent rather than live.

**Evidence.** `src/lib/auth/__tests__/dev-auth-production-guard.test.ts`, 7 behavioural cases exercising
`isDevAuthActive` and `getDevAuthConfig` with constructed configs — deliberately not source-text assertions.
Proven by controlled red: 3 of 7 fail against the vulnerable condition, 7/7 pass against the fix. Regression run:
203 tests green across `auth-roles`, `principal-context`, `auth-middleware`, and `mcp-auth-adversarial`.

**Follow-ups.** RK-33 (strip the flags from the deployment env) and RK-34 (default test config does not collect
the adversarial auth suite).


### AD-57: Epic 25 Scope Discipline

- **Status**: **Proposed** — recorded 2026-08-23 by Story 25.1. Not ratified.
- **Decision**: For Epic 25, `/dashboard/curator` is the sole initial browser route; all
  rendered navigation targets must pass route-smoke validation. Every Epic 25 story must
  produce commit-bound evidence and document an MCP/API/CLI rollback path.
- **Rationale**: **Not captured.** No rationale for AD-57 exists in this repository. The
  decision text above is reconstructed from the only three places AD-57 was ever cited:
  the `REQUIREMENTS-MATRIX.md` "Current architecture authority" header line, REQ-CUR-001,
  and REQ-CUR-008. Story 25.1 records it so the citations resolve; it does not invent the
  reasoning that was never written down.
- **Alternatives considered**: **Not recorded.**
- **References**: [REQUIREMENTS-MATRIX.md](./REQUIREMENTS-MATRIX.md) REQ-CUR-001,
  REQ-CUR-008 · `_bmad/bmm/planning/epic-25-governed-curator-review-console.md` ·
  `_bmad/bmm/stories/25-1-scope-product-truth-documentation-loop.md`
- **Action required**: Brooks or Jobs must supply the rationale and alternatives, or
  supersede this entry.

---

### AD-58: Relational Facts Before Semantic Expansion

- **Status**: Accepted — 2026-08-23. Sole source is
  `_bmad/bmm/planning/epic-25-governed-curator-review-console.md`; propagated here by
  Story 25.1 because REQ-CUR-009 and REQ-CUR-010 cite AD-58 as already-decided and no
  reader could resolve it.
- **Decision**: Allura resolves server-derived tenant/workspace scope, memberships and
  roles, explicit entity IDs, proposal/evidence/receipt state, actor, and time filters
  through PostgreSQL **before** semantic or vector expansion. Semantic retrieval may widen
  or rank only the already-authorized candidate set; it cannot bypass a relational
  boundary or substitute for a factual lookup.
- **Implementation addition — `SemanticProjection`**: For a relational entity family,
  Allura assembles a deterministic, redaction-aware Markdown `SemanticProjection` from the
  meaningful header/detail relationship *before* embedding. A memory-proposal projection
  includes scope, proposal header, linked trace/event evidence, evidence-request state,
  and decision/receipt state when present. It records source references, projection
  version, content hash, redaction policy, embedding model, and generation time.
- **Rationale**:
  - A vector index is not an authorization boundary. Ranking cannot be trusted to exclude
    another tenant's rows; only a relational predicate can.
  - Factual questions ("which proposals are pending in this workspace") have exact
    answers. Answering them by similarity produces plausible wrong sets.
  - Embedding a redaction-aware projection rather than raw rows keeps the relational
    records authoritative and the derived retrieval data rebuildable.
- **Alternatives considered**: Post-filter semantic results by scope — rejected, because a
  recall ceiling set by the vector index silently drops authorized rows and the filter
  runs after the boundary has already been crossed. Embed raw relational rows — rejected,
  because it loses the header/detail relationship and cannot carry redaction policy.
- **Consequences**: The 25.3 curator read contract must resolve relational hard filters
  first and report the resulting `RetrievalPlan`. Semantic results carry provenance,
  freshness, and degraded state.
- **Owner**: Brooks (architecture), Knuth (data)
- **References**: `_bmad/bmm/planning/epic-25-governed-curator-review-console.md` (source
  text) · [REQUIREMENTS-MATRIX.md](./REQUIREMENTS-MATRIX.md) REQ-CUR-009, REQ-CUR-010 ·
  `_bmad/bmm/stories/25-3-curator-read-contract-tenant-hardening.md` · AD-50
  (PostgreSQL-only architecture)

---

### AD-59, AD-60, AD-61, AD-62, AD-63: Recorded Without Captured Rationale

- **Status**: **Proposed** — all five. Recorded 2026-08-23 by Story 25.1. **None is
  ratified.**
- **Why they are here**: `REQUIREMENTS-MATRIX.md` Section 6E cites AD-59, AD-61, AD-62,
  and AD-63 in the Trace column of REQ-MAP-*, REQ-COP-*, REQ-ID-*, REQ-MTG-*, and
  REQ-MOD-* rows as though they were settled decisions. They were never recorded in this
  log, so no reader could resolve them. AD-60 is cited nowhere at all.
- **What is recorded**: Only the decision statement, reverse-engineered from the
  requirement text that cites it. See the summary table above for each.
- **What is NOT recorded, and was not invented**: rationale, alternatives considered,
  consequences, and owner for every one of AD-59, AD-61, AD-62, and AD-63. For AD-60,
  nothing at all exists — the number is reserved to prevent silent reuse.
- **Scope warning**: The stories these decisions target — 25.2, 25.3a, 25.3b, 25.4a,
  25.4b, 25.5a — **have no story files** and are not part of the eight-story Epic 25
  scope. They are listed as out of scope in
  `_bmad/bmm/planning/epic-25-governed-curator-review-console.md`.
- **Action required**: Before any of AD-59, AD-61, AD-62, or AD-63 is relied on as
  implementation authority, its author must supply rationale and alternatives here, or the
  citing requirement rows must be downgraded.

---

## References

- **Architecture Canon**: `docs/allura/BLUEPRINT.md`
- **Memory System Design**: `docs/allura/SOLUTION-ARCHITECTURE.md`
- **Validation Gate**: `docs/archive/allura/VALIDATION-GATE.md`
- **Validation Guide**: merged into `docs/allura/SOLUTION-ARCHITECTURE.md` §9 (Validation Topology)
- **Memory Command Center Launch Gate**: AD-31 and RK-19 in this document; route/data contracts in `DATA-DICTIONARY.md`; implementation topology in `SOLUTION-ARCHITECTURE.md`
- **Operational Agent Access**: Packaged MCP servers (`neo4j-memory`, `database-server`) activated via `MCP_DOCKER`
- **Durable Stores**: PostgreSQL (events/traces) + Neo4j (semantic graph) accessed through controlled services
