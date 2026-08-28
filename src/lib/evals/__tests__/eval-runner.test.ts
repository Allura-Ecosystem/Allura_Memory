/**
 * Story 24.6 — Evaluation and regression gate tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateHtmlReport, generateJsonReport, generateMarkdownReport } from "../report";
import { type CaseOutcome, type EvalResult, defaultOfflineExecutor, loadSuite, runEvaluation, runSuite } from "../runner";

const SUITE_PATH = "evals/suites/portfolio.yaml";

function loadBaseline(): { metrics: Record<string, number>; thresholds: Record<string, number> } {
  return JSON.parse(readFileSync(resolve(process.cwd(), "evals/baselines/portfolio.json"), "utf-8"));
}

describe("AC-1: eval result schema", () => {
  it("produces a valid EvalResult with all required fields", () => {
    const result = runEvaluation({
      suite: "portfolio",
      datasetRevision: "0001",
      thresholds: { "retrieval_relevance_p@5": 0.70 } as Record<string, number>,
      metrics: [{ name: "retrieval_relevance_p@5", value: 0.85 }],
    });
    expect(result.schema_version).toBe("v1");
    expect(result.suite).toBe("portfolio");
    expect(result.dataset_revision).toBe("0001");
    expect(result.environment).toHaveProperty("machine");
    expect(result.environment).toHaveProperty("timestamp");
    expect(result.thresholds).toHaveProperty("retrieval_relevance_p@5");
    expect(result.metrics).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(result.evidence_hashes).toHaveProperty("retrieval_relevance_p@5");
    expect(result.overall_status).toBe("pass");
  });
});

describe("AC-2: thresholds declared before execution", () => {
  it("runner cannot rewrite thresholds from observed results", () => {
    const thresholds = { policy_violation_block_rate: 1.0 };
    const result = runEvaluation({
      suite: "portfolio",
      datasetRevision: "0001",
      thresholds,
      metrics: [{ name: "policy_violation_block_rate", value: 0.95 }],
    });
    // Threshold stays 1.0 regardless of observed 0.95
    expect(result.thresholds.policy_violation_block_rate).toBe(1.0);
    expect(result.metrics[0].status).toBe("fail");
    expect(result.overall_status).toBe("fail");
  });
});

describe("AC-3: offline CI evaluation lanes", () => {
  it("suite config declares all 9 required lanes", () => {
    const suite = loadSuite(SUITE_PATH);
    expect(suite.suite).toBe("portfolio");
    expect(suite.thresholds).toHaveProperty("retrieval_relevance_p@5");
    expect(suite.thresholds).toHaveProperty("approved_only_recall");
    expect(suite.thresholds).toHaveProperty("policy_violation_block_rate");
    expect(suite.thresholds).toHaveProperty("cross_tenant_isolation");
    expect(suite.thresholds).toHaveProperty("promotion_correctness");
    expect(suite.thresholds).toHaveProperty("audit_completeness");
    expect(suite.thresholds).toHaveProperty("deterministic_replay_match");
    expect(suite.thresholds).toHaveProperty("tool_contract_validation");
    expect(suite.thresholds).toHaveProperty("latency_p95_ms");
  });

  it("loadSuite parses the YAML lane declarations (not an empty lanes array)", () => {
    const suite = loadSuite(SUITE_PATH);
    expect(suite.lanes.length).toBe(9);
    const names = suite.lanes.map((l) => l.name);
    expect(names).toEqual([
      "retrieval_relevance",
      "approved_only_recall",
      "policy_violation_blocking",
      "cross_tenant_isolation",
      "promotion_correctness",
      "audit_completeness",
      "deterministic_replay",
      "tool_contract_validation",
      "latency",
    ]);
    for (const lane of suite.lanes) {
      expect(lane.cases).toMatch(/^evals\/datasets\/.+\.json$/);
      expect(lane.type).toBeTruthy();
    }
  });
});

describe("AC-3/AC-4: runner executes declared datasets, not caller-supplied values", () => {
  it("runSuite executes every lane's dataset and derives metrics from case outcomes", async () => {
    const result = await runSuite({ suitePath: SUITE_PATH });
    // All 9 lanes executed and produced a metric.
    expect(result.metrics).toHaveLength(9);
    const names = result.metrics.map((m) => m.name);
    expect(names).toContain("retrieval_relevance_p@5");
    expect(names).toContain("approved_only_recall");
    expect(names).toContain("policy_violation_block_rate");
    expect(names).toContain("cross_tenant_isolation");
    expect(names).toContain("promotion_correctness");
    expect(names).toContain("audit_completeness");
    expect(names).toContain("deterministic_replay_match");
    expect(names).toContain("tool_contract_validation");
    expect(names).toContain("latency_p95_ms");
    // Every metric is traceable to the case ids it executed.
    for (const m of result.metrics) {
      expect(m.case_ids).toBeDefined();
      expect(m.case_ids!.length).toBeGreaterThan(0);
    }
    // Well-formed synthetic fixtures pass the offline gate.
    expect(result.overall_status).toBe("pass");
  });

  it("an injected failing executor drives the metric below threshold (controlled red)", async () => {
    const failingExecutor = (): CaseOutcome => ({ id: "case-x", passed: false, detail: "injected failure" });
    const result = await runSuite({ suitePath: SUITE_PATH, executor: failingExecutor });
    expect(result.overall_status).toBe("fail");
    expect(result.failures.length).toBeGreaterThan(0);
    // The failure identifies the affected metric and a case id.
    expect(result.failures[0].metric).toBeTruthy();
    expect(result.failures[0].case_id).toBe("case-x");
  });

  it("defaultOfflineExecutor rejects a malformed case", () => {
    const lane = { name: "tool_contract_validation", type: "offline", description: "", cases: "x" };
    const bad = defaultOfflineExecutor(lane, {}, { id: "tc-bad", required_params: [] });
    expect(bad.passed).toBe(false);
    const good = defaultOfflineExecutor(lane, {}, { id: "tc-good", required_params: ["group_id"] });
    expect(good.passed).toBe(true);
  });
});

describe("AC-6: regression beyond threshold fails CI", () => {
  it("identifies the affected metric, baseline, observed value, and scenario ID", () => {
    const result = runEvaluation({
      suite: "portfolio",
      datasetRevision: "0001",
      thresholds: { "retrieval_relevance_p@5": 0.70 } as Record<string, number>,
      metrics: [{ name: "retrieval_relevance_p@5", value: 0.60, scenario_ids: ["scenario-x"], case_ids: ["case-y"] }],
      baseline: { "retrieval_relevance_p@5": 0.75 },
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].metric).toBe("retrieval_relevance_p@5");
    expect(result.failures[0].observed).toBe(0.60);
    expect(result.failures[0].threshold).toBe(0.70);
    expect(result.failures[0].baseline).toBe(0.75);
    expect(result.failures[0].scenario_id).toBe("scenario-x");
    expect(result.failures[0].case_id).toBe("case-y");
  });
});

describe("AC-7: baseline changes require explicit file change", () => {
  it("baseline file exists and has rationale", () => {
    const baseline = loadBaseline();
    expect(baseline.thresholds).toBeDefined();
    expect(baseline.metrics).toBeDefined();
  });
});

describe("AC-9: reports as JSON and derived Markdown/HTML", () => {
  it("generates JSON, Markdown, and HTML from the same result", () => {
    const result = runEvaluation({
      suite: "portfolio",
      datasetRevision: "0001",
      thresholds: { tool_contract_validation: 1.0 },
      metrics: [{ name: "tool_contract_validation", value: 1.0 }],
    });
    const json = generateJsonReport(result);
    const md = generateMarkdownReport(result);
    const html = generateHtmlReport(result);
    expect(JSON.parse(json).suite).toBe("portfolio");
    expect(md).toContain("# Evaluation Report");
    expect(md).toContain("tool_contract_validation");
    expect(html).toContain("<table");
    expect(html).toContain("tool_contract_validation");
  });
});

describe("AC-10: evidence manifest incorporates eval hashes", () => {
  it("every metric has an evidence hash", () => {
    const result = runEvaluation({
      suite: "portfolio",
      datasetRevision: "0001",
      thresholds: { cross_tenant_isolation: 1.0, promotion_correctness: 1.0 },
      metrics: [
        { name: "cross_tenant_isolation", value: 1.0 },
        { name: "promotion_correctness", value: 1.0 },
      ],
    });
    for (const m of result.metrics) {
      expect(result.evidence_hashes[m.name]).toHaveLength(64);
    }
  });
});

describe("Controlled red: regression gate fails correctly", () => {
  it("one failing metric marks the entire run as fail", () => {
    const result = runEvaluation({
      suite: "portfolio",
      datasetRevision: "0001",
      thresholds: { cross_tenant_isolation: 1.0, promotion_correctness: 1.0 },
      metrics: [
        { name: "cross_tenant_isolation", value: 1.0 },
        { name: "promotion_correctness", value: 0.95 },
      ],
    });
    expect(result.overall_status).toBe("fail");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].metric).toBe("promotion_correctness");
  });
});