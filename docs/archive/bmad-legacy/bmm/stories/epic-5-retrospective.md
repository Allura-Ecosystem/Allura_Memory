# Epic 5 Retrospective: Runtime Reliability, Cutover, and Final Evidence

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a BMAD retrospective artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done — closed by Ronin approval after dashboard sunset decision.

## Epic Summary

Epic 5 completed the Engine runtime reliability and final evidence closeout for the Allura Memory project. The dashboard UI attempts from this project path are sunset by Ronin direction and are no longer part of the Epic 5 Engine closeout boundary.

Completed stories:

- `5-1-verify-runtime-health-and-recovery-baseline` — runtime health validation, startup validator, and recovery baseline.
- `5-2-package-final-regression-and-sprint-evidence` — final regression harness, startup-validator connection timeout fix, and sprint evidence packet.

Closeout disposition:

- `5-3-document-3100-cutover-and-rollback-gate` — closed by dashboard sunset/deferral. The cutover packet remains historical evidence and can be reopened only if Ronin reopens dashboard cutover scope.
- `5-4-complete-final-team-ram-retrospective-and-closeout-decision` — completed with drift gate and validation evidence.

## Allura Drift Gate

- Brain query: `Epic 5 retrospective runtime reliability cutover final evidence blockers decisions outcomes`
- group_id: `allura-system`
- Drift classification: clear for Engine closeout after dashboard sunset decision.
- Sunset decision: Ronin stated the dashboards produced in this path did not meet the desired direction and that the preferred dashboard was built elsewhere on another branch.

## Question 1: Did We Deliver What We Promised?

| Promise | Delivered | Evidence | Gap |
|---------|-----------|----------|-----|
| Runtime health and recovery baseline | ✅ Yes | Story 5.1: 46 health tests pass, startup validator, connection timeout fix | None |
| Final regression and sprint evidence | ✅ Yes | Story 5.2: `bun run test` 1960 pass / 0 fail, typecheck clean, YAML parse OK | `bun test` (Bun-native) still has broad failures; Vitest suite is green |
| 3100 cutover and rollback gate | ✅ Deferred / sunset | Ronin sunset decision: dashboard work from this path is not the active direction | Reopen only if Ronin explicitly reopens dashboard cutover scope |
| Team RAM retrospective and closeout | ✅ Yes | Story 5.4: retrospective produced with AD-33 restructuring proposal, drift gate, validation evidence | AD-33 roster restructuring remains a separate approval decision |

**Verdict:** Epic 5 is complete for Engine closeout. Core runtime reliability, final regression evidence, Team RAM closeout, and Allura Brain operational proof are complete enough for the Engine boundary. Dashboard UI/cutover work from this path is sunset and must not block Engine closeout.

## Dashboard Sunset Decision

Ronin was not satisfied with the dashboard directions produced in this project path and built the preferred dashboard elsewhere on another branch. Therefore:

- Dashboard UI acceptance is removed from Epic 5 Engine closeout.
- The 3100 cutover gate remains historical/runbook evidence, not an active blocker.
- Prior dashboard cards must not be marked Done from this path.
- Future dashboard reconciliation must start from the branch/source Ronin identifies and should be tracked as a separate project or reopened dashboard epic.

## Question 2: What Accidental Complexity Did We Accumulate?

| Complexity | Source | Severity | Recommendation |
|------------|--------|----------|----------------|
| Bun/Vitest test boundary | Repository mixes Bun-native, Vitest-era, Playwright, and integration tests under one `bun test` target | High | Split test targets: `bun run test` (Vitest), `bun test` (Bun-native only), separate Playwright/integration suites |
| Notion Work Board sync debt | 20+ stories with "pending" board updates because authorized Notion tooling was unavailable | Medium | Automate Notion sync or accept local-first tracking with periodic manual reconciliation |
| Cross-harness agent config drift | `.opencode/`, `.claude/`, `.codex/`, `.agents/` all define Team RAM with variations | Medium | AD-15 unified taxonomy; maintain `.opencode/` as canonical, treat others as adapters |
| 3100 cutover protection overhead | Every dashboard story since Epic 2 had to verify it didn't replace 3100 | Low | Correct protection; resolve by completing cutover gate and either cutting over or explicitly deferring |

## Question 3: What One Thing Would We Change?

**The test harness boundary should have been defined before implementation, not discovered during final regression.**

Story 5.2 spent multiple RalphLoop iterations discovering that `bun test` mixed incompatible test families. The root cause was architectural: no one defined which test runner owns which test type. If we had established "Vitest owns unit/integration, Playwright owns E2E, Bun-native owns only Bun-specific tests" before Epic 2, Story 5.2 would have been a packaging exercise instead of a debugging marathon.

This is the tar pit pattern: no single test failure seems difficult, but the accumulation of incompatible test families creates inertia that blocks the final regression gate.

## What Went Well

- The startup-validator connection timeout fix (Story 5.2) was a clean, minimal, reversible fix that addressed the root cause rather than working around the symptom.
- The cutover gate document (Story 5.3) establishes a real operational runbook with explicit verification points, not a ceremonial checklist.
- The Team RAM retrospective (Story 5.4) honestly assessed that 3 of 10 agents were never used and proposed restructuring rather than preserving the unused structure.
- Evidence-first Done gates continued to work: no story was trusted without validation output.

## What Was Hard

- The `bun test` timeout was a legitimate closeout blocker that required multiple repair attempts before the root cause (missing connection timeouts in `startup-validator.ts`) was identified.
- RalphLoop iterations on Story 5.2 discovered new failure families rather than converging, because the test surface was too broad for bounded validation.
- Notion Work Board reconciliation remained pending across the entire epic, creating audit debt.
- Dashboard/cutover scope became a product-direction mismatch rather than an engineering blocker. The correct move was sunset/deferral, not more dashboard iteration in this path.

## Lessons Learned

1. **Define test runner boundaries before implementation.** "Which runner owns which tests?" is an architectural decision, not a cleanup task.
2. **Connection timeouts are a runtime contract, not a nice-to-have.** Services that are unreachable must fail fast, not hang.
3. **Cutover gates are operational architecture, but only for active product scope.** Once Ronin sunset the dashboard path, the cutover gate became historical evidence rather than an Engine closeout blocker.
4. **Retrospectives are most valuable when energy is lowest.** The temptation to skip them is exactly why they matter.
5. **Agent teams should be sized by actual usage, not theoretical completeness.** 10 agents with 3 unused is accidental complexity.

## Follow-Up Actions

1. **Brooks:** Keep Epic 5 closed around Engine scope and avoid reopening dashboard work without Ronin's active branch/source.
2. **Brooks:** Treat AD-33 restructuring as a separate approval decision, not an Epic 5 blocker.
3. **Hightower:** Define test runner boundary ADR (Vitest vs Bun-native vs Playwright).
4. **Hightower:** Automate Notion Work Board sync to eliminate reconciliation debt.
5. **Woz/Scout:** If Ronin provides the new dashboard branch, reconcile it as a separate dashboard project with fresh acceptance evidence.

## Validation Evidence

- `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text()); print('YAML parse passed')"` -> `YAML parse passed`
- `git diff --check -- _bmad/bmm/stories/sprint-status.yaml _bmad/bmm/stories/epic-5-retrospective.md` -> no output; clean

## Board Traceability

- Notion Engine page updated with Dashboard Sunset Decision on 2026-06-04.
- Notion Dashboard Fork Strategy page updated with Sunset Note on 2026-06-04.
