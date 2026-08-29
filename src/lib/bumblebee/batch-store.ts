if (typeof window !== "undefined") throw new Error("server-side only")

import { createHash } from "node:crypto"

import type { ConformedRecord } from "./batch-conformance"
import { evaluateIngestDecision, parseIngestSummary } from "./ingest-decision"
import type { IngestLease, PersistBatchInput } from "./ingest-pipeline"

// The pool is injected rather than imported so the route can wire whichever
// pool matches its tenant scope (getPool/getAppPool) and tests can substitute
// a fake. Only the query() surface is required, keeping the dependency narrow.
export interface BatchStoreDeps {
  pool: {
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>
  }
  /** False when the caller already owns the scoped transaction. */
  transactional?: boolean
}

interface ReceiptRow {
  batch_id: string
  body_sha256?: string
}

// Deterministic from (lease, batch): a retried persist of the same batch must
// produce the same decision identity so the append-only table stays idempotent.
// The prefix names neither outcome — a retried persist must mint the same id
// whichever way the decision engine evaluates it.
function mintDecisionId(lease: IngestLease, batchId: string): string {
  const digest = createHash("sha256").update(`${lease.leaseId}\0${batchId}`).digest("hex")
  return `dec_${digest.slice(0, 32)}`
}

interface LeaseClockRow {
  lease_created_at: string | Date
  database_now: string | Date
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
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
  // batch. When an outer scoped transaction owns the client, it owns rollback.
  const ownsTransaction = deps.transactional !== false
  if (ownsTransaction) await deps.pool.query("BEGIN")
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

    // AC-10: the decision is computed and written in this same transaction so
    // the receipt, every record, and the eligibility fact land atomically. The
    // lease's own created_at and the database's own clock are read from the
    // scoped lease row rather than trusted from the scanner-controlled NDJSON
    // payload, so a forged endpoint clock cannot manufacture eligibility.
    const clockResult = await deps.pool.query(
      `SELECT created_at AS lease_created_at, NOW() AS database_now
       FROM bumblebee_scan_leases
       WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4 AND lease_id=$5`,
      [lease.groupId, lease.workspaceId, lease.sourceId, lease.sourceRevisionId, lease.leaseId],
    )
    const clockRow = clockResult.rows[0] as LeaseClockRow | undefined

    const summaryRecord = records.find((record) => record.record_type === "scan_summary")
    const summary = summaryRecord ? parseIngestSummary(summaryRecord.sanitized_payload) : null
    const packageRecords = records.filter((record) => record.record_type === "package").length
    const findingRecords = records.filter((record) => record.record_type === "finding").length

    const { decision, reasonCode } = clockRow === undefined
      // No matching lease row is a data-integrity impossibility given the FK
      // from bumblebee_batch_receipts to bumblebee_scan_leases, but the
      // decision engine still needs a definite clock ordering to reason
      // about, so it fails closed the same way a missing summary would.
      ? { decision: "held" as const, reasonCode: "HELD_CLOCK_ORDER" as const }
      : evaluateIngestDecision({
        profile: lease.profile ?? "baseline",
        mode: lease.mode ?? "inventory",
        packageRecords,
        findingRecords,
        leaseCreatedAt: asDate(clockRow.lease_created_at),
        databaseNow: asDate(clockRow.database_now),
        summary,
      })

    // Append-only fact: `promoted` requires the summary record that justified
    // it (enforced by the CHECK on bumblebee_run_decisions); `held` requires
    // summary_record_id to be NULL. The summary record itself was already
    // inserted above as part of `records`, so the FK to bumblebee_records is
    // satisfiable before this INSERT runs.
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
        decision === "promoted" ? input.summaryRecordId : null,
        decision,
        reasonCode,
      ],
    )

    if (ownsTransaction) await deps.pool.query("COMMIT")
  } catch (error) {
    if (ownsTransaction) await deps.pool.query("ROLLBACK")
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
