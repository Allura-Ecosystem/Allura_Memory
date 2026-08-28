if (typeof window !== "undefined") throw new Error("server-side only")

import { randomUUID } from "node:crypto"
import type { Pool } from "pg"

import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"
import { evaluateIngestDecision, type IngestDecisionSummary } from "./ingest-decision"
import { BUMBLEBEE_INGEST_ERROR, type BatchReceipt, type ParsedIngestBatch } from "./ingest"

interface PgError extends Error { code?: string; constraint?: string }

interface LeaseDecisionRow {
  lease_id: string
  generation: string | number
  profile: "baseline" | "project" | "deep"
  mode: "inventory" | "findings-only"
  created_at: Date
}

export async function persistIngestBatch(batch: ParsedIngestBatch, pool: Pool = getAppPool()): Promise<BatchReceipt> {
  const { authority } = batch
  try {
    return await withTenantTransaction({
      tenantId: authority.groupId,
      workspaceId: authority.workspaceId,
      principalId: authority.leaseId,
    }, async (client) => {
      // Source is always locked before lease so disable/revocation races have one order.
      const source = await client.query(`SELECT source_id FROM bumblebee_sources
        WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4
          AND disabled_at IS NULL FOR UPDATE`,
      [authority.groupId, authority.workspaceId, authority.sourceId, authority.sourceRevisionId])
      if (source.rows.length !== 1) throw new Error(BUMBLEBEE_INGEST_ERROR.recordConflict)

      const lease = await client.query<LeaseDecisionRow>(`SELECT lease_id, generation, profile, mode, created_at FROM bumblebee_scan_leases
        WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4
          AND lease_id=$5 AND revoked_at IS NULL AND expires_at > statement_timestamp()
        FOR UPDATE`,
      [authority.groupId, authority.workspaceId, authority.sourceId, authority.sourceRevisionId, authority.leaseId])
      if (lease.rows.length !== 1) throw new Error("BUMBLEBEE_AUTH_EXPIRED")
      const leaseRow = lease.rows[0]

      const replay = await client.query<{ batch_id: string }>(`SELECT batch_id FROM bumblebee_batch_receipts
        WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4
          AND lease_id=$5 AND body_sha256=$6`,
      [authority.groupId, authority.workspaceId, authority.sourceId, authority.sourceRevisionId,
        authority.leaseId, batch.bodySha256])
      if (replay.rows[0]) return { receiptId: replay.rows[0].batch_id, replayed: true }

      const batchId = randomUUID()
      await client.query(`INSERT INTO bumblebee_batch_receipts
        (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,
         body_sha256,expanded_sha256,sanitized_payload_digest,compressed_bytes,expanded_bytes,line_count,record_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [authority.groupId, authority.workspaceId, authority.sourceId, authority.sourceRevisionId,
        authority.leaseId, batchId, batch.bodySha256, batch.expandedSha256,
        batch.sanitizedPayloadDigest, batch.compressedBytes, batch.expandedBytes, batch.lineCount, batch.records.length])

      for (const record of batch.records) {
        await client.query(`INSERT INTO bumblebee_records
          (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,run_id,
           record_id,record_type,line_number,line_sha256,verification_digest,sanitized_payload,redaction_provenance)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb)`,
        [authority.groupId, authority.workspaceId, authority.sourceId, authority.sourceRevisionId,
          authority.leaseId, batchId, record.runId, record.recordId, record.recordType, record.lineNumber,
          record.lineSha256, record.verificationDigest, JSON.stringify(record.sanitized),
          JSON.stringify(record.redactionProvenance)])
      }

      // Decision engine wiring (Slice 5). The scan_summary row, if any, was just
      // inserted above in this same transaction — summary_record_id is a composite
      // FK against bumblebee_records, so the decision INSERT must come after it,
      // never before (ORDERING IS MANDATORY per the migration-48 FK contract).
      const summaryRecord = batch.records.find((record) => record.recordType === "scan_summary")
      const packageRecords = batch.records.filter((record) => record.recordType === "package").length
      const findingRecords = batch.records.filter((record) => record.recordType === "finding").length

      let summary: IngestDecisionSummary | null = null
      if (summaryRecord) {
        const sanitized = summaryRecord.sanitized as Record<string, unknown>
        // sanitizeRecord (ingest.ts) always strips `error` from the stored payload,
        // but only lists it in redactionProvenance.omittedFields when the raw record
        // actually carried `error !== undefined` (ingest.ts sanitizeRecord, scan_summary
        // branch: `omitted = [...].filter((key) => key.includes(".") || record[key] !== undefined)`).
        // This is how a contradictory in-band error is detected here without ever
        // persisting the error text itself. If that omission-listing rule ever changes,
        // this derivation silently breaks — it is pinned by a dedicated test.
        const errorPresent = summaryRecord.redactionProvenance.omittedFields.includes("error")
        summary = {
          status: sanitized.status as IngestDecisionSummary["status"],
          timedOut: sanitized.timed_out === true,
          packageRecordsEmitted: Number(sanitized.package_records_emitted ?? 0),
          packageRecordsSuppressed: Number(sanitized.package_records_suppressed ?? 0),
          findingsEmitted: Number(sanitized.findings_emitted ?? 0),
          httpBatchesFailed: Number(sanitized.http_batches_failed ?? 0),
          errorPresent,
          scanTime: new Date(String(sanitized.scan_time)),
          endTime: new Date(String(sanitized.end_time)),
        }
      }

      const databaseNowResult = await client.query<{ now: Date }>("SELECT statement_timestamp() AS now")
      const databaseNow = databaseNowResult.rows[0].now

      const decision = evaluateIngestDecision({
        profile: leaseRow.profile,
        mode: leaseRow.mode,
        generation: Number(leaseRow.generation),
        packageRecords,
        findingRecords,
        leaseCreatedAt: leaseRow.created_at,
        databaseNow,
        summary,
      })

      await client.query(`INSERT INTO bumblebee_run_decisions
        (group_id,workspace_id,source_id,source_revision_id,lease_id,batch_id,decision,reason_code,summary_record_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [authority.groupId, authority.workspaceId, authority.sourceId, authority.sourceRevisionId,
        authority.leaseId, batchId, decision.decision, decision.reasonCode, summaryRecord?.recordId ?? null])

      return { receiptId: batchId, replayed: false }
    }, pool)
  } catch (error) {
    const pg = error as PgError
    if (pg.code === "23505" && pg.constraint?.startsWith("bumblebee_records")) {
      throw new Error(BUMBLEBEE_INGEST_ERROR.recordConflict)
    }
    throw error
  }
}
