import { describe, expect, it, vi } from "vitest"

import { persistIngestBatch } from "../ingest-repository"
import type { ParsedIngestBatch } from "../ingest"

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
})
