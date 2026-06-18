> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

# Story 12.2 Correction: True Checkpoint Continuation

**Status:** technically-verified (pending IRIS/TALON) — 2026-06-12
**Priority:** P0
**Source:** Epic 14.2, F49-F52, AD-35

> **Evidence (2026-06-12, Team RAM / Claude CLI):** All 9 acceptance criteria
> proven by a PostgreSQL-backed integration test
> `src/lib/process-engine/checkpoint-continuation.integration.test.ts`
> (e2e lane, live `knowledge-postgres`): `start -> block -> approve -> resume ->
> complete -> replay` passes 2/2. Idempotency proven — a completed side-effecting
> step (`prep`) runs exactly once across run + resume; `finalize` runs once.
> Approval survives a simulated restart (resume on a fresh `ProcessEngine`
> instance loading state purely from PG). Definition revision drift raises a
> `DefinitionRevisionError` doctor finding (`process_resume_rejected` event).
> Implementation: `ProcessDefinition.revision` + `ProcessState.definitionRevision`
> pinned at run start; `resume()` continues via `executeFrom` with an idempotency
> guard skipping already terminal steps. Process-engine unit suite 41/41 green;
> typecheck clean.

## Story

As a workflow operator, I need approval of a blocked checkpoint to continue the
pinned process from the next incomplete step so that resume is operational, not
an audit-only status change.

## Acceptance Criteria

- [ ] The run stores a process-definition identifier and immutable revision.
- [ ] Resume reloads that exact definition revision.
- [ ] Completed side-effecting steps are not executed again.
- [ ] Approved checkpoints remain approved after restart.
- [ ] Execution continues from the first incomplete eligible step.
- [ ] The run reaches `completed`, `blocked`, `failed`, or `cancelled`.
- [ ] Resume emits linked append-only events with tenant and actor scope.
- [ ] Missing or changed definitions produce an explicit doctor finding.
- [ ] An integration test proves start -> block -> approve -> resume -> complete
      -> replay.

## Verification

- Run unit tests for replay and engine execution.
- Run a PostgreSQL-backed integration test across a simulated restart.
- Compare the replayed timeline with the final persisted state.

