# Epics — RuVector Documentation Sync & Integration Execution

**Date:** 2026-07-12
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

## Current Active Epics

- [Epic 24 — Agentic AI Framework and Harness Portfolio Readiness](./epic-24-portfolio-readiness.md) — `in-progress`; Stories 24.4–24.9 require remediation before dependent claims or mutations ship.
- [Epic 25 — Governed Curator Review Console](./epic-25-governed-curator-review-console.md) — `in-progress`; Story 25.1 is review-gated, 25.2a merged but dependency-blocked. Read-only scope/documentation work is eligible, while decisions remain dependency-blocked on 24.4.
- [Epic 26 — Bumblebee Supply-Chain Threat Intelligence & Governed Mitigation](./epic-26-bumblebee-supply-chain-threat-intelligence.md) — `proposed`; planning only. No scheduler, connector, or policy mutation is authorized.

Epics 18–23 below are retained as historical delivery context. Epic 24 remains the active remediation plan; Epic 25 is its bounded operator-surface successor; Epic 26 is the proposed supply-chain threat intelligence plugin.

## Epic 18: RuVector Documentation Sync — Promote Archive to Canon

**Goal:** The RuVector graph cutover is 90% built behind `GRAPH_BACKEND` flag (AD-029), but the canonical 6-file doc set still says "pgvector bridge, not full RuVector." This epic promotes the archived AD-49/RK-15 and the RuVector integration boundary into the canonical docs, updates the readiness boundary with the actual cutover path, and prepares the receipt shapes for when native activates.

**Why now:** The code is ahead of the docs. AD-49 has been drafted in `docs/archive/allura/` since 2026-06-24 but is AD-33-gated for promotion. Sabir chose Path B (ruvnet Rust crate), and the spike passed (Bun loads the `.node` addon). The docs need to catch up to reality before Team RAM can execute the cutover work.

**Stories:**

- **18.1** Promote AD-49 (RuVector graph cutover) + RK-15 into canonical `RISKS-AND-DECISIONS.md`
- **18.2** Update `SOLUTION-ARCHITECTURE.md` §3.4.0 — expand readiness boundary with cutover path + graduation criteria
- **18.3** Update `DATA-DICTIONARY.md` — add `GRAPH_BACKEND` flag, RuVector graph tables, expand `ruvector_status` object
- **18.4** Update `REQUIREMENTS-MATRIX.md` — add REQ-RV-001..005 (RuVector cutover requirements)
- **18.5** Update `BLUEPRINT.md` §2 + §8 — RuVector graph posture, port confirmation, capability inventory
- **18.6** Update RK-21 mitigation — add graduation criteria (pgvector_bridge → full_ruvector label upgrade)

**Exit gate:**
- All 6 canonical docs reflect the actual RuVector graph adapter state (AD-029, AD-49)
- AD-49 and RK-15 are in canonical `RISKS-AND-DECISIONS.md` with correct numbering
- Graduation criteria for the `pgvector_bridge` → `full_ruvector` label upgrade are documented
- `GRAPH_BACKEND` flag and RuVector graph tables are in the Data Dictionary
- TALON can validate the doc set is internally consistent

## Epic 19: RuVector Graph Cutover Execution (Team RAM)

**Goal:** Execute the remaining work to flip `GRAPH_BACKEND` from `neo4j` to `ruvector` (Path A — PG tables, ship now) and spike Path B (ruvnet Rust crate, upstreamable engine) in parallel.

**Stories (to be refined after Epic 18 completes):**

- **19.1** Live-DB E2E — run 10-point acceptance gate against Docker Postgres with `GRAPH_BACKEND=ruvector`
- **19.2** Dual-read validation — read from both backends, diff results for one release cycle
- **19.3** Flip default in `factory.ts` (`getGraphBackend()` → `ruvector`) once E2E + dual-read are green
- **19.4** Path B spike — build `ruvector-crate-adapter.ts` behind `GRAPH_BACKEND=ruvector-crate`
- **19.5** Upstream gaps to ruvnet/RuVector (G1 immutable mode, G2 text index, G3 tenant scoping)

**Exit gate:**
- `GRAPH_BACKEND=ruvector` is the default in production
- Neo4j is read-only fallback for one release
- Live-DB E2E passes with RuVector backend
- Path B adapter exists behind flag with three-way parity test green

---

## Epic 20: Subagent Memory Access — Hermes ↔ Allura Wiring

**Date:** 2026-07-26
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** Hermes subagents (via `delegate_task`) and external agents (Troy on laptop, OpenWork on desktop) must query Allura Brain before starting work and write outcomes back after completing. The infrastructure exists — the SONA trajectory engine records what happened, the MCP gateway exposes memory_add/search, and the control plane enforces group_id. What's missing is the wiring: subagent briefs don't include "query Allura first," and agent configs don't declare their group_id.

**Why now:** The memory plane has the engines (trajectory, genesis, curator, coherence) but they're fed only by direct MCP calls from Gilliam. Subagents and external agents are blind — they don't read prior work, don't write outcomes, and don't carry tenant identity. This makes the brain Gilliam's brain, not the crew's brain.

**Stories:**

- **20.1** Create `group_id` registry — a config file mapping agents to their default tenant (`allura-system`, `allura-faithmeats`, `allura-difference-driven`, `allura-coding`). File: `.opencode/config/group-id-registry.yaml`. Each agent entry has `default_group_id` and optional `allowed_group_ids` for cross-tenant agents.
- **20.2** Wire `delegate_task` brief template — update the BRIEF.md template (AGENTS.md §4) to include "Query Allura Brain for prior work on this topic" as step 1 and "Write your outcome to Allura Brain" as the final step. Add `group_id` to the delegate_task context payload so subagents inherit tenant identity.
- **20.3** Add `memory_search` + `memory_add` to subagent tool allowlists — the Hermes config `mcp_servers.allura_brain.tools.include` currently only allows Gilliam. Subagents need their own tool access or inherited access via `inherit_mcp_toolsets: true` (already set in delegation config). Verify this actually propagates to children.
- **20.4** Build a lightweight "memory brief" helper — a script or skill that an agent calls before starting work: `allura-brain memory_search --query "<task topic>" --group_id <tenant>`. Returns prior work, decisions, and blockers. Reduces token cost by filtering to relevant memories only.
- **20.5** Build a "memory writeback" helper — after task completion, an agent calls `allura-brain memory_add` with a structured payload: task summary, files changed, outcome (pass/fail), and key decisions. This feeds the trajectory engine and curator pipeline automatically.

**Exit gate:**
- Every `delegate_task` subagent queries Allura before starting and writes back after completing
- `group_id` is passed through the delegation chain — children inherit parent's tenant
- A subagent working on `allura-faithmeats` cannot read `allura-difference-driven` memories
- The trajectory engine records subagent work, not just Gilliam's direct calls
- Evidence: a delegate_task run shows memory_search before work and memory_add after completion

---

## Epic 21: Retrieval Drift Audit + Curation Scheduling

**Date:** 2026-07-26
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** The retrieval drift audit skill exists but doesn't run on a schedule — search quality could degrade silently. The curator scripts (auto-curator.js, curator-v3.js, content-aware-curator-v2.ts) exist but aren't scheduled — they're manual scripts. Wire both to cron/systemd so the brain self-monitors and self-curates without human intervention.

**Why now:** Brooks built the engines but left them as manual scripts. The watchdog (`src/curator/watchdog.ts`) has a `--interval` flag but no systemd unit or cron job running it. The content-aware curator has no scheduling at all. Without scheduled execution, the brain accumulates uncurated episodic memories and has no drift detection.

**Stories:**

- **21.1** Schedule the curator watchdog — create a systemd unit or cron job that runs `bun src/curator/watchdog.ts --interval 300 --group-id allura-system` every 5 minutes. This continuously scores unpromoted events and creates proposals. Verify the existing `curator-watchdog` systemd unit (#60) is active and wired to the right binary.
- **21.2** Schedule the content-aware curator — create a cron job that runs `bun scripts/content-aware-curator-v2.ts` every 6 hours. This auto-promotes eligible proposals based on category classification and score thresholds. Add `--group-id` flag support if missing. Log to `memory/YYYY-MM-DD.md`.
- **21.3** Schedule the retrieval drift audit — create a daily cron job that runs the `allura-retrieval-drift-audit` skill. The audit checks: (1) subsystem health, (2) count parity between events and promoted insights, (3) index coverage, (4) reader/writer schema parity, (5) public API round-trip for a known promoted ID. If drift is detected, write to Allura Brain as an ALERT event.
- **21.4** Add alerting on drift — when the drift audit detects degradation (missing promotions, index drift, schema mismatch), it writes an ALERT event to Allura Brain with `event_type=RETRIEVAL_DRIFT` and `metadata={component, drift_type, severity}`. The auto-recovery engine (`src/lib/healing/auto-recovery.ts`) picks this up and attempts remediation.
- **21.5** Add a curation metrics endpoint — `GET /api/curator/metrics` that returns: pending proposal count, oldest proposal age, auto-promotion rate (last 24h), rejection rate, drift audit status, watchdog health. This gives any agent or human a quick "brain health" check without a dashboard.

**Exit gate:**
- Curator watchdog runs every 5 minutes via systemd/cron — proposals are created automatically
- Content-aware curator runs every 6 hours — eligible proposals are auto-promoted
- Drift audit runs daily — results written to Allura Brain
- Alerts fire when drift is detected — auto-recovery engine responds
- Metrics endpoint returns brain health in a single API call
- Evidence: 7 days of scheduled execution logs with no manual intervention

---

## Epic 22: Enterprise Readiness — Multi-Tenant Hardening

**Date:** 2026-07-26
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** The memory plane must be ready to deploy for multiple businesses (faithmeats, difference-driven, coding projects) with clean tenant onboarding, profile-based tool isolation, and export/import for sharing configs. The infrastructure is built — this epic hardens the edges so a new project can be onboarded in minutes, not hours.

**Why now:** Docker MCP profiles are created (faithmeats, difference-driven, coding) but the Allura Brain side doesn't know about them. The `group_id` CHECK constraint enforces `^allura-` but there's no registry of which tenants exist, who owns them, or what tools they're allowed to access. Onboarding a new project means manually editing env vars and hoping.

**Stories:**

- **22.1** Create tenant registry table — a new PostgreSQL table `tenants` with columns: `group_id` (PK, matches `^allura-`), `name`, `description`, `owner_agent_id`, `created_at`, `active`. Migration `33-tenant-registry.sql`. This is the source of truth for which tenants exist, not env vars.
- **22.2** Build tenant onboarding API — `POST /api/tenants` (admin-only) creates a new tenant: validates group_id format, inserts into `tenants` table, creates the default MCP profile association, and returns the tenant config. `GET /api/tenants` lists all active tenants. `GET /api/tenants/:group_id` returns tenant details.
- **22.3** Wire MCP profile ↔ tenant mapping — when an agent connects via `docker mcp gateway run --profile faithmeats`, the Allura Brain MCP server reads the `DEFAULT_GROUP_ID` env var and enforces it as the tenant. Add a startup check that validates the `DEFAULT_GROUP_ID` exists in the `tenants` table — fail closed if not.
- **22.4** Add tenant-scoped curator config — each tenant should be able to configure its own promotion threshold, auto-approval mode, and curator schedule. Store in `tenants` table as JSONB `config` column. The watchdog and content-aware curator read this config per-tenant instead of using global defaults.
- **22.5** Build profile export/import — document the workflow: `docker mcp profile export faithmeats ./faithmeats-profile.yaml` → commit to repo → new machine does `docker mcp profile import ./faithmeats-profile.yaml`. Add a README in `_bmad/bmm/planning/profiles/` documenting each profile, its tenant, and its tool restrictions.
- **22.6** Add cross-tenant audit — `GET /api/audit/cross-tenant` (admin-only) that verifies zero cross-tenant leakage: runs 100 random queries per tenant pair, confirms results are always empty for foreign tenants. This is the evidence gate for multi-tenant safety.

**Exit gate:**
- New project onboarding = `POST /api/tenants` + `docker mcp profile create` — under 5 minutes
- Every tenant has a registered `group_id`, owner, and config in the database
- MCP profiles enforce tool access per business context
- Cross-tenant audit proves zero leakage across all tenant pairs
- Profile export/import is documented and tested
- Evidence: a new tenant (`allura-test-enterprise`) is created, configured, and verified end-to-end

---

## Epic 23: Neo4j Sunset Completion — Clean Codebase

**Date:** 2026-07-29
**Status:** Approved
**Owner:** Brooks (orchestrator)
**group_id:** allura-system

**Goal:** The Neo4j container was removed and `GRAPH_BACKEND=ruvector` is the production default, but the codebase still has 90+ source files and 30+ test files referencing Neo4j. There are 25 failing tests (Neo4j fallback paths), 10+ typecheck errors (`Driver | null` vs `Driver | undefined`), and dead code across `src/lib/neo4j/`, `src/lib/graph-adapter/neo4j-adapter.ts`, and `src/lib/backup/neo4j.ts`. This epic cleans the debt so the repo has green tests, clean typecheck, and zero dead Neo4j references.

**Why now:** Every future change is harder with 25 failing tests and broken typecheck. You can't tell if a new change broke something or if it was already broken. The Neo4j sunset was done halfway — container removed, code never cleaned up. This is the completion.

**Stories:**

- **23.1** Fix typecheck errors in `canonical-tools.ts` — 10 `Driver | null` vs `Driver | undefined` errors. The Neo4j driver optional path returns `null` where `undefined` is expected. Fix the type signatures or the callers.
- **23.2** Remove or rewrite Neo4j fallback tests in `writer.test.ts` — 12 tests testing `MEMORY_BYPASS_KERNEL=true` Neo4j fallback path. Neo4j is dead. Delete the tests or rewrite them to test the PostgreSQL-only path.
- **23.3** Fix `target-resolver.test.ts` failures — `validateTenantForWrite` and `neo4jMutate` tests failing because Neo4j path is dead code. Remove the Neo4j mutate path from target-resolver and update tests.
- **23.4** Fix token compliance failures — 19 raw hex colors and 13 deprecated token references. Replace with design tokens.
- **23.5** Remove dead Neo4j code — delete `src/lib/neo4j/` directory (client, connection, queries, schema, agent-nodes), `src/lib/graph-adapter/neo4j-adapter.ts`, `src/lib/backup/neo4j.ts`, `src/lib/errors/neo4j-errors.ts`. Remove Neo4j imports from all 90+ files that reference it. Keep `src/lib/graph-adapter/ruvector-adapter.ts` and `factory.ts` (already production).

**Exit gate:**
- `bun run typecheck` — 0 errors
- `bun run test:unit` — 0 failures (existing 171 skips OK)
- `grep -r "neo4j\|Neo4j" src/ --include="*.ts" | grep -v node_modules | wc -l` — 0 results (or only historical comments in docs)
- No `src/lib/neo4j/` directory
- `src/lib/graph-adapter/neo4j-adapter.ts` deleted
- Git commit with all changes, pushed to origin/main
- Brain log + retrospective
