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
 * Local mode retains threshold gating and permits a cold stack. CI baseline
 * mode records numerical threshold results without enforcing them (Story 24.6
 * owns regression policy), but fails closed on transport errors and skips.
 */
import { config } from "dotenv"
config()

import { randomBytes } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { run as runRetrievalQuality } from "./benchmarks/retrieval-quality"
import { run as runCurationAccuracy } from "./benchmarks/curation-accuracy"
import { run as runGovernanceIntegrity } from "./benchmarks/governance-integrity"
import { run as runLatencyProfile } from "./benchmarks/latency-profile"
import { run as runAuditCompleteness } from "./benchmarks/audit-completeness"
import { BrainClient } from "./lib/client"
import { buildReportFile, hasFailures, printReport } from "./lib/report"
import type { BenchmarkContext, BenchmarkResult } from "./lib/types"
import { DEFAULT_BENCHMARK_GROUP_ID } from "../../scripts/ci/benchmark-contract"

const DEFAULT_JSON_PATH = "src/__benchmarks__/benchmark-results.json"

export interface CliOptions {
  only: string[] | null
  json: string | null
  verbose: boolean
  iters: number
  group: string
  requireGateway: boolean
  enforceThresholds: boolean
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    only: null,
    json: null,
    verbose: false,
    iters: 20,
    group: "",
    requireGateway: false,
    enforceThresholds: true,
  }
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
      case "require-gateway":
        opts.requireGateway = true
        break
      case "ci-baseline":
        opts.requireGateway = true
        opts.enforceThresholds = false
        break
    }
  }
  return opts
}

export function resolveBenchmarkGroup(explicitGroup?: string): string {
  if (explicitGroup && explicitGroup !== DEFAULT_BENCHMARK_GROUP_ID) {
    throw new Error(`--group must match the benchmark credential tenant '${DEFAULT_BENCHMARK_GROUP_ID}'`);
  }
  return DEFAULT_BENCHMARK_GROUP_ID;
}

/**
 * Baseline CI proves that the runner and every required benchmark executed.
 * Numerical threshold enforcement is intentionally separate until Story 24.6.
 */
export function determineExitCode(results: BenchmarkResult[], opts: Pick<CliOptions, "requireGateway" | "enforceThresholds">): number {
  if (results.some((result) => result.status === "error")) return 1
  if (opts.requireGateway && results.some((result) => result.status === "skip")) return 3
  if (opts.enforceThresholds && hasFailures(results)) return 1
  return 0
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

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2))
  const runId = randomBytes(4).toString("hex")
  // The `-loadtest` suffix routes seed writes straight to episodic storage,
  // skipping the HITL proposal queue (see memory_add in canonical-tools.ts).
  const groupId = resolveBenchmarkGroup(opts.group)
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
  let unreachable = false

  if (!ping.reachable) {
    unreachable = true
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
      // Keep every benchmark call inside the credential's exact tenant allowlist.
      // Run isolation is represented by runId/userId, not by an unauthorized
      // per-module tenant.
      const benchCtx: BenchmarkContext = ctx
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
    await mkdir(path.dirname(outPath), { recursive: true })
    await writeFile(outPath, JSON.stringify(report, null, 2) + "\n", "utf8")
    process.stderr.write(`\nJSON results written to ${path.relative(process.cwd(), outPath)}\n`)
  }

  if (unreachable && opts.requireGateway) return 2
  return determineExitCode(results, opts)
}

if (import.meta.main) {
  main().then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`[benchmark] fatal: ${err instanceof Error ? err.stack : String(err)}\n`)
    process.exit(1)
  })
}
