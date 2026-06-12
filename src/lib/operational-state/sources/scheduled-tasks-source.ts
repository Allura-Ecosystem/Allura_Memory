/**
 * Scheduled Tasks Source: Phase 0 Story 6 (Scheduled Tasks surface goes live).
 *
 * Reads background-job activity from the append-only Postgres `events` table:
 * curator watchdog heartbeats, queue-depth BLOCKER events, embedding backfill
 * runs, and curator proposal throughput. Read-only — this source never writes.
 *
 * Returns a SourceOutcome that the operational-state contract maps to
 * ready / empty / stale / error / degraded. Connection/auth failures are
 * reported as `null` (degraded: source unreachable); genuine query failures
 * are reported as `{ ok: false }` (error). User-facing error text is
 * sanitized, never the raw driver message, so credentials and internals are
 * not leaked.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("scheduled-tasks-source is server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import type { SourceOutcome } from "../index"

export interface ScheduledTasksSnapshot {
  groupId: string
  /** ISO-8601 timestamp of the most recent watchdog heartbeat; null if none. */
  lastHeartbeatAt: string | null
  /** Watchdog heartbeats recorded in the last 24 hours. */
  heartbeats24h: number
  /** Queue-depth BLOCKER events emitted in the last 24 hours. */
  blockers24h: number
  /** Embedding backfill runs recorded in the last 24 hours. */
  backfill24h: number
  /** Curator proposals created in the last 24 hours (pipeline throughput). */
  proposals24h: number
}

const UNREACHABLE = /ECONNREFUSED|password|authentication|getaddrinfo|ENOTFOUND|ETIMEDOUT|connection|terminated|pool/i

export async function readScheduledTasks(
  groupId: string,
): Promise<SourceOutcome<ScheduledTasksSnapshot>> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    // Cannot even construct a pool (missing config): degraded.
    return null
  }

  try {
    const result = await pool.query<{
      last_heartbeat_at: string | Date | null
      heartbeats24h: string
      blockers24h: string
      backfill24h: string
      proposals24h: string
    }>(
      `SELECT
         MAX(created_at) FILTER (WHERE event_type = 'WATCHDOG_HEARTBEAT') AS last_heartbeat_at,
         COUNT(*) FILTER (WHERE event_type = 'WATCHDOG_HEARTBEAT' AND created_at > NOW() - INTERVAL '24 hours') AS heartbeats24h,
         COUNT(*) FILTER (WHERE event_type = 'BLOCKER' AND created_at > NOW() - INTERVAL '24 hours') AS blockers24h,
         COUNT(*) FILTER (WHERE event_type = 'embedding_backfill' AND created_at > NOW() - INTERVAL '24 hours') AS backfill24h,
         COUNT(*) FILTER (WHERE event_type = 'proposal_created' AND created_at > NOW() - INTERVAL '24 hours') AS proposals24h
       FROM events
       WHERE group_id = $1`,
      [groupId],
    )

    const row = result.rows[0] ?? {
      last_heartbeat_at: null,
      heartbeats24h: "0",
      blockers24h: "0",
      backfill24h: "0",
      proposals24h: "0",
    }

    const lastHeartbeatAt =
      row.last_heartbeat_at === null
        ? null
        : row.last_heartbeat_at instanceof Date
          ? row.last_heartbeat_at.toISOString()
          : new Date(row.last_heartbeat_at).toISOString()

    return {
      ok: true,
      data: {
        groupId,
        lastHeartbeatAt,
        heartbeats24h: Number(row.heartbeats24h),
        blockers24h: Number(row.blockers24h),
        backfill24h: Number(row.backfill24h),
        proposals24h: Number(row.proposals24h),
      },
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (UNREACHABLE.test(message)) {
      // Source could not be reached: degraded (not a query-level failure).
      return null
    }
    // A real query failure (e.g. relation missing): error, sanitized.
    return { ok: false, error: "Scheduled tasks query failed" }
  }
}

/**
 * True when there is no background-job activity in the last 24 hours.
 * Deliberately ignores `lastHeartbeatAt` (all-time): a heartbeat from weeks
 * ago must not suppress the empty state and its onboarding hint forever.
 */
export function isScheduledTasksEmpty(data: ScheduledTasksSnapshot): boolean {
  return (
    data.heartbeats24h === 0 &&
    data.blockers24h === 0 &&
    data.backfill24h === 0 &&
    data.proposals24h === 0
  )
}
