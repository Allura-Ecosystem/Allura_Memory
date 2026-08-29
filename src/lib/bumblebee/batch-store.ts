if (typeof window !== "undefined") throw new Error("server-side only")

import { createHash } from "node:crypto"

import type { ConformedRecord } from "./batch-conformance"
import type { IngestLease, PersistBatchInput } from "./ingest-pipeline"

// The pool is injected rather than imported so the route can wire whichever
// pool matches its tenant scope (getPool/getAppPool) and tests can substitute
// a fake. Only the query() surface is required, keeping the dependency narrow.
export interface BatchStoreDeps {
  pool: {
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>
  }
}

interface ReceiptRow {
  batch_id: string
  body_sha256?: string
}

// Deterministic from (lease, batch): a retried persist of the same batch must
// produce the same decision identity so the append-only table stays idempotent.
function mintDecisionId(lease: IngestLease, batchId: string): string {
  const digest = createHash("sha256").update(`${lease.leaseId}\0${batchId}`).digest("hex")
  return `held_${digest.slice(0, 32)}`
}

// The digest is over the concatenated JSON of every record's sanitized payload
// in batch order, so any tampering with a single payload changes the receipt.
function sanitizedPayloadDigest(records: readonly ConformedRecord[]): string {
  const payloads = records.map((record) => record.sanitized_payload)
  return createHash("sha256").update(JSON.stringify(payloads)).digest("hex")
}

export async function findExistingBatch(
  deps: BatchStoreDeps,
  params: { lease: IngestLease; bodySha256: string },
): Promise<{ batchId: string } | null> {
  const { lease, bodySha256 } = params
  const result = await deps.pool.query(
    `SELECT batch_id FROM bumblebee_batch_receipts
     WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3
       AND source_revision_id=$4 AND lease_id=$5 AND body_sha256=$6`,
    [lease.groupId, lease.workspaceId, lease.sourceId, lease.sourceRevisionId, lease.leaseId, bodySha256],
  )
  const row = result.rows[0] as ReceiptRow | undefined
  return row ? { batchId: row.batch_id } : null
}

export async function findConflictingBatch(
  deps: BatchStoreDeps,
  params: { lease: IngestLease },
): Promise<{ batchId: string; bodySha256: string } | null> {
  const { lease } = params
  const result = await deps.pool.query(
    `SELECT batch_id, body_sha256 FROM bumblebee_batch_receipts
     WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3
       AND source_revision_id=$4 AND lease_id=$5
     LIMIT 1`,
    [lease.groupId, lease.workspaceId, lease.sourceId, lease.sourceRevisionId, lease.leaseId],
  )
  const row = result.rows[0] as ReceiptRow | undefined
  return row ? { batchId: row.batch_id, bodySha256: row.body_sha256! } : null
}

export async function persistBatch(deps: BatchStoreDeps, input: PersistBatchInput): Promise<void> {
  const { lease, records } = input
  const digest = sanitizedPayloadDigest(records)
  const decisionId = mintDecisionId(lease, input.batchId)

  // The whole batch is one transaction: a failure in any INSERT rolls back the
  // receipt and every record so the scanner never sees a partially-landed
  // batch. ROLLBACK is attempted on any error and the original error rethrown.
  await deps.pool.query("BEGIN")
  try {
    await deps.pool.query(
      `INSERT INTO bumblebee_batch_receipts
         (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, body_sha256, byte_count, line_count, record_count, sanitized_payload_digest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        lease.groupId,
        lease.workspaceId,
        lease.sourceId,
        lease.sourceRevisionId,
        lease.leaseId,
        input.batchId,
        input.bodySha256,
        input.byteCount,
        input.lineCount,
        input.recordCount,
        digest,
      ],
    )

    for (const record of records) {
      await deps.pool.query(
        `INSERT INTO bumblebee_records
           (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, run_id, record_id, record_type, sanitized_payload, canonical_id_inputs, line_number, line_sha256, redaction_provenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          lease.groupId,
          lease.workspaceId,
          lease.sourceId,
          lease.sourceRevisionId,
          lease.leaseId,
          input.batchId,
          record.run_id,
          record.record_id,
          record.record_type,
          JSON.stringify(record.sanitized_payload),
          JSON.stringify(record.canonical_id_inputs),
          record.line_number,
          record.line_sha256,
          JSON.stringify(record.redaction_provenance),
        ],
      )
    }

    // Every accepted batch starts held pending promotion; the summary record
    // that justified it is recorded so a later promotion can be audited.
    await deps.pool.query(
      `INSERT INTO bumblebee_run_decisions
         (group_id, workspace_id, source_id, source_revision_id, lease_id, batch_id, decision_id, run_id, summary_record_id, decision, reason_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        lease.groupId,
        lease.workspaceId,
        lease.sourceId,
        lease.sourceRevisionId,
        lease.leaseId,
        input.batchId,
        decisionId,
        records[0]?.run_id ?? "",
        input.summaryRecordId,
        "held",
        "HELD_PENDING_PROMOTION",
      ],
    )

    await deps.pool.query("COMMIT")
  } catch (error) {
    await deps.pool.query("ROLLBACK")
    throw error
  }
}

export async function createBatchStore(
  deps: BatchStoreDeps,
): Promise<{
  findExistingBatch: (params: { lease: IngestLease; bodySha256: string }) => Promise<{ batchId: string } | null>
  findConflictingBatch: (params: { lease: IngestLease }) => Promise<{ batchId: string; bodySha256: string } | null>
  persistBatch: (input: PersistBatchInput) => Promise<void>
}> {
  return {
    findExistingBatch: (params) => findExistingBatch(deps, params),
    findConflictingBatch: (params) => findConflictingBatch(deps, params),
    persistBatch: (input) => persistBatch(deps, input),
  }
}
