/**
 * Dreams Source: Phase 0 Story 9 (Dreams surface goes live).
 *
 * Reads background intelligence truth from the curator proposal pipeline
 * and embedding/backfill activity in Postgres. Dreams is the surface for
 * Allura's autonomous background work — pattern discovery, curator proposals,
 * embedding backfill, and scheduled recommendations.
 *
 * Per the Phase 0 plan: "propose-only into HITL queue, no auto-promote path;
 * every Dreams action lands in canonical_proposals for human approval."
 *
 * Returns a SourceOutcome that the operational-state contract maps to
 * ready / empty / stale / error / degraded.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("dreams-source is server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import { isConnectionError } from "../utils/error-classifier"
import type { SourceOutcome } from "../index"

export interface DreamsSnapshot {
  groupId: string
  /** Proposals pending curator review */
  proposalsPending: number
  /** Proposals approved in the last 7 days */
  proposalsApproved7d: number
  /** Proposals rejected in the last 7 days */
  proposalsRejected7d: number
  /** Embedding backfill runs in the last 24 hours */
  backfillRuns24h: number
  /** Curator proposals created in the last 24 hours */
  proposalsCreated24h: number
  /** Most recent proposal created timestamp; null if none */
  lastProposalAt: string | null
  /** Current promotion mode (from PROMOTION_MODE env, sanitized) */
  promotionMode: "auto" | "soc2" | "unknown"
}

/**
 * Read live dreams data — curator pipeline + background activity from Postgres.
 */
export async function readDreams(
  groupId: string,
): Promise<SourceOutcome<DreamsSnapshot>> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    return null
  }

  try {
    const result = await pool.query<{
      proposals_pending: string
      proposals_approved_7d: string
      proposals_rejected_7d: string
      backfill_runs_24h: string
      proposals_created_24h: string
      last_proposal_at: string | Date | null
    }>(
      `SELECT
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'pending') AS proposals_pending,
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'approved' AND created_at > NOW() - INTERVAL '7 days') AS proposals_approved_7d,
         (SELECT COUNT(*) FROM canonical_proposals WHERE group_id = $1 AND status = 'rejected' AND created_at > NOW() - INTERVAL '7 days') AS proposals_rejected_7d,
         (SELECT COUNT(*) FROM events WHERE group_id = $1 AND event_type = 'embedding_backfill' AND created_at > NOW() - INTERVAL '24 hours') AS backfill_runs_24h,
         (SELECT COUNT(*) FROM events WHERE group_id = $1 AND event_type = 'proposal_created' AND created_at > NOW() - INTERVAL '24 hours') AS proposals_created_24h,
         (SELECT MAX(created_at) FROM canonical_proposals WHERE group_id = $1) AS last_proposal_at
      `,
      [groupId],
    )

    const row = result.rows[0] ?? {
      proposals_pending: "0",
      proposals_approved_7d: "0",
      proposals_rejected_7d: "0",
      backfill_runs_24h: "0",
      proposals_created_24h: "0",
      last_proposal_at: null,
    }

    const lastProposalAt =
      row.last_proposal_at === null
        ? null
        : row.last_proposal_at instanceof Date
          ? row.last_proposal_at.toISOString()
          : new Date(row.last_proposal_at).toISOString()

    const rawMode = process.env.PROMOTION_MODE ?? ""
    const promotionMode: DreamsSnapshot["promotionMode"] =
      rawMode === "auto"
        ? "auto"
        : rawMode === "soc2"
          ? "soc2"
          : "unknown"

    return {
      ok: true,
      data: {
        groupId,
        proposalsPending: Number(row.proposals_pending),
        proposalsApproved7d: Number(row.proposals_approved_7d),
        proposalsRejected7d: Number(row.proposals_rejected_7d),
        backfillRuns24h: Number(row.backfill_runs_24h),
        proposalsCreated24h: Number(row.proposals_created_24h),
        lastProposalAt,
        promotionMode,
      },
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    if (isConnectionError(err)) {
      return null
    }
    return { ok: false, error: "Dreams query failed" }
  }
}

/**
 * True when there is no background intelligence activity at all.
 * No proposals, no backfill runs, nothing in the pipeline.
 */
export function isDreamsEmpty(data: DreamsSnapshot): boolean {
  return (
    data.proposalsPending === 0 &&
    data.proposalsApproved7d === 0 &&
    data.proposalsRejected7d === 0 &&
    data.backfillRuns24h === 0 &&
    data.proposalsCreated24h === 0
  )
}