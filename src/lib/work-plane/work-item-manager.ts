/**
 * Work Plane — Work Item Manager
 * Phase 2: CRUD + audited status transitions for work_items in PostgreSQL.
 *
 * - createWorkItem    — INSERT with ON CONFLICT DO NOTHING
 * - getWorkItem       — SELECT by (id, group_id)
 * - listWorkItems     — SELECT with optional status / lane filters
 * - transitionWorkItem — Validated, optimistic-concurrency status change
 * - linkRunToWorkItem  — Attach a process run ID to a work item
 *
 * INVARIANT: transitionWorkItem validates the transition graph before writing.
 * INVARIANT: This module never inserts transition events — the caller owns that.
 * INVARIANT: group_id required on every query for tenant isolation.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("work-plane/work-item-manager is server-side only")
}

import type { Pool } from "pg"
import type { WorkItemPriority, WorkItemStatus, StoredWorkItem } from "./types"

// ── Valid transitions ─────────────────────────────────────────────────────────

/**
 * Adjacency map of allowed status transitions.
 * Terminal states (done, cancelled) have empty arrays — no transitions out.
 */
const VALID_TRANSITIONS: Readonly<Record<WorkItemStatus, readonly WorkItemStatus[]>> = {
  backlog:     ["ready", "cancelled"],
  ready:       ["in_progress", "backlog", "cancelled"],
  in_progress: ["in_review", "blocked", "done", "cancelled"],
  in_review:   ["in_progress", "done", "cancelled"],
  blocked:     ["in_progress", "cancelled"],
  done:        [],
  cancelled:   [],
}

function isValidTransition(from: WorkItemStatus, to: WorkItemStatus): boolean {
  return (VALID_TRANSITIONS[from] as readonly string[]).includes(to)
}

// ── Row type ──────────────────────────────────────────────────────────────────

interface WorkItemRow {
  id: string
  project_id: string
  lane_id: string | null
  group_id: string
  title: string
  description: string | null
  status: WorkItemStatus
  priority: WorkItemPriority
  owner_id: string | null
  team_id: string | null
  acceptance_criteria: unknown[]
  linked_run_id: string | null
  latest_receipt_id: string | null
  blocker: string | null
  created_at: Date
  updated_at: Date
  /**
   * Microsecond-precise ISO-8601 token produced by:
   *   to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
   *
   * PG timestamptz has microsecond resolution; JS Date.toISOString() truncates to
   * milliseconds, so `AND updated_at = $token` matches 0 rows on real PG. The
   * `updated_at_token` carries µs precision so the token round-trips exactly through
   * the optimistic-lock WHERE clause.
   */
  updated_at_token: string
  completed_at: Date | null
}

function rowToStored(row: WorkItemRow): StoredWorkItem {
  return {
    id: row.id,
    project_id: row.project_id,
    lane_id: row.lane_id,
    group_id: row.group_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    owner_id: row.owner_id,
    team_id: row.team_id,
    acceptance_criteria: row.acceptance_criteria ?? [],
    linked_run_id: row.linked_run_id,
    latest_receipt_id: row.latest_receipt_id,
    blocker: row.blocker,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    // Use the µs-precise token so the optimistic-lock WHERE round-trips exactly.
    updated_at: row.updated_at_token,
    completed_at:
      row.completed_at == null
        ? null
        : row.completed_at instanceof Date
          ? row.completed_at.toISOString()
          : String(row.completed_at),
  }
}

const WORK_ITEM_COLUMNS = `
  id, project_id, lane_id, group_id, title, description, status, priority,
  owner_id, team_id, acceptance_criteria, linked_run_id, latest_receipt_id,
  blocker, created_at, updated_at, completed_at
`

// Append to every SELECT/RETURNING to capture the µs-precise optimistic-lock token.
const WORK_ITEM_SELECT = `${WORK_ITEM_COLUMNS.trimEnd()},
  to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at_token
`

// ── createWorkItem ────────────────────────────────────────────────────────────

export interface CreateWorkItemParams {
  id: string
  projectId: string
  groupId: string
  title: string
  description?: string
  priority?: WorkItemPriority
  ownerId?: string
  laneId?: string
  acceptanceCriteria?: unknown[]
}

/**
 * Insert a new work item row.
 *
 * ON CONFLICT DO NOTHING — if a row with the same id already exists, the
 * existing row is returned unchanged (idempotent create).
 */
export async function createWorkItem(
  pool: Pool,
  params: CreateWorkItemParams,
): Promise<StoredWorkItem> {
  const {
    id,
    projectId,
    groupId,
    title,
    description,
    priority = "medium",
    ownerId,
    laneId,
    acceptanceCriteria = [],
  } = params

  const insertResult = await pool.query<WorkItemRow>(
    `INSERT INTO work_items
       (id, project_id, lane_id, group_id, title, description, priority, owner_id, acceptance_criteria)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO NOTHING
     RETURNING ${WORK_ITEM_SELECT}`,
    [
      id,
      projectId,
      laneId ?? null,
      groupId,
      title,
      description ?? null,
      priority,
      ownerId ?? null,
      JSON.stringify(acceptanceCriteria),
    ],
  )

  if (insertResult.rows.length > 0) {
    return rowToStored(insertResult.rows[0])
  }

  // ON CONFLICT DO NOTHING — row already exists; fetch and return it
  const existing = await pool.query<WorkItemRow>(
    `SELECT ${WORK_ITEM_SELECT}
     FROM work_items
     WHERE id = $1 AND group_id = $2`,
    [id, groupId],
  )

  return rowToStored(existing.rows[0])
}

// ── getWorkItem ───────────────────────────────────────────────────────────────

export interface GetWorkItemParams {
  id: string
  groupId: string
}

/**
 * Fetch a single work item by (id, group_id). Returns null when not found.
 */
export async function getWorkItem(
  pool: Pool,
  params: GetWorkItemParams,
): Promise<StoredWorkItem | null> {
  const { id, groupId } = params

  const result = await pool.query<WorkItemRow>(
    `SELECT ${WORK_ITEM_SELECT}
     FROM work_items
     WHERE id = $1 AND group_id = $2
     LIMIT 1`,
    [id, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}

// ── listWorkItems ─────────────────────────────────────────────────────────────

export interface ListWorkItemsParams {
  projectId: string
  groupId: string
  status?: WorkItemStatus
  laneId?: string
  limit?: number
}

/**
 * List work items for a project/tenant, with optional status and lane filters.
 * Ordered by created_at DESC, default limit 100.
 */
export async function listWorkItems(
  pool: Pool,
  params: ListWorkItemsParams,
): Promise<StoredWorkItem[]> {
  const { projectId, groupId, status, laneId, limit = 100 } = params

  const conditions: string[] = ["project_id = $1", "group_id = $2"]
  const queryParams: unknown[] = [projectId, groupId]
  let paramIdx = 3

  if (status !== undefined) {
    conditions.push(`status = $${paramIdx++}`)
    queryParams.push(status)
  }
  if (laneId !== undefined) {
    conditions.push(`lane_id = $${paramIdx++}`)
    queryParams.push(laneId)
  }

  queryParams.push(limit)

  const query = `SELECT ${WORK_ITEM_SELECT}
                 FROM work_items
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY created_at DESC
                 LIMIT $${paramIdx}`

  const result = await pool.query<WorkItemRow>(query, queryParams)
  return result.rows.map(rowToStored)
}

// ── transitionWorkItem ────────────────────────────────────────────────────────

export interface TransitionWorkItemParams {
  id: string
  groupId: string
  toStatus: WorkItemStatus
  actorId: string
  reason?: string
  evidenceId?: string
  expectedUpdatedAt: string
}

/**
 * Validated, audited work item status transition.
 *
 * Steps:
 *   1. Read current work item to determine from_status.
 *   2. Validate the transition is allowed per VALID_TRANSITIONS.
 *   3. UPDATE status + updated_at with optimistic lock (WHERE updated_at = $expected).
 *   4. If toStatus is 'done' or 'cancelled', set completed_at = NOW().
 *
 * Returns:
 *   - Updated StoredWorkItem on success.
 *   - null when the lock check fails (stale) or the transition is invalid.
 *
 * INVARIANT: The caller must INSERT the transition event after a successful
 * return. This module does not insert events.
 */
export async function transitionWorkItem(
  pool: Pool,
  params: TransitionWorkItemParams,
): Promise<StoredWorkItem | null> {
  const { id, groupId, toStatus, expectedUpdatedAt } = params

  // Step 1: Read current state
  const current = await getWorkItem(pool, { id, groupId })
  if (current === null) return null

  // Step 2: Validate transition
  if (!isValidTransition(current.status, toStatus)) return null

  // Step 3 & 4: UPDATE with optimistic lock
  const isTerminal = toStatus === "done" || toStatus === "cancelled"

  let query: string
  let queryParams: unknown[]

  if (isTerminal) {
    query = `UPDATE work_items
             SET status       = $1,
                 updated_at   = NOW(),
                 completed_at = NOW()
             WHERE id         = $2
               AND group_id   = $3
               AND to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $4
             RETURNING ${WORK_ITEM_SELECT}`
    queryParams = [toStatus, id, groupId, expectedUpdatedAt]
  } else {
    query = `UPDATE work_items
             SET status     = $1,
                 updated_at = NOW()
             WHERE id         = $2
               AND group_id   = $3
               AND to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $4
             RETURNING ${WORK_ITEM_SELECT}`
    queryParams = [toStatus, id, groupId, expectedUpdatedAt]
  }

  const result = await pool.query<WorkItemRow>(query, queryParams)

  if ((result.rowCount ?? 0) === 0) return null
  return rowToStored(result.rows[0])
}

// ── linkRunToWorkItem ─────────────────────────────────────────────────────────

export interface LinkRunToWorkItemParams {
  id: string
  groupId: string
  runId: string
  expectedUpdatedAt: string
}

/**
 * Attach a process run ID to a work item using optimistic concurrency.
 *
 * Returns the updated StoredWorkItem, or null when the lock check fails (stale).
 */
export async function linkRunToWorkItem(
  pool: Pool,
  params: LinkRunToWorkItemParams,
): Promise<StoredWorkItem | null> {
  const { id, groupId, runId, expectedUpdatedAt } = params

  const result = await pool.query<WorkItemRow>(
    `UPDATE work_items
     SET linked_run_id = $1,
         updated_at    = NOW()
     WHERE id         = $2
       AND group_id   = $3
       AND to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $4
     RETURNING ${WORK_ITEM_SELECT}`,
    [runId, id, groupId, expectedUpdatedAt],
  )

  if ((result.rowCount ?? 0) === 0) return null
  return rowToStored(result.rows[0])
}
