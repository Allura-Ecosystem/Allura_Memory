# Story 24.5 — Deterministic Scenario Harness

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** changes-requested
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** unassigned
**Dependencies:** Story 24.2; Story 24.4 fixtures must be integrated before Gate C closes

## User Story

As an agent-platform engineer, I need declarative scenarios with simulated tools, controlled nondeterminism, checkpoints, and replay, so that multi-step agent behavior and policy outcomes can be reproduced without relying on live external systems.

## Context

Allura already contains process-engine, DAG, state, checkpoint, replay, quality-gate, and tracing primitives. This story composes those primitives into a supported harness instead of creating a second orchestration engine.

## Scenario Contract

A versioned YAML or JSON scenario must declare:

- scenario ID, schema version, tenant fixture, and principal fixture
- immutable process-definition ID and revision
- initial memory references and state
- ordered or matched tool fixtures
- virtual clock and random seed
- failure/latency injection rules
- policy expectations and approval breakpoints
- output, state, memory, audit, and evaluation assertions

## Scope

- Add a versioned scenario schema and validator.
- Add `simulate`, `record`, and `replay` execution modes.
- Reuse process-engine checkpoints and replay.
- Virtualize clock/randomness and fixture tool calls during deterministic runs.
- Emit a signed or hashed run receipt with inputs, revisions, outcomes, and evidence links.

## Out of Scope

- Guaranteeing byte-identical output from a live model call.
- Supporting arbitrary executable code inside scenario files.
- Replacing the process engine or MCP protocol.

## Acceptance Criteria

- [ ] AC-1: `schemas/allura-scenario-v1.schema.json` defines the scenario contract and rejects unknown executable fields.
- [ ] AC-2: `simulate` mode executes entirely from local fixtures with network access disabled.
- [ ] AC-3: `record` mode captures permitted tool responses after redaction and records provider/model/config fingerprints; secrets and restricted payload fields are never persisted.
- [ ] AC-4: `replay` mode refuses a missing or mismatched process-definition revision, fixture digest, policy version, or scenario schema version.
- [ ] AC-5: The harness records virtual clock, seed, ordered tool calls, checkpoint transitions, policy decisions, approval breakpoints, side-effect keys, and final state.
- [ ] AC-6: Failure injection supports at least timeout, explicit tool error, malformed tool result, policy denial, and transient retry.
- [ ] AC-7: Replay of a fixture-backed scenario produces identical control-flow, tool-call, policy-decision, checkpoint, and final-state digests.
- [ ] AC-8: Side effects are idempotency-keyed and are not repeated when resuming or replaying.
- [ ] AC-9: A run receipt contains scenario digest, definition revision, principal/tenant references, configuration fingerprint, evidence hashes, and replay comparison.
- [ ] AC-10: Three committed scenarios cover successful governed memory use, unauthorized cross-tenant access, and checkpoint recovery after a tool failure.

## Implementation Files

- `schemas/allura-scenario-v1.schema.json` — new public scenario schema.
- `src/lib/harness/scenario.ts` — typed model and schema validation.
- `src/lib/harness/runner.ts` — process-engine composition.
- `src/lib/harness/tool-simulator.ts` — fixture matching and fault injection.
- `src/lib/harness/determinism.ts` — virtual clock, seed, and digest handling.
- `src/lib/harness/receipt.ts` — run evidence contract.
- `src/lib/harness/__tests__/scenario-harness.test.ts` — deterministic unit/contract tests.
- `tests/scenarios/*.yaml` — committed reference and adversarial scenarios.
- `scripts/harness.ts` — temporary stable entrypoint until Story 24.7 exposes the final CLI.

## Tasks

- [ ] Map existing process-engine primitives and document which are reused unchanged.
- [ ] Define and validate scenario schema v1.
- [ ] Implement fixture tool adapter and fault rules.
- [ ] Add deterministic providers for time and randomness.
- [ ] Connect checkpoints, resume, replay, and side-effect keys.
- [ ] Implement receipts and digest comparison.
- [ ] Add the three required scenarios and prove network-disabled simulation.
- [ ] Document limitations of live-model recording and replay.

## Validation and Evidence

Run each required scenario twice from a clean fixture state. Evidence must compare every deterministic digest and identify any intentionally nondeterministic field.

## Definition of Done

- A reviewer can run and replay the three scenarios without external credentials.
- Resume/replay does not duplicate side effects.
- The harness uses existing process-engine contracts rather than introducing a parallel engine.

## Dev Agent Record

**Status:** changes-requested — see `docs/reviews/epic-24-post-merge-adversarial-review-2026-08-22.md`

### Completion Notes

(To be filled by the implementing BMAD dev agent.)

### File List

(To be filled by the implementing BMAD dev agent.)

### Status Evidence

(To be filled after gate review.)
