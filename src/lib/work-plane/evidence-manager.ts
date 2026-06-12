/**
 * Work Plane — Evidence Manager
 * Phase 2: Append-only evidence packets for work items and process runs.
 *
 * Evidence packets are immutable once created — no update, no delete.
 * artifact_refs stored as JSONB array; content stored as JSONB object.
 * Every query is scoped to group_id for tenant isolation.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("work-plane/evidence-manager is server-side only")
}

import type { Pool } from "pg"
import type { EvidencePacketType, StoredEvidencePacket } from "./types"

// ── Row type ──────────────────────────────────────────────────────────────────

interface EvidencePacketRow {
  id: string
  group_id: string
  work_item_id: string | null
  run_id: string | null
  step_id: string | null
  actor_id: string
  packet_type: string
  content: Record<string, unknown>
  artifact_refs: string[]
  created_at: Date
}

function rowToStored(row: EvidencePacketRow): StoredEvidencePacket {
  return {
    id: row.id,
    group_id: row.group_id,
    work_item_id: row.work_item_id,
    run_id: row.run_id,
    step_id: row.step_id,
    actor_id: row.actor_id,
    packet_type: row.packet_type as EvidencePacketType,
    content: row.content,
    artifact_refs: Array.isArray(row.artifact_refs) ? row.artifact_refs : [],
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  }
}

// ── createEvidencePacket ──────────────────────────────────────────────────────

/**
 * Create an evidence packet. Evidence is append-only — no update or delete.
 */
export async function createEvidencePacket(
  pool: Pool,
  params: {
    id: string
    groupId: string
    actorId: string
    packetType: EvidencePacketType
    content: Record<string, unknown>
    artifactRefs?: string[]
    workItemId?: string
    runId?: string
    stepId?: string
  },
): Promise<StoredEvidencePacket> {
  const {
    id,
    groupId,
    actorId,
    packetType,
    content,
    artifactRefs = [],
    workItemId = null,
    runId = null,
    stepId = null,
  } = params

  const result = await pool.query<EvidencePacketRow>(
    `INSERT INTO evidence_packets
       (id, group_id, work_item_id, run_id, step_id, actor_id, packet_type, content, artifact_refs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, group_id, work_item_id, run_id, step_id, actor_id, packet_type, content, artifact_refs, created_at`,
    [
      id,
      groupId,
      workItemId,
      runId,
      stepId,
      actorId,
      packetType,
      JSON.stringify(content),
      JSON.stringify(artifactRefs),
    ],
  )

  return rowToStored(result.rows[0])
}

// ── getEvidencePacket ─────────────────────────────────────────────────────────

/**
 * Fetch a single evidence packet by (id, group_id).
 *
 * Returns null when no matching packet exists.
 */
export async function getEvidencePacket(
  pool: Pool,
  params: { id: string; groupId: string },
): Promise<StoredEvidencePacket | null> {
  const { id, groupId } = params

  const result = await pool.query<EvidencePacketRow>(
    `SELECT id, group_id, work_item_id, run_id, step_id, actor_id, packet_type, content, artifact_refs, created_at
     FROM evidence_packets
     WHERE id = $1 AND group_id = $2`,
    [id, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}

// ── listEvidenceByWorkItem ────────────────────────────────────────────────────

/**
 * List all evidence packets associated with a work item, newest first.
 */
export async function listEvidenceByWorkItem(
  pool: Pool,
  params: { workItemId: string; groupId: string; limit?: number },
): Promise<StoredEvidencePacket[]> {
  const { workItemId, groupId, limit = 100 } = params

  const result = await pool.query<EvidencePacketRow>(
    `SELECT id, group_id, work_item_id, run_id, step_id, actor_id, packet_type, content, artifact_refs, created_at
     FROM evidence_packets
     WHERE work_item_id = $1 AND group_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [workItemId, groupId, limit],
  )

  return result.rows.map(rowToStored)
}

// ── listEvidenceByRun ─────────────────────────────────────────────────────────

/**
 * List all evidence packets associated with a process run, newest first.
 */
export async function listEvidenceByRun(
  pool: Pool,
  params: { runId: string; groupId: string; limit?: number },
): Promise<StoredEvidencePacket[]> {
  const { runId, groupId, limit = 100 } = params

  const result = await pool.query<EvidencePacketRow>(
    `SELECT id, group_id, work_item_id, run_id, step_id, actor_id, packet_type, content, artifact_refs, created_at
     FROM evidence_packets
     WHERE run_id = $1 AND group_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [runId, groupId, limit],
  )

  return result.rows.map(rowToStored)
}
