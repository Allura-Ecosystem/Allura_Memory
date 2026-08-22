/**
 * Story 24.6 — Evaluation runner and result schema.
 * AC-2: thresholds declared before execution; runner cannot rewrite them.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface EvalMetric {
  name: string;
  value: number;
  threshold: number;
  status: "pass" | "fail" | "skip";
  scenario_ids?: string[];
  case_ids?: string[];
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

export interface SuiteConfig {
  suite: string;
  version: string;
  dataset_revision: string;
  thresholds: Record<string, number>;
  lanes: Array<{
    name: string;
    type: string;
    description: string;
    cases: string;
  }>;
}

export function loadSuite(path: string): SuiteConfig {
  const raw = readFileSync(resolve(process.cwd(), path), "utf-8");
  // Simple YAML parse for the flat structure we use
  const yaml = raw as string;
  const suite = yaml.match(/^suite:\s*(.+)$/m)?.[1] ?? "";
  const dataset_revision = yaml.match(/^dataset_revision:\s*"?([^"\n]+)"?$/m)?.[1] ?? "";
  const thresholds: Record<string, number> = {};
  const thresholdMatch = yaml.match(/thresholds:\n((?:\s+[\w@]+:\s*[\d.]+\n?)+)/);
  if (thresholdMatch) {
    for (const line of thresholdMatch[1].trim().split("\n")) {
      const m = line.trim().match(/^([\w@]+):\s*([\d.]+)/);
      if (m) thresholds[m[1]] = parseFloat(m[2]);
    }
  }
  return { suite, version: "v1", dataset_revision, thresholds, lanes: [] };
}

export function runEvaluation(opts: {
  suite: string;
  datasetRevision: string;
  thresholds: Record<string, number>;
  metrics: Array<{ name: string; value: number; scenario_ids?: string[]; case_ids?: string[] }>;
  baseline?: Record<string, number>;
}): EvalResult {
  const failures: EvalFailure[] = [];
  const evalMetrics: EvalMetric[] = [];

  for (const m of opts.metrics) {
    const threshold = opts.thresholds[m.name];
    if (threshold === undefined) {
      evalMetrics.push({ name: m.name, value: m.value, threshold: 0, status: "skip", scenario_ids: m.scenario_ids, case_ids: m.case_ids });
      continue;
    }
    const status: "pass" | "fail" = m.value >= threshold ? "pass" : "fail";
    evalMetrics.push({ name: m.name, value: m.value, threshold, status, scenario_ids: m.scenario_ids, case_ids: m.case_ids });
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
    },
    thresholds: opts.thresholds,
    metrics: evalMetrics,
    failures,
    evidence_hashes,
    overall_status: failures.length === 0 ? "pass" : "fail",
  };
}