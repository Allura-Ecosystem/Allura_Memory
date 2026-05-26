# Story 5-4: Complete Final Team RAM Retrospective and Closeout Decision

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working retrospective artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story Traceability

- **Epic:** 5 — Runtime Reliability, Cutover, and Final Evidence
- **FRs covered:** FR17, FR18, FR20, FR22
- **Owner:** Brooks (facilitate), all Team RAM members (contribute evidence)
- **Validation:** `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text()); print('YAML parse passed')"`

## Purpose

This document serves two purposes:

1. **Team RAM Retrospective** — Capture what worked, what didn't, and what we'd change about the 10-agent surgical team model across all five epics.
2. **Closeout Decision** — Record an explicit ADR on whether Team RAM continues as-is, is restructured, or is retired.

---

## Part 1: Team RAM Retrospective

### 1.1 What Worked

| Pattern | Evidence | Value |
|---------|----------|-------|
| **Scout-first hydration** | Every story began with Scout recon → Brain search → context load. No story was implemented without prior context. | Prevented hallucinated architecture and duplicated work. |
| **Brooks as single architect** | Conceptual integrity was preserved across 5 epics, 20+ stories. No conflicting design decisions survived review. | One consistent design, even when slightly inferior to the "best" idea any individual agent proposed. |
| **Pike/Fowler review gates** | Every story required Pike (interface) and Fowler (maintainability) review before Done. Review blockers were resolved, not waived. | Caught cross-store atomicity bugs, schema drift, and premature completion claims. |
| **Knuth data/schema gate** | Schema drift reports and Data Dictionary compliance checks caught field naming and type mismatches before they reached production. | Prevented the most dangerous class of bugs: ones that pass type checks but violate data contracts. |
| **Hightower deployability gate** | Story 5.2 was blocked until `startup-validator.ts` connection timeouts were fixed. Hightower caught the runtime contract violation. | Prevented a production hang on unreachable services. |
| **Append-only audit trail** | Every memory write, curator decision, and approval produced a PostgreSQL trace. No mutation happened without an audit record. | SOC2 compliance foundation; no "convenient story after the fact." |
| **Evidence-first Done gate** | No story reached Done without validation output, review disposition, Brain memory ID, and board traceability. | Eliminated "trust me, it works" completion claims. |
| **Sprint status YAML** | `_bmad/bmm/stories/sprint-status.yaml` provided a single reconciliation surface for all 5 epics. | Reduced status ambiguity across harnesses. |

### 1.2 What Didn't Work

| Pattern | Evidence | Impact |
|---------|----------|-------|
| **Notion Work Board sync** | No authorized Notion tooling was available in any runtime. Board updates remained "pending" across all 20+ stories. | Local sprint status and Brain memories diverged from canonical board. Reconciliation debt accumulated. |
| **Bun/Vitest test boundary** | `bun test` mixed Bun-native, Vitest-era, Playwright, and integration tests. The unrestricted target timed out or failed broadly. | Story 5.2 was blocked for multiple iterations. Root cause was architectural test-boundary drift, not a code bug. |
| **Knuth subagent availability** | Knuth subagent returned empty output on multiple stories. Brooks performed gate-equivalent data/schema review as fallback. | Data/schema review happened, but not through the designed specialist. |
| **RalphLoop validation ceiling** | RalphLoop bounded iterations correctly, but the broad test surface meant each iteration discovered new failure families rather than converging. | Validation loops were honest but expensive. The bounded-iteration design prevented runaway but didn't guarantee convergence. |
| **Cross-harness agent definition drift** | `.opencode/agent/`, `.claude/agents/`, `.codex/agents/`, and `.agents/` all defined Team RAM with slight variations. | Required AD-15 (unified agent taxonomy) and ongoing reconciliation. The tar pit of parallel config surfaces. |
| **`.ralph/` state artifacts** | RalphLoop loop state (ralph-history.json, ralph-loop.state.json) is a fifth config surface across harness integrations. | Loop state can diverge from actual task state (Medium severity); ralph-history.json and ralph-loop.state.json are not synced to canonical sprint state. |
| **Communication overhead** | 10 agents × 9 / 2 = 45 potential communication paths. Category routing reduced this, but shadow coordination still occurred (e.g., Brooks performing Scout, Knuth, and Hightower roles when subagents were unavailable). | The surgical team model worked in principle but degraded when specialists were absent. |

### 1.3 Communication Overhead Audit

**Designed model:** 10 agents, category routing, 45 theoretical paths.

**Actual model:**

| Agent | Invoked As Designed | Substituted By Brooks | Never Invoked |
|-------|--------------------|-----------------------|---------------|
| Brooks | ✅ Every story | — | — |
| Jobs | ⬜ Never invoked through designed role — Brooks absorbed intent gate throughout all 5 epics. | Brooks performed intent gate | Never Invoked |
| Woz | ✅ Implementation stories | — | — |
| Pike | ✅ Review gate | — | — |
| Fowler | ✅ Review gate | — | — |
| Scout | ⬜ Partial | Brooks performed Scout recon when subagent unavailable | — |
| Bellard | ⬜ Not directly invoked | — | ✅ |
| Carmack | ⬜ Not directly invoked | — | ✅ |
| Knuth | ⬜ Partial | Brooks performed data/schema review when subagent returned empty | — |
| Hightower | ✅ Deployability gate (5.2) | — | — |

**Finding:** 3 of 10 agents (Bellard, Carmack, Jobs) were never or rarely invoked through their designed role. 2 agents (Scout, Knuth) were frequently substituted by Brooks. The effective team was **5 agents** (Brooks, Woz, Pike, Fowler, Hightower) with **3 part-time specialists** (Scout, Knuth, Jobs) and **2 unused specialists** (Bellard, Carmack).

**Communication paths actually used:** Approximately 15–20 of the theoretical 45. Category routing worked as designed for the active agents.

**Bellard and Carmack Non-Invocation Root Cause:** Both agents were available in the harness (INSTRUCTION BOUNDARY added, agent files created) but were never routed to. Story 5.2's startup-validator timeout fix (pg.Client connectionTimeoutMillis, Neo4j connectionTimeout) is exactly the class of diagnostic/latency problem Bellard exists for — yet Brooks handled it directly. Root cause: the routing discipline for performance/diagnostics specialists was not practiced. When a fix involved timing or connectivity, the correct move was to dispatch Bellard first. AD-33's "on-demand" classification for both is appropriate given this pattern.

### 1.4 Pattern Effectiveness Ranking

| Rank | Pattern | Effectiveness | Reuse Recommendation |
|------|---------|---------------|---------------------|
| 1 | Evidence-first Done gate | Very High | Keep. Non-negotiable. |
| 2 | Scout-first hydration | High | Keep. Make Scout subagent more reliable. |
| 3 | Brooks as single architect | High | Keep. No committee design. |
| 4 | Pike/Fowler review gates | High | Keep. Consider merging into single review gate for small stories. |
| 5 | Append-only audit trail | High | Keep. SOC2 foundation. |
| 6 | Hightower deployability gate | Medium-High | Keep for infrastructure stories. Skip for documentation-only stories. |
| 7 | Knuth data/schema gate | Medium | Keep. Fix subagent availability. |
| 8 | Sprint status YAML | Medium | Keep. Automate Notion sync. |
| 9 | RalphLoop validation | Medium | Keep for bounded tasks. Don't use for broad regression. |
| 10 | 10-agent surgical team | Medium | Restructure (see closeout decision). |

---

## Part 2: Closeout Decision

### ADR: Team RAM Closeout and Restructuring

**ID:** AD-33  
**Status:** Proposed  
**Approval Authority:** Brooks (Chief Architect) may decide unilaterally for routing/agent model decisions per Team RAM charter. For decisions affecting the Team RAM roster structure (adding/removing agents), Captain sign-off is required. AD-33 restructures the active roster — Captain review required before status moves from Proposed → Decided.
**Approval Criterion:** Captain reviews AD-33 rationale and confirms the 6-active + 4-on-demand model is acceptable. No implementation work begins until Decided.
**Decision:** Restructure Team RAM from 10 agents to 6 active agents, with 4 specialists available on-demand rather than permanently staffed.

**Rationale:**

1. The 10-agent model created 45 theoretical communication paths but only ~15–20 were used.
2. 3 agents were never invoked in their designed role (Bellard, Carmack, Jobs).
3. 2 agents were frequently substituted by Brooks (Scout, Knuth) due to subagent availability issues.
4. The effective team was already 5–7 agents in practice.
5. Maintaining 10 agent definitions, 10 config files, and 10 routing rules for 5 active agents is accidental complexity.

**Restructured Team RAM:**

| Agent | Role | Status | Change |
|-------|------|--------|--------|
| Brooks | Architect + Orchestrator | Active | No change |
| Woz | Builder | Active | No change |
| Pike | Interface Review | Active | No change |
| Fowler | Refactor Review | Active | Merge with Pike for small stories |
| Hightower | DevOps | Active | No change |
| Scout | Recon + Discovery | Active | Must be reliable subagent |
| Jobs | Intent Gate | On-demand | Not permanently staffed; Brooks performs intent gate by default |
| Knuth | Data Architect | On-demand | Invoked for schema/data stories only |
| Bellard | Diagnostics | On-demand | Invoked for performance stories only |
| Carmack | Optimization | On-demand | Invoked for latency/API design stories only |

**Communication paths (active team):** 6 × 5 / 2 = **15**. Down from 45.

**Alternatives considered:**

1. **Keep 10-agent model as-is** — rejected because 3 agents were never used and maintaining unused definitions is accidental complexity.
2. **Reduce to 5 agents** — rejected because Knuth, Bellard, and Carmack provide genuine specialist value when invoked; removing them entirely loses capability.
3. **Merge all review into one agent** — rejected because interface review (Pike) and refactor review (Fowler) have different heuristics; merging loses conceptual integrity.

**Consequences:**

- Active team communication overhead drops from 45 to 15 paths.
- On-demand specialists are still available but don't require permanent routing/config maintenance.
- Brooks remains the single architect; no committee design.
- The restructuring is reversible: any on-demand agent can be promoted back to active if workload justifies it.

---

## Follow-Up Actions

1. **Brooks:** Update `.opencode/agent/` structure to reflect active vs. on-demand classification.
2. **Brooks:** Update `agent-routing.md` with restructured routing table.
3. **Scout:** Fix subagent availability so Scout recon doesn't require Brooks substitution.
4. **Hightower:** Automate Notion Work Board sync to eliminate the 20+ story reconciliation debt.
5. **Knuth:** Verify subagent invocation works for future schema/data stories.

---

## Allura Drift Gate

- Brain query: `Team RAM retrospective closeout decision blockers decisions outcomes`
- group_id: `allura-system`
- **Result:** Brain searched 2026-05-26. Query: "Team RAM retrospective closeout decision blockers decisions outcomes" (group_id: allura-system). Result: 7 memories returned — all resolved historical decisions (Team RAM naming unification, INSTRUCTION BOUNDARY additions, P0/P1 fixes, k6 load test pass). No unresolved blockers, critical drift, or open decisions found.
- **Classification:** CLEAR — no unresolved drift. Gate PASSES.

## Validation Evidence

- `python3 -c "import yaml, sys; yaml.safe_load(open('_bmad/bmm/stories/sprint-status.yaml')); print('YAML parse: OK')"` -> `YAML parse: OK`
- Targeted `git diff --check HEAD 2>&1 | head -5 || echo "git diff --check: clean"` -> (no output — clean, no whitespace errors)

## Board Traceability

- Notion Work Board update pending; no authorized Notion tooling is available in this runtime.