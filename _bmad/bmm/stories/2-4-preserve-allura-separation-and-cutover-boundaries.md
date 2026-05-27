# Story 2.4: Preserve `/allura` Separation and Cutover Boundaries

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD execution artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As Brooks, I want `/dashboard` and `/allura` route boundaries documented and enforced, so that dashboard rebuild work does not accidentally replace Mission Control or the protected `3100` target.

## Acceptance Criteria

- Given `/allura` remains a separate Mission Control surface, when dashboard work changes routes or navigation, then `/allura` remains unchanged unless a story explicitly owns that surface.
- `3100` replacement remains blocked until Epic 5 cutover evidence passes.
- Allura Brain drift checks catch any prior decision about route targets or cutover that conflicts with the change.
- Targeted role/SoD/audit coverage exists for the first Story 2.4 evidence card (`CARD-2.4-E`) and `bun test src/lib/memory/__tests__/approval-audit.test.ts` passes under Bun without `vi.mocked`.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 2.4.
- Traceability: Epic 2 -> FR14, FR15 -> route boundary evidence.
- Validation targets from local governance:
  - `bun test src/lib/memory/__tests__/approval-audit.test.ts`
  - `bun test src/lib/dashboard/__tests__/allura-route.test.ts`
  - `bun run typecheck`
  - `git diff --check -- docs/allura/DESIGN-ALLURA.md _bmad/bmm/planning/epics.md _bmad/bmm/stories/2-4-preserve-allura-separation-and-cutover-boundaries.md _bmad/bmm/stories/sprint-status.yaml`
- Story 2.1 established `/dashboard` shell source/degraded declarations and `/allura` adapter policy binding.
- Story 2.2 established no-fabrication dashboard states and group-scoped dashboard reads.
- Story 2.3 established route-level empty/degraded copy and retry/next-action guidance without changing `/allura`.
- Current `/allura` route files are `src/app/(main)/allura/layout.tsx` and `src/app/(main)/allura/page.tsx`; this story must not modify them unless Brooks explicitly records a `/allura` ownership decision.
- Existing route boundary contract lives in `src/lib/dashboard/allura-route.ts` with tests in `src/lib/dashboard/__tests__/allura-route.test.ts`.
- Existing approval audit implementation lives in `src/lib/memory/approval-audit.ts` with tests in `src/lib/memory/__tests__/approval-audit.test.ts`; keep the test Bun-native and do not introduce `vi.mocked`.
- `docs/allura/DESIGN-ALLURA.md` already states `localhost:3100` is protected until route parity, visual parity, adapter/source-of-truth declarations, auth validation, smoke tests, no-fabricated-data checks, and rollback documentation pass.
- Notion Work Board remains canonical; local sprint status is reconciliation only.

### Allura Drift Gate — Ready

- Brain query run: `allura separation cutover boundaries blockers decisions outcomes` with `group_id=allura-system`.
- Relevant memory context:
  - Notion remains the source of truth for planning/status decisions.
  - Allura Brain is audit/context, not proof of Done.
  - `group_id=allura-system` and the `allura-*` namespace are mandatory.
  - No autonomous Neo4j promotion or direct semantic mutation is allowed.
- Drift classification: no critical drift found locally. The only active limitation is that Notion board update tooling is unavailable in this runtime, so board reconciliation remains pending.
- Drift validation run before Ready:
  - `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text()); print('YAML parse passed')"` -> `YAML parse passed`
  - `git diff --check -- docs/allura/DESIGN-ALLURA.md _bmad/bmm/planning/epics.md` -> no output

## Tasks/Subtasks

- [x] Run Story 2.4 Allura drift gate before implementation and record Ready/Done evidence. (AC: 3)
- [x] Add RED route-boundary tests proving `/dashboard` navigation does not target `/allura`, `/allura` remains the Allura Brain route, and `3100` cutover remains protected until Epic 5 evidence. (AC: 1, 2)
- [x] Add RED role/SoD/audit tests for `CARD-2.4-E` in `approval-audit.test.ts`, keeping the suite Bun-native and free of `vi.mocked`. (AC: 4)
- [x] Implement the minimal route/cutover and approval-audit contract code needed to satisfy the RED tests without changing `/allura` route files. (AC: 1, 2, 4)
- [x] Run targeted validation and record exact output. (AC: 1-4)
- [x] Run Pike/Fowler code review or documented gate-equivalent review and resolve blockers. (AC: 1-4)
- [x] Log outcome to Allura Brain and update local BMAD evidence. (AC: 3)

## Dev Agent Record

### Debug Log

- 2026-05-24: Story opened from Epic 2 backlog. Real Scout recon and Allura Brain search completed before story creation.
- 2026-05-24: Ready drift gate found no local critical drift. Notion board tooling is unavailable, so board reconciliation remains pending.
- 2026-05-24: RED route-boundary test failed because `assertDashboardNavigationPreservesAlluraSeparation` was not exported from `src/lib/dashboard/allura-route.ts`.
- 2026-05-24: RED approval-audit test failed because `SegregationOfDutiesError` was not exported from `src/lib/memory/approval-audit.ts`.
- 2026-05-24: Pike/Fowler review found blockers: route guard missed `/allura` subpaths/fragments, approval audit role/SoD was not wired into production approval route, duplicate legacy route audit inserts bypassed the governed audit path, and the route test mock polluted combined test execution.
- 2026-05-24: Review blockers resolved by normalizing `/allura` route-family checks, wiring requester/role metadata into `logApprovalEvent`, removing duplicate legacy audit event inserts, exercising the actual approval audit module in route tests, and adding a transaction/advisory-lock production path for audit idempotency.

### Completion Notes

- Added an explicit dashboard/allura cutover boundary contract that keeps `/dashboard` navigation from owning `/allura` and keeps `3100` replacement blocked until Epic 5 cutover evidence exists.
- Added role/segregation-of-duties audit checks for approval events: requester and approver must differ when requester is known, and decision actors below curator role are rejected.
- Wired approval audit role/SoD metadata into the production curator approval route by resolving source trace requester identity and passing the authenticated decision actor role.
- Removed duplicate legacy `proposal_approved` / `proposal_rejected` inserts from the approval route so proposal decisions use the governed approval-audit path.
- Preserved existing `/allura` route files unchanged.
- Validation evidence:
  - RED route-boundary: `bun test src/lib/dashboard/__tests__/allura-route.test.ts` failed with `Export named 'assertDashboardNavigationPreservesAlluraSeparation' not found`.
  - RED approval-audit: `bun test src/lib/memory/__tests__/approval-audit.test.ts` failed with `Export named 'SegregationOfDutiesError' not found`.
  - GREEN targeted: `bun test src/lib/memory/__tests__/approval-audit.test.ts src/lib/dashboard/__tests__/allura-route.test.ts`: `25 pass`, `0 fail`, `121 expect() calls`.
  - Review-fix GREEN combined: `bun test src/lib/memory/__tests__/approval-audit.test.ts src/lib/dashboard/__tests__/allura-route.test.ts src/__tests__/curator-approve-route.test.ts`: `27 pass`, `0 fail`, `137 expect() calls`.
  - `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
  - YAML parse: `YAML parse passed`.
  - Targeted `git diff --check`: no output.
- Review evidence: Pike final re-review reported no blocking findings; Fowler final re-review reported no blocking findings.
- Brain outcome memory: `8d6f06a0-a0bf-4bfc-9587-0316ef3dcc81`.

### File List

- `_bmad/bmm/stories/2-4-preserve-allura-separation-and-cutover-boundaries.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/lib/dashboard/allura-route.ts`
- `src/lib/dashboard/__tests__/allura-route.test.ts`
- `src/lib/memory/approval-audit.ts`
- `src/lib/memory/__tests__/approval-audit.test.ts`
- `src/app/api/curator/approve/route.ts`
- `src/__tests__/curator-approve-route.test.ts`

## Change Log

- 2026-05-24: Created Story 2.4 execution artifact and moved local sprint reconciliation state to ready-for-dev.
- 2026-05-24: Added route/cutover boundary contract and approval audit role/SoD tests; moved story to review.
- 2026-05-24: Resolved code review blockers, completed validation, and moved story to Done.
