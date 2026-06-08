# Story 4.3: Add Request Evidence / Request Changes Flow

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As a curator,
I want to request evidence instead of only approving or rejecting,
So that uncertain proposals can remain auditable without being prematurely rejected.

## Traceability

Epic 4 -> FR9 -> request-evidence audit evidence -> `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/app/curator/page.test.tsx`

## Acceptance Criteria

- [x] Given a proposal lacks sufficient evidence, when the curator requests evidence or changes, then the action records actor, timestamp, rationale, proposal ID, prior status, and resulting state in append-only audit evidence.
- [x] The request-evidence action leaves the proposal out of active semantic knowledge and does not call Neo4j promotion.
- [x] The UI label maps to documented backend behavior without inventing an unsupported `canonical_proposals.status`; the proposal remains `pending` while the receipt decision is `needs_evidence`.
- [x] Request-evidence is tenant-scoped by validated `group_id`, role-gated through the curator route, rationale-gated, and keyboard reachable.
- [x] Allura drift checks compare this behavior against HITL, no autonomous promotion, append-only evidence, single approval door, and the latest curator contract.

## Allura Drift Gate

- Story: `4-3-add-request-evidence-request-changes-flow — Add Request Evidence / Request Changes Flow`
- Brain query: `Story 4.3 request evidence request changes flow blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `mem-3401d9be65b3819c`: single proposals queue, single approval door, `^allura-` group scope, append-only traces, `SUPERSEDES` versioning, and HITL promotion are mandatory invariants.
  - `prop-arch-dual-layer`: PostgreSQL stores episodic traces, Neo4j stores canonical semantic insights; no direct agent writes to Neo4j.
  - `mem-33e1d9be65b38174`: Notion Work Board remains canonical for planning/status; local BMAD status is reconciliation only.
- Compared against `_bmad/bmm/planning/epics.md` Story 4.3, Story 4.2 completion notes, `docker/postgres-init/11-canonical-proposals.sql`, `src/app/api/curator/approve/route.ts`, `src/lib/memory/approval-audit.ts`, and `src/app/curator/page.tsx`.
- Drift classification: `major` — Epic 4.3 asks for request-evidence/request-changes, but the current canonical proposal schema only supports `pending`, `approved`, and `rejected`. The safe interpretation is an append-only `proposal_evidence_requested` audit event that keeps `canonical_proposals.status = 'pending'` and does not promote to Neo4j.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Add RED coverage for request-evidence behavior.
  - [x] Prove request-evidence writes append-only audit metadata with rationale, actor, tenant, proposal ID, and `resulting_status: pending`.
  - [x] Prove route-level request-evidence does not update `canonical_proposals.status` to an unsupported value.
  - [x] Prove request-evidence never calls Neo4j promotion or deletes source evidence.
- [x] Implement the minimal request-evidence route/helper behavior.
  - [x] Extend decision parsing without broadening direct promotion paths.
  - [x] Keep existing approve/reject behavior unchanged.
  - [x] Return an inspectable receipt using `decision: needs_evidence` and `resulting_status: pending`.
- [x] Add explicit UI affordance.
  - [x] Reuse the existing rationale field and governed `/api/curator/approve` route.
  - [x] Label clearly: request evidence keeps the proposal pending and out of semantic knowledge.
  - [x] Keep controls keyboard reachable and scoped to the selected proposal.
- [x] Run targeted validation and record exact output.
  - [x] `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/app/curator/page.test.tsx`
  - [x] `bun run typecheck`
  - [x] YAML parse and targeted `git diff --check` for changed story/status/code files.
- [x] Run Pike/Fowler/Knuth review and resolve blocking findings.
- [x] Log outcome to Allura Brain and update local BMAD evidence after review/validation passes.

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 4.3.
- Epic 4 non-goal: no autonomous Neo4j promotion, direct memory editing, or unreviewed semantic activation.
- Previous Story 4.2 patterns to preserve:
  - route derives curator identity from auth rather than trusting request body;
  - rationale is required before any curator decision;
  - proposal updates are scoped by `id`, `group_id`, and pending state;
  - approval requester provenance fails closed before semantic promotion;
  - rejection does not delete source evidence or call Neo4j.
- `canonical_proposals.status` currently allows only `pending`, `approved`, and `rejected`. Do not introduce a new status in app code without schema migration and Knuth review. For this story, request-evidence should be represented as an append-only event/receipt while the proposal remains pending.
- Existing implementation candidates:
  - `src/lib/memory/approval-audit.ts` for append-only audit helper.
  - `src/app/api/curator/approve/route.ts` for the single governed curator decision door.
  - `src/app/curator/page.tsx` and `src/app/curator/page.test.tsx` for UI affordance and copy guards.
  - `src/__tests__/curator-approve-route.test.ts` for route-level decision behavior.
- Context7 receipt: Next.js App Router route handlers use `request.json()` and `NextResponse.json(...)`; React controlled inputs bind `value` and update state in `onChange`.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED request-evidence audit/route/UI tests, GREEN minimal append-only request-evidence event + route branch + UI action, REFACTOR only while targeted tests remain green.

### Debug Log

- 2026-05-24: Ralph iteration 5 found prompt steering stale: Stories 2.4, Epic 2, Epic 3, Story 4.1, and Story 4.2 are already Done locally. First actual backlog story is Story 4.3.
- 2026-05-24: Drift gate searched Brain with `group_id=allura-system`; HITL, no-autopromotion, single approval door, append-only evidence, schema-status, and Notion-canonical status memories applied.
- 2026-05-24: RED tests failed as expected on missing `logProposalNeedsEvidenceEvent`, unsupported `request_evidence` route decision, and missing UI request-evidence affordance.
- 2026-05-24: Pike/Fowler review blockers resolved: request-evidence audit now explicitly records `resulting_status: pending`; repeated request-evidence actions append new audit events; request-evidence enqueues Notion sync rather than returning a misleading pending receipt.

### Completion Notes

- Added request-evidence/needs-evidence curator flow through the existing governed `/api/curator/approve` route.
- Preserved `canonical_proposals.status` as `pending`; no unsupported proposal status is written.
- Added append-only `proposal_evidence_requested` audit events with actor, role, requester, rationale, score, tier, and `resulting_status: pending`.
- Repeated request-evidence actions append distinct audit events instead of being idempotently dropped.
- UI now exposes a rationale-gated, keyboard-reachable `Request evidence` action and copy states that the proposal remains pending/out of semantic knowledge.
- Validation evidence: `bun test src/lib/memory/__tests__/approval-audit.test.ts src/__tests__/curator-approve-route.test.ts src/app/curator/page.test.tsx` -> `42 pass`, `0 fail`, `173 expect() calls`.
- `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
- YAML parse passed for `_bmad/bmm/stories/sprint-status.yaml`; targeted `git diff --check` produced no output.
- Review evidence: Pike re-review reported no blocking findings; Fowler re-review reported no blocking findings; Knuth subagent returned empty output, so Brooks performed gate-equivalent schema/data review.
- Brain outcome memory: `efa2dffc-123f-407f-be78-6a8064494918`.
- Notion Work Board update pending because no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/4-3-add-request-evidence-request-changes-flow.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/lib/memory/approval-audit.ts`
- `src/lib/memory/__tests__/approval-audit.test.ts`
- `src/app/api/curator/approve/route.ts`
- `src/__tests__/curator-approve-route.test.ts`
- `src/app/curator/page.tsx`
- `src/app/curator/page.test.tsx`

## Change Log

- 2026-05-24: Created Story 4.3 from Epic 4.3 and added initial RED tests; local BMAD status ready-for-dev pending canonical Notion board sync.
- 2026-05-24: Implemented Story 4.3 request-evidence flow, resolved review blockers, and moved local BMAD status to Done.
- Brain outcome memory: `efa2dffc-123f-407f-be78-6a8064494918`.
