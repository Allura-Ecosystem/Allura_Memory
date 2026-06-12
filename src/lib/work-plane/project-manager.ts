/**
 * Work Plane — Project Manager
 * Phase 2: CRUD operations for projects stored in PostgreSQL.
 *
 * - createProject  — INSERT with ON CONFLICT DO NOTHING
 * - getProject     — SELECT by (id, group_id)
 * - listProjects   — SELECT with optional status filter
 * - updateProject  — Optimistic-concurrency UPDATE
 * - archiveProject — Sets status='archived', archived_at=NOW() with optimistic lock
 *
 * INVARIANT: This module never inserts events. Callers own the audit trail.
 * INVARIANT: group_id required on every query for tenant isolation.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("work-plane/project-manager is server-side only")
}

import type { Pool } from "pg"
import type { ProjectStatus, StoredProject } from "./types"

// ── Row type ──────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string
  group_id: string
  name: string
  description: string | null
  status: ProjectStatus
  owner_id: string | null
  team_id: string | null
  created_at: Date
  updated_at: Date
  archived_at: Date | null
}

function rowToStored(row: ProjectRow): StoredProject {
  return {
    id: row.id,
    group_id: row.group_id,
    name: row.name,
    description: row.description,
    status: row.status,
    owner_id: row.owner_id,
    team_id: row.team_id,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    archived_at:
      row.archived_at == null
        ? null
        : row.archived_at instanceof Date
          ? row.archived_at.toISOString()
          : String(row.archived_at),
  }
}

// ── createProject ─────────────────────────────────────────────────────────────

export interface CreateProjectParams {
  id: string
  groupId: string
  name: string
  description?: string
  ownerId?: string
  teamId?: string
}

/**
 * Insert a new project row.
 *
 * ON CONFLICT DO NOTHING — if the exact (id) row already exists, the existing
 * row is returned unchanged (idempotent create).
 */
export async function createProject(
  pool: Pool,
  params: CreateProjectParams,
): Promise<StoredProject> {
  const { id, groupId, name, description, ownerId, teamId } = params

  const insertResult = await pool.query<ProjectRow>(
    `INSERT INTO projects (id, group_id, name, description, owner_id, team_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING
     RETURNING id, group_id, name, description, status, owner_id, team_id,
               created_at, updated_at, archived_at`,
    [id, groupId, name, description ?? null, ownerId ?? null, teamId ?? null],
  )

  if (insertResult.rows.length > 0) {
    return rowToStored(insertResult.rows[0])
  }

  // ON CONFLICT DO NOTHING — row already exists; fetch and return it
  const existing = await pool.query<ProjectRow>(
    `SELECT id, group_id, name, description, status, owner_id, team_id,
            created_at, updated_at, archived_at
     FROM projects
     WHERE id = $1 AND group_id = $2`,
    [id, groupId],
  )

  return rowToStored(existing.rows[0])
}

// ── getProject ────────────────────────────────────────────────────────────────

export interface GetProjectParams {
  id: string
  groupId: string
}

/**
 * Fetch a single project by (id, group_id). Returns null when not found.
 */
export async function getProject(
  pool: Pool,
  params: GetProjectParams,
): Promise<StoredProject | null> {
  const { id, groupId } = params

  const result = await pool.query<ProjectRow>(
    `SELECT id, group_id, name, description, status, owner_id, team_id,
            created_at, updated_at, archived_at
     FROM projects
     WHERE id = $1 AND group_id = $2
     LIMIT 1`,
    [id, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}

// ── listProjects ──────────────────────────────────────────────────────────────

export interface ListProjectsParams {
  groupId: string
  status?: ProjectStatus
  limit?: number
}

/**
 * List projects for a tenant, optionally filtered by status.
 * Ordered by created_at DESC, default limit 50.
 */
export async function listProjects(
  pool: Pool,
  params: ListProjectsParams,
): Promise<StoredProject[]> {
  const { groupId, status, limit = 50 } = params

  let query: string
  let queryParams: unknown[]

  if (status !== undefined) {
    query = `SELECT id, group_id, name, description, status, owner_id, team_id,
                    created_at, updated_at, archived_at
             FROM projects
             WHERE group_id = $1 AND status = $2
             ORDER BY created_at DESC
             LIMIT $3`
    queryParams = [groupId, status, limit]
  } else {
    query = `SELECT id, group_id, name, description, status, owner_id, team_id,
                    created_at, updated_at, archived_at
             FROM projects
             WHERE group_id = $1
             ORDER BY created_at DESC
             LIMIT $2`
    queryParams = [groupId, limit]
  }

  const result = await pool.query<ProjectRow>(query, queryParams)
  return result.rows.map(rowToStored)
}

// ── updateProject ─────────────────────────────────────────────────────────────

export interface UpdateProjectParams {
  id: string
  groupId: string
  name?: string
  description?: string
  status?: ProjectStatus
  expectedUpdatedAt: string
}

/**
 * Optimistic-concurrency project update.
 *
 * Uses `WHERE updated_at = $expectedUpdatedAt` to detect write conflicts.
 * Returns the updated StoredProject, or null when no row matched (stale —
 * the caller should respond with HTTP 409 or retry from fresh state).
 *
 * At least one of name, description, or status must differ from the current
 * row to be meaningful, but the function does not enforce this.
 */
export async function updateProject(
  pool: Pool,
  params: UpdateProjectParams,
): Promise<StoredProject | null> {
  const { id, groupId, name, description, status, expectedUpdatedAt } = params

  // Build SET clause dynamically — only update provided fields
  const setClauses: string[] = ["updated_at = NOW()"]
  const queryParams: unknown[] = []
  let paramIdx = 1

  if (name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`)
    queryParams.push(name)
  }
  if (description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`)
    queryParams.push(description)
  }
  if (status !== undefined) {
    setClauses.push(`status = $${paramIdx++}`)
    queryParams.push(status)
  }

  // Append WHERE clause params
  queryParams.push(id, groupId, expectedUpdatedAt)
  const idIdx = paramIdx
  const groupIdx = paramIdx + 1
  const tsIdx = paramIdx + 2

  const query = `UPDATE projects
                 SET ${setClauses.join(", ")}
                 WHERE id = $${idIdx}
                   AND group_id = $${groupIdx}
                   AND updated_at = $${tsIdx}
                 RETURNING id, group_id, name, description, status, owner_id, team_id,
                           created_at, updated_at, archived_at`

  const result = await pool.query<ProjectRow>(query, queryParams)

  if ((result.rowCount ?? 0) === 0) return null
  return rowToStored(result.rows[0])
}

// ── archiveProject ────────────────────────────────────────────────────────────

export interface ArchiveProjectParams {
  id: string
  groupId: string
  expectedUpdatedAt: string
}

/**
 * Archive a project: sets status='archived', archived_at=NOW() with optimistic lock.
 *
 * Returns the updated StoredProject, or null when the lock check failed (stale).
 */
export async function archiveProject(
  pool: Pool,
  params: ArchiveProjectParams,
): Promise<StoredProject | null> {
  const { id, groupId, expectedUpdatedAt } = params

  const result = await pool.query<ProjectRow>(
    `UPDATE projects
     SET status      = 'archived',
         archived_at = NOW(),
         updated_at  = NOW()
     WHERE id         = $1
       AND group_id   = $2
       AND updated_at = $3
     RETURNING id, group_id, name, description, status, owner_id, team_id,
               created_at, updated_at, archived_at`,
    [id, groupId, expectedUpdatedAt],
  )

  if ((result.rowCount ?? 0) === 0) return null
  return rowToStored(result.rows[0])
}
