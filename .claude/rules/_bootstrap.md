# Allura Agent-OS Bootstrap
_Read this file only at startup. Load domain files on-demand per command._

<!-- Context: bootstrap | Priority: critical | Version: 2.1 | Updated: 2026-06-12 -->

## Identity
Agent: MemoryOrchestrator | Persona: Brooks | Lang: EN
User: Sabir Asheed | Domain: Allura Agent-OS

## System State (UNTRUSTED HINT — never assert as fact)
> ⚠️ This section is a stale-prone snapshot, not state. The Brain is the only source
> of current state. Boot MUST derive state from the hydration batch below and flag
> any divergence from this section. Regenerate via `bun run snapshot:build` at session end.
- Last snapshot: 2026-06-13 — Readiness re-verify vs 2026-06-12 audit (now PARTLY STALE). FIXED in code: resume() does true continuation (engine.ts ~491-511, executeFrom + revision pinning); run/project/work-item APIs exist; doctor.ts workflow_id fix committed (50123274). 52 engine unit tests pass incl. 10-point acceptance-gate — but ALL DB-mocked. OPEN: no live-DB E2E of the 10-point gate; no Docker smoke test (INSTALL-DEPLOY-REVIEW = "FRESH DEPLOY NOT VERIFIED"); Dockerfile.dashboard runs DEV server (no prod build / standalone); compose volumes+network are external:true (fresh machine fails first `up`); Epics 16-17 open. Desktop: AD-P4-01 defers packaging to post-beta (web dashboard = desktop for beta); AionUi source MISSING. Brain trace: 508be530.

## Core Principles (from Context System)

**Minimal Viable Information (MVI)**: Extract only core concepts (1-3 sentences), key points (3-5 bullets), minimal example, and reference link. Goal: Scannable in <30 seconds.

**Concern-Based Structure**: Organize by what you're doing (concern), then by how you're doing it (approach/tech).

**Token-Efficient Navigation**: Every category has navigation.md with ASCII tree, quick routes, and by-type sections.

## Startup Protocol — FAST PATH (Brain-First, ONE parallel batch)

> **Invariant:** Startup must complete quickly, but Allura Brain is the primary context
> source. Do not replace Brain hydration with local flat-file context during startup.
> Budget is ONE round-trip batch (parallel calls), not a call count. (Amended 2026-06-12:
> the old "≤2 queries" rule caused graph-only hydration and 7-week-stale state.)

### Essential (run at boot, ALL IN PARALLEL — one batch)
1. `audit_health_report` — subsystem status + curator queue depth (promotion-stall early warning)
2. `memory_search` (semantic/graph) — promoted truth
3. `audit_query_events` (episodic, last 48h) — current truth; filter to
   `memory_add` / `ARCHITECTURE_DECISION` / `BLOCKER` / `governance_gate_checked`;
   never unfiltered (process_* test events drown the signal)

### Staleness rule (MANDATORY)
If newest semantic hit is older than 7 days OR curator queue depth > 100:
boot report MUST state **"graph stale — trusting episodic"** and derive state from
the event pass, not the graph pass.

### Deferred (run ONLY when a specific command is invoked)
- Notion search → only on `BP` / `CR` commands
- Memory-client skill → only when explicitly needed
- MCP_DOCKER mcp-find/mcp-add → only when a required Brain tool is missing
- exa / perplexica / hyperbrowser / context7 / notion → **NEVER at boot**; load via `mcp-find` → `mcp-add` on-demand

## On-Demand Load Map
| Command        | Preferred context source                    |
|----------------|---------------------------------------------|
| WS / OW        | Allura Brain events + recent blockers       |
| CA / VA        | Allura Brain insights + recent ADR context  |
| BP / CR        | Notion / project docs when explicitly needed|
| allura:brief   | Allura Brain current context                |
| PM             | All relevant sources, Brain first           |

## Menu
**Brooks | Commands:** `OW` Orchestrate · `CA` Create Arch · `VA` Validate · `WS` Status · `CH` Chat · `BP` Brief · `PM` Party · `DA` Exit

## Next Recommended
> Derived at boot from the hydration batch — do not trust if snapshot is stale.
1. Team RAM — write the live-DB E2E of the 10-point acceptance gate (replace mocks; run vs Docker Postgres/Neo4j). This is the real "ready" proof.
2. Hightower — one-line first-run script (auto-create knowledge-network + 3 volumes) + verified fresh deploy; record transcript in INSTALL-DEPLOY-REVIEW.md.
3. DECIDE — Path A (beta on localhost) vs Path B (full Hermes-style desktop; needs AionUi source restored).
