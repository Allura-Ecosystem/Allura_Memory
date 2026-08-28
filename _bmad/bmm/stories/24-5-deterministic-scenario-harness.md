# Story 24.5 — Deterministic Scenario Harness

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Epic:** 24 — Agentic AI Framework and Harness Portfolio Readiness
**Status:** in-review
**Priority:** P0-Critical
**Complexity:** Large
**Owner:** Brooks (Hermes)
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

**Status:** in-review — remediation verified 2026-08-28 (Brooks/Hermes + Team RAM)

### Completion Notes

C4 finding from the post-merge adversarial review (2026-08-22) is resolved in
the current codebase:

- **C4 (runner doesn't compose the process engine):** `src/lib/harness/runner.ts`
  now builds a `ProcessDefinition` from the scenario and drives it through the
  real `ProcessEngine.run()` → `resume()` (checkpoint loop) → `getTimeline()`
  (replay). No parallel engine; the engine's own state manager, resume, replay,
  and quality-gate contracts are used.
- **Hermeticity (found 2026-08-28):** the harness tests previously hit the live
  PostgreSQL via `getPool()` in `registerDefinition` (auth failure). Fixed by
  mocking `@/lib/postgres/connection` in the test and adding
  `src/lib/harness/**/*.test.ts` to `vitest.config.unit.ts` — CI now runs them
  with no DB. Verified: 25/25 pass under the unit lane.
- **Review fixes (Pike, 2026-08-28):** `compareReceipts` now binds
  `scenario_id`, `principal_id`, `tenant_id`, `config_fingerprint`, and `status`
  (previously omitted); the replay timeline hash is only carried when the prior
  receipt has one, so a simulate→replay comparison can report `identical: true`.
- **Residue guard (Story 24.8 AC-9):** `docs-backend-residue-guard.sh` wired
  into `ai-guidelines-check.yml`; scan optimized (single-pass grep + tracked
  files only — 6+ min → 15s) and caught/fixed live residue in the Brooks role
  cards (`.claude/agents/brooks.md`, `.opencode/agent/core/brooks.md`).

### File List

- `src/lib/harness/runner.ts` — rewritten to compose the ProcessEngine; replay
  timeline-hash fix.
- `src/lib/harness/scenario.ts` — digest includes fixture response payloads +
  `policy_version` (C4).
- `src/lib/harness/receipt.ts` — `policy_version`/`schema_version` fields;
  `compareReceipts` binds identity/tenant/config/status fields.
- `src/lib/harness/__tests__/scenario-harness.test.ts` — hermetic pool mock;
  8 new tests (network-disabled, record mode, digest, version binding, idempotency).
- `schemas/allura-scenario-v1.schema.json` — optional `policy_version`; numeric
  revision pattern.
- `vitest.config.unit.ts` — harness + evals tests added to the unit lane.
- `tests/scenarios/*.yaml.json` — revisions normalized to numeric strings.

### Status Evidence

- `bun run vitest run --config vitest.config.unit.ts src/lib/harness/__tests__/`
  → 25/25 passed (no DB).
- `bun run vitest run --config vitest.config.unit.ts src/lib/evals/__tests__/`
  → 12/12 passed (no DB).
- `bun run typecheck` → clean.
- `bun run test:unit` (full lane) → 2237 passed | 160 skipped.
- `bash .github/scripts/docs-backend-residue-guard.sh` → OK (15s).
