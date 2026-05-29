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
| AD-02 | Neo4j for semantic memory                                         | Decided  | Native graph relationships, SUPERSEDES lineage is idiomatic, semantic search via Cypher.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AD-03 | MCP as primary agent interface                                    | Decided  | Adopted standard. Works with Claude, GPT-4, any MCP-compatible runtime. No vendor lock-in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| AD-04 | `PROMOTION_MODE` env var governs Neo4j writes                     | Decided  | Architectural gate. `soc2` mode requires human approval — enforced in code, not policy. `auto` mode uses score threshold.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AD-05 | 5-tool public API surface (`add/search/get/list/delete`)          | Decided  | mem0 UX parity. Developers see five tools. All internal complexity is hidden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| AD-06 | `group_id ~ '^allura-'` CHECK constraint in Postgres              | Decided  | Tenant isolation at schema level. Cannot be bypassed by application code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| AD-07 | No ADAS, domain workflows            | Decided  | Essential complexity only. All removed 2026-04-07. Allura is a memory engine — nothing else. The dashboard is part of the core engine, not a separate product.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AD-08 | Soft-delete only — no hard deletes                                | Decided  | Append-only audit trail. Deletion records are events, not erasures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AD-09 | Neo4j write failure is non-fatal                                  | Decided  | Postgres write is the source of truth. Neo4j is a promotion — its failure should degrade gracefully, not fail the operation.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AD-10 | RalphLoop for bounded validation tasks only                       | Decided  | RalphLoop is designed for slice-by-slice validation, not full project execution. Bounded by `--max-iterations` flag and timeout guards. Prevents runaway validation loops.                                                                                                                                                                                                                                                                                                                                                                                                  |
| AD-11 | Human-in-the-loop gating for validation evidence                  | Decided  | Every RalphLoop slice requires human review before proceeding. Judge reviews all evidence; no automatic progression to next slice without explicit approval.                                                                                                                                                                                                                                                                                                                                                                                                                |
| AD-12 | Slice-by-slice approach (no parallel slice definition)            | Decided  | Sequential slice execution ensures clear causation and evidence trails. Parallel slices would introduce race conditions and obscure failure attribution.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| AD-13 | Canonical API validation uses bounded RalphLoop slices            | Decided  | Validate `/api/memory` with bounded, repeatable slices to preserve fast feedback, clear causality, and low architectural risk.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| AD-14 | PostgreSQL required, Neo4j degradable at runtime                  | Decided  | Canonical memory contract remains available when PostgreSQL is healthy. Neo4j is optional-at-runtime: failures must surface explicit degraded metadata in health and tool responses rather than causing silent partial success or full outage.                                                                                                                                                                                                                                                                                                                              |
| AD-15 | Unified agent taxonomy (AGENT_MANIFEST as single source of truth) | Decided  | Three conflicting agent taxonomies (.opencode/agent/, scripts/agents/, agent-routing.md) unified into AGENT_MANIFEST (src/lib/agents/agent-manifest.ts). Team RAM persona names (brooks, jobs, pike, fowler, scout, woz, bellard, carmack, knuth, hightower) are canonical. Legacy OmO names (turing, hopper, etc.) removed from active manifest. CI routing driven by manifest data via dynamic-router.ts, replacing static bash case statement.                                                                                                                                                           |
| AD-16 | Ralph is an installed tool, not a built component                 | Decided  | Ralph (`@th0rgal/ralph-wiggum`) is a CLI tool that wraps any AI coding agent in a self-correcting loop. We install it; we do not implement it. Our `ralph-loop.ts` is a thin harness: resolves the binary, constructs the command with Allura defaults, logs start/end to PostgreSQL, and passes through to the real `ralph` CLI. Previous `github-models` / `GITHUB_TOKEN` references were incorrect and have been removed. What model Ralph's agent uses (OpenCode default, Claude Code, Codex, Copilot) is configured via `--agent` and `--model` flags — not hardcoded. |
| AD-17 | 13-16-18 youth culture UX validation framework                    | Decided  | Marketing principle: 13-year-olds spot emerging trends, 16-year-olds identify popularity gaps, 18-year-olds confirm mainstream readiness. Applied to Allura consumer UI review. Target score: 0.85+. Framework validates emotional resonance, not just functional correctness.                                                                                                                                                                                                                                                                                              |
| AD-18 | Merge `/dashboard/traces` into `/dashboard/audit`                 | Decided  | Traces merged into audit page in codebase. Doc now matches reality. See `docs/allura/AD-18-traces-vs-audit.md`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| AD-19 | Controlled retrieval layer as sole agent read path                | Decided  | Agents MUST NOT query PostgreSQL or Neo4j directly. All reads go through `POST /api/memory/retrieval`. This enforces scoping, audit logging, and policy at the service boundary rather than relying on agent compliance. See [BLUEPRINT.md](./BLUEPRINT.md).                                                                                                                                                                                                                                                                          |
| AD-20 | Curator marks events as promoted after proposal creation          | Decided  | Without marking events as promoted, the curator re-scores the same traces on every run, creating duplicate proposals. Events with `status = 'promoted'` are excluded from future curator queries. See [BLUEPRINT.md](./BLUEPRINT.md).                                                                                                                                                                                                                                                                                |
| AD-21 | Single consolidated governed memory design surface                 | Decided  | One design doc covers the full governed pipeline (F1–F15). Splitting into five thin design docs too early creates maintenance overhead without ownership clarity. Split later only if subsystem complexity forces it. See [SOLUTION-ARCHITECTURE.md](./SOLUTION-ARCHITECTURE.md).                                                                                                                                                                                                                                                                                           |
| AD-22 | VALIDATION-GATE.md in docs/archive/allura/, not docs/allura/       | Decided  | The validation gate is an operational artifact, not one of the six canonical architecture documents. Per the canonical surface rule, it belongs in `docs/archive/allura/`. Cross-linked from BLUEPRINT.md, REQUIREMENTS-MATRIX.md, and RISKS-AND-DECISIONS.md. See [VALIDATION-GATE.md](../archive/allura/VALIDATION-GATE.md).                                                                                                                                                                                                                                           |
| AD-23 | Skills-first packaged MCP architecture for memory access          | Decided  | Brooks / Team RAM orchestrates skills first. Skills encode routing and guardrails, then call focused packaged MCP servers: `neo4j-memory` for approved-memory recall, `database-server` for trace/audit evidence, and `neo4j-cypher` only for read-only graph inspection when memory recall is insufficient. No custom all-in-one MCP runtime is canonical. Skills enforce read-only + tenant-scope guardrails for inspection flows, while governed write paths remain controlled by application services and approval policy. See [MIGRATION-TRACKER.md](../archive/allura/MIGRATION-TRACKER.md). |
| AD-24 | Agent/Project/Team graph model as structural context layer          | Decided  | A graph without structure is just a list. Agent, Team, and Project nodes provide the structural context that makes Memory nodes retrievable by ownership, project, and delegation path. Eliminates the shadow Memory Framework agent hierarchy in favor of the existing surgical team pattern. Alternatives: (1) Memory-only graph with metadata properties — rejected because flat metadata doesn't support traversal queries across team structure. (2) Separate knowledge base for agents — rejected because it creates sync burden between two surfaces. |
| AD-25 | Phase 6 Closure — all deliverables shipped | Decided  | See Phase 6 Closure Decision Detail section below. |
| AD-26 | Real-data dashboard uses query/mapper boundary and read-only graph endpoint | Decided | Issue #25 makes `/dashboard` a trust surface over real Allura Brain data, not a mock UI. Dashboard components consume mapped UI contracts from `src/lib/dashboard/`; raw Brain API shapes stay behind `api.ts`, `queries.ts`, and `mappers.ts`. `/api/memory/graph` is read-only, tenant-scoped by `group_id`, returns a capped display sample plus `total_edges`, and performs no Neo4j mutations. Alternatives rejected: mock data, frontend-inferred relationships, and raw API responses in components. |
| AD-27 | Budget enforcer TTL auto-expiry for halted sessions | Decided | Halted budget sessions auto-expire after `haltTtlMs` (default: 1 hour). `DEFAULT_HALT_TTL_MS = 60 * 60 * 1000` in `src/lib/budget/enforcer.ts`. Admin can reset manually via `POST /api/admin/reset-budget`. Auto-expiry prevents indefinite lockout of agents after a budget breach. Alternatives: (1) No auto-expiry — rejected because agents would require manual reset after every breach. (2) Immediate reset — rejected because it defeats the purpose of budget enforcement. |
| AD-28 | Sync contract mapping table for relationship wiring | Decided | `src/lib/graph-adapter/sync-contract-mappings.ts` provides deterministic user_id→Agent and group_id→Project mappings. Used by curator approve and auto-promote paths to wire AUTHORED_BY and CONTRIBUTES_TO relationships on promoted memories. Alternatives: (1) Dynamic agent/project discovery from Neo4j — rejected because it adds latency and requires graph queries during promotion. (2) Convention-based naming (user_id = agent name) — rejected because it's fragile and breaks when names diverge. |
| DDR-004 | Token Authority — Two-path design system | Enforced | CSS custom properties (`var(--allura-*)`, `var(--dashboard-*)`) for Tailwind/HTML contexts; `tokens.ts` for Canvas/JS runtime. Raw hex and generic shadcn utilities (`text-muted-foreground`, `bg-muted`) are prohibited in active dashboard scope. `button.tsx` shadow rgba documented as DD-004 build-tool exception. Committed 2026-04-30. |
| AD-29 | Mission Control dashboard rebuild cutover strategy | Decided | `localhost:6420` is the visual/reference memory dashboard, `localhost:3334` is the Mission Control development integration target, and `localhost:3100` is the current Docker dashboard replacement target. The rebuild combines the memory dashboard and Mission Control cockpit; it must not create a separate product or replace `3100` before route parity, visual parity, source-of-truth declarations, auth validation, smoke tests, and rollback plan pass. Alternatives rejected: (1) ship 3334 as a separate dashboard — rejected because it creates duplicate surfaces; (2) overwrite 3100 directly — rejected because it removes rollback and hides parity gaps. |
| AD-30 | Email-derived content is external untrusted evidence | Decided | Email/Gmail/IMAP content may enter Allura only as raw episodic evidence with `trust_zone=external_untrusted`. It cannot issue agent instructions, trigger privileged actions, or auto-promote to canonical Neo4j memory. RuVix policies POL-EMAIL-001 through POL-EMAIL-005 enforce instruction blocking, action approval, high-risk quarantine, HITL promotion, and attachment sandboxing. See [EMAIL-ALLURA-ENFORCEMENT.md](./EMAIL-ALLURA-ENFORCEMENT.md). |
| AD-XX | RuVix Kernel Contract | Accepted | The 12 RuVix rules are the kernel invariants governing Allura Brain. Every existing gap — HITL approval, append-only history, tenant isolation, fail-closed tool use, and evidence-backed completion — is formalized as a testable boundary rule. Canonical contract: `RUVIX_KERNEL_CONTRACT_v1`. |
| AD-XX+1 | RuVix Brand Governance Rules | Accepted | The 6 RuVix brand rules are enforceable kernel invariants for Allura Dashboard surfaces. Durham token exclusivity, mission-control voice, evidence-gated completion, accessibility, component consistency, and the Durham gate before ship are treated as release boundaries — not style suggestions. Canonical artifact: [BRAND-RULES-dashboard-v2.md](./BRAND-RULES-dashboard-v2.md). |

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
| RK-15 | Approve route connection leak | Medium | Active |
| RK-16 | Graph-Notion sync drift | Medium | ✅ Resolved — 2026-04-30 |
| RK-17 | Dashboard API shape drift hides Brain data gaps | Medium | ✅ Resolved — 2026-04-30 |
| RK-18 | WCAG contrast failures in token system | Medium | 🔴 Open |
| RK-19 | Mission Control route/source-of-truth drift before `3100` cutover | High | Active |
| RK-20 | Email prompt injection/phishing drives agent actions | High | Mitigated |

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
| RK-12 | Retrieval layer bypass — agents query DBs directly | High | AD-19: Controlled retrieval layer enforced as sole read path. Code review gate checks for direct PG/Neo4j imports in agent-facing code. Kernel `direct-access-blocker.ts` detects violations. | Active |
| RK-13 | Curator re-scores already-promoted traces      | Medium | AD-20: Events marked as `status = 'promoted'` after proposal creation. Curator query excludes promoted events. | Mitigated |
| RK-14 | E2E validation gap — pipeline not proven       | High | VALIDATION-GATE.md defines 12 acceptance checks with hard gates. E2E validation script (`scripts/e2e-validation-gate.ts`) runs all checks. | Active |
| RK-15 | Approve route connection leak                  | Medium | Route creates its own `Pool` instead of using `getPool()` singleton. Fix: replace with shared pool from `src/lib/postgres/connection.ts`. | Active |
| RK-16 | Graph-Notion sync drift | Medium | Sync contract mapping table (`src/lib/graph-adapter/sync-contract-mappings.ts`) now resolves user_id→Agent and group_id→Project relationships automatically. Notion sync worker uses mappings on approve/promote. | ✅ Resolved — 2026-04-30 |
| RK-17 | Dashboard API shape drift hides Brain data gaps | Medium | `src/lib/dashboard/mappers.ts` now maps all Brain responses through typed UI contracts. Zod validation added. Mapper tests cover dashboard responses. DDR-004 token authority eliminates shadow utility classes. | ✅ Resolved — 2026-04-30 |
| RK-18 | WCAG contrast failures in token system | Medium | 5 token pairings fail WCAG AA contrast ratio (4.5:1) — primarily light-background/low-contrast text combinations in `var(--allura-*)` and `var(--dashboard-*)` tokens. Audit needed across both token namespaces. | 🔴 Open |
| RK-19 | Mission Control route/source-of-truth drift before `3100` cutover | High | Require route parity map, AdapterDeclaration for every route, explicit degraded behavior, no fabricated data, auth validation, smoke tests, and rollback plan before replacing the current Docker dashboard. | Active |
| RK-20 | Email prompt injection/phishing drives agent actions | High | AD-30 + RuVix POL-EMAIL-001..005: email is external_untrusted evidence only; privileged actions require approval; high-risk mail quarantined; canonical memory promotion requires HITL; attachments require sandbox/quarantine. | Mitigated |

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

### AD-XX: RuVix Kernel Contract

**Decision:** The 12 RuVix rules are the kernel invariants governing Allura Brain.

**Rationale:** The architecture already enforces the core behaviors — HITL promotion, append-only episodic storage, tenant isolation, fail-closed boundaries, and evidence-first completion. RuVix codifies those behaviors as one explicit kernel contract instead of scattering them across module-local policies.

**Alternatives considered:**

- **Per-module policies**: easier to localize, but too easy to drift and miss a boundary.
- **Monolithic engine**: simpler to name, but harder to test and too much blast radius.

**Tradeoffs:**

- Twelve discrete rules are individually testable.
- Enforcement must remain consistent at every boundary.
- Rule drift becomes a release blocker, not a background concern.

**Status:** accepted, documented 2026-05-28, auto-promotion threshold 0.85.

### AD-XX+1: RuVix Brand Governance Rules

**Decision:** The 6 brand rules are enforceable kernel invariants for Allura Dashboard surfaces.

**Rationale:** Allura Dashboard is mission-control software, not a marketing site. Brand coherence depends on Durham token exclusivity and a governed release gate. Difference Driven contamination is a real risk at the kernel boundary, so brand drift must fail closed before ship.

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

| Signal                      | Source                       | Alert Threshold       |
| --------------------------- | ---------------------------- | --------------------- |
| Neo4j promotion failures    | `src/lib/neo4j/promotion.ts` | > 5 failures in 5 min |
| Embedding latency           | Provider response time       | p99 > 3s              |
| Schema drift detection      | Health check endpoint        | Version mismatch      |
| RalphLoop iterations        | Slice counter log            | > 80 per session      |
| Cross-tenant query attempts | Query middleware             | Any occurrence        |
| Postgres trace growth       | Table size metric            | > 100GB               |

---

## References

- **Architecture Canon**: `docs/allura/BLUEPRINT.md`
- **Memory System Design**: `docs/allura/SOLUTION-ARCHITECTURE.md`
- **Validation Gate**: `docs/archive/allura/VALIDATION-GATE.md`
- **Validation Guide**: merged into `docs/allura/SOLUTION-ARCHITECTURE.md` §9 (Validation Topology)
- **Dashboard Rebuild Cutover**: AD-29 and RK-19 in this document; route/data contracts in `DATA-DICTIONARY.md`; implementation topology in `SOLUTION-ARCHITECTURE.md`
- **Operational Agent Access**: Packaged MCP servers (`neo4j-memory`, `database-server`) activated via `MCP_DOCKER`
- **Durable Stores**: PostgreSQL (events/traces) + Neo4j (semantic graph) accessed through controlled services
