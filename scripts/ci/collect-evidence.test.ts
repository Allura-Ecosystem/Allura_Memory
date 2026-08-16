import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"

import { describe, expect, it } from "vitest"

import {
  buildEvidenceManifest,
  parseArgs,
  recordCommand,
  REQUIRED_BENCHMARK_IDS,
  validateBenchmarkReport,
  validateAgainstSchema,
  validateVitestReport,
  type EvidenceManifest,
  type LaneEvidence,
} from "./collect-evidence"
import schema from "../../docs/portfolio/evidence-schema.json"

function manifest(): EvidenceManifest {
  return {
    schema_version: "1.0.0",
    kind: "ci-evidence-manifest",
    commit_sha: "d70a8781d53d1ffbee40ae2c5ba48c3a396124c2",
    generated_at: "2026-08-15T12:00:00.000Z",
    run_url: "https://github.com/example/allura/actions/runs/1",
    status: "passed",
    environment: { bun: "1.3.14", node: "v24.0.0", postgresql: "PostgreSQL 16.10" },
    missing_lanes: [],
    lanes: [{
      lane: "unit",
      status: "passed",
      commands: [{
        name: "unit-tests",
        command: ["bun", "run", "test:unit"],
        started_at: "2026-08-15T12:00:00.000Z",
        duration_ms: 42,
        exit_status: 0,
        status: "passed",
        artifact_paths: ["artifacts/ci/sha/unit/unit-tests.json"],
      }],
    }],
    artifacts: [{
      lane: "unit",
      logical_name: "unit-tests.json",
      path: "artifacts/ci/sha/unit/unit-tests.json",
      run_url: "https://github.com/example/allura/actions/runs/1",
    }],
  }
}

describe("CI evidence schema validation", () => {
  it("accepts a complete SHA-bound manifest", () => {
    expect(validateAgainstSchema(manifest(), schema)).toEqual([])
  })

  it("rejects a malformed SHA and missing commands", () => {
    const invalid = manifest() as unknown as Record<string, unknown>
    invalid.commit_sha = "main"
    delete invalid.lanes
    expect(validateAgainstSchema(invalid, schema)).toEqual(expect.arrayContaining([
      expect.stringContaining("commit_sha"),
      expect.stringContaining("lanes"),
    ]))
  })

  it("fails aggregation when an expected lane is missing", () => {
    const aggregate = buildEvidenceManifest({
      expectedLanes: ["unit", "build"],
      fragments: [fragment("unit", "passed")],
      commitSha: "d70a8781d53d1ffbee40ae2c5ba48c3a396124c2",
      generatedAt: "2026-08-15T12:00:00.000Z",
      runUrl: null,
      bunVersion: "1.3.14",
      nodeVersion: "v24.0.0",
    })
    expect(aggregate.status).toBe("failed")
    expect(aggregate.missing_lanes).toEqual(["build"])
    expect(aggregate.lanes.find((lane) => lane.lane === "build")?.status).toBe("missing")
  })

  it("preserves a failed lane and makes the aggregate fail", () => {
    const aggregate = buildEvidenceManifest({
      expectedLanes: ["unit"],
      fragments: [fragment("unit", "failed")],
      commitSha: "d70a8781d53d1ffbee40ae2c5ba48c3a396124c2",
      generatedAt: "2026-08-15T12:00:00.000Z",
      runUrl: null,
      bunVersion: "1.3.14",
      nodeVersion: "v24.0.0",
    })
    expect(aggregate.status).toBe("failed")
    expect(aggregate.missing_lanes).toEqual([])
    expect(aggregate.lanes[0]?.status).toBe("failed")
  })

  it("does not accept a fragment from a different commit", () => {
    const foreign = fragment("unit", "passed")
    foreign.commit_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    foreign.environment.postgresql = "PostgreSQL 99.0"
    const aggregate = buildEvidenceManifest({
      expectedLanes: ["unit"],
      fragments: [foreign],
      commitSha: "d70a8781d53d1ffbee40ae2c5ba48c3a396124c2",
      generatedAt: "2026-08-15T12:00:00.000Z",
      runUrl: null,
      bunVersion: "1.3.14",
      nodeVersion: "v24.0.0",
    })
    expect(aggregate.status).toBe("failed")
    expect(aggregate.missing_lanes).toEqual(["unit"])
    expect(aggregate.environment.postgresql).toBeNull()
  })
})

describe("required output trust boundaries", () => {
  it("accepts Vitest output only when at least one test executed", () => {
    expect(validateVitestReport({
      numTotalTests: 3,
      numPassedTests: 2,
      numFailedTests: 0,
      numPendingTests: 1,
    })).toBeNull()
  })

  it("rejects malformed, zero-test, and all-skipped Vitest output", () => {
    expect(validateVitestReport({ numTotalTests: 1 })).toContain("total/passed/failed/pending")
    expect(validateVitestReport({
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
    })).toContain("zero tests")
    expect(validateVitestReport({
      numTotalTests: 4,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 4,
    })).toContain("zero passed tests")
    expect(validateVitestReport({
      numTotalTests: 2,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 0,
    })).toContain("failed test")
  })

  it("requires the exact benchmark inventory and complete execution", () => {
    const complete = benchmarkReport(REQUIRED_BENCHMARK_IDS)
    expect(validateBenchmarkReport(complete, REQUIRED_BENCHMARK_IDS)).toBeNull()
    expect(validateBenchmarkReport(benchmarkReport(REQUIRED_BENCHMARK_IDS.slice(0, 4)), REQUIRED_BENCHMARK_IDS)).toContain("missing required IDs")
    expect(validateBenchmarkReport(benchmarkReport([...REQUIRED_BENCHMARK_IDS, REQUIRED_BENCHMARK_IDS[0]]), REQUIRED_BENCHMARK_IDS)).toContain("duplicate IDs")
    expect(validateBenchmarkReport(benchmarkReport([...REQUIRED_BENCHMARK_IDS, "unexpected"]), REQUIRED_BENCHMARK_IDS)).toContain("unexpected IDs")
    const skipped = benchmarkReport(REQUIRED_BENCHMARK_IDS)
    ;(skipped.results[0] as { status: string }).status = "skip"
    expect(validateBenchmarkReport(skipped, REQUIRED_BENCHMARK_IDS)).toContain("did not execute successfully")
  })

  it("fails a successful command receipt when a declared artifact is missing", async () => {
    const root = `artifacts/ci/collector-test-${randomUUID()}`
    try {
      const code = await recordCommand(parseArgs([
        "run",
        "--lane=unit",
        "--name=missing-artifact",
        `--artifact-dir=${root}`,
        `--artifact=${root}/missing.json`,
        "--",
        "bash",
        "-lc",
        "true",
      ]))
      expect(code).toBe(66)
      const receipt = JSON.parse(await readFile(`${root}/evidence-fragment.json`, "utf8")) as LaneEvidence
      expect(receipt.status).toBe("failed")
      expect(receipt.commands[0]?.exit_status).toBe(66)
      expect(receipt.commands[0]?.artifact_paths).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("preserves an original non-zero exit and does not replace it with receipt validation", async () => {
    const root = `artifacts/ci/collector-test-${randomUUID()}`
    try {
      const code = await recordCommand(parseArgs([
        "run",
        "--lane=unit",
        "--name=original-exit",
        `--artifact-dir=${root}`,
        `--artifact=${root}/not-created.json`,
        "--",
        "bash",
        "-lc",
        "exit 7",
      ]))
      expect(code).toBe(7)
      const receipt = JSON.parse(await readFile(`${root}/evidence-fragment.json`, "utf8")) as LaneEvidence
      expect(receipt.commands[0]?.exit_status).toBe(7)
      expect(receipt.commands[0]?.artifact_paths).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("records an explicitly supplied PostgreSQL server version artifact", async () => {
    const root = `artifacts/ci/collector-test-${randomUUID()}`
    const versionPath = `${root}/postgres-server-version.txt`
    try {
      await mkdir(root, { recursive: true })
      await writeFile(versionPath, "16.10\n", "utf8")
      const code = await recordCommand(parseArgs([
        "run",
        "--lane=live-db",
        "--name=server-version",
        `--artifact-dir=${root}`,
        `--artifact=${versionPath}`,
        `--postgres-server-version-file=${versionPath}`,
        "--",
        "bash",
        "-lc",
        "true",
      ]))
      expect(code).toBe(0)
      const receipt = JSON.parse(await readFile(`${root}/evidence-fragment.json`, "utf8")) as LaneEvidence
      expect(receipt.environment.postgresql).toBe("PostgreSQL 16.10")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function benchmarkReport(ids: readonly string[]): { results: Array<{ id: string; status: string }> } {
  return { results: ids.map((id) => ({ id, status: "pass" })) }
}

function fragment(lane: string, status: LaneEvidence["status"]): LaneEvidence {
  return {
    schema_version: "1.0.0",
    kind: "lane-fragment",
    commit_sha: "d70a8781d53d1ffbee40ae2c5ba48c3a396124c2",
    run_url: null,
    lane,
    status,
    environment: { bun: "1.3.14", node: "v24.0.0", postgresql: null },
    commands: [{
      name: `${lane}-command`,
      command: ["bun", "run", lane],
      started_at: "2026-08-15T12:00:00.000Z",
      duration_ms: 1,
      exit_status: status === "passed" ? 0 : 1,
      status,
      artifact_paths: [],
    }],
  }
}
