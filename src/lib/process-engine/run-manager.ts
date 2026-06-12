/**
 * Process Engine — Run Manager
 * Phase 1: Production Run Kernel (AD-P1-02)
 *
 * Snapshot CRUD for process_runs. This module owns:
 *   - createRun   — INSERT new snapshot row
 *   - getRun      — SELECT by (id, group_id)
 *   - listRuns    — SELECT with optional status filter
 *   - updateRunSnapshot — optimistic-concurrency UPDATE
 *
 * INVARIANT: This module never inserts events. The caller (engine) must
 * INSERT the event BEFORE calling updateRunSnapshot. Write-order is
 * event → snapshot, never reversed.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/run-manager is server-side only")
}

import type { Pool } from "pg"
import type { ProcessState, ProcessStatus, StoredRun } from "./types"

// ── Row shape returned by PG ─────────────────────────────────────────────────

interface RunRow {
  id: string
  definition_id: string
  definition_revision: number
  group_id: string
  status: ProcessStatus
  state_json: Record<string, unknown>
  actor_id: string | null
  started_at: Date
  updated_at: Date
  completed_at: Date | null
}

function rowToStoredRun(row: RunRow): StoredRun {
  return {
    id: row.id,
    definition_id: row.definition_id,
    definition_revision: row.definition_revision,
    group_id: row.group_id,
    status: row.status,
    state_json: row.state_json,
    actor_id: row.actor_id,
    started_at: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    completed_at:
      row.completed_at == null
        ? null
        : row.completed_at instanceof Date
          ? row.completed_at.toISOString()
          : String(row.completed_at),
  }
}

// ── createRun ────────────────────────────────────────────────────────────────

export interface CreateRunParams {
  id: string
  definitionId: string
  definitionRevision: number
  groupId: string
  actorId: string
  initialState: ProcessState
}

/**
 * Insert a new process run snapshot.
 * Status is set to "pending" on creation.
 */
export async function createRun(pool: Pool, params: CreateRunParams): Promise<StoredRun> {
  const { id, definitionId, definitionRevision, groupId, actorId, initialState } = params

  const result = await pool.query<RunRow>(
    `INSERT INTO process_runs
       (id, definition_id, definition_revision, group_id, status, state_json, actor_id)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6)
     RETURNING *`,
    [id, definitionId, definitionRevision, groupId, JSON.stringify(initialState), actorId],
  )

  return rowToStoredRun(result.rows[0])
}

// ── getRun ────────────────────────────────────────────────────────────────────

export interface GetRunParams {
  id: string
  groupId: string
}

/**
 * Fetch a single run by (id, group_id). Returns null when not found.
 */
export async function getRun(pool: Pool, params: GetRunParams): Promise<StoredRun | null> {
  const { id, groupId } = params

  const result = await pool.query<RunRow>(
    `SELECT * FROM process_runs
     WHERE id = $1 AND group_id = $2
     LIMIT 1`,
    [id, groupId],
  )

  if (result.rows.length === 0) {
    return null
  }

  return rowToStoredRun(result.rows[0])
}

// ── listRuns ──────────────────────────────────────────────────────────────────

export interface ListRunsParams {
  groupId: string
  status?: ProcessStatus
  limit?: number
}

/**
 * List runs for a group, optionally filtered by status.
 * Ordered by started_at DESC, default limit 50.
 */
export async function listRuns(pool: Pool, params: ListRunsParams): Promise<StoredRun[]> {
  const { groupId, status, limit = 50 } = params

  let query: string
  let queryParams: unknown[]

  if (status !== undefined) {
    query = `SELECT * FROM process_runs
             WHERE group_id = $1 AND status = $2
             ORDER BY started_at DESC
             LIMIT $3`
    queryParams = [groupId, status, limit]
  } else {
    query = `SELECT * FROM process_runs
             WHERE group_id = $1
             ORDER BY started_at DESC
             LIMIT $2`
    queryParams = [groupId, limit]
  }

  const result = await pool.query<RunRow>(query, queryParams)
  return result.rows.map(rowToStoredRun)
}

// ── updateRunSnapshot ─────────────────────────────────────────────────────────

export interface UpdateRunSnapshotParams {
  id: string
  groupId: string
  status: ProcessStatus
  stateJson: Record<string, unknown>
  /** ISO-8601 timestamp from the snapshot the caller last read */
  expectedUpdatedAt: string
  /** ISO-8601 timestamp; set when the run reaches a terminal state */
  completedAt?: string
}

/**
 * Optimistic-concurrency snapshot update.
 *
 * Uses `WHERE updated_at = $expectedUpdatedAt` to detect write conflicts.
 * Returns the updated StoredRun, or null when no row matched (stale —
 * the caller should respond with HTTP 409 or retry from fresh state).
 *
 * INVARIANT: The caller must have already inserted the corresponding event
 * row before calling this function (events-first write order).
 */
export async function updateRunSnapshot(
  pool: Pool,
  params: UpdateRunSnapshotParams,
): Promise<StoredRun | null> {
  const { id, groupId, status, stateJson, expectedUpdatedAt, completedAt } = params

  let query: string
  let queryParams: unknown[]

  if (completedAt !== undefined) {
    query = `UPDATE process_runs
             SET status       = $1,
                 state_json   = $2,
                 updated_at   = NOW(),
                 completed_at = $3
             WHERE id         = $4
               AND group_id   = $5
               AND updated_at = $6
             RETURNING *`
    queryParams = [status, JSON.stringify(stateJson), completedAt, id, groupId, expectedUpdatedAt]
  } else {
    query = `UPDATE process_runs
             SET status     = $1,
                 state_json = $2,
                 updated_at = NOW()
             WHERE id         = $3
               AND group_id   = $4
               AND updated_at = $5
             RETURNING *`
    queryParams = [status, JSON.stringify(stateJson), id, groupId, expectedUpdatedAt]
  }

  const result = await pool.query<RunRow>(query, queryParams)

  if (result.rowCount === 0) {
    // Stale — another writer updated the row; caller handles 409
    return null
  }

  return rowToStoredRun(result.rows[0])
}
