/**
 * Work Plane — Handoff Manager
 * Phase 2: Actor-to-actor handoffs with pending / acknowledged / rejected lifecycle.
 *
 * - createHandoff: inserts with status='pending'
 * - acknowledgeHandoff: transitions pending → acknowledged (idempotent on non-pending)
 * - rejectHandoff: transitions pending → rejected (idempotent on non-pending)
 * - listPendingHandoffs: returns status='pending', optionally filtered by toActorId
 *
 * Every query is scoped to group_id for tenant isolation.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("work-plane/handoff-manager is server-side only")
}

import type { Pool } from "pg"
import type { HandoffStatus, StoredHandoff } from "./types"

// ── Row type ──────────────────────────────────────────────────────────────────

interface HandoffRow {
  id: string
  group_id: string
  work_item_id: string | null
  from_actor_id: string
  to_actor_id: string
  message: string | null
  status: string
  created_at: Date
  acknowledged_at: Date | null
}

function rowToStored(row: HandoffRow): StoredHandoff {
  return {
    id: row.id,
    group_id: row.group_id,
    work_item_id: row.work_item_id,
    from_actor_id: row.from_actor_id,
    to_actor_id: row.to_actor_id,
    message: row.message,
    status: row.status as HandoffStatus,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
    acknowledged_at: row.acknowledged_at
      ? row.acknowledged_at instanceof Date
        ? row.acknowledged_at.toISOString()
        : String(row.acknowledged_at)
      : null,
  }
}

// ── createHandoff ─────────────────────────────────────────────────────────────

/**
 * Create a new handoff with status='pending'.
 */
export async function createHandoff(
  pool: Pool,
  params: {
    id: string
    groupId: string
    fromActorId: string
    toActorId: string
    message?: string
    workItemId?: string
  },
): Promise<StoredHandoff> {
  const {
    id,
    groupId,
    fromActorId,
    toActorId,
    message = null,
    workItemId = null,
  } = params

  const result = await pool.query<HandoffRow>(
    `INSERT INTO handoffs (id, group_id, work_item_id, from_actor_id, to_actor_id, message, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id, group_id, work_item_id, from_actor_id, to_actor_id, message, status, created_at, acknowledged_at`,
    [id, groupId, workItemId, fromActorId, toActorId, message],
  )

  return rowToStored(result.rows[0])
}

// ── getHandoff ────────────────────────────────────────────────────────────────

/**
 * Fetch a single handoff by (id, group_id).
 *
 * Returns null when no matching handoff exists.
 */
export async function getHandoff(
  pool: Pool,
  params: { id: string; groupId: string },
): Promise<StoredHandoff | null> {
  const { id, groupId } = params

  const result = await pool.query<HandoffRow>(
    `SELECT id, group_id, work_item_id, from_actor_id, to_actor_id, message, status, created_at, acknowledged_at
     FROM handoffs
     WHERE id = $1 AND group_id = $2`,
    [id, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}

// ── listPendingHandoffs ───────────────────────────────────────────────────────

/**
 * List all pending handoffs for a group, optionally filtered to a specific recipient actor.
 * Ordered by created_at ASC (oldest first — process in arrival order).
 */
export async function listPendingHandoffs(
  pool: Pool,
  params: { groupId: string; toActorId?: string; limit?: number },
): Promise<StoredHandoff[]> {
  const { groupId, toActorId, limit = 100 } = params

  if (toActorId !== undefined) {
    const result = await pool.query<HandoffRow>(
      `SELECT id, group_id, work_item_id, from_actor_id, to_actor_id, message, status, created_at, acknowledged_at
       FROM handoffs
       WHERE group_id = $1 AND status = 'pending' AND to_actor_id = $2
       ORDER BY created_at ASC
       LIMIT $3`,
      [groupId, toActorId, limit],
    )
    return result.rows.map(rowToStored)
  }

  const result = await pool.query<HandoffRow>(
    `SELECT id, group_id, work_item_id, from_actor_id, to_actor_id, message, status, created_at, acknowledged_at
     FROM handoffs
     WHERE group_id = $1 AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT $2`,
    [groupId, limit],
  )
  return result.rows.map(rowToStored)
}

// ── acknowledgeHandoff ────────────────────────────────────────────────────────

/**
 * Transition a pending handoff to acknowledged.
 *
 * Idempotent: returns null if the handoff is already acknowledged or rejected,
 * or does not exist. Only operates on status='pending'.
 */
export async function acknowledgeHandoff(
  pool: Pool,
  params: { id: string; groupId: string },
): Promise<StoredHandoff | null> {
  const { id, groupId } = params

  const result = await pool.query<HandoffRow>(
    `UPDATE handoffs
     SET status = 'acknowledged', acknowledged_at = NOW()
     WHERE id = $1 AND group_id = $2 AND status = 'pending'
     RETURNING id, group_id, work_item_id, from_actor_id, to_actor_id, message, status, created_at, acknowledged_at`,
    [id, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}

// ── rejectHandoff ─────────────────────────────────────────────────────────────

/**
 * Transition a pending handoff to rejected.
 *
 * Idempotent: returns null if the handoff is already acknowledged or rejected,
 * or does not exist. Only operates on status='pending'.
 */
export async function rejectHandoff(
  pool: Pool,
  params: { id: string; groupId: string },
): Promise<StoredHandoff | null> {
  const { id, groupId } = params

  const result = await pool.query<HandoffRow>(
    `UPDATE handoffs
     SET status = 'rejected', acknowledged_at = NOW()
     WHERE id = $1 AND group_id = $2 AND status = 'pending'
     RETURNING id, group_id, work_item_id, from_actor_id, to_actor_id, message, status, created_at, acknowledged_at`,
    [id, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}
