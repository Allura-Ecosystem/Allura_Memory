import { describe, expect, it } from "vitest"

import type { BenchmarkResult } from "./lib/types"
import { DEFAULT_BENCHMARK_GROUP_ID } from "../../scripts/ci/benchmark-contract"
import { determineExitCode, parseArgs, resolveBenchmarkGroup } from "./run"

function result(status: BenchmarkResult["status"]): BenchmarkResult {
  return { id: status, title: status, status, durationMs: 1, metrics: [], notes: [] }
}

describe("benchmark CI baseline exit policy", () => {
  it("requires a reachable gateway without enforcing numerical thresholds", () => {
    const options = parseArgs(["--ci-baseline", "--require-gateway"])
    expect(options.requireGateway).toBe(true)
    expect(options.enforceThresholds).toBe(false)
    expect(determineExitCode([result("fail")], options)).toBe(0)
  })

  it("fails closed on required skips and runner errors", () => {
    const options = parseArgs(["--ci-baseline"])
    expect(determineExitCode([result("skip")], options)).toBe(3)
    expect(determineExitCode([result("error")], options)).toBe(1)
  })

  it("retains threshold gating in the local default mode", () => {
    const options = parseArgs([])
    expect(determineExitCode([result("fail")], options)).toBe(1)
    expect(determineExitCode([result("skip")], options)).toBe(0)
  })

  it("uses the provisioned deterministic tenant unless an explicit tenant is supplied", () => {
    expect(DEFAULT_BENCHMARK_GROUP_ID).toBe("allura-bench-ci-loadtest")
    expect(resolveBenchmarkGroup()).toBe(DEFAULT_BENCHMARK_GROUP_ID)
    expect(resolveBenchmarkGroup(DEFAULT_BENCHMARK_GROUP_ID)).toBe(DEFAULT_BENCHMARK_GROUP_ID)
    expect(() => resolveBenchmarkGroup("allura-custom-ci")).toThrow(/must match the benchmark credential tenant/)
  })
})
