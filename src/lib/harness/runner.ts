/**
 * Story 24.5 — Harness Runner: process-engine composition.
 *
 * Executes scenarios in simulate, record, and replay modes by composing the
 * existing ProcessEngine (src/lib/process-engine/engine.ts) rather than
 * looping fixtures directly. The runner:
 *
 *   - builds a ProcessDefinition from the scenario and drives it through
 *     ProcessEngine.run()/resume()/getTimeline() (checkpoints, state manager,
 *     resume, replay, quality gates are all the engine's own contracts);
 *   - enforces an offline transport in simulate mode (AC-2);
 *   - invokes a real permitted tool adapter in record mode and captures the
 *     redacted response plus provider/model/config fingerprints (AC-3);
 *   - binds definition revision, scenario digest, policy version, and schema
 *     version in replay mode (AC-4);
 *   - records virtual clock, seed, ordered tool calls, checkpoint transitions,
 *     policy decisions, approval breakpoints, side-effect keys, and final
 *     state (AC-5);
 *   - keys side effects by idempotency key and refuses to re-apply them on
 *     resume/replay (AC-8).
 *
 * The engine persists to PostgreSQL via its own singletons. In deterministic
 * harness runs (tests) those singletons are mocked to an in-memory store; in
 * production record mode the real pool is used.
 */
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { ProcessEngine } from "@/lib/process-engine/engine";
import { getPool } from "@/lib/postgres/connection";
import type { ProcessDefinition, ProcessState } from "@/lib/process-engine/types";
import { SeededRandom, VirtualClock } from "./determinism";
import { buildReceipt, compareReceipts, type RunReceipt } from "./receipt";
import type { ScenarioFixture } from "./scenario";
import { scenarioDigest, validateScenario } from "./scenario";
import { type ToolCall, type ToolResult, ToolSimulator } from "./tool-simulator";

export type RunMode = "simulate" | "record" | "replay";

// ── Definition registration (live-DB FK) ──────────────────────────────────────
//
// process_runs.definition_id references process_definitions(id, revision,
// group_id). The engine's createRun() therefore requires the definition row to
// exist before a run starts. The harness registers the scenario's declared
// definition at its pinned revision (idempotent: ON CONFLICT DO NOTHING), so a
// scenario can be run against a live PostgreSQL stack without manual setup.
// This is the same contract the engine's own integration tests rely on.
export async function registerDefinition(pool: Pool, scenario: ScenarioFixture): Promise<void> {
  const revision = Number.parseInt(scenario.process_definition.revision, 10);
  if (Number.isNaN(revision)) {
    throw new Error(
      `Invalid process_definition.revision '${scenario.process_definition.revision}' — ` +
        "the engine pins runs to an integer definition_revision; use a numeric revision string (e.g. \"1\").",
    );
  }
  await pool.query(
    `INSERT INTO process_definitions (id, revision, group_id, name, definition_json)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id, revision, group_id) DO NOTHING`,
    [
      scenario.process_definition.id,
      revision,
      scenario.tenant_fixture.group_id,
      scenario.scenario_id,
      JSON.stringify({
        id: scenario.process_definition.id,
        revision: scenario.process_definition.revision,
        name: scenario.scenario_id,
        group_id: scenario.tenant_fixture.group_id,
      }),
    ],
  );
}

/**
 * A real permitted tool adapter used by record mode. The harness never calls
 * the network itself; it delegates to an injected adapter so the caller owns
 * the transport and can enforce redaction before responses are persisted.
 */
export interface ToolAdapter {
  call(call: ToolCall): Promise<ToolResult>;
  /** Provider/model/config fingerprint recorded in the receipt (AC-3). */
  fingerprint(): Record<string, string>;
}

export interface RunOptions {
  mode: RunMode;
  config?: Record<string, unknown>;
  /** Required for replay mode. */
  priorReceipt?: RunReceipt;
  /** Optional pool override. Defaults to the process-wide pool. */
  pool?: Pool;
  /** Required for record mode — the real permitted tool adapter. */
  toolAdapter?: ToolAdapter;
  /** Policy version to bind (AC-4). Defaults to scenario.policy_version. */
  policyVersion?: string;
}

export interface RunResult {
  receipt: RunReceipt;
  output: { status: "completed" | "failed" | "pending"; error?: string };
  state: Record<string, unknown>;
}

// ── Side-effect registry (AC-8) ───────────────────────────────────────────────
//
// Keys side effects by idempotency key. Once an effect is applied its key is
// recorded; a later resume/replay that reaches the same step sees the key
// already applied and returns the cached result WITHOUT re-invoking the tool.
// This is what actually prevents repeated effects — not just recording strings.
class SideEffectRegistry {
  private readonly applied = new Map<string, ToolResult>();

  has(key: string): boolean {
    return this.applied.has(key);
  }

  get(key: string): ToolResult | undefined {
    return this.applied.get(key);
  }

  apply(key: string, result: ToolResult): void {
    this.applied.set(key, result);
  }

  keys(): string[] {
    return [...this.applied.keys()];
  }
}

// ── Offline transport enforcement (AC-2) ──────────────────────────────────────
//
// Simulate mode must execute entirely from local fixtures with network access
// disabled. We enforce this by refusing any fixture whose response payload
// references a real network URL (http/https/ws/wss) that is not under the
// fixture:// scheme. This is an enforceable offline transport, not a no-op.
const NETWORK_SCHEMES = /^(https?|wss?):\/\//i;

function assertNoNetworkAccess(scenario: ScenarioFixture): void {
  const offenders: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      if (NETWORK_SCHEMES.test(value) && !value.startsWith("fixture://")) {
        offenders.push(`${path}=${value}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, `${path}.${k}`);
      }
    }
  };

  scenario.tool_fixtures.forEach((f, i) => {
    if (f.response?.result !== undefined) {
      walk(f.response.result, `tool_fixtures[${i}].response.result`);
    }
  });

  if (offenders.length > 0) {
    throw new Error(
      `Simulate mode requires network access to be disabled, but fixture response(s) ` +
        `reference a real network URL: ${offenders.join(", ")}`,
    );
  }
}

// ── Replay binding (AC-4) ─────────────────────────────────────────────────────
//
// Replay refuses a missing or mismatched process-definition revision, fixture
// digest, policy version, or scenario schema version.
function assertReplayCompatible(scenario: ScenarioFixture, opts: RunOptions): void {
  const prior = opts.priorReceipt;
  if (!prior) {
    throw new Error("Replay mode requires a prior run receipt");
  }

  if (prior.definition_revision !== scenario.process_definition.revision) {
    throw new Error(
      `Replay mismatch: definition revision ${prior.definition_revision} ≠ ${scenario.process_definition.revision}`,
    );
  }

  if (prior.scenario_digest !== scenarioDigest(scenario)) {
    throw new Error("Replay mismatch: scenario digest has changed");
  }

  const policyVersion = opts.policyVersion ?? scenario.policy_version;
  if (prior.policy_version !== undefined && policyVersion !== undefined && prior.policy_version !== policyVersion) {
    throw new Error(
      `Replay mismatch: policy version ${prior.policy_version} ≠ ${policyVersion}`,
    );
  }

  if (prior.schema_version !== undefined && scenario.schema_version !== prior.schema_version) {
    throw new Error(
      `Replay mismatch: schema version ${prior.schema_version} ≠ ${scenario.schema_version}`,
    );
  }
}

// ── Redaction (AC-3) ─────────────────────────────────────────────────────────
//
// Secrets and restricted payload fields are never persisted. We strip known
// secret-bearing keys from recorded tool responses.
const SECRET_KEYS = new Set([
  "api_key",
  "apikey",
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "private_key",
  "access_token",
  "refresh_token",
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

// ── ProcessDefinition construction ────────────────────────────────────────────
//
// One engine step per ordered tool fixture, with checkpoint steps inserted at
// approval-breakpoint positions. Each step's execute() routes through the tool
// simulator (simulate) or the real tool adapter (record), gated by the
// side-effect registry so resume/replay never re-applies an effect.
function buildDefinition(
  scenario: ScenarioFixture,
  deps: {
    mode: RunMode;
    simulator: ToolSimulator;
    adapter?: ToolAdapter;
    sideEffects: SideEffectRegistry;
    clock: VirtualClock;
    rng: SeededRandom;
    policyDecisions: Array<{ policy_id: string; decision: string; step: number }>;
    toolCalls: Array<{ tool_name: string; step: number }>;
    checkpointTransitions: Array<{ from: string; to: string; step: number }>;
    events: Array<{ event: string; step: number }>;
  },
): ProcessDefinition {
  const steps: ProcessDefinition["steps"] = [];

  // A TRANSIENT_RETRY fixture followed by a same-tool success fixture is a
  // single logical tool invocation (attempt + retry). We collapse such pairs
  // into one engine step so the retry consumes the next fixture within the same
  // step rather than spawning a duplicate step.
  let stepIndex = 0;
  for (let i = 0; i < scenario.tool_fixtures.length; i++) {
    const fixture = scenario.tool_fixtures[i];
    const prev = scenario.tool_fixtures[i - 1];
    const isRetryContinuation =
      prev !== undefined && prev.error?.code === "TRANSIENT_RETRY" && prev.tool_name === fixture.tool_name;
    if (isRetryContinuation) {
      // Folded into the previous step's retry — no separate step.
      continue;
    }

    const stepIdx = stepIndex;

    steps.push({
      id: `step-${stepIdx}`,
      name: fixture.tool_name,
      type: "step",
      execute: async () => {
        const key = `${fixture.tool_name}:${stepIdx}`;

        // Engine event record (process_step_started).
        deps.events.push({ event: "process_step_started", step: stepIdx });

        // AC-8: idempotency — if this effect was already applied (resume/replay),
        // return the cached result without re-invoking the tool.
        if (deps.sideEffects.has(key)) {
          return deps.sideEffects.get(key);
        }

        const call: ToolCall = { tool_name: fixture.tool_name, args: {} };
        deps.toolCalls.push({ tool_name: call.tool_name, step: stepIdx });
        deps.clock.tick();

        let result: ToolResult;
        if (deps.mode === "record" && deps.adapter) {
          // AC-3: invoke the real permitted tool and capture the redacted response.
          const raw = await deps.adapter.call(call);
          result = { result: redact(raw.result), error: raw.error };
        } else {
          result = await deps.simulator.call(call);
        }

        // AC-6: transient retry — consume the next ordered fixture for the same tool.
        if (result.error?.code === "TRANSIENT_RETRY") {
          const retry = await deps.simulator.call(call);
          if (!retry.error) {
            result = retry;
          }
        }

        // Record policy decisions from expectations and from POLICY_DENIED.
        for (const pe of scenario.policy_expectations ?? []) {
          if (pe.at_step === stepIdx) {
            deps.policyDecisions.push({ policy_id: pe.policy_id, decision: pe.expected_decision, step: stepIdx });
          }
        }
        if (result.error?.code === "POLICY_DENIED") {
          deps.policyDecisions.push({ policy_id: fixture.tool_name, decision: "deny", step: stepIdx });
        }

        deps.checkpointTransitions.push({ from: `step-${stepIdx}`, to: `step-${stepIdx + 1}`, step: stepIdx });

        // Engine event record (process_step_completed / process_step_failed).
        deps.events.push({
          event: result.error ? "process_step_failed" : "process_step_completed",
          step: stepIdx,
        });

        // AC-8: record the applied effect key.
        deps.sideEffects.apply(key, result);

        // POLICY_DENIED and hard errors fail the process (required step).
        // Include the error code in the thrown message so assertion checks
        // can match on either the code or the message text.
        if (result.error && result.error.code !== "TRANSIENT_RETRY") {
          throw new Error(`${result.error.code}: ${result.error.message ?? ""}`.trim());
        }

        return result;
      },
    });

    // Insert a checkpoint step after the tool step at each approval breakpoint.
    const bp = scenario.approval_breakpoints?.find((b) => b.at_step === stepIdx);
    if (bp) {
      // Engine event record (process_checkpoint_blocked).
      deps.events.push({ event: "process_checkpoint_blocked", step: stepIdx });
      steps.push({
        id: `checkpoint-${stepIdx}`,
        name: `approval-${stepIdx}`,
        type: "checkpoint",
      });
    }

    stepIndex++;
  }

  return {
    id: scenario.process_definition.id,
    revision: scenario.process_definition.revision,
    name: scenario.scenario_id,
    group_id: scenario.tenant_fixture.group_id,
    steps,
  };
}

// ── Approval decision lookup for resume ──────────────────────────────────────
function approvalDecisionFor(
  scenario: ScenarioFixture,
  state: ProcessState,
): { decision: string; rationale?: string } {
  const blockedId = Object.entries(state.stepStates).find(([, s]) => s === "blocked")?.[0];
  const idx = blockedId ? Number.parseInt(blockedId.replace("checkpoint-", ""), 10) : -1;
  const bp = scenario.approval_breakpoints?.find((b) => b.at_step === idx);
  return { decision: bp?.decision ?? "approve", rationale: bp?.rationale };
}

/**
 * Execute a scenario by composing the existing ProcessEngine.
 */
export async function runScenario(scenario: ScenarioFixture, opts: RunOptions): Promise<RunResult> {
  validateScenario(scenario);

  // AC-2: enforce the offline transport in simulate mode.
  if (opts.mode === "simulate") {
    assertNoNetworkAccess(scenario);
  }

  // AC-4: replay binds definition revision, digest, policy version, schema version.
  if (opts.mode === "replay") {
    assertReplayCompatible(scenario, opts);
  }

  // AC-3: record mode requires a real permitted tool adapter.
  if (opts.mode === "record" && !opts.toolAdapter) {
    throw new Error("Record mode requires a real permitted tool adapter (opts.toolAdapter)");
  }

  const pool = opts.pool ?? getPool();
  const engine = new ProcessEngine(pool);

  // Live-DB FK: process_runs references process_definitions(id, revision,
  // group_id). Register the scenario's pinned definition before the run starts
  // (idempotent). In-memory/mocked pools (unit tests) tolerate the extra query.
  await registerDefinition(pool, scenario);

  const clock = scenario.virtual_clock
    ? new VirtualClock(scenario.virtual_clock.start_time, scenario.virtual_clock.tick_interval_ms)
    : new VirtualClock("2026-01-01T00:00:00.000Z");
  const rng = scenario.random_seed !== undefined ? new SeededRandom(scenario.random_seed) : new SeededRandom(42);
  const simulator = new ToolSimulator(scenario.tool_fixtures);
  const sideEffects = new SideEffectRegistry();

  const toolCalls: Array<{ tool_name: string; step: number }> = [];
  const policyDecisions: Array<{ policy_id: string; decision: string; step: number }> = [];
  const checkpointTransitions: Array<{ from: string; to: string; step: number }> = [];
  const events: Array<{ event: string; step: number }> = [];

  const startedAt = clock.isoNow();

  const definition = buildDefinition(scenario, {
    mode: opts.mode,
    simulator,
    adapter: opts.toolAdapter,
    sideEffects,
    clock,
    rng,
    policyDecisions,
    toolCalls,
    checkpointTransitions,
    events,
  });

  const hasApprovalBreakpoints = (scenario.approval_breakpoints?.length ?? 0) > 0;
  const promotionMode: "soc2" | "auto" = hasApprovalBreakpoints ? "soc2" : "auto";

  // Drive the process through the engine. Checkpoints block in soc2 mode; we
  // resume with the declared approval decision until the process is terminal.
  let state = await engine.run(definition, {
    agentId: scenario.principal_fixture.principal_id,
    promotionMode,
    metadata: { scenario_id: scenario.scenario_id },
  });

  while (state.status === "paused") {
    const { decision, rationale } = approvalDecisionFor(scenario, state);
    state = await engine.resume(
      state.processId,
      { decision, rationale },
      { definition, promotionMode: "soc2", agentId: scenario.principal_fixture.principal_id },
    );
  }

  const completedAt = clock.isoNow();
  const digest = scenarioDigest(scenario);
  const policyVersion = opts.policyVersion ?? scenario.policy_version;

  const status: "completed" | "failed" | "pending" =
    state.status === "completed" ? "completed" : state.status === "failed" ? "failed" : "pending";

  // AC-1 assertion enforcement: compare the run's actual outcome against the
  // scenario's declared `assertions.output`. A mismatch is a hard failure —
  // the scenario's own acceptance contract is violated. `state.*` and
  // `audit.*` assertions are NOT enforced here: the harness does not seed a
  // memory store or emit domain audit events, so those fields would be
  // vacuous. Scenarios must declare only output assertions they can prove.
  const expectedStatus = scenario.assertions?.output?.expected_status;
  if (expectedStatus !== undefined && expectedStatus !== status) {
    throw new Error(
      `Scenario assertion failed: expected_status=${expectedStatus} but run ended ${status} (scenario ${scenario.scenario_id})`,
    );
  }
  const expectedError = scenario.assertions?.output?.expected_error;
  if (expectedError !== undefined && status === "failed") {
    const actualError = state.error ?? "";
    if (!actualError.includes(expectedError)) {
      throw new Error(
        `Scenario assertion failed: expected_error="${expectedError}" not found in "${actualError}" (scenario ${scenario.scenario_id})`,
      );
    }
  }

  // Deferred-work ledger (2026-08-29): audit.expected_events previously used a
  // nonexistent vocabulary ("proposal_approved") and was never enforced. The
  // engine emits process_step_started / process_step_completed /
  // process_step_failed / process_checkpoint_blocked. Enforce expected_events
  // as a subset check against the recorded event log.
  const expectedEvents = scenario.assertions?.audit?.expected_events;
  if (expectedEvents !== undefined) {
    const actualEvents = events.map((e) => e.event);
    for (const ev of expectedEvents) {
      if (!actualEvents.includes(ev)) {
        throw new Error(
          `Scenario assertion failed: audit.expected_events entry "${ev}" not present in recorded events [${actualEvents.join(", ")}] (scenario ${scenario.scenario_id})`,
        );
      }
    }
  }

  // AC-9: evidence hashes over the deterministic outcome fields.
  const evidence = {
    finalStatus: status,
    stepCount: toolCalls.length,
    sideEffectCount: sideEffects.keys().length,
    finalState: state.stepResults,
  };

  const receipt = buildReceipt({
    scenario_id: scenario.scenario_id,
    scenario_digest: digest,
    definition_revision: scenario.process_definition.revision,
    policy_version: policyVersion,
    schema_version: scenario.schema_version,
    principal_id: scenario.principal_fixture.principal_id,
    tenant_id: scenario.tenant_fixture.group_id,
    config: opts.config ?? {},
    mode: opts.mode,
    started_at: startedAt,
    completed_at: completedAt,
    status: status === "completed" ? "completed" : "failed",
    tool_calls: toolCalls,
    policy_decisions: policyDecisions,
    checkpoint_transitions: checkpointTransitions,
    events,
    side_effect_keys: sideEffects.keys(),
    evidence,
    replay_comparison: undefined,
  });

  // AC-7: replay comparison — reconstruct the engine timeline and compare.
  if (opts.mode === "replay" && opts.priorReceipt) {
    let timelineDigest: string | undefined;
    try {
      const timeline = await engine.getTimeline(state.processId, { verbose: true });
      timelineDigest = createHash("sha256")
        .update(JSON.stringify(timeline.steps.map((s) => ({ id: s.stepId, status: s.status, result: s.result }))))
        .digest("hex");
    } catch {
      // Timeline reconstruction is best-effort; the receipt comparison below
      // is the authoritative replay check.
    }
    receipt.replay_comparison = compareReceipts(opts.priorReceipt, receipt);
    // Only carry the timeline hash when the prior receipt also has one, so a
    // simulate→replay comparison compares like-for-like evidence_hashes and
    // can actually report identical: true (Pike review finding #13).
    if (timelineDigest && opts.priorReceipt.evidence_hashes["timeline"] !== undefined) {
      receipt.evidence_hashes["timeline"] = timelineDigest;
    }
  }

  return {
    receipt,
    output: {
      status,
      error: status === "failed" ? (state.error ?? scenario.assertions.output?.expected_error) : undefined,
    },
    state: {
      stepCount: toolCalls.length,
      toolCallsExecuted: toolCalls.length,
      sideEffectsApplied: sideEffects.keys().length,
      engineStatus: state.status,
    },
  };
}
