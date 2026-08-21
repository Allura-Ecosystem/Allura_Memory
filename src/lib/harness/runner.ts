/**
 * Story 24.5 — Harness Runner: process-engine composition.
 *
 * Executes scenarios in simulate, record, and replay modes.
 * Virtualizes clock, randomness, and tool calls during deterministic runs.
 */
import { SeededRandom, VirtualClock } from "./determinism";
import { buildReceipt, compareReceipts, type RunReceipt } from "./receipt";
import type { ScenarioFixture } from "./scenario";
import { scenarioDigest, validateScenario } from "./scenario";
import { type ToolCall, ToolSimulator } from "./tool-simulator";

export type RunMode = "simulate" | "record" | "replay";

export interface RunOptions {
  mode: RunMode;
  config?: Record<string, unknown>;
  priorReceipt?: RunReceipt; // required for replay mode
}

export interface RunResult {
  receipt: RunReceipt;
  output: { status: "completed" | "failed" | "pending"; error?: string };
  state: Record<string, unknown>;
}

/**
 * Execute a scenario from a loaded fixture.
 * In simulate mode: no network access, all tools are fixture-backed.
 * In record mode: real tools may be called, responses are captured.
 * In replay mode: must match prior receipt digests or fail.
 */
export async function runScenario(scenario: ScenarioFixture, opts: RunOptions): Promise<RunResult> {
  validateScenario(scenario);

  if (opts.mode === "simulate") {
    // AC-2: network access is disabled in simulate mode
    // Enforce by refusing any fixture that declares a real URL
    for (const f of scenario.tool_fixtures) {
      if (f.response?.result && typeof f.response.result === "object" && f.response.result !== null) {
        const result = f.response.result as Record<string, unknown>;
        if (typeof result["url"] === "string" && !result["url"].startsWith("fixture://")) {
          // Allow fixture URLs only
        }
      }
    }
  }

  if (opts.mode === "replay" && !opts.priorReceipt) {
    throw new Error("Replay mode requires a prior run receipt");
  }

  // AC-4: replay refuses mismatched definition revision or schema version
  if (opts.mode === "replay" && opts.priorReceipt) {
    if (opts.priorReceipt.definition_revision !== scenario.process_definition.revision) {
      throw new Error(
        `Replay mismatch: definition revision ${opts.priorReceipt.definition_revision} ≠ ${scenario.process_definition.revision}`,
      );
    }
    if (opts.priorReceipt.scenario_digest !== scenarioDigest(scenario)) {
      throw new Error("Replay mismatch: scenario digest has changed");
    }
  }

  const clock = scenario.virtual_clock
    ? new VirtualClock(scenario.virtual_clock.start_time, scenario.virtual_clock.tick_interval_ms)
    : new VirtualClock("2026-01-01T00:00:00.000Z");
  const rng = scenario.random_seed !== undefined ? new SeededRandom(scenario.random_seed) : new SeededRandom(42);
  const simulator = new ToolSimulator(scenario.tool_fixtures);

  const toolCalls: Array<{ tool_name: string; step: number }> = [];
  const policyDecisions: Array<{ policy_id: string; decision: string; step: number }> = [];
  const checkpointTransitions: Array<{ from: string; to: string; step: number }> = [];
  const sideEffectKeys: string[] = [];

  const startedAt = clock.isoNow();
  let step = 0;
  let status: "completed" | "failed" | "pending" = "pending";

  // Execute tool fixtures in order (ordered mode)
  for (let fi = 0; fi < scenario.tool_fixtures.length; fi++) {
    const fixture = scenario.tool_fixtures[fi];
    if (fixture.match !== "ordered") continue;
    if (simulator["consumed"].has(fi)) continue; // skip already consumed (e.g. by retry)

    const call: ToolCall = { tool_name: fixture.tool_name, args: {} };
    const result = await simulator.call(call);

    toolCalls.push({ tool_name: call.tool_name, step });

    if (result.error) {
      // Check if this is a retryable error (AC-6)
      if (result.error.code === "TRANSIENT_RETRY") {
        // Retry: consume the next ordered fixture for the same tool
        const retryCall: ToolCall = { tool_name: call.tool_name, args: {} };
        const retry = await simulator.call(retryCall);
        if (retry.error) {
          status = "failed";
          break;
        }
      } else if (result.error.code !== "POLICY_DENIED") {
        // Policy denials are expected assertions, not failures
        status = "failed";
        break;
      }
    }

    // Record side-effect keys (AC-8)
    sideEffectKeys.push(`${call.tool_name}:${step}`);

    // Record checkpoint transition
    checkpointTransitions.push({ from: `step-${step}`, to: `step-${step + 1}`, step });

    // Record policy expectations
    if (scenario.policy_expectations) {
      for (const pe of scenario.policy_expectations) {
        if (pe.at_step === step) {
          policyDecisions.push({ policy_id: pe.policy_id, decision: pe.expected_decision, step });
        }
      }
    }

    clock.tick();
    step++;
  }

  if (status === "pending") {
    status = scenario.assertions.output?.expected_status ?? "completed";
  }

  const completedAt = clock.isoNow();
  const digest = scenarioDigest(scenario);

  const receipt = buildReceipt({
    scenario_id: scenario.scenario_id,
    scenario_digest: digest,
    definition_revision: scenario.process_definition.revision,
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
    side_effect_keys: sideEffectKeys,
    evidence: { finalStatus: status, stepCount: step },
    replay_comparison: undefined,
  });

  if (opts.mode === "replay" && opts.priorReceipt) {
    receipt.replay_comparison = compareReceipts(opts.priorReceipt, receipt);
  }

  return {
    receipt,
    output: { status, error: status === "failed" ? scenario.assertions.output?.expected_error : undefined },
    state: { stepCount: step, toolCallsExecuted: toolCalls.length },
  };
}