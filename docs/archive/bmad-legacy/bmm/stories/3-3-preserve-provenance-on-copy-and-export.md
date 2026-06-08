# Story 3.3: Preserve Provenance on Copy and Export

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As an operator,
I want copy/export actions to include provenance metadata,
So that external review preserves source, actor, timestamp, tenant, status, confidence, and evidence/hash fields.

## Traceability

Epic 3 -> FR25 -> export evidence -> `bun test src/lib/memory/provenance-export.test.ts src/lib/memory/detail-view.test.ts src/app/memory/[id]/page.test.tsx`

## Acceptance Criteria

- [x] Given a memory, audit, or evidence record is copied, when the clipboard payload is produced, then it includes source, actor/creator/approver, timestamp, `group_id`, status, confidence/score, evidence IDs, and hash/previous-hash fields when present.
- [x] Given a memory, audit, or evidence record is exported, when the export payload is produced, then it includes the same provenance metadata in a human-readable format.
- [x] Missing provenance fields are labeled as unavailable or omitted with an explicit degraded note; they are never fabricated.
- [x] Export or clipboard failures render explicit degraded states.
- [x] Copy/export remains read-only and does not call memory add, update, delete, restore, promote, direct PostgreSQL mutation, or Neo4j mutation paths.

## Allura Drift Gate

- Story: `3-3-preserve-provenance-on-copy-and-export — Preserve Provenance on Copy and Export`
- Brain query: `Story 3.3 preserve provenance on copy and export blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `mem-33e1d9be65b38174`: Notion remains the planning/source-of-truth surface; local story files are reconciliation artifacts.
  - `prop-arch-scope-resolution`: memory calls carry tenant/group/project/agent/session identity.
  - `prop-session-issue7`: non-`allura-*` group IDs are blocked by scope constraints.
  - `mem-3371d9be65b3806a`: repository documentation standards govern AI-assisted workflow artifacts.
- Compared against:
  - `_bmad/bmm/planning/epics.md` Story 3.3 and Epic 3 done condition.
  - `_bmad/bmm/stories/3-2-show-memory-detail-and-evidence-chain.md` read-only detail and canonical evidence-chain learnings.
  - `src/app/memory/[id]/page.tsx` current copy affordance.
  - `src/lib/memory/detail-view.ts` current evidence-chain helper.
  - `src/lib/memory/api-schemas.ts` memory export/detail contracts.
- Drift classification: `minor` — current detail page copies only the raw memory ID, which is safe but insufficient for FR25 provenance-preserving copy/export.
- Disposition: proceed; implement a small read-only formatter/helper and wire the copy/export affordances to it.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Add RED coverage for provenance-preserving copy/export payload formatting.
  - [x] Include source, actor/user or creator/approver, timestamp, `group_id`, status, score/confidence, evidence IDs, hash, and previous-hash when present.
  - [x] Prove missing fields are unavailable/degraded rather than invented.
- [x] Implement a small read-only provenance export formatter in `src/lib/memory/` or `src/lib/audit/` following existing schema shapes.
- [x] Wire `/memory/[id]` copy/export actions to use the formatter without adding mutation actions.
- [x] Add degraded-state coverage for clipboard/export failure.
- [x] Run targeted validation and record exact output.
- [x] Run Pike/Fowler/Knuth review and resolve blocking findings.
- [x] Log outcome to Allura Brain and update local BMAD evidence.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 3.3.
- Previous story learning: Story 3.2 had review blockers because legacy mutation behavior remained in a read-only detail surface and canonical evidence entries were ignored. Do not reintroduce edit/delete/restore/promote/approve behavior here.
- Existing detail route: `src/app/memory/[id]/page.tsx` currently has a safe but insufficient `Copy memory ID` action.
- Existing evidence helper: `src/lib/memory/detail-view.ts` now preserves canonical `evidence` entries before falling back to legacy source-event/proposal/trace refs.
- Existing memory schemas: `src/lib/memory/api-schemas.ts` includes `MemoryExportInputSchema` and `MemoryExportOutputSchema`; use these contracts as evidence, not as permission to mutate.
- Keep Epic 3 read-only: no approval, promotion, deletion, restore, edit, or direct store mutation behavior.
- Prefer a pure formatter function that accepts a plain object and returns a deterministic text or JSON-safe payload. UI code should call the formatter and then clipboard/download APIs only.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED provenance formatter/copy-export tests, GREEN minimal formatter/UI wiring, REFACTOR only while tests remain green.

### Debug Log

- 2026-05-24: Story created from Epic 3.3 after Story 3.2 closure. Drift gate searched Brain with `group_id=allura-system` and found no blocker, but found source-of-truth and tenant-scope reminders.
- 2026-05-24: RED provenance formatter/page tests caught missing evidence-chain export wiring, collapsed actor labeling, and mixed canonical/legacy evidence loss.
- 2026-05-24: Pike/Fowler review found blockers for role collapse, dropped legacy evidence, stale story evidence, and weak degraded-state coverage; blocker tests and fixes were added.
- 2026-05-24: Final review closure found one more provenance correctness issue: version-only memories produced synthetic superseding evidence and partial canonical evidence could hide unavailable markers. Fixed by only adding superseding evidence when `superseded_by` exists and preserving unavailable proposal/trace markers when canonical evidence is partial.
- 2026-05-24: Ralph iteration 5 re-review found additional contract drift: user_id was being relabeled as actor, SDK/schema outputs omitted provenance fields, and curator sync-contract linkage could fall back to the curator or rely on a non-selected proposal creator. Fixed by separating Actor/User, adding SDK/schema provenance fields, and using source trace requester for authored-by linkage.

### Completion Notes

- Added a pure read-only provenance export formatter that emits human-readable source, provenance, actor/user, creator, approver, timestamp, `group_id`, status, score/confidence, evidence, hash, and previous-hash fields.
- Wired `/memory/[id]` copy/export actions to export provenance text instead of raw ID-only copy while preserving the read-only boundary and explicit clipboard/download degraded messages.
- Preserved mixed canonical and legacy evidence IDs for copy/export and on-screen evidence chains without fabricating missing fields.
- Removed read-side edit/delete/restore affordances from the memory detail page.
- Validation evidence:
  - RED: `bun test src/lib/memory/provenance-export.test.ts src/app/memory/[id]/page.test.tsx` failed on missing `evidence: evidenceChain` page wiring.
  - RED: `bun test src/lib/memory/provenance-export.test.ts src/lib/memory/detail-view.test.ts src/app/memory/[id]/page.test.tsx` failed on mixed canonical/legacy evidence loss and evidence-row key coverage.
  - GREEN targeted: `bun test src/lib/memory/provenance-export.test.ts src/lib/memory/detail-view.test.ts src/app/memory/[id]/page.test.tsx`: `33 pass`, `0 fail`, `91 expect() calls`.
  - Final closure: `bun test src/lib/memory/provenance-export.test.ts src/lib/memory/detail-view.test.ts src/lib/memory/api-schemas.test.ts src/app/memory/[id]/page.test.tsx` passed with `106 pass`, `0 fail`, `175 expect() calls`.
  - Ralph iteration 5 closure: `bun test src/__tests__/curator-approve-route.test.ts packages/sdk/__tests__/memory.test.ts src/lib/memory/provenance-export.test.ts src/lib/memory/detail-view.test.ts src/app/memory/[id]/page.test.tsx src/lib/memory/api-schemas.test.ts` passed with `135 pass`, `0 fail`, `246 expect() calls`.
  - `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
  - YAML parse: `YAML parse passed`.
  - Targeted `git diff --check`: no output.
- Review evidence: Pike and Fowler review blockers were resolved through targeted tests/fixes. Fowler final re-review approved. Pike's final scoped blocker on synthetic superseding evidence and partial canonical evidence was resolved with new regression coverage and final validation. Ralph iteration 5 Pike closure re-review approved with no blocking findings after actor/user, SDK/schema, and curator requester-linkage fixes. Knuth subagent returned empty output in this runtime, so Brooks performed gate-equivalent data/schema review from source and tests.
- Brain outcome memory: `4487d5e2-7397-468a-9f00-9a12ec367400`; Ralph iteration 5 closure memory: `470aa0fe-e27c-44bf-952e-649970813b1d`.
- Notion Work Board update: pending; no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/3-3-preserve-provenance-on-copy-and-export.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `packages/sdk/__tests__/memory.test.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/dist/index.cjs`
- `packages/sdk/dist/index.d.cts`
- `packages/sdk/dist/index.d.ts`
- `packages/sdk/dist/index.js`
- `src/__tests__/curator-approve-route.test.ts`
- `src/app/api/curator/approve/route.ts`
- `src/lib/dashboard/mappers.ts`
- `src/lib/memory/provenance-export.ts`
- `src/lib/memory/provenance-export.test.ts`
- `src/lib/memory/detail-view.ts`
- `src/lib/memory/detail-view.test.ts`
- `src/app/memory/[id]/page.tsx`
- `src/app/memory/[id]/page.test.tsx`

## Change Log

- 2026-05-24: Created ready-for-dev story with drift gate, acceptance criteria, implementation guardrails, and Story 3.2 review learnings.
- 2026-05-24: Added provenance-preserving copy/export formatter and memory detail wiring; moved story to review pending final blocker re-review and Brain outcome logging.
- 2026-05-24: Completed final validation, review blocker resolution, Brain outcome logging, and local Done evidence packet.
- 2026-05-24: Ralph iteration 5 resolved additional provenance contract drift in actor/user separation, SDK/schema fields, and curator sync-contract requester linkage.
