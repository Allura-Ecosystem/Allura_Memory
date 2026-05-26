# Epic 5 Retrospective: Runtime Reliability, Cutover, and Final Evidence

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a BMAD retrospective artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Optional — pending all Epic 5 stories reaching Done.

## Epic Summary

Epic 5 completed the runtime reliability, cutover gate, and final evidence closeout for the Allura Memory project.

Completed stories:

- `5-1-verify-runtime-health-and-recovery-baseline` — runtime health validation, startup validator, and recovery baseline.
- `5-2-package-final-regression-and-sprint-evidence` — final regression harness, startup-validator connection timeout fix, and sprint evidence packet.

Remaining stories:

- `5-3-document-3100-cutover-and-rollback-gate` — cutover gate document with pre-cutover checklist, procedure, rollback, decision authority, and monitoring window. **Draft produced; gates not yet verified.**
- `5-4-complete-final-team-ram-retrospective-and-closeout-decision` — Team RAM retrospective and AD-33 closeout/restructuring decision. **Draft produced; drift gate not yet run.**

## Allura Drift Gate

- Brain query: `Epic 5 retrospective runtime reliability cutover final evidence blockers decisions outcomes`
- group_id: `allura-system`
- Drift classification: pending until all stories are Done.

## Question 1: Did We Deliver What We Promised?

| Promise | Delivered | Evidence | Gap |
|---------|-----------|----------|-----|
| Runtime health and recovery baseline | ✅ Yes | Story 5.1: 46 health tests pass, startup validator, connection timeout fix | None |
| Final regression and sprint evidence | ✅ Yes | Story 5.2: `bun run test` 1960 pass / 0 fail, typecheck clean, YAML parse OK | `bun test` (Bun-native) still has broad failures; Vitest suite is green |
| 3100 cutover and rollback gate | ⬜ Draft | Story 5.3: gate document produced with 9 gates, procedure, rollback, decision authority | Gates not yet verified; Captain approval not yet recorded |
| Team RAM retrospective and closeout | ⬜ Draft | Story 5.4: retrospective produced with AD-33 restructuring proposal | Drift gate not yet run; restructuring not yet approved |

**Verdict:** Core runtime reliability delivered. Cutover gate and closeout decision are drafted but not yet verified. Epic 5 is **not complete** until 5-3 and 5-4 pass their gates.

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
- The cutover gate requires Captain approval, which cannot be automated and must wait for human review.

## Lessons Learned

1. **Define test runner boundaries before implementation.** "Which runner owns which tests?" is an architectural decision, not a cleanup task.
2. **Connection timeouts are a runtime contract, not a nice-to-have.** Services that are unreachable must fail fast, not hang.
3. **Cutover gates are operational architecture.** They define *what must be true*, not *how the code works*. They belong in the project from the start, not as a final deliverable.
4. **Retrospectives are most valuable when energy is lowest.** The temptation to skip them is exactly why they matter.
5. **Agent teams should be sized by actual usage, not theoretical completeness.** 10 agents with 3 unused is accidental complexity.

## Follow-Up Actions

1. **Brooks:** Complete Story 5-3 gate verification and seek Captain approval for cutover.
2. **Brooks:** Complete Story 5-4 drift gate and seek team approval for AD-33 restructuring.
3. **Hightower:** Define test runner boundary ADR (Vitest vs Bun-native vs Playwright).
4. **Hightower:** Automate Notion Work Board sync to eliminate reconciliation debt.
5. **Brooks:** After 5-3 and 5-4 are Done, mark Epic 5 as done and close the project.

## Validation Evidence

- `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text()); print('YAML parse passed')"` -> pending
- Targeted `git diff --check` for sprint status and retrospective artifact -> pending

## Board Traceability

- Notion Work Board update pending; no authorized Notion tooling is available in this runtime.