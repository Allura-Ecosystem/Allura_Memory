#!/usr/bin/env bun
/**
 * Allura Memory — Benchmark Harness Orchestrator
 *
 * Black-box entrypoint: connects to the live Allura Brain MCP gateway, runs the
 * five benchmark modules, prints a report, and (optionally) writes a JSON
 * result file. Imports NO server internals — every number comes from a real
 * `tools/call` over the wire (see ./lib/client.ts).
 *
 * Usage:
 *   bun run benchmark                                  # all benchmarks + JSON
 *   bun src/__benchmarks__/run.ts --only=retrieval-quality,latency-profile
 *   bun src/__benchmarks__/run.ts --json=bench.json --verbose
 *   bun src/__benchmarks__/run.ts --iters=50          # latency sample count
 *   bun src/__benchmarks__/run.ts --group=allura-bench-loadtest
 *
 * Exit code: 0 when every benchmark passed/skipped, 1 when any failed or errored
 * (so the harness can act as a CI acceptance gate). If the gateway is
 * unreachable, all benchmarks are reported as `skip` and the process still
 * writes its JSON and exits 0 — a cold stack is not a test failure.
 */
import { config } from "dotenv"
config()

import { randomBytes } from "node:crypto"
import { writeFile } from "node:fs/promises"
import path from "node:path"

import { BrainClient } from "./lib/client"
import { buildReportFile, hasFailures, printReport } from "./lib/report"
import type { BenchmarkContext, BenchmarkResult } from "./lib/types"

import { run as runRetrievalQuality } from "./benchmarks/retrieval-quality"
import { run as runCurationAccuracy } from "./benchmarks/curation-accuracy"
import { run as runGovernanceIntegrity } from "./benchmarks/governance-integrity"
import { run as runLatencyProfile } from "./benchmarks/latency-profile"
import { run as runAuditCompleteness } from "./benchmarks/audit-completeness"

const DEFAULT_JSON_PATH = "src/__benchmarks__/benchmark-results.json"

interface CliOptions {
  only: string[] | null
  json: string | null
  verbose: boolean
  iters: number
  group: string
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { only: null, json: null, verbose: false, iters: 20, group: "" }
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=")
    switch (key) {
      case "only":
        if (value) opts.only = value.split(",").map((s) => s.trim()).filter(Boolean)
        break
      case "json":
        // `--json` with no value writes to the default path; `--json=x` overrides.
        opts.json = value ? value : DEFAULT_JSON_PATH
        break
      case "verbose":
        opts.verbose = true
        break
      case "iters":
        opts.iters = Math.max(1, parseInt(value ?? "20", 10) || 20)
        break
      case "group":
        if (value) opts.group = value
        break
    }
  }
  return opts
}

/** Registry of benchmark modules in display order. */
type Entry = { id: string; run: (ctx: BenchmarkContext) => Promise<BenchmarkResult> }

function buildRegistry(iters: number): Entry[] {
  return [
    { id: "retrieval-quality", run: runRetrievalQuality },
    { id: "curation-accuracy", run: runCurationAccuracy },
    { id: "governance-integrity", run: runGovernanceIntegrity },
    { id: "latency-profile", run: (ctx) => runLatencyProfile(ctx, iters) },
    { id: "audit-completeness", run: runAuditCompleteness },
  ]
}

/** Produce a uniform `skip` result when the gateway is unreachable. */
function skipResult(id: string, reason: string): BenchmarkResult {
  return {
    id,
    title: id,
    status: "skip",
    durationMs: 0,
    metrics: [],
    notes: [reason],
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2))
  const runId = randomBytes(4).toString("hex")
  // The `-loadtest` suffix routes seed writes straight to episodic storage,
  // skipping the HITL proposal queue (see memory_add in canonical-tools.ts).
  const groupId = opts.group || `allura-bench-${runId}-loadtest`
  const userId = `bench-user-${runId}`

  const client = new BrainClient()
  const ctx: BenchmarkContext = { client, groupId, runId, userId, verbose: opts.verbose }

  const registry = buildRegistry(opts.iters)
  const selected = opts.only ? registry.filter((e) => opts.only!.includes(e.id)) : registry

  if (selected.length === 0) {
    process.stderr.write(`No benchmarks matched --only=${opts.only?.join(",")}\n`)
    process.exit(2)
  }

  process.stderr.write(`Allura benchmark harness → ${client.endpoint}\n`)
  process.stderr.write(`run_id=${runId}  group=${groupId}\n`)

  // Preflight: is the gateway reachable at all?
  const ping = await client.ping(groupId)
  const results: BenchmarkResult[] = []

  if (!ping.reachable) {
    process.stderr.write(
      `\n⚠ Gateway unreachable (${ping.detail ?? "no detail"}). ` +
        `Reporting all benchmarks as skip. Bring the stack up with \`bun run brain:up\`.\n`,
    )
    for (const e of selected) {
      results.push(skipResult(e.id, `gateway unreachable at ${client.endpoint}: ${ping.detail ?? "no detail"}`))
    }
  } else {
    process.stderr.write(`gateway reachable (${Math.round(ping.latencyMs)}ms)\n`)
    for (const e of selected) {
      if (opts.verbose) process.stderr.write(`\n▶ running ${e.id}…\n`)
      // Isolate each benchmark in its own loadtest sub-group so a write-heavy
      // benchmark (e.g. latency-profile) cannot poison a later one by tripping a
      // shared per-group budget / circuit breaker. Each still skips the HITL
      // queue via the `-loadtest` suffix.
      const benchCtx: BenchmarkContext = opts.group
        ? ctx
        : { ...ctx, groupId: `allura-bench-${runId}-${e.id}-loadtest` }
      try {
        results.push(await e.run(benchCtx))
      } catch (err) {
        results.push({
          id: e.id,
          title: e.id,
          status: "error",
          durationMs: 0,
          metrics: [],
          notes: [],
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  printReport(results)

  if (opts.json) {
    const outPath = path.resolve(process.cwd(), opts.json)
    const report = buildReportFile({
      endpoint: client.endpoint,
      runId,
      generatedAt: new Date().toISOString(),
      results,
    })
    await writeFile(outPath, JSON.stringify(report, null, 2) + "\n", "utf8")
    process.stderr.write(`\nJSON results written to ${path.relative(process.cwd(), outPath)}\n`)
  }

  // A cold stack (everything skipped) is not a failure; real fails/errors are.
  process.exit(hasFailures(results) ? 1 : 0)
}

main().catch((err) => {
  process.stderr.write(`[benchmark] fatal: ${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
