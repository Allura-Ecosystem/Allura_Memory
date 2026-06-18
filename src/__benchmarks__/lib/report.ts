/**
 * Console + JSON reporting for the benchmark harness.
 *
 * No external dependencies — plain ANSI and string padding so the report renders
 * the same in CI logs and local terminals.
 */

import type { BenchmarkResult, BenchmarkStatus, Metric } from "./types"
import { round } from "./metrics"

const COLOR = process.stdout.isTTY === true && process.env.NO_COLOR === undefined

function c(code: string, s: string): string {
  return COLOR ? `\x1b[${code}m${s}\x1b[0m` : s
}

const STATUS_BADGE: Record<BenchmarkStatus, string> = {
  pass: c("32", "PASS"),
  fail: c("31", "FAIL"),
  skip: c("33", "SKIP"),
  error: c("31", "ERROR"),
}

function formatValue(m: Metric): string {
  const v = round(m.value)
  return m.unit ? `${v}${m.unit}` : `${v}`
}

function formatThreshold(m: Metric): string {
  if (m.threshold === undefined || m.comparator === undefined) return ""
  const op = m.comparator === "gte" ? "≥" : "≤"
  return `${op} ${round(m.threshold)}${m.unit}`
}

/** Render a full run report to stdout. */
export function printReport(results: BenchmarkResult[]): void {
  const line = "─".repeat(72)
  process.stdout.write(`\n${c("1", "Allura Memory — Benchmark Report")}\n${line}\n`)

  for (const r of results) {
    process.stdout.write(`\n${STATUS_BADGE[r.status]}  ${c("1", r.title)}  ${c("90", `(${Math.round(r.durationMs)}ms)`)}\n`)
    if (r.error) {
      process.stdout.write(`  ${c("31", "error:")} ${r.error}\n`)
    }
    for (const m of r.metrics) {
      const status =
        m.passed === undefined ? " " : m.passed ? c("32", "✓") : c("31", "✗")
      const name = m.name.padEnd(28)
      const value = formatValue(m).padStart(12)
      const thr = formatThreshold(m)
      process.stdout.write(`  ${status} ${name}${value}  ${c("90", thr)}\n`)
    }
    for (const note of r.notes) {
      process.stdout.write(`    ${c("90", "·")} ${c("90", note)}\n`)
    }
  }

  // Summary
  const counts: Record<BenchmarkStatus, number> = { pass: 0, fail: 0, skip: 0, error: 0 }
  for (const r of results) counts[r.status]++
  process.stdout.write(`\n${line}\n`)
  process.stdout.write(
    `${c("1", "Summary:")} ` +
      `${c("32", `${counts.pass} pass`)}, ` +
      `${c("31", `${counts.fail} fail`)}, ` +
      `${c("31", `${counts.error} error`)}, ` +
      `${c("33", `${counts.skip} skip`)}\n\n`,
  )
}

/** Shape written when `--json=<path>` is supplied. */
export interface ReportFile {
  generated_at: string
  endpoint: string
  run_id: string
  results: BenchmarkResult[]
}

/** Build the serializable report object. */
export function buildReportFile(args: {
  endpoint: string
  runId: string
  generatedAt: string
  results: BenchmarkResult[]
}): ReportFile {
  return {
    generated_at: args.generatedAt,
    endpoint: args.endpoint,
    run_id: args.runId,
    results: args.results,
  }
}

/** True when any benchmark failed or errored (drives the process exit code). */
export function hasFailures(results: BenchmarkResult[]): boolean {
  return results.some((r) => r.status === "fail" || r.status === "error")
}
