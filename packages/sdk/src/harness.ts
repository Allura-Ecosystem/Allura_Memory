/**
 * @allura/sdk — HarnessOperations
 *
 * Typed clients for scenario execution, replay, evaluation, and evidence
 * inspection (Story 24.7 AC-1). All operations go through the same MCP
 * tools/call envelope as memory operations, so they are transport-consistent
 * with the rest of the SDK.
 */

import type { RequestFn } from "./memory.js";

// Passthrough schema: harness tool results are validated by the gateway;
// the SDK returns them typed by the declared response interfaces.
const passthrough = {
  parse: <T>(data: unknown): T => data as T,
} as { parse: <T>(data: unknown) => T };

// ── Request Params ───────────────────────────────────────────────────────────

export interface ScenarioRunParams {
  /** Scenario file path (repo-relative, e.g. examples/engineering-review-agent/scenarios/success.json) */
  scenario: string;
  /** Run mode: simulate (default) or replay */
  mode?: "simulate" | "replay";
  /** Prior receipt path for replay comparison */
  priorReceipt?: string;
}

export interface ScenarioReplayParams {
  /** Scenario file path */
  scenario: string;
  /** Prior receipt path to compare against */
  receipt: string;
}

export interface EvalRunParams {
  /** Evaluation suite path (defaults to evals/suites/portfolio.yaml) */
  suite?: string;
}

export interface EvidenceInspectParams {
  /** Optional directory to inspect (defaults to cwd receipts + artifacts/) */
  dir?: string;
}

// ── Responses ────────────────────────────────────────────────────────────────

export interface ScenarioRunResponse {
  status: "completed" | "failed" | "pending";
  error?: string;
  receiptPath?: string;
}

export interface ScenarioReplayResponse {
  identical: boolean;
  divergentFields: string[];
}

export interface EvalRunResponse {
  status: "pass" | "fail";
  lanes: Array<{ name: string; status: string; metrics?: Record<string, number> }>;
}

export interface EvidenceInspectResponse {
  receipts: string[];
  artifacts: string[];
}

// ── HarnessOperations ────────────────────────────────────────────────────────

export class HarnessOperations {
  constructor(private readonly request: RequestFn) {}

  /**
   * Execute a scenario through the deterministic harness.
   */
  async run(params: ScenarioRunParams): Promise<ScenarioRunResponse> {
    return (await this.request("scenario_run", params as unknown as Record<string, unknown>, passthrough)) as ScenarioRunResponse;
  }

  /**
   * Replay a scenario against a prior receipt and compare determinism.
   */
  async replay(params: ScenarioReplayParams): Promise<ScenarioReplayResponse> {
    return (await this.request("scenario_replay", params as unknown as Record<string, unknown>, passthrough)) as ScenarioReplayResponse;
  }

  /**
   * Run the portfolio evaluation suite.
   */
  async eval(params: EvalRunParams = {}): Promise<EvalRunResponse> {
    return (await this.request("eval_run", params as unknown as Record<string, unknown>, passthrough)) as EvalRunResponse;
  }

  /**
   * List evidence artifacts (run receipts + artifacts/ contents).
   */
  async inspect(params: EvidenceInspectParams = {}): Promise<EvidenceInspectResponse> {
    return (await this.request("evidence_inspect", params as unknown as Record<string, unknown>, passthrough)) as EvidenceInspectResponse;
  }
}
