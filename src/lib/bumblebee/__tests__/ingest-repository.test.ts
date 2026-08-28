import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"

import { persistIngestBatch } from "../ingest-repository"
import { parseIngestRequest, type ParsedIngestBatch } from "../ingest"
import type { BoundIngestAuthority } from "../lease-repository"

const decisionAuthority: BoundIngestAuthority = {
  groupId: "allura-ingest", workspaceId: "ws-1", sourceId: "source-1", sourceRevisionId: "revision-1", leaseId: "lease-1",
}

function packageRecord(overrides: Record<string, unknown> = {}) {
  const parts = ["baseline", "npm", "safe-package", "1.2.3", "", "", "", "npm", "lockfile", "/private/project/package-lock.json", "", "false", "", "high", "", ""]
  const digest = createHash("sha256").update(`package\0${parts.join("\x1e")}`).digest("hex")
  return {
    record_type: "package", record_id: `package:${digest}`, schema_version: "0.1.0",
    scanner_name: "bumblebee", scanner_version: "v0.1.2", run_id: "0123456789abcdef0123456789abcdef",
    scan_time: "2026-08-28T12:00:00.000Z",
    endpoint: { hostname: "private-host", os: "linux", arch: "amd64", username: "secret-user", uid: "1000", device_id: "device-1" },
    profile: "baseline", ecosystem: "npm", package_name: "safe-package", normalized_name: "safe-package",
    version: "1.2.3", package_manager: "npm", source_type: "lockfile", source_file: "/private/project/package-lock.json",
    has_lifecycle_scripts: false, confidence: "high",
    ...overrides,
  }
}

function summaryRecord(overrides: {
  status?: "complete" | "partial" | "error"
  timedOut?: boolean
  packageRecordsEmitted?: number
  packageRecordsSuppressed?: number
  findingsEmitted?: number
  httpBatchesFailed?: number
  error?: string
} = {}) {
  const status = overrides.status ?? "complete"
  const timedOut = overrides.timedOut ?? false
  const packageRecordsEmitted = overrides.packageRecordsEmitted ?? 1
  const packageRecordsSuppressed = overrides.packageRecordsSuppressed ?? 0
  const findingsEmitted = overrides.findingsEmitted ?? 0
  const httpBatchesFailed = overrides.httpBatchesFailed ?? 0
  const scanTime = "2026-08-28T12:00:00.000Z"
  const endTime = "2026-08-28T12:00:05.000Z"
  const parts = ["baseline", status, scanTime, endTime, "", "", String(packageRecordsEmitted),
    String(packageRecordsSuppressed), String(findingsEmitted), "0", "0", "1", String(timedOut), "5",
    "0", "0", String(httpBatchesFailed), "0", overrides.error ?? ""]
  const digest = createHash("sha256").update(`scan_summary\0${parts.join("\x1e")}`).digest("hex")
  const record: Record<string, unknown> = {
    record_type: "scan_summary", record_id: `scan_summary:${digest}`, schema_version: "0.1.0",
    scanner_name: "bumblebee", scanner_version: "v0.1.2", run_id: "0123456789abcdef0123456789abcdef",
    scan_time: scanTime,
    endpoint: { hostname: "private-host", os: "linux", arch: "amd64", username: "secret-user", uid: "1000", device_id: "device-1" },
    profile: "baseline", end_time: endTime, status, package_records_emitted: packageRecordsEmitted,
    package_records_suppressed: packageRecordsSuppressed, findings_emitted: findingsEmitted,
    duplicates: 0, diagnostics_count: 0, files_considered: 1, timed_out: timedOut, duration_ms: 5,
    http_batches_failed: httpBatchesFailed,
  }
  if (overrides.error !== undefined) record.error = overrides.error
  return record
}

async function parseBatch(records: unknown[]): Promise<ParsedIngestBatch> {
  return parseIngestRequest(new Request("https://allura.example/i", {
    method: "POST",
    headers: { "content-type": "application/x-ndjson" },
    body: `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  }), decisionAuthority)
}

function decisionClientMock(options: {
  leaseRow?: Record<string, unknown>
  databaseNow?: Date
} = {}) {
  const leaseRow = options.leaseRow ?? {
    lease_id: "lease-1", generation: "3", profile: "baseline", mode: "inventory",
    created_at: new Date("2026-08-28T11:59:00.000Z"),
  }
  const databaseNow = options.databaseNow ?? new Date("2026-08-28T12:00:10.000Z")
  const query = vi.fn(async (sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql.startsWith("SET LOCAL")) return { rows: [] }
    if (sql.includes("FROM bumblebee_sources")) return { rows: [{ source_id: decisionAuthority.sourceId }] }
    if (sql.includes("FROM bumblebee_scan_leases")) return { rows: [leaseRow] }
    if (sql.includes("FROM bumblebee_batch_receipts")) return { rows: [] }
    if (sql.includes("statement_timestamp() AS now")) return { rows: [{ now: databaseNow }] }
    if (sql.startsWith("INSERT")) return { rows: [] }
    throw new Error(`unexpected query: ${sql}`)
  })
  const client = { query, release: vi.fn() }
  const pool = { connect: vi.fn(async () => client) }
  return { query, pool }
}

function decisionInsertCall(query: ReturnType<typeof vi.fn>) {
  const call = query.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO bumblebee_run_decisions"))
  if (!call) throw new Error("decision insert was never issued")
  return call[1] as unknown[]
}

const batch = {
  authority: { groupId: "allura-ingest", workspaceId: "ws-1", sourceId: "source-1", sourceRevisionId: "revision-1", leaseId: "lease-1" },
  bodySha256: "a".repeat(64), expandedSha256: "b".repeat(64), sanitizedPayloadDigest: "c".repeat(64),
  compressedBytes: 10, expandedBytes: 10, lineCount: 1,
  records: [{ lineNumber: 1, recordId: `package:${"d".repeat(64)}`, runId: "0123456789abcdef0123456789abcdef", recordType: "package" as const,
    lineSha256: "e".repeat(64), verificationDigest: "f".repeat(64), sanitized: { record_type: "package" },
    redactionProvenance: { policy: "bumblebee-ingest-v1" as const, omittedFields: ["source_file"] } }],
} satisfies ParsedIngestBatch

describe("Story 26.7 atomic ingest repository", () => {
  it("locks source then lease and returns an existing exact-body receipt without inserts", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql.startsWith("SET LOCAL")) return { rows: [] }
      if (sql.includes("FROM bumblebee_sources")) return { rows: [{ source_id: "source-1" }] }
      if (sql.includes("FROM bumblebee_scan_leases")) return { rows: [{ lease_id: "lease-1" }] }
      if (sql.includes("FROM bumblebee_batch_receipts")) return { rows: [{ batch_id: "receipt-existing" }] }
      throw new Error(`unexpected query: ${sql}`)
    })
    const client = { query, release: vi.fn() }
    const pool = { connect: vi.fn(async () => client) }

    await expect(persistIngestBatch(batch, pool as never)).resolves.toEqual({ receiptId: "receipt-existing", replayed: true })
    const sql = query.mock.calls.map(([value]) => value)
    expect(sql.findIndex((value) => value.includes("FROM bumblebee_sources"))).toBeLessThan(sql.findIndex((value) => value.includes("FROM bumblebee_scan_leases")))
    expect(sql.some((value) => value.startsWith("INSERT"))).toBe(false)
  })

  it("rolls the whole transaction back when any record insert fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql.startsWith("SET LOCAL")) return { rows: [] }
      if (sql.includes("FROM bumblebee_sources")) return { rows: [{ source_id: "source-1" }] }
      if (sql.includes("FROM bumblebee_scan_leases")) return { rows: [{ lease_id: "lease-1" }] }
      if (sql.includes("FROM bumblebee_batch_receipts")) return { rows: [] }
      if (sql.includes("INSERT INTO bumblebee_batch_receipts")) return { rows: [] }
      if (sql.includes("INSERT INTO bumblebee_records")) throw Object.assign(new Error("duplicate"), { code: "23505", constraint: "bumblebee_records_run_record_key" })
      if (sql === "ROLLBACK") return { rows: [] }
      throw new Error(`unexpected query: ${sql}`)
    })
    const client = { query, release: vi.fn() }
    await expect(persistIngestBatch(batch, { connect: vi.fn(async () => client) } as never)).rejects.toThrow("BUMBLEBEE_INGEST_RECORD_CONFLICT")
    expect(query).toHaveBeenCalledWith("ROLLBACK")
    expect(query).not.toHaveBeenCalledWith("COMMIT")
  })

  it("maps unknown database errors to no public acceptance fact", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql.startsWith("SET LOCAL")) return { rows: [] }
      if (sql.includes("FROM bumblebee_sources")) throw new Error("db unavailable secret")
      if (sql === "ROLLBACK") return { rows: [] }
      throw new Error(`unexpected query: ${sql}`)
    })
    await expect(persistIngestBatch(batch, { connect: vi.fn(async () => ({ query, release: vi.fn() })) } as never)).rejects.toThrow("db unavailable")
    expect(query).toHaveBeenCalledWith("ROLLBACK")
  })

  it("sequences a promoted decision after the summary record insert, referencing it by id (Slice 5)", async () => {
    const summary = summaryRecord()
    const parsed = await parseBatch([packageRecord(), summary])
    const { query, pool } = decisionClientMock()

    const receipt = await persistIngestBatch(parsed, pool as never)
    expect(receipt.replayed).toBe(false)

    const sql = query.mock.calls.map(([value]) => value as string)
    const recordsIndex = sql.findIndex((value) => value.includes("INSERT INTO bumblebee_records"))
    const decisionIndex = sql.findIndex((value) => value.includes("INSERT INTO bumblebee_run_decisions"))
    expect(recordsIndex).toBeGreaterThanOrEqual(0)
    expect(decisionIndex).toBeGreaterThan(recordsIndex)

    const params = decisionInsertCall(query)
    expect(params).toEqual([
      "allura-ingest", "ws-1", "source-1", "revision-1", "lease-1", receipt.receiptId,
      "promoted", "PROMOTED_COMPLETE", summary.record_id,
    ])
  })

  it("promotes a valid empty-complete population as a known-empty state (AC-10)", async () => {
    const summary = summaryRecord({ packageRecordsEmitted: 0 })
    const parsed = await parseBatch([summary])
    const { query, pool } = decisionClientMock()

    await persistIngestBatch(parsed, pool as never)

    const params = decisionInsertCall(query)
    expect(params[6]).toBe("promoted")
    expect(params[7]).toBe("PROMOTED_COMPLETE")
    expect(params[8]).toBe(summary.record_id)
  })

  it("holds with a stable reason and a null summary reference when no scan_summary arrives", async () => {
    const parsed = await parseBatch([packageRecord()])
    const { query, pool } = decisionClientMock()

    await persistIngestBatch(parsed, pool as never)

    const params = decisionInsertCall(query)
    expect(params[6]).toBe("held")
    expect(params[7]).toBe("HELD_MISSING_SUMMARY")
    expect(params[8]).toBeNull()
  })

  it("derives errorPresent from redactionProvenance omission and holds the contradiction (pinned coupling)", async () => {
    const summary = summaryRecord({ error: "unexpected panic" })
    const parsed = await parseBatch([packageRecord(), summary])
    const summarySanitized = parsed.records.find((record) => record.recordType === "scan_summary")!
    expect(summarySanitized.sanitized).not.toHaveProperty("error")
    expect(summarySanitized.redactionProvenance.omittedFields).toContain("error")

    const { query, pool } = decisionClientMock()
    await persistIngestBatch(parsed, pool as never)

    const params = decisionInsertCall(query)
    expect(params[6]).toBe("held")
    expect(params[7]).toBe("HELD_ERROR_CONTRADICTION")
    expect(params[8]).toBe(summary.record_id)
  })
})
