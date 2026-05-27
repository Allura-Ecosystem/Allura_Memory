# Story 4.4: Show Curator Decision Receipts

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As an auditor,
I want curator decisions to show inspectable receipts,
So that every promotion decision can be traced from proposal to actor to resulting memory state.

## Traceability

Epic 4 -> FR9 -> decision receipt evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts src/app/curator/page.test.tsx src/__tests__/curator-approve-route.test.ts`

## Acceptance Criteria

- [x] Given a proposal has been approved, rejected, or returned for evidence, when the decision receipt is viewed, then it shows actor, timestamp, rationale, prior status, new status, trace reference, and promoted memory reference when available.
- [x] Missing receipts are shown as blockers/degraded receipt state, never hidden.
- [x] Receipt data maps back to append-only `events` metadata or proposal records.
- [x] Approval receipts expose the deterministic queued/promoted memory reference returned by the governed curator route.
- [x] Allura drift checks compare this behavior against HITL, append-only traces, no autonomous promotion, and Notion-canonical board constraints.

## Allura Drift Gate

- Story: `4-4-show-curator-decision-receipts — Show Curator Decision Receipts`
- Brain query: `Story 4.4 show curator decision receipts blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `prop-arch-soc2-promotion`: promotion follows SOC2/HITL approval before graph activation.
  - `mem-3401d9be65b38189`: agents cannot autonomously promote knowledge to Neo4j or Notion.
  - `mem-3401d9be65b381ad`: PostgreSQL is append-only episodic/audit store; Neo4j is versioned semantic store.
  - `mem-33e1d9be65b38174`: Notion Work Board remains canonical for planning/status.
- Compared against `_bmad/bmm/planning/epics.md` Story 4.4, Story 4.3 completion notes, `src/lib/memory/approval-audit.ts`, `src/app/api/curator/approve/route.ts`, and `src/app/curator/page.tsx`.
- Drift classification: `minor` — the route already returned live receipts, but there was no reusable mapper for append-only receipt records and missing-receipt degraded state was not represented.
- Disposition: proceed; add receipt mapper and UI receipt fields without changing proposal status semantics.
- Owner: Brooks route; Woz implementation; Pike/Fowler review.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Add RED coverage for curator decision receipt mapping.
  - [x] Prove append-only approval audit metadata maps to actor, rationale, trace reference, status transition, event type, and memory reference.
  - [x] Prove decided proposals without audit events produce a degraded blocker receipt.
- [x] Add RED coverage for UI receipt visibility.
  - [x] Prove missing-receipt fields are represented rather than hidden.
  - [x] Prove final-queue decisions keep the receipt panel inspectable after pending proposals refresh empty.
- [x] Implement the minimal receipt contract.
  - [x] Add `buildCuratorDecisionReceipt` in the approval audit module.
  - [x] Extend curator UI receipt fields for trace reference, source event type, receipt status, and degraded reason.
  - [x] Return the deterministic memory reference in approve receipts.
- [x] Run targeted validation and record exact output.
- [x] Run Pike/Fowler review and resolve blocking findings.
- [x] Log outcome to Allura Brain and update local BMAD evidence.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 4.4.
- Preserve Story 4.3 behavior: `request_evidence` remains append-only audit with proposal status `pending`.
- Do not add autonomous promotion, direct Neo4j writes, or new `canonical_proposals.status` values.
- Missing receipts are blockers/degraded state because Done evidence requires append-only audit traceability.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED receipt mapper and UI receipt visibility tests, GREEN minimal mapper/UI/route receipt alignment, REFACTOR only while targeted tests remain green.

### Debug Log

- 2026-05-24: Scout hydration found prompt steering stale; Stories 3.1-3.4, Epic 3 retrospective, and Stories 4.1-4.3 are locally Done. First actual backlog story was 4.4.
- 2026-05-24: Drift gate searched Brain with `group_id=allura-system`; HITL/no-autopromotion/append-only audit and Notion-canonical constraints applied.
- 2026-05-24: RED approval-audit test failed because `buildCuratorDecisionReceipt` was missing.
- 2026-05-24: RED curator page test failed because missing receipt blocker fields were not represented.
- 2026-05-24: Pike/Fowler review found blockers: receipt disappeared after submit and approve receipt did not expose memory reference. Fixes kept selected proposal mounted, preserved receipt panel when pending list becomes empty, and returned deterministic memory reference.

### Completion Notes

- Added `buildCuratorDecisionReceipt` to map append-only curator decision events/proposals into inspectable receipts.
- Added degraded `missing_receipt_blocker` receipts for decided proposals without append-only audit evidence.
- Extended curator UI receipt fields for trace reference, source event type, receipt status, and degraded reason.
- Kept receipt details mounted after decisions, including the final pending proposal case where refresh returns an empty queue.
- Approval route now returns the deterministic memory reference as `promoted_memory_id` and `queued_memory_id` while promotion sync remains queued.
- Validation evidence:
  - RED: `bun test src/lib/memory/__tests__/approval-audit.test.ts` failed with missing `buildCuratorDecisionReceipt` export.
  - RED: `bun test src/app/curator/page.test.tsx` failed because `receipt_status` / missing receipt blocker fields were absent.
  - GREEN: `bun test src/lib/memory/__tests__/approval-audit.test.ts src/app/curator/page.test.tsx src/__tests__/curator-approve-route.test.ts` passed with `46 pass`, `0 fail`, `187 expect() calls`; route tests intentionally log rollback fixture errors while passing.
  - `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
  - Targeted `git diff --check` produced no output.
- Review evidence: Pike re-review reported no blocking findings. Fowler initial re-review found final-pending-proposal receipt unmount blocker; fix applied and targeted validation passed.
- Brain outcome memory: `8d063bff-1038-446a-84cb-db8e5d7a1b60`.
- Notion Work Board update pending because no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/4-4-show-curator-decision-receipts.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/lib/memory/approval-audit.ts`
- `src/lib/memory/__tests__/approval-audit.test.ts`
- `src/app/api/curator/approve/route.ts`
- `src/app/curator/page.tsx`
- `src/app/curator/page.test.tsx`

## Change Log

- 2026-05-24: Created and completed Story 4.4 decision receipt slice with receipt mapper, missing receipt degraded state, UI receipt persistence, validation, and review evidence.
- Brain outcome memory: `8d063bff-1038-446a-84cb-db8e5d7a1b60`.
