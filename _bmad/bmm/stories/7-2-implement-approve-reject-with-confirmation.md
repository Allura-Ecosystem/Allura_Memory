# Story 7.2: Implement Approve/Reject with Confirmation Dialogs

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As a curator,
I want approve and reject actions with confirmation dialogs and rationale capture,
So that every promotion decision is intentional, human-gated, and auditable.

## Traceability

Epic 7 -> FR5, FR6 -> approval/rejection evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts src/app/api/curator/approve/ src/app/api/curator/reject/`

## Team RAM Routing

- **Woz:** Implementation of approval/rejection flows
- **Knuth:** Schema review for state transitions and audit receipt fields
- **Jobs:** Scope gate — HITL is non-negotiable, no autonomous bypass
- **Pike/Fowler:** Interface and code review

## Acceptance Criteria

**Given** a curator selects a pending proposal,
**When** they click approve or reject,
**Then** a confirmation dialog appears requiring rationale input.
**And** the dialog traps focus and restores it on dismiss (WCAG).
**And** on confirm, the action records: actor, timestamp, rationale, proposal ID, prior status, new status.
**And** approval queues governed promotion through the curator flow only.
**And** rejection never deletes source evidence or episodic traces.
**And** autonomous Neo4j promotion remains blocked.

## Dev Agent Record

### Completion Notes

- Reconciled from prior completion evidence: approve/reject actions use governed confirmation dialogs with required human rationale, focus trap, and focus restore.
- Decisions route through shared `postCuratorDecision()` and `/api/curator/approve`; no direct promotion endpoint is used.
- Prior review evidence: Pike approved after focus restore; Fowler approved after decision-boundary extraction, copy correction, helper behavior tests, and URL status guard.
- Prior validation evidence recorded in session context: targeted Story 7-2 suite passed `41 tests`; changed-file eslint clean.
- Brain outcome memory: `0fe37237-6977-479f-ad21-5f78e94fc6e7`.
- Notion Work Board update remains the canonical status target; local file was stale and is reconciled as supporting evidence only.

## File List

- `_bmad/bmm/stories/7-2-implement-approve-reject-with-confirmation.md`
- `src/app/dashboard/curator/page.tsx`
- `src/app/dashboard/curator/decision-dialog.tsx`
- `src/app/dashboard/curator/curator-actions.ts`
- `src/app/dashboard/curator/types.ts`
- `src/__tests__/curator-dashboard-actions.test.ts`

## Change Log

- 2026-06-06: Reconciled stale local status to Done from prior Story 7-2 completion evidence.
