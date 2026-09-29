/**
 * Validation Utilities and Pure Helpers for Canonical MCP Tools
 *
 * All pure helper functions with no side effects.
 */

import { Pool } from "pg"
import { randomUUID } from "crypto"
import type {
  GroupId,
  MemoryGetResponse,
  MemoryId,
  MemoryProvenance,
  MemoryResponseMeta,
} from "@/lib/memory/canonical-contracts"
import { validateGroupId as canonicalValidateGroupId } from "@/lib/validation/group-id"

export interface EpisodicMemoryRow {
  id: string
  content: string
  provenance: string | null
  user_id: string | null
  created_at: string
  tags?: string | null
}

export function toMemoryId(value: string): MemoryId {
  return value as MemoryId
}

export function toProvenance(value: string | null | undefined): MemoryProvenance {
  return value === "manual" ? "manual" : "conversation"
}

/**
 * Parse tags from a PG metadata text column.
 * Tags are stored as comma-separated strings in metadata->>'tags'.
 * Returns empty array if null/undefined.
 */
export function parseEpisodicTags(tags: string | null | undefined): string[] {
  if (!tags) return []
  if (typeof tags === "string")
    return tags
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean)
  if (Array.isArray(tags)) return tags as string[]
  return []
}

/**
 * Count how many times a memory was retrieved or searched in the last 30 days.
 *
 * Queries the append-only events table for event_type matching 'retrieve' or 'search'
 * patterns that reference the given memory_id in their metadata.
 *
 * Uses the expression index on metadata->>'memory_id' (migration 18).
 *
 * Returns:
 * - A positive integer if retrieval events exist
 * - null if no tracking data is available (episodic-only, no retrieval events)
 *
 * This function NEVER returns 0 — if there are zero retrieval events the caller
 * can distinguish "we track but nobody looked" (0 is valid) from "we don't track
 * this memory's retrievals at all" (null).  In practice, when the query succeeds
 * we return the actual count (which can be 0), but wrap it: null means the query
 * failed or the memory is episodic-only with no retrieval trace.
 */
export async function getRecentUsageCount(pg: Pool, groupId: string, memoryId: string): Promise<number | null> {
  const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const result = await pg.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM events
       WHERE group_id = $1
         AND metadata->>'memory_id' = $2
         AND event_type IN ('memory_search', 'memory_retrieve', 'memory_get')
         AND created_at >= $3`,
      [groupId, memoryId, THIRTY_DAYS_AGO]
    )

    const count = parseInt(result.rows[0]?.count ?? "0", 10)
    return count
  } catch (error) {
    console.warn("[usage] Failed to query recent usage count, returning null:", error)
    return null
  }
}

export function baseMeta(storesUsed: Array<"postgres" | "ruvector" | "graph">, degraded: boolean = false): MemoryResponseMeta {
  return {
    contract_version: "v1",
    degraded,
    stores_used: storesUsed,
    stores_attempted: ["postgres", "graph"],
    warnings: degraded ? ["semantic layer unavailable; returned episodic results only"] : [],
  }
}

export function degradedMeta(storesUsed: Array<"postgres" | "ruvector" | "graph">): MemoryResponseMeta {
  return {
    ...baseMeta(storesUsed, true),
    degraded_reason: "graph_unavailable",
  }
}

// ── Configuration ─────────────────────────────────────────────────────────

export function getPromotionMode(): "auto" | "soc2" {
  return (process.env.PROMOTION_MODE || "soc2") as "auto" | "soc2"
}

export function getAutoApprovalThreshold(): number {
  return parseFloat(process.env.AUTO_APPROVAL_THRESHOLD || "0.85")
}

export const DUPLICATE_THRESHOLD = parseFloat(process.env.DUPLICATE_THRESHOLD || "0.95")
export const RECOVERY_WINDOW_DAYS = parseInt(process.env.RECOVERY_WINDOW_DAYS || "30")

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * ARCH-001: Validate group_id using canonical module.
 * All entry points must enforce ^allura-[a-z0-9-]+$ pattern.
 */
export function validateGroupId(groupId: string): GroupId {
  return canonicalValidateGroupId(groupId) as GroupId
}

export function generateMemoryId(): MemoryId {
  return randomUUID() as MemoryId
}

/**
 * Sort deduplicated memories according to the requested sort order.
 */
export function sortDedupedMemories(
  memories: MemoryGetResponse[],
  sort: "created_at_desc" | "created_at_asc" | "score_desc" | "score_asc"
): MemoryGetResponse[] {
  switch (sort) {
    case "created_at_asc":
      return [...memories].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    case "score_desc":
      return [...memories].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    case "score_asc":
      return [...memories].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    case "created_at_desc":
    default:
      return [...memories].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }
}