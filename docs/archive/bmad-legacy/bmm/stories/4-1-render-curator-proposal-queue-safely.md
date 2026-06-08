# Story 4.1: Render Curator Proposal Queue Safely

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As a curator,
I want a scoped proposal queue with evidence and status,
So that I can review pending proposals without accidentally promoting or rejecting them.

## Traceability

Epic 4 -> FR6, FR9 -> queue evidence -> `bun test src/lib/memory/curator-proposal-queue.test.ts src/lib/memory/__tests__/approval-audit.test.ts`

## Acceptance Criteria

- [x] Given canonical proposals exist for a `group_id`, when the queue renders, then it shows proposal ID, content preview, score, reasoning, tier, status, trace reference, and created timestamp.
- [x] Queries are scoped by validated `group_id`.
- [x] Viewing the queue remains read-only and does not approve, reject, promote, deprecate, export-mutate, or write to PostgreSQL/Neo4j.
- [x] Allura drift checks verify no autonomous promotion path has been reintroduced.
- [x] Targeted queue/audit validation passes with exact evidence recorded.
- [x] Empty/degraded queue states do not claim high-confidence memories are auto-promoted.

## Allura Drift Gate

- Story: `4-1-render-curator-proposal-queue-safely — Render Curator Proposal Queue Safely`
- Brain query: `Story 4.1 render curator proposal queue safely blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `mem-3401d9be65b3819c`: single proposals queue, single approval door, `^allura-` group_id, append-only traces, SUPERSEDES versioning, HITL promotion.
  - `mem-3401d9be65b38189`: agents cannot autonomously promote knowledge; promotions require human approval through the curator pipeline.
  - `mem-3401d9be65b38140`: curator watchdog/proposals surface to human review and does not auto-approve.
  - `prop-arch-soc2-promotion`: semantic activation requires SOC2/HITL approval.
  - `mem-33e1d9be65b38174`: Notion Work Board remains canonical for planning status.
- Compared against `_bmad/bmm/planning/epics.md` Story 4.1 and existing approval audit gates.
- Drift classification: `minor` — dashboard mappers could display proposals, but no small read-only domain helper proved group-scoped queue rows and no side effects.
- Disposition: fixed in this story with a read-only queue formatter/query helper and targeted tests.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Add RED coverage for a scoped curator proposal queue.
  - [x] Prove proposal ID, content preview, score, reasoning, tier, status, trace reference, and created timestamp are included.
  - [x] Prove invalid or mismatched `group_id` fails before rendering.
  - [x] Prove the query is SELECT-only, scoped by `group_id`, and filtered to pending proposals.
- [x] Implement a small read-only queue helper in `src/lib/memory/`.
- [x] Keep approval/rejection/promotion behavior out of the queue helper.
- [x] Run targeted validation and record exact output.
- [x] Remove pending queue approve/reject/edit controls and unsafe auto-promotion copy from the curator page.
- [x] Encode pending queue query parameters so `group_id` cannot override `status=pending`.
- [x] Run Pike/Fowler/Knuth review and resolve blocking findings.
- [x] Log outcome to Allura Brain and update local BMAD evidence.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 4.1.
- Epic 4 non-goal: no autonomous Neo4j promotion, direct memory editing, or unreviewed semantic activation.
- Queue view must be read-only. Approval/rejection/request-evidence actions belong to later Epic 4 stories.
- Tenant scope is mandatory. Validate `group_id` with `src/lib/validation/group-id.ts` and query with parameterized SQL.
- Prior story learning: Epic 3 read-side surfaces preserved provenance without mutating source evidence; keep the same read-only discipline here.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED missing curator queue module, GREEN minimal read-only formatter/query helper, REFACTOR only while tests remain green.

### Debug Log

- 2026-05-24: Prompt steering said Story 3.1 was backlog, but local sprint status showed Epic 3 fully done. Brooks routed to the first actual backlog/ready story: Story 4.1.
- 2026-05-24: Drift gate searched Brain with `group_id=allura-system`; no hard blocker found. HITL/no-autopromotion and single-queue constraints applied.
- 2026-05-24: RED test failed on missing `@/lib/memory/curator-proposal-queue` module before implementation.
- 2026-05-24: Implemented read-only queue helper with validated group scope and SELECT-only pending proposal query.
- 2026-05-24: RED page safety tests failed on pending queue auto-promoted copy and `/api/curator/approve` mutation affordances.
- 2026-05-24: Fowler review blocked raw `groupId` interpolation in the pending proposals URL; fixed with `URLSearchParams` and regression coverage.
- 2026-05-24: Pike final review caught approval failing open when requester provenance was missing; fixed by returning `403` before Neo4j promotion or proposal status update.

### Completion Notes

- Added `formatCuratorProposalQueue` to normalize queue rows into explicit review evidence fields.
- Added `getScopedCuratorProposalQueue` to SELECT pending `canonical_proposals` rows by validated `group_id` without writing or invoking promotion paths.
- Removed pending queue approve/reject/edit controls and rationale input from `src/app/curator/page.tsx`; Story 4.2 owns decisions.
- Replaced unsafe auto-promotion empty-state copy with human-review queue copy.
- Encoded pending proposal query parameters with `URLSearchParams` to preserve fixed `status=pending` semantics.
- Cleared selected proposal details on `group_id` changes to avoid stale cross-scope detail display.
- Added approval provenance fail-closed behavior: approval now requires source requester provenance from `events` before promotion can proceed.
- Validation evidence:
  - RED: `bun test src/lib/memory/curator-proposal-queue.test.ts` failed with `Cannot find module '@/lib/memory/curator-proposal-queue'` before implementation.
  - GREEN targeted: `bun test src/lib/memory/curator-proposal-queue.test.ts` passed with `3 pass`, `0 fail`, `11 expect() calls`.
- RED page safety: `bun test src/app/curator/page.test.tsx src/lib/memory/curator-proposal-queue.test.ts` failed on `auto-promoted` copy and `/api/curator/approve` mutation affordance.
- RED blocker-fix: `bun test src/app/curator/page.test.tsx` failed because `new URLSearchParams` was missing.
- RED selected-detail guard: `bun test src/app/curator/page.test.tsx` failed because selected proposal details were not cleared on `group_id` changes.
- RED approval provenance guard: `bun test src/__tests__/curator-approve-route.test.ts` failed because approval without requester provenance returned `200` instead of `403`.
- GREEN approval/audit validation: `bun test src/__tests__/curator-approve-route.test.ts src/lib/memory/__tests__/approval-audit.test.ts` passed with `23 pass`, `0 fail`, `81 expect() calls`.
- Final targeted: `bun test src/lib/memory/curator-proposal-queue.test.ts src/lib/memory/__tests__/approval-audit.test.ts src/app/curator/page.test.tsx src/__tests__/curator-approve-route.test.ts` passed with `33 pass`, `0 fail`, `106 expect() calls`.
- `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
- YAML parse passed.
- Targeted `git diff --check` produced no output.
- Review evidence: Pike initial review found stale selected proposal scope; Fowler blocked raw `groupId` URL interpolation; Pike final review found approval requester provenance fail-open. Final Pike reported no findings/no blockers after approval provenance fix. Final Fowler reported no blocking findings. Knuth subagent returned empty output; Brooks performed gate-equivalent data/schema review against `canonical_proposals`, `group_id`, pending-only status, append-only audit, and no autonomous promotion.
- Brain outcome memories: `420e3bb0-156b-4f7b-8ed7-3ff5440d8f14`; Ralph iteration 4 verification log: `f38ddc50-764c-4d62-a20c-89ca7c3ed340`; Ralph iteration 7 closure: `ff70dbde-2be1-4661-b29a-f5213d77c5cf`.
- Notion Work Board update: pending; no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/4-1-render-curator-proposal-queue-safely.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/app/curator/page.tsx`
- `src/app/curator/page.test.tsx`
- `src/app/api/curator/approve/route.ts`
- `src/__tests__/curator-approve-route.test.ts`
- `src/lib/memory/curator-proposal-queue.ts`
- `src/lib/memory/curator-proposal-queue.test.ts`

## Change Log

- 2026-05-24: Created Story 4.1 and implemented the first read-only scoped curator proposal queue helper with targeted TDD evidence.
- 2026-05-24: Completed read-only curator page queue hardening, review blocker resolution, validation, Brain logging, and local Done evidence.
- 2026-05-24: Closed Ralph iteration 7 approval provenance blocker; approvals now fail closed when requester provenance cannot be resolved.
