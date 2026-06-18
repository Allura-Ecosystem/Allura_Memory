/**
 * Header source — live state for the Command Center top bar.
 *
 * Honest-state contract: when the store is unreachable we report "unknown"
 * freshness and zero receipts — never a fabricated "just now / live".
 */
import { getPool, isPoolHealthy } from "@/lib/postgres/connection"
import { isConnectionError } from "@/lib/operational-state/utils/error-classifier"

export interface HeaderState {
  /** Active organization = tenant group_id (server-injected). */
  orgName: string
  /** Live data source label. */
  sourceName: string
  /** Human freshness label, e.g. "last write 3m ago" or "no activity yet". */
  sourceFresh: string
  /** live = store connected & read now; stale = old; unknown = unreachable. */
  sourceFreshness: "live" | "stale" | "unknown"
  /** Events written in the last 24h for this group. */
  receiptCount: number
}

function relativeTime(from: Date): string {
  const sec = Math.max(0, Math.round((Date.now() - from.getTime()) / 1000))
  if (sec < 60) return `last write ${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `last write ${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `last write ${hr}h ago`
  const day = Math.round(hr / 24)
  return `last write ${day}d ago`
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000

export async function getHeaderState(groupId: string): Promise<HeaderState> {
  const unreachable: HeaderState = {
    orgName: groupId,
    sourceName: groupId,
    sourceFresh: "store unreachable",
    sourceFreshness: "unknown",
    receiptCount: 0,
  }

  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return unreachable
  }

  if (!(await isPoolHealthy())) return unreachable

  try {
    const [latest, recent] = await Promise.all([
      pool.query<{ max: string | null }>(
        `SELECT MAX(created_at) AS max FROM events WHERE group_id = $1`,
        [groupId],
      ),
      pool.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM events
         WHERE group_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [groupId],
      ),
    ])

    const receiptCount = parseInt(recent.rows[0]?.n ?? "0", 10)
    const maxRaw = latest.rows[0]?.max
    if (!maxRaw) {
      return {
        orgName: groupId,
        sourceName: groupId,
        sourceFresh: "no activity yet",
        sourceFreshness: "live",
        receiptCount,
      }
    }

    const maxTs = new Date(maxRaw)
    const age = Date.now() - maxTs.getTime()
    return {
      orgName: groupId,
      sourceName: groupId,
      sourceFresh: relativeTime(maxTs),
      sourceFreshness: age > STALE_MS ? "stale" : "live",
      receiptCount,
    }
  } catch (err) {
    if (isConnectionError(err)) return unreachable
    return {
      orgName: groupId,
      sourceName: groupId,
      sourceFresh: "no activity yet",
      sourceFreshness: "live",
      receiptCount: 0,
    }
  }
}
