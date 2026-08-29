import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"

import {
  BUMBLEBEE_BATCH_ERROR,
  type ConformanceContext,
  MAX_LINE_BYTES,
  MAX_RECORDS,
  parseNdjsonBatch,
  recomputeRecordId,
} from "../batch-conformance"

/**
 * Fixture mirrors docs/archive/allura/evidence/epic-26/26.7/scan-output-baseline.ndjson
 * so tests exercise the exact shapes the pinned scanner emits.
 */
const RUN_ID = "f83a940c644dcb14152eed0c8b241477"

const packageA = {
  record_type: "package",
  record_id: "package:3e34dec18064de515fd4866c86327ccf262d0d2573947a109620e8a1b59577be",
  schema_version: "0.1.0",
  scanner_name: "bumblebee",
  scanner_version: "v0.1.2",
  run_id: RUN_ID,
  scan_time: "2026-08-28T23:59:14.725988598Z",
  endpoint: { hostname: "ronin704-MS-7B86", os: "linux", arch: "amd64", username: "ronin704", uid: "1000" },
  profile: "baseline",
  ecosystem: "npm",
  package_name: "left-pad",
  normalized_name: "left-pad",
  version: "1.3.0",
  project_path: "/tmp/scan-target",
  root_kind: "user_package_root",
  package_manager: "npm",
  source_type: "npm-node_modules",
  source_file: "/tmp/scan-target/node_modules/left-pad/package.json",
  has_lifecycle_scripts: false,
  confidence: "medium",
} as Record<string, unknown>

const packageB = {
  record_type: "package",
  record_id: "package:1d9b1140470b155b4a9020b4989ac17a7e2d1b77b93cb160317764c5a30a1ee4",
  schema_version: "0.1.0",
  scanner_name: "bumblebee",
  scanner_version: "v0.1.2",
  run_id: RUN_ID,
  scan_time: "2026-08-28T23:59:14.725988598Z",
  endpoint: { hostname: "ronin704-MS-7B86", os: "linux", arch: "amd64", username: "ronin704", uid: "1000" },
  profile: "baseline",
  ecosystem: "npm",
  package_name: "lodash",
  normalized_name: "lodash",
  version: "4.17.21",
  project_path: "/tmp/scan-target",
  root_kind: "user_package_root",
  package_manager: "npm",
  source_type: "npm-node_modules",
  source_file: "/tmp/scan-target/node_modules/lodash/package.json",
  has_lifecycle_scripts: false,
  confidence: "medium",
} as Record<string, unknown>

const scanSummary = {
  record_type: "scan_summary",
  record_id: "scan_summary:658e099a808173188827b64bf126588b9815a87745d3198014f57aee803007eb",
  schema_version: "0.1.0",
  scanner_name: "bumblebee",
  scanner_version: "v0.1.2",
  run_id: RUN_ID,
  scan_time: "2026-08-28T23:59:14.725988598Z",
  end_time: "2026-08-28T23:59:14.726695576Z",
  endpoint: { hostname: "ronin704-MS-7B86", os: "linux", arch: "amd64", username: "ronin704", uid: "1000" },
  profile: "baseline",
  status: "complete",
  roots: [{ path: "/tmp/scan-target", kind: "user_package_root" }],
  counts: { finding: 0, package: 2 },
  package_records_emitted: 2,
  findings_emitted: 0,
  duplicates: 0,
  diagnostics_count: 0,
  files_considered: 3,
  timed_out: false,
  duration_ms: 0,
} as Record<string, unknown>

// Real upstream record IDs recompute exactly from the pinned algorithm — ground truth.
const fixtureIds = {
  packageA: packageA.record_id,
  summary: scanSummary.record_id,
}

const validLines = [packageA, packageB, scanSummary].map((r) => JSON.stringify(r)).join("\n")

const ctx = (over: Partial<ConformanceContext> = {}): ConformanceContext => ({
  mode: "inventory",
  profile: "baseline",
  ecosystems: ["npm"],
  ...over,
})

const diagnosticRecord = {
  record_type: "diagnostic",
  // recomputed via recomputeRecordId in the test body to keep the fixture honest
  record_id: "",
  schema_version: "0.1.0",
  scanner_name: "bumblebee",
  scanner_version: "v0.1.2",
  run_id: RUN_ID,
  scan_time: "2026-08-28T23:59:14.725988598Z",
  endpoint: { hostname: "ronin704-MS-7B86", os: "linux", arch: "amd64", username: "ronin704", uid: "1000" },
  profile: "baseline",
  level: "warn",
  path: "/tmp/scan-target/bad.lock",
  message: "unparseable lockfile entry",
} as Record<string, unknown>

function withValidId(record: Record<string, unknown>): Record<string, unknown> {
  return { ...record, record_id: recomputeRecordId(record) }
}

describe("parseNdjsonBatch", () => {
  it("accepts a valid batch and strips endpoint from stored payloads", () => {
    const { records, summary } = parseNdjsonBatch(validLines, ctx())
    expect(records).toHaveLength(2)
    expect(summary?.record_type).toBe("scan_summary")
    for (const r of records) {
      expect(r.sanitized_payload).not.toHaveProperty("endpoint")
      expect(r.redaction_provenance).toEqual({ endpoint: "stripped" })
      expect(r.record_id).toMatch(/^(package|finding):[a-f0-9]{64}$/)
    }
    expect(summary?.sanitized_payload).not.toHaveProperty("endpoint")
    expect(summary?.line_number).toBe(3)
    expect(records[0].line_number).toBe(1)
    // line_sha256 is a content hash so ingestion can dedupe by content later
    expect(records[0].line_sha256).toBe(createHash("sha256").update(JSON.stringify(packageA)).digest("hex"))
    // canonical_id_inputs captured for auditability
    expect(records[0].canonical_id_inputs).toBeTypeOf("string")
  })

  it("accepts a diagnostic record (pinned-scanner drift tolerance)", () => {
    const diag = withValidId(diagnosticRecord)
    const lines = [JSON.stringify(packageA), JSON.stringify(scanSummary), JSON.stringify(diag)].join("\n")
    const { records } = parseNdjsonBatch(lines, ctx())
    expect(records.map((r) => r.record_type)).toEqual(["package", "diagnostic"])
  })

  it("rejects a blank/empty batch with a stable error", () => {
    expect(() => parseNdjsonBatch("", ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.malformedLine)
    expect(() => parseNdjsonBatch("\n\n", ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.malformedLine)
  })

  it("rejects a package ecosystem outside the inventory allowlist", () => {
    const bad = withValidId({ ...packageA, ecosystem: "agent-skill", normalized_name: "agent-skill:foo" })
    const lines = [JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.ecosystemForbidden)
  })

  it("rejects a finding ecosystem outside the findings allowlist (homebrew in findings-only)", () => {
    const bad = withValidId({
      record_type: "finding",
      schema_version: "0.1.0",
      scanner_name: "bumblebee",
      scanner_version: "v0.1.2",
      run_id: RUN_ID,
      scan_time: "2026-08-28T23:59:14.725988598Z",
      endpoint: { hostname: "h", os: "linux", arch: "amd64", username: "u", uid: "1" },
      profile: "baseline",
      ecosystem: "homebrew",
      finding_type: "advisory",
      catalog_id: "GHSA-xxxx",
      normalized_name: "foo",
      version: "1.0.0",
      root_kind: "user_package_root",
      project_path: "/tmp/scan-target",
      source_type: "brew-cellar",
      source_file: "/opt/homebrew/Cellar/foo/1.0.0",
      confidence: "medium",
    })
    const lines = [JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() =>
      parseNdjsonBatch(lines, ctx({ mode: "findings-only", ecosystems: ["npm", "homebrew"] })),
    ).toThrow(BUMBLEBEE_BATCH_ERROR.ecosystemForbidden)
  })

  it("rejects an unknown record_type", () => {
    const bad = { ...packageA, record_type: "heartbeat" }
    const lines = [JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.unknownRecordType)
  })

  it("rejects a schema_version mismatch", () => {
    const bad = withValidId({ ...packageA, schema_version: "0.2.0" })
    const lines = [JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.schemaMismatch)
  })

  it("rejects a mixed run_id batch", () => {
    const bad = { ...packageB, run_id: "a83a940c644dcb14152eed0c8b241477", record_id: "package:" + "b".repeat(64) }
    const lines = [JSON.stringify(packageA), JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.mixedRun)
  })

  it("rejects a run_id that differs from ctx.expectedRunId", () => {
    expect(() => parseNdjsonBatch(validLines, ctx({ expectedRunId: "f".repeat(32) }))).toThrow(
      BUMBLEBEE_BATCH_ERROR.mixedRun,
    )
  })

  it("rejects a batch missing the scan_summary", () => {
    const lines = [JSON.stringify(packageA), JSON.stringify(packageB)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.missingSummary)
  })

  it("rejects a duplicate record_id", () => {
    const lines = [JSON.stringify(packageA), JSON.stringify(packageA), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.duplicateRecord)
  })

  it("rejects an oversized line (> MAX_LINE_BYTES)", () => {
    const bad = withValidId({ ...packageA, package_name: "x".repeat(MAX_LINE_BYTES) })
    const lines = [JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.limitExceeded)
  })

  it("rejects a record_id that does not match recomputation", () => {
    const bad = { ...packageA, record_id: "package:" + "c".repeat(64) }
    const lines = [JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.recordIdMismatch)
  })

  it("rejects batches exceeding MAX_RECORDS", () => {
    const pkg = JSON.stringify(packageA)
    const one = pkg + "\n"
    const raw = one.repeat(MAX_RECORDS + 1) + JSON.stringify(scanSummary)
    expect(() => parseNdjsonBatch(raw, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.limitExceeded)
  })

  it("rejects a profile that differs from ctx.profile", () => {
    const bad = withValidId({ ...packageA, profile: "deep" })
    const lines = [JSON.stringify(bad), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.mixedProfile)
  })

  it("rejects records from a second endpoint identity (mixed device)", () => {
    const secondDevice = withValidId({
      ...packageB,
      endpoint: { hostname: "other-host", os: "linux", arch: "amd64", username: "someone-else", uid: "1001" },
    })
    const lines = [JSON.stringify(packageA), JSON.stringify(secondDevice), JSON.stringify(scanSummary)].join("\n")
    expect(() => parseNdjsonBatch(lines, ctx())).toThrow(BUMBLEBEE_BATCH_ERROR.mixedEndpoint)
  })
})

describe("recomputeRecordId — pinned upstream ground truth", () => {
  it("recomputes the real fixture package record_id exactly", () => {
    expect(recomputeRecordId(packageA)).toBe(fixtureIds.packageA)
  })

  it("recomputes the real fixture scan_summary record_id exactly", () => {
    expect(recomputeRecordId(scanSummary)).toBe(fixtureIds.summary)
  })
})