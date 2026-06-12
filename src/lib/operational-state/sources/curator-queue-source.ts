/**
 * Curator Queue Source: Story 13.2 (Governance reads the live curator queue).
 *
 * Returns a SourceOutcome that the operational-state contract maps to
 * ready / empty / error / degraded. Connection/auth failures are reported as
 * `null` (degraded: source unreachable); genuine query failures are reported
 * as `{ ok: false }` (error). User-facing error text is sanitized, never the
 * raw driver message, so credentials and internals are not leaked.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("curator-queue-source is server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import type { SourceOutcome } from "../index"

export interface CuratorQueueSnapshot {
  groupId: string
  pending: number
  approved7d: number
  rejected7d: number
}

const UNREACHABLE = /ECONNREFUSED|password|authentication|getaddrinfo|ENOTFOUND|ETIMEDOUT|connection|terminated|pool/i

export async function readCuratorQueue(
  groupId: string,
): Promise<SourceOutcome<CuratorQueueSnapshot>> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    // Cannot even construct a pool (missing config): degraded.
    return null
  }

  try {
    const result = await pool.query<{
      pending: string
      approved7d: string
      rejected7d: string
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE status = 'approved' AND created_at > NOW() - INTERVAL '7 days') AS approved7d,
         COUNT(*) FILTER (WHERE status = 'rejected' AND created_at > NOW() - INTERVAL '7 days') AS rejected7d
       FROM canonical_proposals
       WHERE group_id = $1`,
      [groupId],
    )

    const row = result.rows[0] ?? { pending: "0", approved7d: "0", rejected7d: "0" }

    return {
      ok: true,
      data: {
        groupId,
        pending: Number(row.pending),
        approved7d: Number(row.approved7d),
        rejected7d: Number(row.rejected7d),
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
    return { ok: false, error: "Curator queue query failed" }
  }
}
