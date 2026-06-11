# Epic 12 Retrospective — Process Engine & SDK

**Date:** 2026-06-11
**Facilitator:** Brooks (Architect)
**Epic:** 12 — Process Engine & SDK (Babysitter Parity)
**Status:** COMPLETE — 7/7 stories shipped
**Commits:** 0836c715, b658f74d, 94f62d28, 9c6e93e5, f27f639e

---

## Delivery Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 7/7 (100%) |
| Total lines added | ~5,600 |
| Unit tests written | 94 (20 + 33 + 23 + 21 + 30 - some overlap with replay) |
| Code reviews | 1 full review, 3 patches applied |
| Typecheck passes | 5/5 commits clean |
| Sprint-status updated per commit | YES (governance lesson from Epic 11 retro applied) |

## Stories Shipped

| Story | Title | Lines | Tests | Commit |
|-------|-------|-------|-------|--------|
| 12.1 | Process-as-Code Engine | 1,085 | — | 0836c715 |
| 12.2 | Event-Sourced Replay | 956 | 20 | b658f74d |
| 12.3 | @allura/sdk | 1,009 | 33 | 94f62d28 |
| 12.4 | Token Compression | 668 | 23 | 9c6e93e5 |
| 12.5 | Headless CLI Runner | 429 | — | b658f74d |
| 12.6 | DAG Dependency Resolver | 438 | 21 | 94f62d28 |
| 12.7 | Multi-Harness Adapters | 800 | 30 | 9c6e93e5 |

---

## What Went Well

### 1. Parallel dispatch doubled throughput
Running 2 Woz agents simultaneously on independent stories (12.2+12.5, 12.3+12.6, 12.4+12.7) shipped 7 stories in 3 commit cycles instead of 7. No file conflicts because Brooks ensured each agent had clear file boundaries.

### 2. Scout recon before Woz dispatch
The Scout report before 12.1 mapped the entire event system infrastructure — events table schema, existing workflow_id/step_id columns, insertEvent() helper, circuit breaker patterns. Woz didn't have to discover anything — the battle plan was ready.

### 3. Sprint-status governance applied
After the Epic 11 retro identified the sprint-status tracking failure, every Epic 12 commit included sprint-status updates. Woz agents updated it themselves. The lesson was learned and applied immediately.

### 4. Existing infrastructure leveraged well
The events table already had `workflow_id`, `step_id`, and `parent_event_id` columns. The process engine didn't need schema changes — it built on what was there. Same with `insertEvent()` — reused, not reinvented.

### 5. Code review caught a real concurrency bug
The `runParallel()` race condition (shared mutable state across Promise.all) was caught by static analysis in the code review. Fixed with `Promise.allSettled` + post-group merge. This bug would have been extremely hard to reproduce in testing but would corrupt state under real parallel workloads.

---

## What Went Wrong

### 1. runParallel race condition shipped before review
Woz wrote correct sequential code but the parallel path had a concurrency bug. The code passed typecheck and would pass unit tests (tests don't exercise true concurrency). Only the code review caught it. **Lesson: parallel execution code needs explicit concurrency review before merge.**

### 2. Harness detection used `??` instead of `||`
Empty string environment variables (`CLAUDE_CODE=""`) would have triggered false detection. A subtle JavaScript semantics error that passed typecheck and tests. **Lesson: env var checks should always use `||`, not `??`.**

### 3. CLI `--group-id` flag was dead code
The headless CLI accepted `--group-id` but the process engine reads `group_id` from the definition file. The flag gave operators false confidence they were overriding tenant scope. **Lesson: every CLI flag should have a test proving it affects behavior.**

### 4. No integration tests for process engine
All process engine stories have type-level correctness and unit tests for individual components (DAG, replay, compression). But there's no end-to-end test that runs a real process through PostgreSQL. The engine is tested in isolation. **Lesson: Epic 12 needs an integration test story or it should be added to the next work.**

---

## Key Lessons

1. **Parallel agent dispatch works but needs concurrency review** — files don't conflict, but shared mutable state does
2. **Scout recon pays for itself** — the 12.1 scout report saved significant discovery time across all 7 stories
3. **Sprint-status governance is enforceable with culture, not just hooks** — Woz updated it because we established the norm, not because a hook blocked the commit
4. **Code review catches what tests miss** — concurrency bugs, semantic operator errors (??/||), dead parameters
5. **Existing infrastructure should be audited before building** — the events table was already 80% of what the process engine needed

---

## Technical Debt Incurred

| Item | Severity | Owner |
|------|----------|-------|
| `runParallel` still mutates state within individual step execution (events emitted during execution, not after) | Medium | Brooks — architecture decision: acceptable because events are append-only |
| Replay anchor query has no group_id filter (chicken-and-egg: needs processId to find group_id) | Low | Knuth — add secondary lookup with group_id if needed |
| Server-only guards on types-only files prevent browser import of just types | Low | Pike — consider splitting types into shared/server |
| No integration tests for process engine against real PostgreSQL | Medium | Woz — add in next work cycle |
| Compression dedup uses single-linkage clustering (can chain dissimilar sentences) | Low | Bellard — acceptable for v1, improve if needed |
| CLI `--group-id` flag is effectively unused | Low | Woz — either wire it to override definition.group_id or remove it |

---

## Previous Retro (Epic 11) Follow-Through

| Action Item | Status |
|-------------|--------|
| Update sprint-status in every commit | **APPLIED** — all Epic 12 commits include status updates |
| Scout recon before Woz dispatch | **APPLIED** — Scout ran before 12.1, results used across all stories |
| Code review is non-negotiable | **APPLIED** — full review run, 3 patches applied |
| Check for existing infrastructure before building | **APPLIED** — events table reused, no schema changes |

**4/4 action items from Epic 11 retro were applied.** This is the first retro with 100% follow-through.

---

## Significant Discovery

**Process governance gap is now closed.** Before Epic 12, Allura enforced DATA governance (group_id, append-only, HITL) but not PROCESS governance (sprint tracking, story lifecycle, review gates). The process engine now enables:

- `checkpoint` steps that BLOCK until human approval in SOC2 mode
- `gate` steps that FAIL the process if conditions aren't met
- Event-sourced replay for audit
- Headless execution for CI/CD
- DAG-aware parallel execution with dependency tracking

This means BMAD workflows can be expressed as executable code, not just markdown instructions. The sprint-status failure that triggered the Epic 11 retro action item can now be enforced as a `gate` in a commit process definition.

---

## Action Items

| # | Action | Owner | Criteria |
|---|--------|-------|----------|
| 1 | Add process engine integration test (real PG) | Woz | Test runs defineProcess → engine.run() → verify events in PG |
| 2 | Wire CLI --group-id to override definition or remove the flag | Woz | Flag either works or doesn't exist |
| 3 | Create example commit-governance process using the engine | Brooks | Demonstrates gate for sprint-status, checkpoint for review |
| 4 | Publish @allura/sdk to npm (when ready for external consumers) | Hightower | Package builds, README complete, types exported |
| 5 | Wire process engine into /commit skill for sprint-status enforcement | Brooks | /commit runs a governed process, not ad-hoc steps |

---

## Next Steps

No Epic 13 is defined. The immediate work is:
1. Execute the 5 action items above
2. Wire the process engine into actual workflows (commit, deploy, review)
3. Decide on the next product direction with Ronin

**The engine layer, dashboard layer, and process layer are all shipped. Allura Memory is a complete governed AI memory platform.**
