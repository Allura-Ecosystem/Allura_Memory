/**
 * Zod schemas for durable, tenant-routed exposure alerts.
 *
 * Story 26.4: persists Story 26.3's in-memory ExposureAlert output into
 * threat_alerts (migration 42) with a richer, story-26.4-owned lifecycle.
 * See docker/postgres-init/42-threat-alerts.sql for why this lifecycle
 * vocabulary is separate from Story 26.3's in-memory AlertState.
 */

import { z } from "zod"
import { TenantScope } from "../inventory/schemas"

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

/**
 * Story 26.4's persisted alert lifecycle. 'stale' means the alert's
 * supporting evidence has degraded since creation -- surfaced explicitly
 * (AC-4), never silently retained as if still current. 'resolved' is
 * terminal: staleness transitions never overwrite it.
 */
export const LifecycleState = z.enum(["new", "acknowledged", "mitigated", "resolved", "stale"])

/**
 * A durable, deduplicated exposure alert row. One row per unique
 * (group_id, workspace_id, dedup_key) -- AC-5.
 */
export const PersistedThreatAlert = z.object({
  id: z.string().uuid(),
  group_id: TenantScope.shape.group_id,
  workspace_id: z.string().min(1),
  inventory_ref: z.string().min(1),
  artifact_ref: z.string().min(1),
  advisory_refs: z.array(z.string().min(1)).min(1),
  match_type: z.string().min(1),
  confidence: z.number().min(0).max(1),
  severity: z.string().min(1),
  evidence_ids: z.array(z.string().min(1)).min(1),
  dedup_key: z.string().min(1),
  lifecycle_state: LifecycleState,
  created_at: z.string(),
  updated_at: z.string(),
})

/**
 * Per-cycle audit evidence (AC-6), written as a THREAT_DISCOVERY_HEARTBEAT
 * event -- same pattern as curator/watchdog.ts's WATCHDOG_HEARTBEAT.
 */
/**
 * Per-source retry accounting carried into the heartbeat so AC-2's
 * "retry behavior ... auditable" is literally true: the retry policy and
 * what it actually did land in an immutable `events` row, not just a log.
 * Optional so a caller that polls nothing (e.g. an empty inventory) still
 * emits a valid heartbeat.
 */
export const DiscoveryRetryEvidence = z.object({
  max_attempts: z.number().int().min(1),
  base_delay_ms: z.number().int().min(1),
  max_delay_ms: z.number().int().min(1),
  osv_attempts: z.number().int().min(0),
  osv_succeeded: z.boolean(),
  npm_attempts: z.number().int().min(0),
  npm_succeeded: z.boolean(),
  npm_chunks_failed: z.number().int().min(0),
  npm_chunks_total: z.number().int().min(0),
  github_attempts: z.number().int().min(0),
  github_succeeded: z.boolean(),
})

export const DiscoveryCycleHeartbeat = z.object({
  advisories_processed: z.number().int().min(0),
  advisories_failed: z.number().int().min(0),
  alerts_created: z.number().int().min(0),
  alerts_already_known: z.number().int().min(0),
  drafts_generated: z.number().int().min(0),
  retry: DiscoveryRetryEvidence.optional(),
})
