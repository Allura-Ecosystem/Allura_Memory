# Story 3.2: Show Memory Detail and Evidence Chain

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As an operator,
I want a memory detail view with provenance and evidence chain,
So that I can understand why a memory exists and whether it is approved, pending, or deprecated.

## Traceability

Epic 3 -> FR3 -> detail evidence -> `bun test src/lib/memory/api-schemas.test.ts src/agents/memory-wrapper.test.ts`

## Acceptance Criteria

- [x] Given a memory ID is selected, when the detail view loads, then it shows content, source, actor/user, timestamp, status, confidence/score, `group_id`, source event/proposal references when present, and deprecated/version state.
- [x] Missing evidence is shown as unavailable, not invented.
- [x] No approval or mutation action is exposed in this read-only story.

## Allura Drift Gate

- Story: `3-2-show-memory-detail-and-evidence-chain — Show Memory Detail and Evidence Chain`
- Brain query: `Story 3.2 memory detail evidence chain blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `prop-arch-scope-resolution`: every memory call carries tenant/group/project/agent/session identity.
  - `prop-arch-append-only`: memory operations are append-only; updates create new versions with `SUPERSEDES` rather than mutation.
  - `prop-arch-soc2-promotion`: semantic activation requires curator scoring and human approval.
  - `mem-33e1d9be65b38174`: Notion remains canonical for planning/status.
- Compared against: `_bmad/bmm/planning/epics.md`, `_bmad/bmm/stories/sprint-status.yaml`, `src/app/memory/[id]/page.tsx`, `src/lib/memory/api-schemas.ts`, `packages/sdk/src/types.ts`.
- Drift classification: `minor` — existing memory detail UI showed basic source/confidence but the API/schema detail contract did not preserve `group_id`, status, source event/proposal references, or explicit unavailable evidence items.
- Disposition: fixed in this story.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Run Story 3.2 Allura drift gate before implementation.
- [x] Add RED coverage for memory detail provenance fields and read-only evidence chain behavior.
- [x] Extend memory detail schemas/contracts to preserve read-only provenance/evidence fields.
- [x] Render detail provenance, evidence-chain unavailable states, and read-only actions in the memory detail page.
- [x] Run targeted validation and record exact output.
- [x] Run Pike/Fowler/Knuth review and resolve blocking findings.
- [x] Log outcome to Allura Brain and update local BMAD evidence.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 3.2.
- Existing detail route: `src/app/memory/[id]/page.tsx`.
- API/schema contract: `src/lib/memory/api-schemas.ts` and `packages/sdk/src/types.ts`.
- Keep Epic 3 read-only: do not add approval, promotion, deletion, or edit affordances as part of this story.
- Missing evidence must be visible as unavailable rather than filled with fabricated IDs.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED schema/detail-view tests, GREEN helper/schema/page updates, REFACTOR only while tests remain green.

### Debug Log

- 2026-05-24: Scout hydration found Story 2.3 and Epic 2 already Done locally; next unfinished story is Epic 3 Story 3.2.
- 2026-05-24: Drift gate searched Brain for Story 3.2 memory detail evidence chain blockers decisions outcomes with `group_id=allura-system`.
- 2026-05-24: RED tests failed because memory_get schema stripped provenance/evidence fields and `src/lib/memory/detail-view` did not exist.
- 2026-05-24: Pike/Fowler review found read-only blockers: legacy edit/delete/restore request plumbing remained, missing `group_id` was defaulted from local scope, deleted-list fallback lacked deleted status, and canonical `evidence` entries were ignored.
- 2026-05-24: Root cause: the detail page still mixed legacy mutation UI behavior with the new read-only provenance story, and the evidence helper rebuilt a synthetic chain from legacy fields instead of honoring canonical evidence entries first.

### Completion Notes

- Added optional read-only memory detail provenance fields to memory API and SDK schemas: `group_id`, `status`, `source_event_id`, `proposal_id`, `trace_ref`, and `evidence`.
- Reconciled memory list input back to the canonical contract: `user_id` is optional for tenant-scoped/admin list views while wrapper calls may still supply it for user-scoped listing.
- Added `buildMemoryEvidenceChain()` to render available event/proposal/trace references and explicit unavailable placeholders for missing evidence.
- Updated `/memory/[id]` to show tenant scope, actor, status, created timestamp, evidence-chain entries, and read-only actions (`Copy memory ID`, `Retry load`) instead of surfacing approval/promotion actions.
- Ralph iteration 2/4 review fixes removed exposed edit/delete/restore controls from the read-only detail page, preserved canonical evidence entries when returned by the API, displayed missing tenant scope as `Unavailable`, and marked deleted-list fallback records with `status: "deleted"`.
- Validation evidence:
  - RED: `bun test src/lib/memory/detail-view.test.ts src/lib/memory/api-schemas.test.ts` failed because detail evidence fields were stripped and `@/lib/memory/detail-view` was missing.
  - GREEN: `bun test src/lib/memory/detail-view.test.ts src/lib/memory/api-schemas.test.ts src/app/memory/[id]/page.test.tsx` passed with `89 pass`, `0 fail`, `103 expect() calls`.
  - `bun run typecheck` passed with `tsc --noEmit` and no TypeScript output after the command line.
  - Targeted `git diff --check` passed with no output.
- Ralph iteration 2 closure validation:
  - `bun test src/lib/memory/detail-view.test.ts src/lib/memory/api-schemas.test.ts src/app/memory/[id]/page.test.tsx` passed with `86 pass`, `0 fail`, `104 expect() calls`.
  - `bun run typecheck` passed with `tsc --noEmit` and no TypeScript output after the command line.
  - `git diff --check -- src/app/memory/[id]/page.tsx src/app/memory/[id]/page.test.tsx src/lib/memory/detail-view.ts src/lib/memory/detail-view.test.ts` produced no output.
- Ralph iteration 4 closure validation:
  - `bun test src/lib/memory/detail-view.test.ts src/lib/memory/api-schemas.test.ts src/app/memory/[id]/page.test.tsx src/agents/memory-wrapper.test.ts` passed with `111 pass`, `0 fail`, `143 expect() calls`.
  - `bun run typecheck` passed with `tsc --noEmit`.
  - `cd packages/sdk && bun run typecheck` passed with `tsc --noEmit`.
  - Targeted `git diff --check` produced no output.
- Review evidence: Pike final re-review approved with no blocking interface/contract findings. Fowler final re-review approved after SDK dist runtime/declaration drift was fixed. Knuth subagent returned empty output, so Brooks performed a gate-equivalent data/schema review from source, SDK dist, and validation evidence.
- Brain outcome memory: `3f4eb265-bbde-4f40-b59b-67a79b116f39`; Ralph iteration 4 closure memory: `d8db40b0-9361-402e-b367-a593dde8d476`.
- Notion Work Board update: pending; no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/3-2-show-memory-detail-and-evidence-chain.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/app/memory/[id]/page.tsx`
- `src/app/memory/[id]/page.test.tsx`
- `src/lib/memory/api-schemas.ts`
- `src/lib/memory/api-schemas.test.ts`
- `src/lib/memory/detail-view.ts`
- `src/lib/memory/detail-view.test.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/dist/index.js`
- `packages/sdk/dist/index.cjs`
- `packages/sdk/dist/index.d.ts`
- `packages/sdk/dist/index.d.cts`

## Change Log

- 2026-05-24: Created Story 3.2 execution artifact and completed read-only memory detail provenance/evidence-chain slice pending final review and Brain outcome receipt.
- 2026-05-24: Resolved Ralph iteration 2 review blockers, completed final validation/re-review, and logged Brain outcome memory `3f4eb265-bbde-4f40-b59b-67a79b116f39`.
- 2026-05-24: Resolved Ralph iteration 4 SDK dist/list-contract review blockers and logged closure memory `d8db40b0-9361-402e-b367-a593dde8d476`.
