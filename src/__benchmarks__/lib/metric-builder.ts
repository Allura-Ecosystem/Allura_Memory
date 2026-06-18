/**
 * Helpers for constructing `Metric` objects with threshold evaluation, and for
 * deriving a benchmark's aggregate status from its metrics.
 */

import type { BenchmarkStatus, Comparator, Metric } from "./types"

/** Build a plain (un-thresholded, informational) metric. */
export function info(name: string, value: number, unit = ""): Metric {
  return { name, value, unit }
}

/** Build a metric with a pass/fail threshold; computes `passed`. */
export function gated(
  name: string,
  value: number,
  comparator: Comparator,
  threshold: number,
  unit = "",
): Metric {
  const passed = comparator === "gte" ? value >= threshold : value <= threshold
  return { name, value, unit, threshold, comparator, passed }
}

/**
 * Derive an aggregate status from metrics: `fail` if any gated metric failed,
 * otherwise `pass`. Benchmarks set `skip`/`error` explicitly themselves.
 */
export function statusFromMetrics(metrics: Metric[]): BenchmarkStatus {
  const gatedMetrics = metrics.filter((m) => m.passed !== undefined)
  if (gatedMetrics.length === 0) return "pass"
  return gatedMetrics.every((m) => m.passed) ? "pass" : "fail"
}
