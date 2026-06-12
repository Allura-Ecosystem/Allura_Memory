/**
 * Runs Source: Phase 1 Run Kernel dashboard surface.
 *
 * Reads live run state from two Postgres tables:
 * 1. `process_runs` — snapshot table for run status and metadata
 * 2. `process_definitions` — definition names joined by (definition_id, definition_revision, group_id)
 *
 * Returns a SourceOutcome that the operational-state contract maps to
 * ready / empty / stale / error / degraded. Connection/auth failures are
 * reported as `null` (degraded: source unreachable); genuine query failures
 * are reported as `{ ok: false }` (error). User-facing error text is
 * sanitized — credentials and internals are never leaked.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("runs-source is server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "../utils/error-classifier"
import type { SourceOutcome } from "../index"

export interface RunsSnapshot {
  activeRuns: Array<{
    id: string
    definitionId: string
    definitionName: string
    status: string
    actorId: string | null
    startedAt: string
    lastEventAt: string | null
  }>
  runCounts: {
    total: number
    running: number
    paused: number
    completed: number
    failed: number
  }
  recentCompletions: Array<{
    id: string
    definitionName: string
    completedAt: string
    status: string
  }>
}

/**
 * Read live runs truth from Postgres.
 *
 * Three queries run in parallel:
 * - Active runs (pending/running/paused) joined with definition names
 * - Run counts grouped by status
 * - Recent completions (completed/failed) ordered by completed_at DESC LIMIT 5
 *
 * This is a READ-ONLY source — it never writes to any database.
 */
export async function readRuns(
  groupId: string,
): Promise<SourceOutcome<RunsSnapshot> | null> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    // Cannot even construct a pool (missing config): degraded.
    return null
  }

  try {
    // ── Active runs ───────────────────────────────────────────────────────────
    const activeRunsResult = await pool.query<{
      id: string
      definition_id: string
      definition_name: string
      status: string
      actor_id: string | null
      started_at: Date | string
      last_event_at: Date | string | null
    }>(
      `SELECT
         r.id,
         r.definition_id,
         COALESCE(d.name, r.definition_id) AS definition_name,
         r.status,
         r.actor_id,
         r.started_at,
         (
           SELECT MAX(e.created_at)
           FROM events e
           WHERE e.metadata->>'run_id' = r.id
             AND e.group_id = $1
         ) AS last_event_at
       FROM process_runs r
       LEFT JOIN process_definitions d
         ON d.id = r.definition_id
        AND d.revision = r.definition_revision
        AND d.group_id = r.group_id
       WHERE r.group_id = $1
         AND r.status IN ('running', 'paused', 'pending')
       ORDER BY r.started_at DESC`,
      [groupId],
    )

    // ── Run counts by status ──────────────────────────────────────────────────
    const countsResult = await pool.query<{
      status: string
      cnt: string
    }>(
      `SELECT status, COUNT(*) AS cnt
       FROM process_runs
       WHERE group_id = $1
       GROUP BY status`,
      [groupId],
    )

    // ── Recent completions ────────────────────────────────────────────────────
    const completionsResult = await pool.query<{
      id: string
      definition_name: string
      completed_at: Date | string
      status: string
    }>(
      `SELECT
         r.id,
         COALESCE(d.name, r.definition_id) AS definition_name,
         r.completed_at,
         r.status
       FROM process_runs r
       LEFT JOIN process_definitions d
         ON d.id = r.definition_id
        AND d.revision = r.definition_revision
        AND d.group_id = r.group_id
       WHERE r.group_id = $1
         AND r.status IN ('completed', 'failed')
         AND r.completed_at IS NOT NULL
       ORDER BY r.completed_at DESC
       LIMIT 5`,
      [groupId],
    )

    // ── Assemble active runs ──────────────────────────────────────────────────
    const activeRuns = activeRunsResult.rows.map((row) => ({
      id: row.id,
      definitionId: row.definition_id,
      definitionName: row.definition_name,
      status: row.status,
      actorId: row.actor_id,
      startedAt: toISOString(row.started_at),
      lastEventAt: row.last_event_at !== null ? toISOString(row.last_event_at) : null,
    }))

    // ── Assemble run counts ───────────────────────────────────────────────────
    const countMap: Record<string, number> = {}
    let total = 0
    for (const row of countsResult.rows) {
      const n = Number(row.cnt)
      countMap[row.status] = n
      total += n
    }
    const runCounts = {
      total,
      running: countMap["running"] ?? 0,
      paused: countMap["paused"] ?? 0,
      completed: countMap["completed"] ?? 0,
      failed: countMap["failed"] ?? 0,
    }

    // ── Assemble recent completions ───────────────────────────────────────────
    const recentCompletions = completionsResult.rows.map((row) => ({
      id: row.id,
      definitionName: row.definition_name,
      completedAt: toISOString(row.completed_at),
      status: row.status,
    }))

    return {
      ok: true,
      data: {
        activeRuns,
        runCounts,
        recentCompletions,
      },
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    if (isConnectionError(err)) {
      // Source could not be reached: degraded (not a query-level failure).
      return null
    }
    // A real query failure (e.g. relation missing): error, sanitized.
    return { ok: false, error: "Runs query failed" }
  }
}

/**
 * True when there are no runs at all (no active, no completions, total zero).
 * A runs surface with zero runs should show onboarding guidance.
 */
export function isRunsEmpty(data: RunsSnapshot): boolean {
  return data.runCounts.total === 0
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toISOString(value: Date | string): string {
  if (value instanceof Date) return value.toISOString()
  return new Date(value).toISOString()
}
