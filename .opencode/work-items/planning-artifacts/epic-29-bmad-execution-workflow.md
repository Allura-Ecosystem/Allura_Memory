# Epic 29 — BMAD Execution Workflow

**Date:** 2026-09-08  
**Goal:** `goal-20260908-2034`  
**Model lock:** Use the current Hermes model, `gpt-5.6-sol` through `openai-codex`, for implementation and review passes. Do not use Mimo or substitute another coding model.  
**Status:** Approved by Sabir on 2026-09-08; Story 29.1 may begin.

## Canonical Workflow

Epic 29 will use three top-level BMAD workflows:

1. `bmad-dev-story`
2. `bmad-code-review`
3. `bmad-retrospective`

Supporting testing, security, database, documentation, and evidence skills execute **inside** those workflows as required by each story. They are not separate replacements for the three canonical steps.

## Story Loop — Repeat for Every Story

### 1. Run `bmad-dev-story`

Process exactly one dependency-ready Story 29 file.

The dev-story pass must:

- Verify every declared dependency is `done`.
- Move the story from `backlog` to `in-progress` before implementation.
- Perform Scout hydration manually in this `gpt-5.6-sol` session:
  - read `CLAUDE.md`, `AGENTS.md`, `.opencode/context/`, canonical `docs/allura/`, the story, approved Epic 29 architecture, and relevant current code/schema/tests;
  - search Allura Brain for prior decisions and blockers;
  - state honestly when a source is unavailable.
- Load `allura-team-ram` and `allura-dev-story`.
- Load story-specific supporting skills only when applicable:
  - schema/database: `postgres-best-practices`, `schema-boundary-guard`;
  - authentication, authorization, tokens, cryptography, device trust: security review guidance and `varlock` when environment variables are touched;
  - dependencies/tooling: `bun-security` and `context7` when external APIs or current library behavior are involved;
  - all implementation: strict `test-driven-development`.
- Run a documentation-impact check against:
  - `BLUEPRINT.md`
  - `SOLUTION-ARCHITECTURE.md`
  - `DESIGN-ALLURA.md`
  - `REQUIREMENTS-MATRIX.md`
  - `RISKS-AND-DECISIONS.md`
  - `DATA-DICTIONARY.md`
- Use strict vertical-slice TDD:
  1. RED — add one acceptance/behavior test and run it to prove the expected failure.
  2. GREEN — add the minimum implementation needed and prove the test passes.
  3. REFACTOR — improve structure without changing behavior and keep tests green.
  4. Repeat for the next behavior.
- Run the story's targeted tests plus all validation lanes named in its Definition of Done.
- Update affected canonical documentation in the same change.
- Move the story to `review` only after implementation evidence exists.

### 2. Run `bmad-code-review`

Review the completed story before it can become `done`.

The code-review pass must use a fresh review context and inspect the story, acceptance criteria, changed files, complete diff, tests, and real command output. The same `gpt-5.6-sol` model executes the review, but the review pass is isolated from the builder reasoning and receives the diff as untrusted data.

Required review perspectives:

- **Acceptance auditor:** every story AC maps to implementation and evidence.
- **Blind/adversarial reviewer:** security, authorization, replay, leakage, race, and failure-mode defects.
- **Edge-case reviewer:** boundaries, invalid states, expiry, concurrency, retries, and rollback behavior.
- **Pike gate:** interface simplicity and source-of-truth clarity.
- **Fowler gate:** maintainability and component boundaries.
- **Knuth gate:** required for migrations, constraints, indexes, RLS, transactions, and database invariants.
- **Brooks gate:** required when implementation would change an approved architecture contract.

Review outcomes:

- Any BLOCK, HIGH, critical security issue, logic error, missing AC evidence, or new regression means `changes-requested`.
- Fix findings through a new RED→GREEN→REFACTOR cycle, then rerun `bmad-code-review`.
- After two unsuccessful fix/review cycles, stop and run the BMAD correct-course/escalation path with Sabir; do not weaken the acceptance criteria.
- A story becomes `done` only when review is approved, required tests pass, typecheck passes, documentation is synchronized, and evidence is written into the story file.
- Commit the approved story on the Epic 29 feature branch. Never push directly to `main`.

### 3. Advance Sprint Tracking

After review approval:

- Set the Story 29 file status to `done` and record concrete evidence.
- Set the matching `development_status` key in `sprint-status.yaml` to `done`.
- Update the work-package status only when every story in that package passes.
- Start only the next dependency-ready story.
- A skipped, unavailable, mocked, or unexecuted runtime check is not passing evidence.

## Story Order

Follow the approved dependency graph in `epic-29-work-packages.md`:

1. **WP2 Foundations:** 29.1 → 29.2 and 29.3
2. **WP3 Pairing:** 29.4 → 29.5 → 29.6
3. **WP4 Reconnect and Authority:** 29.7, 29.8, and 29.10 → 29.9 → 29.11
4. **WP5 Rotation:** 29.12 → 29.13 → 29.14
5. **WP6 Revocation and Audit:** 29.15 → 29.16 → 29.17
6. **WP7 Automated Validation:** 29.18 and 29.19
7. **WP8 External Runtime Proof:** 29.20 and 29.21
8. **WP9 Final gates and retrospective**

Where the plan permits parallel stories, this session may still execute them sequentially to preserve one-story-at-a-time review and evidence integrity.

## Baseline and Git Safety

Before Story 29.1:

1. Verify the planning artifacts and 21 stories are internally consistent.
2. Create an Epic 29 feature branch from the current repository state.
3. Commit the approved planning baseline separately from implementation.
4. Never discard or overwrite pre-existing user changes.
5. No production deployment, migration execution against production, secret change, merge, or direct `main` push without Sabir's separate approval.

## Final Epic Gate

After all 21 story loops pass:

- Reconcile AC-01 through AC-29 to concrete implementation evidence.
- Run every required local lane:
  - `bun run typecheck`
  - `bun run test:unit`
  - `bun run test:integration`
  - `bun run test:live-db`
  - `bun run test:e2e`
  - Story 29.17 credential-leak scan
  - `bun run build`
- Obtain zero-BLOCK/zero-HIGH final security and maintainability review verdicts.
- Verify required hosted CI at the reviewed commit.
- Require real B1 Clerk evidence and real B2 macOS/Windows/Linux secure-store evidence; skips and mocks do not pass.

## Run `bmad-retrospective`

Run the retrospective **once, after all 21 stories and final gates pass**. Do not run a normal retrospective after each story.

The retrospective must:

- Verify all Story 29 files, `epic-29`, and the sprint entries are `done`.
- Summarize delivered behavior, blockers, review findings, and evidence.
- Record concrete lessons and owned action items.
- Update `RISKS-AND-DECISIONS.md` with at least one evidence-based risk/lesson entry when warranted by the retrospective.
- Log the final Epic 29 outcome to Allura with honest receipt status.
- Mark `epic-29-retrospective` and the goal complete only after the retrospective is accepted.

## Stop Conditions

Stop and ask Sabir instead of guessing when:

- an approved architecture contract must change;
- B1 or B2 is unavailable;
- a destructive database, production, credential, deploy, merge, or direct-main action is required;
- two fix/review cycles fail to clear blocking findings;
- required proof cannot be executed;
- the current model cannot continue safely.

## Completion Rule

Implementation alone is not completion. Epic 29 is complete only when all 21 stories have passed `bmad-dev-story` and `bmad-code-review`, all ACs and test/build/CI/external gates have real evidence, and `bmad-retrospective` is accepted.
