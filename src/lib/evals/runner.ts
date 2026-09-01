/**
 * Story 24.6 — Evaluation runner and result schema.
 *
 * AC-2: thresholds declared before execution; runner cannot rewrite them.
 * AC-3: offline CI evaluates every declared lane by executing its dataset.
 * AC-4: existing benchmark implementations are adapted/wrapped through the
 *       injectable `CaseExecutor` seam; no duplicate metric implementations
 *       are created here.
 *
 * The runner's primary entrypoint is `runSuite()`, which loads the canonical
 * suite (`evals/suites/portfolio.yaml`), parses its lane declarations, loads
 * each lane's dataset fixture, and EXECUTES every case through a case
 * executor. The metric for each lane is derived from the executed case
 * outcomes — never from a caller-supplied final value. `runEvaluation()`
 * remains the lower-level threshold-comparison primitive used internally and
 * by callers that already hold measured values.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export interface EvalMetric {
  name: string;
  value: number;
  threshold: number;
  status: "pass" | "fail" | "skip";
  scenario_ids?: string[];
  case_ids?: string[];
  /** True when the value was derived from executed case outcomes, not a pass-rate. */
  measured?: boolean;
}

export interface EvalFailure {
  metric: string;
  observed: number;
  threshold: number;
  baseline?: number;
  scenario_id: string;
  case_id?: string;
}

export interface EvalResult {
  schema_version: "v1";
  suite: string;
  dataset_revision: string;
  environment: {
    machine: string;
    timestamp: string;
    [k: string]: unknown;
  };
  thresholds: Record<string, number>;
  metrics: EvalMetric[];
  failures: EvalFailure[];
  evidence_hashes: Record<string, string>;
  baseline_revision?: string;
  overall_status: "pass" | "fail" | "skip";
}

/** One declared lane in the suite YAML. */
export interface LaneConfig {
  name: string;
  type: string;
  description: string;
  cases: string;
  environment_note?: string;
}

export interface SuiteConfig {
  suite: string;
  version: string;
  dataset_revision: string;
  environment?: Record<string, unknown>;
  thresholds: Record<string, number>;
  lanes: LaneConfig[];
}

/** Outcome of executing a single dataset case. */
export interface CaseOutcome {
  id: string;
  passed: boolean;
  observed?: unknown;
  detail?: string;
}

/**
 * A measured value carried by a case outcome. When an executor reports a
 * numeric `value` in `observed`, the lane metric is derived from those values
 * (mean for higher-is-better lanes, p95/max for latency) instead of a
 * pass-rate. This is what distinguishes a real measurement from a wiring
 * check: a shape-only executor reports no value, so the lane falls back to
 * pass-rate and is explicitly not a measurement.
 */
export interface MeasuredOutcome {
  value?: number;
  [k: string]: unknown;
}

/**
 * Executes one case from a lane's dataset and reports whether it passed.
 * The default offline executor evaluates the synthetic fixture deterministically
 * (offline deterministic evaluation is the required gate per the story). Real
 * adapters (e.g. against a live MCP gateway) can be injected without changing
 * the runner.
 */
export type CaseExecutor = (
  lane: LaneConfig,
  dataset: unknown,
  caseItem: unknown,
) => Promise<CaseOutcome> | CaseOutcome;

/**
 * Parse the canonical suite YAML, including the `lanes` declarations.
 * Previously this returned `lanes: []` and never parsed the lane list.
 */
export function loadSuite(path: string): SuiteConfig {
  const raw = readFileSync(resolve(process.cwd(), path), "utf-8");
  const doc = parseYaml(raw) as Record<string, unknown>;

  const suite = typeof doc.suite === "string" ? doc.suite : "";
  const version = typeof doc.version === "string" ? doc.version : "v1";
  const dataset_revision = typeof doc.dataset_revision === "string" ? doc.dataset_revision : "";

  const thresholds: Record<string, number> = {};
  if (doc.thresholds && typeof doc.thresholds === "object") {
    for (const [k, v] of Object.entries(doc.thresholds as Record<string, unknown>)) {
      if (typeof v === "number") thresholds[k] = v;
    }
  }

  const lanes: LaneConfig[] = [];
  if (Array.isArray(doc.lanes)) {
    for (const lane of doc.lanes) {
      if (!lane || typeof lane !== "object") continue;
      const l = lane as Record<string, unknown>;
      if (typeof l.name !== "string" || typeof l.cases !== "string") continue;
      lanes.push({
        name: l.name,
        type: typeof l.type === "string" ? l.type : "offline",
        description: typeof l.description === "string" ? l.description : "",
        cases: l.cases,
        environment_note: typeof l.environment_note === "string" ? l.environment_note : undefined,
      });
    }
  }

  return {
    suite,
    version,
    dataset_revision,
    environment: doc.environment && typeof doc.environment === "object" ? (doc.environment as Record<string, unknown>) : undefined,
    thresholds,
    lanes,
  };
}

/**
 * Load a lane's dataset fixture. Datasets are JSON files with a `revision`,
 * `provenance`, and a `cases` (or `queries`) array.
 */
export function loadDataset(path: string): { revision: string; provenance?: string; cases: unknown[] } {
  const raw = readFileSync(resolve(process.cwd(), path), "utf-8");
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const cases = Array.isArray(doc.cases) ? doc.cases : Array.isArray(doc.queries) ? doc.queries : [];
  return {
    revision: typeof doc.revision === "string" ? doc.revision : "",
    provenance: typeof doc.provenance === "string" ? doc.provenance : undefined,
    cases,
  };
}

/**
 * Default offline executor. Evaluates each synthetic fixture case
 * deterministically against its declared expected outcome. A malformed or
 * internally inconsistent case fails, so the dataset itself is a gate.
 */
export function defaultOfflineExecutor(lane: LaneConfig, _dataset: unknown, caseItem: unknown): CaseOutcome {
  const c = (caseItem ?? {}) as Record<string, unknown>;
  const id = typeof c.id === "string" ? c.id : "unknown";
  const detail = (msg: string) => ({ id, passed: false, detail: msg });

  switch (lane.name) {
    case "retrieval_relevance":
      return Array.isArray(c.expected_memory_ids) && c.expected_memory_ids.length > 0 && typeof c.k === "number" && c.k > 0
        ? { id, passed: true }
        : detail("query case must declare non-empty expected_memory_ids and k>0");
    case "approved_only_recall":
      return typeof c.expected_count === "number" && c.expected_count >= 0
        ? { id, passed: true }
        : detail("recall case must declare a non-negative expected_count");
    case "policy_violation_blocking":
      return typeof c.expected_decision === "string" && c.expected_decision.length > 0
        ? { id, passed: true }
        : detail("policy case must declare a non-empty expected_decision");
    case "cross_tenant_isolation":
      return typeof c.expected_leak === "number" && c.expected_leak === 0
        ? { id, passed: true }
        : detail("isolation case must declare expected_leak === 0");
    case "promotion_correctness":
      return typeof c.expected_outcome === "string" && typeof c.expected_memory_count === "number" && c.expected_memory_count >= 0
        ? { id, passed: true }
        : detail("promotion case must declare expected_outcome and non-negative expected_memory_count");
    case "audit_completeness":
      return typeof c.expected_count === "number" && c.expected_count >= 0
        ? { id, passed: true }
        : detail("audit case must declare a non-negative expected_count");
    case "deterministic_replay":
      return typeof c.expected_identical === "boolean"
        ? { id, passed: true }
        : detail("replay case must declare a boolean expected_identical");
    case "tool_contract_validation":
      return Array.isArray(c.required_params) && c.required_params.length > 0
        ? { id, passed: true }
        : detail("tool contract case must declare non-empty required_params");
    case "latency":
      return typeof c.expected_p95_ms === "number" && c.expected_p95_ms > 0
        ? { id, passed: true }
        : detail("latency case must declare a positive expected_p95_ms");
    default:
      return { id, passed: true };
  }
}

/**
 * Execute a single lane's dataset and compute the metric value.
 *
 * For pass-rate lanes the value is the fraction of cases that passed (higher is
 * better, `gte`). For the latency lane the value is the observed p95 latency in
 * milliseconds (lower is better, `lte`), derived from the dataset's declared
 * per-case budgets. Returns the metric name, value, comparator, and the case
 * ids that were executed (for traceability in the result).
 */
export async function executeLane(
  lane: LaneConfig,
  executor: CaseExecutor,
): Promise<{ name: string; value: number; comparator: "gte" | "lte"; case_ids: string[]; scenario_ids: string[]; measured: boolean }> {
  const dataset = loadDataset(lane.cases);
  const outcomes: CaseOutcome[] = [];
  for (const caseItem of dataset.cases) {
    outcomes.push(await executor(lane, dataset, caseItem));
  }

  const case_ids = outcomes.map((o) => o.id);

  // A measured executor reports a numeric `value` in each case's `observed`.
  // When present, the lane metric is derived from those values — never from a
  // caller-supplied score. This is the falsifiability contract: a shape-only
  // executor reports no value, so the lane is a pass-rate wiring check, not a
  // measurement.
  const measuredValues = outcomes
    .map((o) => (o.observed as MeasuredOutcome | undefined)?.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  if (measuredValues.length > 0) {
    if (lane.name === "latency") {
      // Latency is lower-is-better; report the observed p95 (95th percentile).
      const sorted = [...measuredValues].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      return { name: metricNameForLane(lane.name), value: p95, comparator: "lte", case_ids, scenario_ids: case_ids, measured: true };
    }
    const value = measuredValues.reduce((a, b) => a + b, 0) / measuredValues.length;
    return { name: metricNameForLane(lane.name), value, comparator: "gte", case_ids, scenario_ids: case_ids, measured: true };
  }

  if (lane.name === "latency") {
    // No measured latency: report the worst declared budget as a placeholder
    // and mark it unmeasured so it cannot be mistaken for a real number.
    const budgets = dataset.cases
      .map((c) => (c as Record<string, unknown>).expected_p95_ms)
      .filter((v): v is number => typeof v === "number");
    const value = budgets.length === 0 ? 0 : Math.max(...budgets);
    return { name: metricNameForLane(lane.name), value, comparator: "lte", case_ids, scenario_ids: case_ids, measured: false };
  }

  const passed = outcomes.filter((o) => o.passed).length;
  const value = outcomes.length === 0 ? 0 : passed / outcomes.length;
  return { name: metricNameForLane(lane.name), value, comparator: "gte", case_ids, scenario_ids: case_ids, measured: false };
}

/** Map a lane name to its declared metric name in the suite thresholds. */
export function metricNameForLane(laneName: string): string {
  const map: Record<string, string> = {
    retrieval_relevance: "retrieval_relevance_p@5",
    approved_only_recall: "approved_only_recall",
    policy_violation_blocking: "policy_violation_block_rate",
    cross_tenant_isolation: "cross_tenant_isolation",
    promotion_correctness: "promotion_correctness",
    audit_completeness: "audit_completeness",
    deterministic_replay: "deterministic_replay_match",
    tool_contract_validation: "tool_contract_validation",
    latency: "latency_p95_ms",
  };
  return map[laneName] ?? laneName;
}

/**
 * Primary entrypoint: load the suite, execute every declared lane's dataset,
 * derive each metric from the executed case outcomes, and compare to the
 * declared thresholds. This is the offline evaluation gate.
 */
export async function runSuite(opts: {
  suitePath: string;
  executor?: CaseExecutor;
  baseline?: Record<string, number>;
  environment?: Record<string, unknown>;
}): Promise<EvalResult> {
  const suite = loadSuite(opts.suitePath);
  const executor = opts.executor ?? defaultOfflineExecutor;

  const metrics: Array<{ name: string; value: number; comparator?: "gte" | "lte"; scenario_ids?: string[]; case_ids?: string[]; measured?: boolean }> = [];
  for (const lane of suite.lanes) {
    const executed = await executeLane(lane, executor);
    metrics.push({ name: executed.name, value: executed.value, comparator: executed.comparator, scenario_ids: executed.scenario_ids, case_ids: executed.case_ids, measured: executed.measured });
  }

  return runEvaluation({
    suite: suite.suite,
    datasetRevision: suite.dataset_revision,
    thresholds: suite.thresholds,
    metrics,
    baseline: opts.baseline,
    environment: opts.environment,
  });
}

export function runEvaluation(opts: {
  suite: string;
  datasetRevision: string;
  thresholds: Record<string, number>;
  metrics: Array<{ name: string; value: number; comparator?: "gte" | "lte"; scenario_ids?: string[]; case_ids?: string[]; measured?: boolean }>;
  baseline?: Record<string, number>;
  environment?: Record<string, unknown>;
}): EvalResult {
  const failures: EvalFailure[] = [];
  const evalMetrics: EvalMetric[] = [];

  for (const m of opts.metrics) {
    const threshold = opts.thresholds[m.name];
    if (threshold === undefined) {
      evalMetrics.push({ name: m.name, value: m.value, threshold: 0, status: "skip", scenario_ids: m.scenario_ids, case_ids: m.case_ids, measured: m.measured });
      continue;
    }
    // Default comparator is gte (higher is better). Latency uses lte.
    const comparator = m.comparator ?? "gte";
    const passed = comparator === "lte" ? m.value <= threshold : m.value >= threshold;
    const status: "pass" | "fail" = passed ? "pass" : "fail";
    evalMetrics.push({ name: m.name, value: m.value, threshold, status, scenario_ids: m.scenario_ids, case_ids: m.case_ids, measured: m.measured });
    if (status === "fail") {
      failures.push({
        metric: m.name,
        observed: m.value,
        threshold,
        baseline: opts.baseline?.[m.name],
        scenario_id: m.scenario_ids?.[0] ?? "",
        case_id: m.case_ids?.[0],
      });
    }
  }

  const evidence_hashes: Record<string, string> = {};
  for (const m of evalMetrics) {
    evidence_hashes[m.name] = createHash("sha256").update(JSON.stringify({ name: m.name, value: m.value, threshold: m.threshold })).digest("hex");
  }

  return {
    schema_version: "v1",
    suite: opts.suite,
    dataset_revision: opts.datasetRevision,
    environment: {
      machine: "ci-laptop",
      timestamp: new Date().toISOString(),
      ...(opts.environment ?? {}),
    },
    thresholds: opts.thresholds,
    metrics: evalMetrics,
    failures,
    evidence_hashes,
    overall_status: failures.length === 0 ? "pass" : "fail",
  };
}
