# Brief: Allura Phase 0 Correction via Team RAM

## Mission

**Mission ID:** allura-phase0-ram-claude-20260612
**Group ID:** allura-system
**Owner:** Brooks / Team RAM
**Execution:** Project-local Claude CLI

## Objective

Implement and verify the Phase 0 correction stories so Allura's route,
authorization, operational-state, checkpoint-continuation, tenant, brand, and
runtime contracts become truthful and testable.

## Approved Scope

1. Route and authorization contract reconciliation.
2. Live operational truth for Governance, Schedules, Dreams, Settings, and
   Teams.
3. True checkpoint continuation with pinned process-definition revision and
   idempotent resume.
4. Approved Allura asset restoration where the active sidebar violates canon.
5. Dashboard runtime, tenant, browser, and evidence proof after technical fixes.

Broad work-plane, operator-workspace, and desktop implementation are not part of
this mission.

## Source Of Truth

- `docs/allura/SPRINT-CHANGE-PROPOSAL-2026-06-12.md`
- `docs/allura/EPICS-13-17-GOVERNED-AI-OFFICE.md`
- `docs/reviews/IMPLEMENTATION-READINESS-2026-06-12.md`
- `docs/allura/stories/11-5-dashboard-route-parity-correction.md`
- `docs/allura/stories/11-8-permission-enforcement-correction.md`
- `docs/allura/stories/12-2-true-checkpoint-continuation.md`
- `docs/allura/stories/13-1-route-auth-contract-reconciliation.md`
- `docs/allura/stories/13-2-live-operational-truth.md`
- `docs/allura/stories/13-4-dashboard-runtime-proof.md`
- `docs/allura/BLUEPRINT.md`
- `docs/allura/SOLUTION-ARCHITECTURE.md`
- `docs/allura/DESIGN-ALLURA.md`
- `docs/allura/REQUIREMENTS-MATRIX.md`
- `docs/allura/RISKS-AND-DECISIONS.md`
- `docs/allura/DATA-DICTIONARY.md`

## Existing Worktree Constraints

The worktree is already dirty. Team RAM is not alone in the repository.

- Do not revert, overwrite, stage, or commit unrelated user changes.
- Inspect and work with existing changes in:
  - `docker-compose.yml`
  - `src/components/allura/sidebar.tsx`
  - deleted `src/middleware.ts`
  - `src/app/dashboard/teams/`
  - `_bmad/`, `docs/reviews/`, `project-context.md`, and other untracked files.
- Do not use `git reset`, `git checkout --`, or destructive cleanup.
- Do not publish, push, deploy, or change external visibility.

## Architecture Decisions

- PostgreSQL owns operational project, work-item, run, breakpoint, handoff, and
  evidence-packet state.
- Allura Brain owns governed memory, receipts, decisions, and approved
  writeback candidates.
- Neo4j is semantic projection, not operational board/run state.
- All database and API paths enforce `group_id`.
- Resume must use an immutable pinned process-definition revision.
- Completed side effects must not execute again.
- Allura is the visible product identity. Use approved assets from
  `public/brand/`; do not draw or generate replacement logos.
- Static operational claims must become live, unknown, or degraded.

## Team Routing

- **Brooks:** architecture integrity, sequencing, final integration.
- **Scout:** inspect current code/tests and report root causes before edits.
- **Woz:** TypeScript/Next.js implementation.
- **Knuth:** PostgreSQL run-definition/runtime persistence and idempotency.
- **Pike:** API, authorization, and interface review.
- **Fowler:** maintainability and regression review.
- **Hightower:** runtime start path, smoke proof, and diagnostics.

## Required Process

1. Search Allura Brain before implementation.
2. Inspect failing tests and current implementation; record root cause.
3. Implement in bounded slices, keeping tests close to each change.
4. Run targeted tests after each slice.
5. Run typecheck and the relevant broader suite.
6. Start the dashboard and run the real browser/integration journey where
   feasible.
7. Update story status/evidence only after proof.
8. Write the outcome to Allura Brain.

## Verification Gates

1. Route parity suite passes.
2. Permission suite proves `401` unauthenticated and `403` forbidden.
3. Checkpoint integration proves:
   `start -> block -> approve -> resume -> complete -> replay`.
4. Static operational surfaces have ready/empty/error/stale/degraded tests.
5. TypeScript passes.
6. Dashboard start path and core route smoke pass.
7. Browser console/network evidence is recorded.
8. No unrelated worktree changes are reverted.

## Output Contract

Return:

- files changed;
- root causes found;
- commands and exact test counts;
- runtime/browser evidence;
- remaining blockers;
- status of each Phase 0 story;
- Allura memory/writeback ID;
- whether the mission is technically verified or still needs IRIS/TALON review.

## Definition Of Done

Phase 0 is technically complete only when every verification gate above passes.
Passing unit tests alone is not sufficient. IRIS product-feel approval and
TALON ship readiness remain separate downstream gates.

