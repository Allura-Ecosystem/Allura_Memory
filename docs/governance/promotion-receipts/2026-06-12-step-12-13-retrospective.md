# Phase 0 Retrospective — Step 12+13

**Date:** 2026-06-12
**Agent:** Brooks (brooks-architect)
**Runtime:** Claude Code Opus 4.6 (1M context)
**Goal:** goal-20260612-1245 (Task 7)

---

## Exit Criteria Final Status

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| C1 | env drift + live gate + E2E | CLOSED | commit 66517a3c |
| C2 | Operational-state contract (65 tests) | PASS | 86 tests (expanded from 65 with error-classifier) |
| C3 | All 4 surfaces LIVE | 4/4 | Governance, Scheduled Tasks, Settings, Teams, Dreams |
| C4 | AC-4 org/team enforcement | DONE | Stories 8+9 |
| C5 | TALON+IRIS reviews | EXCLUDED | Per operator instruction (external reviewer availability) |
| C6 | Invariant 6/6 | PASS | audit_invariant_check 2026-06-12T17:20:43Z |
| C7 | Curator queue <100 | CLOSED (97) | Batch triage A-O, commit 51c32365 |
| C8 | Retrospective | THIS DOCUMENT | |

## Metrics

- **Commits (Phase 0 window):** 33 (since 2026-06-10)
- **Files changed:** 100
- **Lines:** +8,944 / -631
- **Tests:** 2,251 passing, 0 failing (up from 65 at start)
- **Typecheck:** clean (tsc --noEmit)
- **Invariants:** 6/6 PASS
- **Curator queue:** 267 → 97 (39 promoted to Neo4j, 131 rejected, 97 held)

## What Went Well

1. **Operational-state pattern held.** The source→page→API pattern established with Governance/Scheduled Tasks replicated cleanly to Settings, Teams, and Dreams. Direct-import (no self-fetch) was the right call for Docker-safe operation.

2. **Carry-forward resolution.** CF-A (UNREACHABLE regex) extracted to a shared utility with 21 tests. CF-B (adapter-registry) added 2 missing entries. CF-D was a false alarm. CF-F (watchdog tests) fixed a parameterized-query test bug. All carry-forwards closed.

3. **Curator triage scaled.** Expanding the classifier from 5 batches (A-E) to 15 (A-O) classified 170 of 267 proposals automatically. The content-prefix classification strategy is sustainable.

4. **Cross-runtime handoff worked.** Session started in OpenCode (GLM-5.1), continued in Claude Code (Opus 4.6). The goal file, Brain episodic traces, and git state provided sufficient context for seamless continuation.

5. **Invariant enforcement held throughout.** 6/6 at start, 6/6 at end. No violations introduced during 33 commits. The append-only and SUPERSEDES contracts are structurally enforced.

## What Could Be Better

1. **Graph staleness.** Newest semantic (Neo4j) hit is from April 2026 — 2 months stale. The curator HITL pipeline works but the promotion cadence is too slow. The 39 promoted this session helped but the graph still lags episodic reality significantly.

2. **Curator queue growth.** Queue grew from 249 to 267 during the work session (new proposals created by watchdog while triaging). The triage brought it to 97, but without regular triage runs it will grow back above 100. Need either: (a) scheduled triage cron, or (b) watchdog proposal rate limiting.

3. **Test count inflation vs. coverage.** 2,251 tests sounds impressive but many are unit tests for mocked sources. The E2E tests (which require real Postgres + Neo4j) are the real coverage — those are still gated behind `RUN_E2E_TESTS=true` and rarely run.

4. **C5 exclusion.** TALON and IRIS reviews were excluded due to external reviewer availability, not because they're unnecessary. This is an open gap for beta-readiness.

## Lessons Learned

1. **Parameterized queries break string-matching test patterns.** The watchdog test failure (CF-F) was caused by tests checking SQL strings for event type names that are actually in parameter values. Pattern: always test parameter arrays, not SQL strings, when using parameterized queries.

2. **Batch classification is a pipeline, not a one-shot.** The A-E classifier was too narrow. Content prefix patterns are stable enough for rule-based classification, but the D-hold bucket needs periodic re-analysis as new content types emerge.

3. **Direct-import pattern > self-fetch for dashboard sources.** Pages that fetch their own API routes create a port-dependency chain that breaks in Docker. Direct-import from source functions is zero-hop, same-process, and Docker-safe.

## Carry-Forwards to Beta

| ID | Item | Priority |
|----|------|----------|
| 1 | Graph staleness — promotion cadence too slow | P1 |
| 2 | TALON+IRIS reviews — deferred, not cancelled | P1 |
| 3 | Curator triage automation (cron or rate limit) | P2 |
| 4 | E2E test coverage gap (rarely run) | P2 |
| 5 | 97 held proposals (Batch D) — case-by-case review | P3 |

---

**Retrospective logged to Brain and committed. C8 CLOSED.**
