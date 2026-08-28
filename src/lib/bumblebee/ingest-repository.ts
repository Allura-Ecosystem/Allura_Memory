if (typeof window !== "undefined") throw new Error("server-side only")

import { randomUUID } from "node:crypto"
import type { Pool } from "pg"

import { withTenantTransaction } from "@/lib/db/tenant-transaction"
import { getAppPool } from "@/lib/postgres/connection"
import { BUMBLEBEE_INGEST_ERROR, type BatchReceipt, type ParsedIngestBatch } from "./ingest"

interface PgError extends Error { code?: string; constraint?: string }

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

      const lease = await client.query(`SELECT lease_id FROM bumblebee_scan_leases
        WHERE group_id=$1 AND workspace_id=$2 AND source_id=$3 AND source_revision_id=$4
          AND lease_id=$5 AND revoked_at IS NULL AND expires_at > statement_timestamp()
        FOR UPDATE`,
      [authority.groupId, authority.workspaceId, authority.sourceId, authority.sourceRevisionId, authority.leaseId])
      if (lease.rows.length !== 1) throw new Error("BUMBLEBEE_AUTH_EXPIRED")

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
