import { describe, expect, it, vi } from "vitest"

import { createHash } from "node:crypto"

import type { ConformedRecord } from "../batch-conformance"
import { type BatchStoreDeps, createBatchStore } from "../batch-store"
import type { IngestLease, PersistBatchInput } from "../ingest-pipeline"

// A fake pool that records every query verbatim and lets the test script the
// rows each SELECT returns. It also supports a failure mode where a specific
// INSERT throws, so the ROLLBACK path can be exercised without a database.
function fakePool(overrides: {
  rows?: Record<string, unknown>[]
  failOnText?: string
} = {}) {
  const calls: { text: string; params: unknown[] }[] = []
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    calls.push({ text, params })
    if (overrides.failOnText && text.includes(overrides.failOnText)) {
      throw new Error(`boom: ${text}`)
    }
    return { rows: overrides.rows ?? [] }
  })
  return { pool: { query } as unknown as BatchStoreDeps["pool"], calls, query }
}

const lease: IngestLease = {
  groupId: "allura-acme",
  workspaceId: "workspace-1",
  sourceId: "source-1",
  sourceRevisionId: "revision-1",
  leaseId: "lease-1",
}

function record(overrides: Partial<ConformedRecord> = {}): ConformedRecord {
  return {
    line_number: 1,
    line_sha256: "a".repeat(64),
    record_type: "package",
    record_id: "package:" + "b".repeat(64),
    run_id: "c".repeat(32),
    sanitized_payload: { name: "lodash", version: "4.17.21" },
    canonical_id_inputs: "lodash@4.17.21",
    redaction_provenance: { endpoint: "stripped" },
    ...overrides,
  }
}

function input(overrides: Partial<PersistBatchInput> = {}): PersistBatchInput {
  return {
    lease,
    batchId: "batch_abc",
    bodySha256: "d".repeat(64),
    byteCount: 1024,
    lineCount: 3,
    recordCount: 2,
    records: [record({ line_number: 1 }), record({ line_number: 2 })],
    summaryRecordId: "scan_summary:" + "e".repeat(64),
    ...overrides,
  }
}

describe("Story 26.7 Bumblebee batch store", () => {
  it("findExistingBatch issues the exact scoped SELECT and returns null when no row", async () => {
    const { pool, calls } = fakePool()
    const store = await createBatchStore({ pool })

    const result = await store.findExistingBatch({ lease, bodySha256: "d".repeat(64) })

    expect(result).toBeNull()
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toContain("SELECT batch_id FROM bumblebee_batch_receipts")
    expect(calls[0].text).toContain("group_id=$1")
    expect(calls[0].text).toContain("workspace_id=$2")
    expect(calls[0].text).toContain("source_id=$3")
    expect(calls[0].text).toContain("source_revision_id=$4")
    expect(calls[0].text).toContain("lease_id=$5")
    expect(calls[0].text).toContain("body_sha256=$6")
    expect(calls[0].params).toEqual([
      "allura-acme",
      "workspace-1",
      "source-1",
      "revision-1",
      "lease-1",
      "d".repeat(64),
    ])
  })

  it("findExistingBatch returns the row when one exists", async () => {
    const { pool } = fakePool({ rows: [{ batch_id: "batch_abc" }] })
    const store = await createBatchStore({ pool })

    const result = await store.findExistingBatch({ lease, bodySha256: "d".repeat(64) })

    expect(result).toEqual({ batchId: "batch_abc" })
  })

  it("findConflictingBatch returns the row with batch_id and body_sha256", async () => {
    const { pool, calls } = fakePool({
      rows: [{ batch_id: "batch_abc", body_sha256: "d".repeat(64) }],
    })
    const store = await createBatchStore({ pool })

    const result = await store.findConflictingBatch({ lease })

    expect(result).toEqual({ batchId: "batch_abc", bodySha256: "d".repeat(64) })
    expect(calls[0].text).toContain("SELECT batch_id, body_sha256 FROM bumblebee_batch_receipts")
    expect(calls[0].text).toContain("LIMIT 1")
    expect(calls[0].params).toEqual([
      "allura-acme",
      "workspace-1",
      "source-1",
      "revision-1",
      "lease-1",
    ])
  })

  it("findConflictingBatch returns null when no row", async () => {
    const { pool } = fakePool()
    const store = await createBatchStore({ pool })

    const result = await store.findConflictingBatch({ lease })

    expect(result).toBeNull()
  })

  it("persistBatch issues BEGIN, receipt INSERT, one INSERT per record, run_decisions INSERT, and COMMIT in order", async () => {
    const { pool, calls } = fakePool()
    const store = await createBatchStore({ pool })

    await store.persistBatch(input())

    const texts = calls.map((call) => call.text)
    expect(texts[0]).toBe("BEGIN")
    expect(texts[1]).toContain("INSERT INTO bumblebee_batch_receipts")
    expect(texts[2]).toContain("INSERT INTO bumblebee_records")
    expect(texts[3]).toContain("INSERT INTO bumblebee_records")
    expect(texts[4]).toContain("INSERT INTO bumblebee_run_decisions")
    expect(texts[texts.length - 1]).toBe("COMMIT")
    expect(texts).not.toContain("ROLLBACK")
  })

  it("persistBatch writes the receipt with the full scoped identity and digest", async () => {
    const { pool, calls } = fakePool()
    const store = await createBatchStore({ pool })

    await store.persistBatch(input())

    const receipt = calls[1]
    expect(receipt.text).toContain("INSERT INTO bumblebee_batch_receipts")
    expect(receipt.text).toContain("group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, body_sha256, byte_count, line_count, record_count, sanitized_payload_digest")
    expect(receipt.params).toEqual([
      "allura-acme",
      "workspace-1",
      "source-1",
      "revision-1",
      "lease-1",
      "batch_abc",
      "d".repeat(64),
      1024,
      3,
      2,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    ])
  })

  it("persistBatch writes one record row per record with JSON-stringified payloads", async () => {
    const { pool, calls } = fakePool()
    const store = await createBatchStore({ pool })

    await store.persistBatch(input())

    const recordCalls = calls.slice(2, 4)
    expect(recordCalls).toHaveLength(2)
    for (const [index, call] of recordCalls.entries()) {
      expect(call.text).toContain("INSERT INTO bumblebee_records")
      expect(call.text).toContain("group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, run_id, record_id, record_type, sanitized_payload, canonical_id_inputs, line_number, line_sha256, redaction_provenance")
      expect(call.params).toEqual([
        "allura-acme",
        "workspace-1",
        "source-1",
        "revision-1",
        "lease-1",
        "batch_abc",
        "c".repeat(32),
        "package:" + "b".repeat(64),
        "package",
        JSON.stringify({ name: "lodash", version: "4.17.21" }),
        JSON.stringify("lodash@4.17.21"),
        index + 1,
        "a".repeat(64),
        JSON.stringify({ endpoint: "stripped" }),
      ])
    }
  })

  it("persistBatch writes the run decision as held with the summary record id", async () => {
    const { pool, calls } = fakePool()
    const store = await createBatchStore({ pool })

    await store.persistBatch(input())

    const decision = calls[4]
    expect(decision.text).toContain("INSERT INTO bumblebee_run_decisions")
    expect(decision.text).toContain("group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, decision_id, run_id, summary_record_id, decision, reason_code")
    expect(decision.params).toEqual([
      "allura-acme",
      "workspace-1",
      "source-1",
      "revision-1",
      "lease-1",
      "batch_abc",
      expect.stringMatching(/^held_[a-f0-9]{32}$/),
      "c".repeat(32),
      "scan_summary:" + "e".repeat(64),
      "held",
      "HELD_PENDING_PROMOTION",
    ])
  })

  it("does not nest BEGIN/COMMIT when a tenant-scoped caller owns the transaction", async () => {
    const { pool, calls } = fakePool()
    const store = await createBatchStore({ pool, transactional: false })

    await store.persistBatch(input())

    const texts = calls.map((call) => call.text)
    expect(texts).not.toContain("BEGIN")
    expect(texts).not.toContain("COMMIT")
    expect(texts).not.toContain("ROLLBACK")
    expect(texts.filter((text) => text.includes("INSERT INTO"))).toHaveLength(4)
  })

  it("persistBatch ROLLBACKs and rethrows when a record INSERT fails, and never COMMITs", async () => {
    const { pool, calls } = fakePool({ failOnText: "INSERT INTO bumblebee_records" })
    const store = await createBatchStore({ pool })

    await expect(store.persistBatch(input())).rejects.toThrow("boom")

    const texts = calls.map((call) => call.text)
    expect(texts[0]).toBe("BEGIN")
    expect(texts).toContain("ROLLBACK")
    expect(texts).not.toContain("COMMIT")
  })

  it("persistBatch ROLLBACKs and rethrows when the receipt INSERT fails", async () => {
    const { pool, calls } = fakePool({ failOnText: "INSERT INTO bumblebee_batch_receipts" })
    const store = await createBatchStore({ pool })

    await expect(store.persistBatch(input())).rejects.toThrow("boom")

    const texts = calls.map((call) => call.text)
    expect(texts[0]).toBe("BEGIN")
    expect(texts).toContain("ROLLBACK")
    expect(texts).not.toContain("COMMIT")
  })

  it("sanitized_payload_digest is a 64-hex sha256 over the records' sanitized payloads", async () => {
    const { pool, calls } = fakePool()
    const store = await createBatchStore({ pool })

    const payloads = [
      { name: "lodash", version: "4.17.21" },
      { name: "express", version: "4.19.2" },
    ]
    await store.persistBatch(input({
      records: [
        record({ line_number: 1, sanitized_payload: payloads[0] }),
        record({ line_number: 2, sanitized_payload: payloads[1] }),
      ],
    }))

    const expected = createHash("sha256")
      .update(JSON.stringify(payloads))
      .digest("hex")
    expect(calls[1].params[10]).toBe(expected)
  })
})
