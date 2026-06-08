# Story 7.1: Build Curator Proposal Queue with Evidence Display

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to source code, validation output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As a curator,
I want a proposal queue showing confidence, reasoning, and evidence,
So that I can review pending proposals with enough context to make informed decisions.

## Traceability

Epic 7 -> FR5, FR6 -> queue evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts`

## Team RAM Routing

- **Woz:** Implementation of proposal queue UI
- **Knuth:** Schema review for proposal fields and scoring contract
- **Jobs:** Scope gate — queue is read-only display, no mutations
- **Pike/Fowler:** Interface and code review

## Acceptance Criteria

**Given** pending proposals exist for a `group_id`,
**When** the curator queue renders on `/dashboard/curator`,
**Then** each proposal shows: ID, content preview, score, reasoning, tier, status, trace reference, and timestamp.
**And** queries are scoped by validated `group_id`.
**And** no promotion occurs by viewing the queue.
**And** the queue handles empty state warmly: "No pending proposals" with guidance.
**And** queue is keyboard navigable per WCAG 2.1 AA.

## Dev Agent Record

### Completion Notes

- Reconciled from prior completion evidence: curator proposal queue shipped on `/dashboard/curator` with evidence display, scoped proposal retrieval, empty state, and keyboard-accessible row selection.
- Prior validation evidence recorded in session context: all five acceptance criteria verified and seven governance gates passed.
- Brain evidence referenced in handoff: `6c044383-06f2-4af7-a31d-61fd8bc23b00`, `d6c30c23-d9a6-47d6-b565-dfe4862ebb50`.
- Notion Work Board update remains the canonical status target; local file was stale and is reconciled as supporting evidence only.

## File List

- `_bmad/bmm/stories/7-1-build-curator-proposal-queue.md`
- `src/app/dashboard/curator/page.tsx`

## Change Log

- 2026-06-06: Reconciled stale local status to Done from prior Story 7-1 completion evidence.
