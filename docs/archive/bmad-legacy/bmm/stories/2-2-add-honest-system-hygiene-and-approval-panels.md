# Story 2.2: Add Honest System, Hygiene, and Approval Panels

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD execution artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As an operator, I want dashboard panels for system truth, hygiene/actions, and approvals, so that I can see what is true, what needs action, and what needs approval without fake healthy states.

## Acceptance Criteria

- Given dashboard data is unavailable, partial, or degraded, when panels render, then they show `unknown`, `degraded`, `empty`, or `failed` states honestly.
- No placeholder metrics, fabricated counts, or unlabeled samples appear.
- Data reads remain scoped by `group_id`.
- Allura drift checks compare panel claims against prior no-fabrication lessons.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 2.2.
- Traceability: Epic 2 -> FR10, FR11 -> panel validation evidence.
- Validation target from epic: `bun test src/__tests__/dashboard-schemas.test.ts src/__tests__/health-metrics-scope.test.ts`.
- Bun-native health metrics test currently uses Vitest `vi.hoisted`; if Bun native fails, run through the configured Vitest script via Bun and record exact output.
- Story 2.1 established shell source/degraded declarations and dashboard guard compliance.
- No-fabrication invariant: do not turn unavailable data into healthy/clear/zero states.
- Notion Work Board remains canonical; local sprint status is reconciliation only.

## Tasks/Subtasks

- [x] Run Story 2.2 Allura drift gate before implementation.
- [x] Add RED tests for honest panel state mapping and scoped health reads.
- [x] Implement minimal system/hygiene/approval panel state model and render it on `/dashboard`.
- [x] Run targeted validation and record exact output.
- [x] Run Pike/Fowler review and resolve blockers.
- [x] Log outcome to Allura Brain and update local BMAD evidence.

## Dev Agent Record

### Debug Log

- 2026-05-24: Story opened from Epic 2 backlog. Scout hydration and Brain search completed before edits.
- 2026-05-24: RED test confirmed missing `@/lib/dashboard/honest-panels` module before implementation.
- 2026-05-24: Bun-native health scope command failed because `vi.hoisted` is unavailable in Bun's Vitest shim; configured Vitest command passed.
- 2026-05-24: Pike/Fowler review blockers fixed: onboarding no longer appears before truth panels settle, default health panel reads are scoped, warning-only degraded panels no longer render `Count: 0`, and confidence displays as normalized percent.

### Completion Notes

- Added `loadHonestDashboardPanels(groupId)` to produce explicit `unknown`, `degraded`, `empty`, `failed`, or `ready` states for system truth, hygiene actions, and approvals.
- Added regression coverage that failed first for missing honest panel module, then passed after implementation.
- Rendered the three honest panels on `/dashboard` without placeholder metrics or sample data claims.
- Kept health, policy, and curator queue reads scoped by `group_id`.
- Validation evidence:
  - `bun test src/lib/dashboard/__tests__/api.test.ts` initially failed with missing module for `@/lib/dashboard/honest-panels`.
  - `bun test src/lib/dashboard/__tests__/api.test.ts src/__tests__/dashboard-schemas.test.ts src/lib/dashboard/__tests__/allura-route.test.ts`: `39 pass`, `0 fail`, `147 expect() calls`.
  - `bun run typecheck`: `tsc --noEmit`, no output after command line.
  - `bash .github/scripts/dashboard-guard.sh`: `✅ Dashboard guard passed — no resurrection artifacts found.`
  - `bun test src/__tests__/health-metrics-scope.test.ts`: failed with `TypeError: vi.hoisted is not a function` as expected from Story 1.1 known runner limitation.
  - `bun run test -- src/__tests__/health-metrics-scope.test.ts`: `1 passed`, `3 passed`.
  - YAML parse and targeted `git diff --check`: no output.

## File List

- `_bmad/bmm/stories/2-2-add-honest-system-hygiene-and-approval-panels.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/lib/dashboard/honest-panels.ts`
- `src/lib/dashboard/api.ts`
- `src/lib/dashboard/__tests__/api.test.ts`
- `src/app/(main)/dashboard/page.tsx`

## Change Log

- 2026-05-24: Created Story 2.2 execution artifact and started implementation.
- 2026-05-24: Added honest dashboard panel model, tests, and `/dashboard` rendering.
- 2026-05-24: Resolved review blockers and finalized validation evidence.
- Review evidence: Pike final re-review reported no findings; Fowler final re-review reported no blocking findings and one low nonblocking note that `loadCuratorQueue("pending")` still also fetches approved proposals.
- Brain outcome memory: `108e2842-437a-4fa4-a9ae-e7bba23b0a6a`.
