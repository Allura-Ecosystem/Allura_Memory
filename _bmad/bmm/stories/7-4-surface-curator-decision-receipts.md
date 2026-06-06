# Story 7.4: Surface Curator Decision Receipts

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As an auditor,
I want every curator decision to show an inspectable receipt,
So that promotion paths are traceable from proposal to actor to resulting memory state.

## Traceability

Epic 7 -> FR6 -> receipt evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/dashboard-schemas.test.ts`

## Team RAM Routing

- **Woz:** Implementation of receipt display
- **Knuth:** Data contract review for receipt fields
- **Hightower:** Audit trail integrity review
- **Pike/Fowler:** Code review

## Acceptance Criteria

**Given** a proposal has been approved, rejected, or returned for evidence,
**When** the receipt is viewed,
**Then** it shows: actor, timestamp, rationale, prior status, new status, trace reference, and promoted memory reference when applicable.
**And** missing receipts show as degraded/blocker states, not hidden.
**And** receipt data maps to append-only events or proposal records.
**And** receipts are read-only; no mutation from the receipt view.

## Tasks / Subtasks

- [x] Add RED coverage for dashboard curator decision receipts.
  - [x] Prove receipt UI exposes actor, timestamp, rationale, prior status, new status, trace reference, and promoted memory reference.
  - [x] Prove missing receipts render degraded/blocker states instead of being hidden.
- [x] Implement minimal receipt contract on the dashboard curator surface.
  - [x] Add typed `DecisionReceipt` support to dashboard curator models.
  - [x] Preserve the returned decision receipt after approve/reject/request-evidence actions.
  - [x] Surface event-backed receipts from `/api/curator/proposals` for decided and pending evidence-requested proposals.
  - [x] Render a read-only receipt panel for decided proposals.
  - [x] Render a degraded `missing_receipt_blocker` panel for decided proposals without append-only receipt data.
- [x] Run targeted validation and record exact evidence.
- [x] Run Pike/Fowler code review and resolve blocking findings.
- [x] Log final story outcome and mark Done after review approval.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED dashboard receipt visibility tests, GREEN minimal typed receipt model/action response/detail panel, then validation.

### Debug Log

- 2026-06-06: Scout hydration found local Epic 7 story statuses stale (`backlog`) while Brain evidence showed Stories 7-1/7-2/7-3 completed; proceeded with Story 7-4 as the remaining Epic 7 slice.
- 2026-06-06: BMad resolver script `_bmad/scripts/resolve_customization.py` was unavailable; followed BMad fallback using project config and local story context.
- 2026-06-06: RED `bun test src/__tests__/curator-dashboard-actions.test.ts` failed because `DecisionReceipt`, `DecisionReceiptPanel`, and `missing_receipt_blocker` were absent.
- 2026-06-06: RED `bun test src/__tests__/curator-proposals-route.test.ts` failed because `/api/curator/proposals` queried proposals only and did not attach append-only receipt data.
- 2026-06-06: Pike/Fowler review requested changes because `request_evidence` keeps proposals `pending` and pending receipts were suppressed after refresh.
- 2026-06-06: RED pending evidence receipt test failed because `body.proposals[0].decision_receipt` was null for a `proposal_evidence_requested` event.

### Completion Notes

- Added typed dashboard `DecisionReceipt` model and typed curator decision response.
- Added read-only `DecisionReceiptPanel` on the dashboard curator detail panel.
- Preserved returned decision receipts after human-gated curator decisions so final pending proposals remain inspectable even after refresh removes them from the pending queue.
- Added event-backed receipt mapping to `/api/curator/proposals` so approved/rejected proposal reloads can surface append-only receipt evidence.
- Fixed review blocker: pending proposals now surface event-backed `proposal_evidence_requested` receipts when append-only receipt events exist.
- Preserved local receipt snapshots when a pending proposal refresh races ahead of event-backed receipt visibility.
- Added degraded missing receipt blocker state for decided proposals that lack append-only receipt data.
- Validation evidence:
  - RED: `bun test src/__tests__/curator-dashboard-actions.test.ts` failed with missing receipt model/panel/blocker strings.
  - RED: `bun test src/__tests__/curator-proposals-route.test.ts` failed because `/api/curator/proposals` queried proposals only and did not attach append-only receipt data.
  - RED: `bun test src/__tests__/curator-proposals-route.test.ts` failed for pending `request_evidence` because `decision_receipt` was null.
  - GREEN: `bun test src/__tests__/curator-dashboard-actions.test.ts` passed with `10 pass`, `0 fail`, `44 expect() calls`.
  - GREEN: `bun test src/__tests__/curator-proposals-route.test.ts` passed with `1 pass`, `0 fail`, `3 expect() calls`.
  - GREEN after pending receipt fix: `bun test src/__tests__/curator-proposals-route.test.ts src/__tests__/curator-dashboard-actions.test.ts` passed with `12 pass`, `0 fail`, `50 expect() calls`.
  - Targeted suite before review fix: `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/__tests__/curator-reject-route.test.ts src/__tests__/curator-dashboard-actions.test.ts src/__tests__/curator-proposals-route.test.ts` passed with `47 pass`, `0 fail`, `200 expect() calls`; route tests intentionally print rollback fixture errors while passing.
  - Targeted suite after review fix: same command passed with `48 pass`, `0 fail`, `203 expect() calls`; route tests intentionally print rollback fixture errors while passing.
  - `bun run typecheck`: `$ tsc --noEmit`, no TypeScript errors.
  - `bunx eslint src/app/dashboard/curator/page.tsx src/app/dashboard/curator/curator-actions.ts src/app/dashboard/curator/types.ts src/__tests__/curator-dashboard-actions.test.ts`: no output.
  - Final gate after Pike/Fowler approval: targeted suite passed with `48 pass`, `0 fail`, `203 expect() calls`; `bun run typecheck` passed; targeted eslint produced no output.
  - `git diff --check -- <changed files>`: no output.
- Review evidence: Pike approved after pending `request_evidence` receipt fix; Fowler approved after pending receipt route test and selected snapshot fallback.

## File List

- `_bmad/bmm/stories/7-4-surface-curator-decision-receipts.md`
- `src/__tests__/curator-dashboard-actions.test.ts`
- `src/__tests__/curator-proposals-route.test.ts`
- `src/app/api/curator/proposals/route.ts`
- `src/app/dashboard/curator/curator-actions.ts`
- `src/app/dashboard/curator/page.tsx`
- `src/app/dashboard/curator/types.ts`

## Change Log

- 2026-06-06: Implemented dashboard curator decision receipt surface with typed receipt responses, API event-backed receipt mapping, pending evidence receipt visibility, read-only receipt panel, degraded missing receipt blocker state, and targeted validation evidence.
