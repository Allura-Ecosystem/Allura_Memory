# Story 5.1: Verify Runtime Health and Recovery Baseline

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to source code, validation output, runtime health output, Notion Work Board state, and team consensus.

## Status

Done

## Story

As Hightower,
I want runtime health and recovery checks documented and executable,
So that project closeout does not depend on an unstable host or container stack.

## Traceability

Epic 5 -> FR15, FR21, FR22 -> runtime health evidence -> `bun test src/__tests__/health-metrics.test.ts src/__tests__/health-metrics-scope.test.ts`

## Acceptance Criteria

- [x] Given the system runs through Docker/MCP/runtime paths, when health checks execute, then they report store availability, degraded state, scoped metrics, and recovery guidance.
- [x] Failures include exact command/output evidence and do not get hidden behind optimistic copy.
- [x] Health metrics remain tenant-scoped by validated `group_id` and do not fabricate healthy counts when backing stores are degraded.
- [x] Recovery guidance covers PostgreSQL/Neo4j/MCP/runtime probes and names what to inspect next.
- [x] Allura drift checks compare runtime claims against recent blockers, fallbacks, deferrals, and waivers.

## Allura Drift Gate — Ready

- Story: `5-1-verify-runtime-health-and-recovery-baseline — Verify Runtime Health and Recovery Baseline`
- Brain query: `Story 5.1 runtime health recovery baseline blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `mem-3401d9be65b3810f`: prior healthcheck green baseline; Neo4j fallback and mock-mode deferrals must not be overstated.
  - `prop-session-p2-complete`: soft-delete recovery and HITL curator queue context.
  - `mem-33e1d9be65b38174`: Notion Work Board remains canonical for planning/status.
- Compared against `_bmad/bmm/planning/epics.md` Story 5.1, Epic 4 retrospective, `src/__tests__/health-metrics.test.ts`, `src/__tests__/health-metrics-scope.test.ts`, `src/__tests__/health-probes.test.ts`, `src/app/api/health/metrics/route.ts`, and dashboard health callers.
- Drift classification: `minor` — healthcheck baseline exists, but Epic 5 requires fresh exact validation and recovery evidence before final closeout.
- Disposition: proceed to implementation/verification; do not treat old green baseline as current proof.
- Board traceability: pending; no authorized Notion tooling is available in this runtime.

## Tasks / Subtasks

- [x] Add or confirm RED/guard coverage for scoped runtime health. (AC: 1-3)
  - [x] Verify health metrics include PostgreSQL/Neo4j availability, degraded counters, queue age, and scoped group behavior.
  - [x] Verify degraded/failed health responses produce honest warnings and recovery guidance.
- [x] Implement the minimal runtime health/recovery baseline fixes. (AC: 1-5)
  - [x] Reuse existing health metrics/probe routes and dashboard health callers; do not create a parallel health subsystem.
  - [x] Preserve `group_id` scoping and exact degraded state semantics.
  - [x] Document command/output evidence in this story artifact.
- [x] Run targeted validation and record exact output. (AC: 1-5)
  - [x] `bun test src/__tests__/health-metrics.test.ts src/__tests__/health-metrics-scope.test.ts src/__tests__/health-probes.test.ts`
  - [x] `bun run typecheck`
  - [x] YAML parse and targeted `git diff --check` for changed story/status/code files.
- [x] Run Hightower/Pike/Fowler review or documented gate-equivalent review. (AC: 1-5)
- [x] Log outcome to Allura Brain and update local BMAD evidence after review/validation passes. (AC: 5)

## Dev Notes

- Source story: `_bmad/bmm/planning/epics.md` Story 5.1.
- Epic 5 objective is closeout reliability, not new product scope.
- Existing implementation candidates:
  - `src/app/api/health/metrics/route.ts` for scoped runtime metrics.
  - `src/__tests__/health-metrics.test.ts` and `src/__tests__/health-metrics-scope.test.ts` for core validation.
  - `src/__tests__/health-probes.test.ts` for probe/recovery guardrails.
  - `src/lib/dashboard/honest-panels.ts` and dashboard health callers for honest degraded presentation.
- Preserve lessons from Epic 4: evidence proves Done; Brain memory is audit/context, not proof; Notion board sync remains pending without authorized tooling.
- Do not claim Docker, MCP, PostgreSQL, or Neo4j are healthy without fresh command output from this story run.
- Notion Work Board remains canonical; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED or confirm guard tests for scoped health/degraded recovery, GREEN minimal health/recovery fixes, REFACTOR only while targeted tests remain green.

### Debug Log

- 2026-05-24: Story created from Epic 5 backlog after Epic 4 retrospective completed locally. Brain drift gate found no critical blocker but warned not to reuse older healthcheck green baseline as current proof.
- 2026-05-24: RED health validation failed under Bun on `vi.hoisted`, `vi.mocked`, and Neo4j driver runtime import interop (`ManagedTransaction`/default export missing).
- 2026-05-24: Fixed Bun-native test compatibility with top-level mocks/casts and fixed Neo4j driver interop with namespace runtime import plus type-only named imports.

### Completion Notes

- Runtime health validation passed: `bun test src/__tests__/health-metrics.test.ts src/__tests__/health-metrics-scope.test.ts src/__tests__/health-probes.test.ts` -> `46 pass`, `0 fail`, `129 expect() calls`.
- `bun run typecheck`: `$ tsc --noEmit`, no TypeScript output after command line.
- YAML parse passed for `_bmad/bmm/stories/sprint-status.yaml`; targeted `git diff --check` produced no output.
- Review evidence: Hightower reported no deployability/runtime blockers. Fowler reported no code/test maintainability blockers after stale story evidence was updated.
- Context7 receipt: Neo4j JavaScript driver docs show namespace/CommonJS style runtime API (`neo4j.driver`, `neo4j.auth.basic`, sessions); namespace import preserves the runtime API while type-only imports avoid missing runtime exports.
- Brain readiness memory: `35d56dc1-5c9a-4082-8d36-b155968a5ac6`; completion memory: `7b4d10ba-7733-4b58-846e-10989ae9a835`.

### File List

- `_bmad/bmm/stories/5-1-verify-runtime-health-and-recovery-baseline.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `src/__tests__/health-metrics-scope.test.ts`
- `src/__tests__/health-probes.test.ts`
- `src/lib/neo4j/connection.ts`

## Change Log

- 2026-05-24: Created Story 5.1 from Epic 5.1 and marked local BMAD status ready-for-dev pending canonical Notion board sync.
- 2026-05-24: Fixed Bun-native health tests and Neo4j driver import interop, passed validation/review, and moved local BMAD status to Done.
