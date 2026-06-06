# Story 7.3: Add Request Evidence and Request Changes Flow

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As a curator,
I want to request additional evidence or changes on a proposal,
So that uncertain proposals stay pending with audit trail instead of being prematurely rejected.

## Traceability

Epic 7 -> FR5 -> request-evidence evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts`

## Team RAM Routing

- **Woz:** Implementation
- **Knuth:** Schema review — request-evidence is append-only audit, proposal stays pending
- **Pike/Fowler:** Code review

## Acceptance Criteria

**Given** a proposal lacks sufficient evidence,
**When** the curator clicks "Request Evidence" or "Request Changes",
**Then** the action records rationale as an append-only audit event.
**And** the proposal remains in `pending` status (not a new schema state unless migration is approved).
**And** the UI maps to documented backend behavior without inventing unsupported states.
**And** Allura drift checks compare against the latest curator contract.

## Dev Agent Record

### Completion Notes

- Reconciled from prior completion evidence: Request Evidence and Request Changes actions were added while keeping proposal status `pending`.
- `request_changes` remains UI intent only and maps to backend `request_evidence` with prefixed rationale; no unsupported schema state was added.
- Prior review evidence: Pike approved; Fowler approved with non-blocking follow-up to centralize decision metadata/config.
- Prior validation evidence recorded in session context: targeted suite passed `42 tests`; changed-file eslint clean.
- Brain outcome memory: `06ca888e-d71e-47eb-bbe1-699feb1271e9`.
- Notion Work Board update remains the canonical status target; local file was stale and is reconciled as supporting evidence only.

## File List

- `_bmad/bmm/stories/7-3-add-request-evidence-and-changes-flow.md`
- `src/app/dashboard/curator/page.tsx`
- `src/app/dashboard/curator/decision-dialog.tsx`
- `src/app/dashboard/curator/curator-actions.ts`
- `src/app/dashboard/curator/types.ts`
- `src/__tests__/curator-dashboard-actions.test.ts`

## Change Log

- 2026-06-06: Reconciled stale local status to Done from prior Story 7-3 completion evidence.
