# Story 4.2: Implement HITL Approval and Rejection Actions

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As a curator,
I want explicit approve and reject actions with rationale and audit receipts,
So that promotion decisions are human-gated and traceable.

## Traceability

Epic 4 -> FR6, FR9 -> approval audit evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts`

## Acceptance Criteria

- [x] Given a pending proposal, when a curator approves it, then the transition is explicit, scoped by validated `group_id`, and records actor, timestamp, rationale, proposal ID, and resulting status.
- [x] Given a pending proposal, when a curator rejects it, then the transition is explicit, scoped by validated `group_id`, and records actor, timestamp, rationale, proposal ID, and resulting status.
- [x] Approval may queue or perform governed promotion only through the curator flow; no deprecated direct approval path or autonomous Neo4j promotion is reintroduced.
- [x] Rejection never deletes source evidence, proposal evidence, PostgreSQL trace rows, or Neo4j memory nodes.
- [x] UI actions are explicit, rationale-gated, keyboard-reachable, and show honest success/error receipts without fabricating promotion state.
- [x] Allura drift checks compare behavior against HITL, single approval door, no-autopromotion, and append-only evidence memories.

## Allura Drift Gate

- Story: `4-2-implement-hitl-approval-and-rejection-actions — Implement HITL Approval and Rejection Actions`
- Brain query: `Story 4.2 implement HITL approval rejection actions blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `mem-3401d9be65b381ad`: PostgreSQL stores append-only episodic traces, Neo4j stores versioned semantic knowledge, and the curator pipeline requires HITL approval.
  - `mem-3401d9be65b3819c`: single proposals queue, single approval door, `^allura-` group scope, append-only traces, `SUPERSEDES` versioning, and HITL promotion are mandatory invariants.
  - `mem-3401d9be65b38140`: curator watchdog surfaces proposals to human review and does not auto-approve.
  - `mem-3401d9be65b38189`: agents cannot autonomously promote knowledge; deprecated approval paths throw instead of promoting.
  - `prop-arch-soc2-promotion`: semantic activation in SOC2 mode requires curator scoring and human approval.
  - `mem-33e1d9be65b38174`: Notion Work Board remains canonical for planning status; local status is reconciliation only.
- Compared against `_bmad/bmm/planning/epics.md` Story 4.2, Story 4.1 completion notes, `src/app/api/curator/approve/route.ts`, `src/lib/memory/__tests__/approval-audit.test.ts`, and `src/app/curator/page.tsx`.
- Drift classification: `major` — Story 4.1 deliberately removed pending queue approve/reject/edit controls, while Epic 4.2 requires explicit approve/reject actions with rationale and receipts through the governed curator flow. Additional drift found during review: dashboard/admin approve callers lacked rationale after the route began requiring it.
- Disposition: fixed in this story with rationale-gated approve/reject actions, receipt metadata, status-scoped updates, deterministic promotion IDs, and dashboard/admin rationale propagation.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Add RED approval/rejection coverage for explicit HITL decisions.
  - [x] Prove approval requires valid `group_id`, proposal ID, curator actor, and non-empty rationale before any status update or promotion attempt.
  - [x] Prove rejection requires valid `group_id`, proposal ID, curator actor, and non-empty rationale before any status update.
  - [x] Prove rejection updates proposal decision state without deleting source trace/evidence.
- [x] Implement or harden the minimal curator decision API surface.
  - [x] Preserve existing approval provenance fail-closed behavior from Story 4.1.
  - [x] Add rejection handling only through governed curator route/helper code; do not add direct Neo4j mutation from UI code.
  - [x] Return inspectable receipts with proposal ID, actor, timestamp, rationale, resulting status, and promoted memory reference when applicable.
- [x] Add explicit UI approve/reject affordances to the curator page.
  - [x] Require rationale before submit.
  - [x] Make controls keyboard reachable and visibly scoped to the selected pending proposal.
  - [x] Show honest receipt/error state and avoid copy that implies autonomous promotion.
- [x] Run targeted validation and record exact output.
  - [x] `bun test src/app/admin/approvals/actions.test.ts src/lib/dashboard/__tests__/api.test.ts src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/app/curator/page.test.tsx`
  - [x] `bun run typecheck`
  - [x] YAML parse and targeted `git diff --check` for changed story/status/code files.
- [x] Run Pike/Fowler/Knuth review and resolve blocking findings.
- [x] Log outcome to Allura Brain and update local BMAD evidence after review/validation passes.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 4.2.
- Epic 4 non-goal: no autonomous Neo4j promotion, direct memory editing, or unreviewed semantic activation.
- Story 4.1 intentionally left the queue read-only and moved approve/reject behavior here. Do not regress its safety fixes:
  - pending queue query parameters are encoded with `URLSearchParams`;
  - selected proposal details clear when `group_id` changes;
  - approval fails closed when requester provenance is missing;
  - queue viewing has no mutation affordance.
- Existing implementation candidates:
  - `src/app/api/curator/approve/route.ts` for approval route behavior and provenance guardrails.
  - `src/lib/memory/__tests__/approval-audit.test.ts` for append-only audit and approval invariants.
  - `src/__tests__/curator-approve-route.test.ts` for route-level approval behavior.
  - `src/app/curator/page.tsx` and `src/app/curator/page.test.tsx` for curator UI affordances.
  - `src/lib/memory/curator-proposal-queue.ts` and its tests for selected proposal queue context.
- Tenant scope is mandatory. Validate `group_id` with `src/lib/validation/group-id.ts` before querying or mutating proposal state.
- Approval/rejection must record curator identity and rationale in append-only audit evidence. If the existing schema lacks a dedicated rejection helper, prefer a narrow helper that updates proposal status and writes an audit event rather than broad UI-side mutation logic.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED approval/rejection/rationale/receipt tests, GREEN minimal governed curator decision route/helper/UI, REFACTOR only while targeted tests remain green.

### Debug Log

- 2026-05-24: Ralph iteration 6 found prompt steering stale: Epic 3 and Story 3.1 are already Done locally, and the first actual backlog story is 4.2 after Story 4.1 is Done.
- 2026-05-24: Drift gate searched Brain with `group_id=allura-system`; HITL, no-autopromotion, single approval door, append-only evidence, and Notion-canonical status memories applied.
- 2026-05-24: RED tests failed on missing `resulting_status` audit metadata, missing route receipt responses, missing UI receipt/rationale behavior, and missing admin/dashboard approval rationale propagation.
- 2026-05-24: Pike/Fowler review blockers resolved: approval provenance affordance is disabled when trace evidence is missing, stale rationale/receipt state clears on proposal selection, dashboard/admin callers supply rationale, and proposal status updates are `group_id` + pending-state scoped.
- 2026-05-24: Ralph iteration 6 re-review reopened a blocking ordering issue: proposal status/audit can commit before downstream Neo4j promotion/Notion-sync side effects are guaranteed, risking a terminal approved proposal without promoted graph node or durable sync receipt.
- 2026-05-24: Ralph iteration 7 root cause found: synchronous Neo4j promotion inside/around the PostgreSQL approval transaction created an unavoidable cross-store atomicity gap. Fix changed approval to queue `promotion_sync_pending` durably in PostgreSQL with the status/audit/notion outbox transaction; route no longer calls `createInsight` directly.
- 2026-05-24: Final review blockers reproduced and fixed: dashboard rejection still used legacy `/api/curator/reject`, request-evidence audit/outbox writes were split, and the legacy reject API still carried weak independent DB mutation logic. Dashboard reject now uses the governed decision door, request-evidence writes share the transaction, and `/api/curator/reject` is shim-only.

### Completion Notes

- Added rationale-gated approve/reject actions with route response receipts and audit metadata containing `resulting_status`.
- Preserved approval requester-provenance fail-closed behavior and SoD/role checks.
- Rejection updates proposal state through the governed route without deleting source evidence or promoting to Neo4j.
- Guarded proposal updates by `id`, `group_id`, and `status = 'pending'`; approval memory IDs are deterministic per proposal/group to reduce retry divergence.
- Dashboard/admin approval callers now send explicit rationale to the governed curator route.
- Validation evidence: `bun test src/app/admin/approvals/actions.test.ts src/lib/dashboard/__tests__/api.test.ts src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/app/curator/page.test.tsx` -> `52 pass`, `0 fail`, `209 expect() calls`.
- `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
- Additional validation evidence after receipt/race fixes: approval-audit + curator-approve route passed `27 pass`, `0 fail`, `110 expect() calls`; curator page + queue passed `14 pass`, `0 fail`, `43 expect() calls`; `bun run typecheck` passed.
- Ralph iteration 7 blocker fix: approval now writes proposal status, approval audit, `promotion_sync_pending`, and `notion_sync_pending` inside the same PostgreSQL transaction and returns an honest queued receipt (`promoted_memory_id: null`, `queued_memory_id: <deterministic uuid>`). No route-level `createInsight`/Neo4j write remains, eliminating the cross-store terminal-status-before-graph split.
- Final validation evidence after queue-model fix: `bun test src/app/admin/approvals/actions.test.ts src/lib/dashboard/__tests__/api.test.ts src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/app/curator/page.test.tsx` -> `57 pass`, `0 fail`, `243 expect() calls`.
- Final expanded validation after legacy reject/request-evidence fixes: `bun test src/app/admin/approvals/actions.test.ts src/lib/dashboard/__tests__/api.test.ts src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/__tests__/curator-reject-route.test.ts src/app/curator/page.test.tsx` -> `64 pass`, `0 fail`, `268 expect() calls`.
- `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
- YAML parse passed for `_bmad/bmm/stories/sprint-status.yaml`; targeted `git diff --check` produced no output.
- Final review evidence: Pike final re-review approved with one resolved medium UUID-contract note; deterministic queued memory IDs now set UUID v4 version and variant nibbles. Fowler final re-review approved with no blocking findings and confirmed cross-store blocker resolved by durable PostgreSQL outbox. Final Pike/Fowler re-review after legacy reject shim and request-evidence transaction fixes reported no blocking findings and ready for Done.
- Brain story-creation outcome memory: `4cfac01f-bae0-478c-96e2-130605acb88e`; completion outcome memory: `4f10ced0-ae6d-428a-a678-054b2fa7d1d2`; final closure outcome memory: `cbb37d1b-d90b-44a1-9756-695cdef63382`.
- Notion Work Board update pending because no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/4-2-implement-hitl-approval-and-rejection-actions.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/app/api/curator/approve/route.ts`
- `src/app/api/curator/reject/route.ts`
- `src/__tests__/curator-approve-route.test.ts`
- `src/__tests__/curator-reject-route.test.ts`
- `src/lib/memory/approval-audit.ts`
- `src/lib/memory/__tests__/approval-audit.test.ts`
- `src/app/curator/page.tsx`
- `src/app/curator/page.test.tsx`
- `src/lib/memory/approval-audit.ts`
- `src/lib/memory/__tests__/approval-audit.test.ts`
- `src/lib/dashboard/api.ts`
- `src/lib/dashboard/__tests__/api.test.ts`
- `src/app/(main)/dashboard/page.tsx`
- `src/app/(main)/dashboard/insights/page.tsx`
- `src/app/(main)/dashboard/builder/page.tsx`
- `src/app/admin/approvals/actions.tsx`
- `src/app/admin/approvals/actions.test.ts`

## Change Log

- 2026-05-24: Created Story 4.2 from Epic 4.2 and marked local BMAD status ready-for-dev pending canonical Notion board sync.
- Brain story-creation outcome memory: `4cfac01f-bae0-478c-96e2-130605acb88e`.
- 2026-05-24: Implemented Story 4.2 HITL approve/reject actions and resolved initial review blockers, but final re-review found a remaining approval-ordering blocker; local BMAD status reset to in-progress.
- 2026-05-24: Resolved approval-ordering blocker by replacing synchronous Neo4j promotion with durable `promotion_sync_pending` outbox, preserving honest queued receipts, and marking Story 4.2 Done after validation and Pike/Fowler approval.
- 2026-05-24: Resolved final legacy reject/request-evidence atomicity blockers, passed expanded validation and final Pike/Fowler re-review, and kept local BMAD status Done.
