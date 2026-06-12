/**
 * Process Engine — Definition Registry
 * Story 12.1: Production Run Kernel — AD-P1-01
 *
 * CRUD operations for versioned process definitions stored in PostgreSQL.
 * - Revisions auto-increment within tenant (group_id + id).
 * - Listings filter deleted_at IS NULL; run-pinned lookups return even deleted.
 * - Soft-delete only — no hard deletes ever.
 * - No cache — direct PG reads at launch.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/definition-registry is server-side only")
}

import type { Pool } from "pg"
import type { ProcessDefinition, StoredDefinition } from "./types"

// ── Row type ───────────────────────────────────────────────────────────────────

interface DefinitionRow {
  id: string
  revision: number
  group_id: string
  name: string
  definition_json: Record<string, unknown>
  created_at: Date
  deleted_at: Date | null
}

function rowToStored(row: DefinitionRow): StoredDefinition {
  return {
    id: row.id,
    revision: row.revision,
    group_id: row.group_id,
    name: row.name,
    definition_json: row.definition_json,
    created_at: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
    deleted_at: row.deleted_at
      ? row.deleted_at instanceof Date
        ? row.deleted_at.toISOString()
        : String(row.deleted_at)
      : null,
  }
}

// ── createDefinition ──────────────────────────────────────────────────────────

/**
 * Create a new revision of a process definition.
 *
 * Revision auto-increments within the (id, group_id) tenant scope.
 * If the exact (id, revision, group_id) row already exists (duplicate insert),
 * the existing row is returned unchanged (ON CONFLICT DO NOTHING pattern).
 */
export async function createDefinition(
  pool: Pool,
  params: {
    id: string
    name: string
    groupId: string
    definition: ProcessDefinition
  },
): Promise<StoredDefinition> {
  const { id, name, groupId, definition } = params

  // Auto-increment: next revision = max(existing) + 1, or 1 if none exist
  const revisionResult = await pool.query<{ next_revision: string }>(
    `SELECT COALESCE(MAX(revision), 0) + 1 AS next_revision
     FROM process_definitions
     WHERE id = $1 AND group_id = $2`,
    [id, groupId],
  )

  const revision = parseInt(revisionResult.rows[0].next_revision, 10)

  const insertResult = await pool.query<DefinitionRow>(
    `INSERT INTO process_definitions (id, revision, group_id, name, definition_json)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id, revision, group_id) DO NOTHING
     RETURNING id, revision, group_id, name, definition_json, created_at, deleted_at`,
    [id, revision, groupId, name, JSON.stringify(definition)],
  )

  if (insertResult.rows.length > 0) {
    return rowToStored(insertResult.rows[0])
  }

  // ON CONFLICT DO NOTHING — row already exists; fetch and return it
  const existing = await pool.query<DefinitionRow>(
    `SELECT id, revision, group_id, name, definition_json, created_at, deleted_at
     FROM process_definitions
     WHERE id = $1 AND revision = $2 AND group_id = $3`,
    [id, revision, groupId],
  )

  return rowToStored(existing.rows[0])
}

// ── getDefinition ─────────────────────────────────────────────────────────────

/**
 * Fetch a specific revision of a definition by (id, revision, group_id).
 *
 * Returns even soft-deleted definitions — callers that pin a revision at run
 * start must be able to retrieve the definition even after it is deleted.
 */
export async function getDefinition(
  pool: Pool,
  params: { id: string; revision: number; groupId: string },
): Promise<StoredDefinition | null> {
  const { id, revision, groupId } = params

  const result = await pool.query<DefinitionRow>(
    `SELECT id, revision, group_id, name, definition_json, created_at, deleted_at
     FROM process_definitions
     WHERE id = $1 AND revision = $2 AND group_id = $3`,
    [id, revision, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}

// ── getLatestDefinition ───────────────────────────────────────────────────────

/**
 * Fetch the highest active (non-deleted) revision for a given (id, group_id).
 *
 * Returns null when no active revision exists.
 */
export async function getLatestDefinition(
  pool: Pool,
  params: { id: string; groupId: string },
): Promise<StoredDefinition | null> {
  const { id, groupId } = params

  const result = await pool.query<DefinitionRow>(
    `SELECT id, revision, group_id, name, definition_json, created_at, deleted_at
     FROM process_definitions
     WHERE id = $1 AND group_id = $2 AND deleted_at IS NULL
     ORDER BY revision DESC
     LIMIT 1`,
    [id, groupId],
  )

  if (result.rows.length === 0) return null
  return rowToStored(result.rows[0])
}

// ── listDefinitions ───────────────────────────────────────────────────────────

/**
 * List all active (non-deleted) definitions for a tenant group.
 *
 * Returns one row per (id, revision) pair; does not collapse to latest only.
 * Ordered by id ASC, revision DESC so the highest revision floats to the top
 * for each definition id.
 */
export async function listDefinitions(
  pool: Pool,
  params: { groupId: string; limit?: number },
): Promise<StoredDefinition[]> {
  const { groupId, limit = 100 } = params

  const result = await pool.query<DefinitionRow>(
    `SELECT id, revision, group_id, name, definition_json, created_at, deleted_at
     FROM process_definitions
     WHERE group_id = $1 AND deleted_at IS NULL
     ORDER BY id ASC, revision DESC
     LIMIT $2`,
    [groupId, limit],
  )

  return result.rows.map(rowToStored)
}

// ── softDeleteDefinition ──────────────────────────────────────────────────────

/**
 * Soft-delete a specific revision by setting deleted_at = NOW().
 *
 * Returns true when a row was updated, false when the row did not exist
 * or was already deleted.
 */
export async function softDeleteDefinition(
  pool: Pool,
  params: { id: string; revision: number; groupId: string },
): Promise<boolean> {
  const { id, revision, groupId } = params

  const result = await pool.query(
    `UPDATE process_definitions
     SET deleted_at = NOW()
     WHERE id = $1 AND revision = $2 AND group_id = $3 AND deleted_at IS NULL`,
    [id, revision, groupId],
  )

  return (result.rowCount ?? 0) > 0
}
