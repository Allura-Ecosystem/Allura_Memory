/**
 * Skill Usage Tracker — Story 1.2
 *
 * Logs skill load events to the `skill_usage_events` append-only table through
 * the kernel `syscall_mutate` path. All writes flow through the RuVix kernel so
 * that proof-of-intent, tenant isolation (POL-001), and the audit trail
 * (POL-005) are enforced — satisfying AD-40 (all writes via kernel syscalls).
 *
 * The kernel stamps `group_id` onto every insert (see `syscall_mutate` in
 * `src/kernel/syscalls.ts`), so callers must supply a valid `group_id` in the
 * `SyscallContext` and do NOT need to repeat it in the data payload.
 */

// Server-only guard: the tracker touches the kernel and PostgreSQL pool.
import "server-only"

import {
  syscall_mutate,
  syscall_query,
  type SyscallContext,
} from "@/kernel/syscalls"
import {
  GroupIdValidationError,
  validateGroupId,
} from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload for a single skill usage event.
 */
export interface SkillUsageEvent {
  /** Required: tenant isolation identifier (allura-* format). */
  group_id: string
  /** Required: canonical skill name (lowercase, hyphens/underscores). */
  skill_name: string
  /** Required: whether the skill load succeeded. */
  success: boolean
  /** Tokens consumed by the skill load (0 if unmeasured). */
  token_count?: number
  /** Duration of the skill load in milliseconds (0 if unmeasured). */
  duration_ms?: number
}

/**
 * Row as stored in the `skill_usage_events` table.
 */
export interface SkillUsageEventRecord {
  id: number
  group_id: string
  skill_name: string
  success: boolean
  token_count: number
  duration_ms: number
  created_at: Date
}

/**
 * Aggregated usage summary for a single skill within a group.
 */
export interface SkillUsageSummaryRow {
  group_id: string
  skill_name: string
  total_count: number
  success_count: number
  failure_count: number
  success_rate_pct: number
  avg_tokens: number
  avg_duration_ms: number
  first_used: Date | null
  last_used: Date | null
}

/**
 * Query options for the usage summary.
 */
export interface SkillUsageSummaryQuery {
  /** Required: tenant isolation identifier. */
  group_id: string
  /** Optional: filter to a specific skill name. */
  skill_name?: string
  /** Optional: only include events created at or after this time. */
  since?: Date
}

/**
 * Validation error for invalid skill-usage payloads.
 */
export class SkillUsageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SkillUsageValidationError"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,127}$/

/**
 * Validate a skill usage event payload before it enters the kernel.
 */
export function validateSkillUsageEvent(event: SkillUsageEvent): void {
  const errors: string[] = []

  // group_id — delegate to canonical validator (enforces allura-* pattern)
  try {
    validateGroupId(event.group_id)
  } catch (e) {
    if (e instanceof GroupIdValidationError) {
      errors.push(e.message)
    } else {
      errors.push(
        `group_id validation failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  // skill_name — must be a non-empty lowercase identifier
  if (!event.skill_name || event.skill_name.trim().length === 0) {
    errors.push("skill_name is required and cannot be empty")
  } else if (!SKILL_NAME_PATTERN.test(event.skill_name)) {
    errors.push(
      `skill_name must match ${SKILL_NAME_PATTERN} (got '${event.skill_name}')`,
    )
  }

  // success — must be a boolean
  if (typeof event.success !== "boolean") {
    errors.push("success must be a boolean")
  }

  // token_count — optional, non-negative integer
  if (event.token_count != null) {
    if (!Number.isInteger(event.token_count) || event.token_count < 0) {
      errors.push("token_count must be a non-negative integer")
    }
  }

  // duration_ms — optional, non-negative integer
  if (event.duration_ms != null) {
    if (!Number.isInteger(event.duration_ms) || event.duration_ms < 0) {
      errors.push("duration_ms must be a non-negative integer")
    }
  }

  if (errors.length > 0) {
    throw new SkillUsageValidationError(
      `Skill usage validation failed: ${errors.join("; ")}`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write path — kernel syscall_mutate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a skill usage event through the kernel `syscall_mutate` path.
 *
 * AD-40 compliance: the only write path is the kernel. The kernel stamps
 * `group_id` onto the data payload from the signed proof claims, so the
 * caller's `group_id` (in `event` and in `context`) is authoritative.
 *
 * @param event   - The skill usage event payload.
 * @param context - Kernel syscall context (actor, group_id, permission tier).
 * @returns `{ id, auditId }` on success, throws on kernel failure.
 * @throws {SkillUsageValidationError} if the payload is invalid.
 * @throws {Error} if the kernel syscall returns `success: false`.
 */
export async function logSkillUsage(
  event: SkillUsageEvent,
  context?: Partial<SyscallContext>,
): Promise<{ id: number; auditId: string }> {
  validateSkillUsageEvent(event)

  const ctx: SyscallContext = {
    actor: context?.actor ?? "system",
    group_id: event.group_id,
    permission_tier: context?.permission_tier ?? "skill",
    audit_context: context?.audit_context ?? {
      skill_name: event.skill_name,
      success: event.success,
    },
  }

  // The kernel's resolveTarget will INSERT into the `skill_usage_events`
  // table using the data payload. `group_id` is re-stamped by the kernel
  // from the proof claims (defense-in-depth), but we include it here so
  // the payload is self-describing and the append-only table gets it even
  // if the kernel's stamping is ever bypassed.
  const result = await syscall_mutate(
    {
      type: "insert",
      target: "pg:skill_usage_events",
      data: {
        group_id: event.group_id,
        skill_name: event.skill_name,
        success: event.success,
        token_count: event.token_count ?? 0,
        duration_ms: event.duration_ms ?? 0,
      },
    },
    ctx,
  )

  if (!result.success) {
    throw new Error(
      `Skill usage log failed (kernel): ${result.error ?? "unknown error"}`,
    )
  }

  const auditId =
    (result.data as { auditId?: string })?.auditId ??
    `audit-skill-usage-${Date.now()}`

  return {
    id: (result.data as { affected_rows?: number })?.affected_rows ?? 0,
    auditId,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read path — kernel syscall_query + direct summary aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query raw skill usage events for a group via the kernel `syscall_query` path.
 *
 * Returns the most recent events (ordered by created_at DESC). The kernel
 * stamps `group_id` onto the query filter from the proof claims, enforcing
 * tenant isolation on reads as well as writes.
 *
 * @param query   - Query options (group_id required).
 * @param context - Optional kernel syscall context override.
 * @returns Array of raw event rows.
 * @throws {SkillUsageValidationError} if group_id is invalid.
 */
export async function getSkillUsageEvents(
  query: SkillUsageSummaryQuery,
  context?: Partial<SyscallContext>,
): Promise<SkillUsageEventRecord[]> {
  validateGroupId(query.group_id)

  const ctx: SyscallContext = {
    actor: context?.actor ?? "system",
    group_id: query.group_id,
    permission_tier: context?.permission_tier ?? "skill",
  }

  const queryBag: Record<string, unknown> = {}
  if (query.skill_name) queryBag.skill_name = query.skill_name

  const result = await syscall_query(
    {
      target: "pg:skill_usage_events",
      query: queryBag,
      limit: 1000,
    },
    ctx,
  )

  if (!result.success) {
    throw new Error(
      `Skill usage query failed (kernel): ${result.error ?? "unknown error"}`,
    )
  }

  return (result.data as SkillUsageEventRecord[]) ?? []
}

/**
 * Compute a usage summary (count, success rate, avg tokens, avg duration)
 * per skill_name for a given group_id.
 *
 * The kernel's `syscall_query` returns raw rows; this function performs the
 * aggregation in-memory so the read stays fully kernel-gated (AD-40) without
 * needing a second direct-DB aggregation query. A production deployment may
 * alternatively read the `skill_usage_summary` view directly via the pool;
 * both paths are tenant-isolated by group_id.
 *
 * @param query - Query options (group_id required, skill_name optional).
 * @returns Array of summary rows, one per skill_name, sorted by total_count DESC.
 * @throws {SkillUsageValidationError} if group_id is invalid.
 */
export async function getSkillUsageSummary(
  query: SkillUsageSummaryQuery,
): Promise<SkillUsageSummaryRow[]> {
  const events = await getSkillUsageEvents(query)

  // Optional: filter by `since` in-memory (kernel query handler is equality-only)
  const filtered = query.since
    ? events.filter((e) => new Date(e.created_at).getTime() >= query.since!.getTime())
    : events

  // Group by skill_name
  const buckets = new Map<
    string,
    { events: SkillUsageEventRecord[] }
  >()
  for (const e of filtered) {
    let bucket = buckets.get(e.skill_name)
    if (!bucket) {
      bucket = { events: [] }
      buckets.set(e.skill_name, bucket)
    }
    bucket.events.push(e)
  }

  const rows: SkillUsageSummaryRow[] = []
  for (const [skillName, { events: skillEvents }] of buckets) {
    const total = skillEvents.length
    const successCount = skillEvents.filter((e) => e.success).length
    const failureCount = total - successCount
    const successRatePct =
      total > 0 ? Number(((100.0 * successCount) / total).toFixed(2)) : 0
    const avgTokens =
      total > 0
        ? Math.round(
            skillEvents.reduce((sum, e) => sum + e.token_count, 0) / total,
          )
        : 0
    const avgDurationMs =
      total > 0
        ? Math.round(
            skillEvents.reduce((sum, e) => sum + e.duration_ms, 0) / total,
          )
        : 0
    const timestamps = skillEvents.map((e) => new Date(e.created_at).getTime())
    const firstUsed = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null
    const lastUsed = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null

    rows.push({
      group_id: query.group_id,
      skill_name: skillName,
      total_count: total,
      success_count: successCount,
      failure_count: failureCount,
      success_rate_pct: successRatePct,
      avg_tokens: avgTokens,
      avg_duration_ms: avgDurationMs,
      first_used: firstUsed,
      last_used: lastUsed,
    })
  }

  rows.sort((a, b) => b.total_count - a.total_count)
  return rows
}

/**
 * Query the `skill_usage_summary` view directly via the PostgreSQL pool.
 *
 * This is a convenience read path for dashboards that want the DB to perform
 * the aggregation. It still enforces tenant isolation via the `group_id`
 * filter, and is a read-only operation (no AD-40 write concern).
 *
 * @param query - Query options (group_id required, skill_name optional).
 * @returns Array of summary rows from the view.
 * @throws {SkillUsageValidationError} if group_id is invalid.
 */
export async function getSkillUsageSummaryFromView(
  query: SkillUsageSummaryQuery,
): Promise<SkillUsageSummaryRow[]> {
  validateGroupId(query.group_id)

  const pool = getPool()
  const conditions = ["group_id = $1"]
  const values: unknown[] = [query.group_id]
  let paramIdx = 2

  if (query.skill_name) {
    conditions.push(`skill_name = $${paramIdx++}`)
    values.push(query.skill_name)
  }
  if (query.since) {
    conditions.push(`last_used >= $${paramIdx++}`)
    values.push(query.since)
  }

  const sql = `
    SELECT
      group_id,
      skill_name,
      total_count,
      success_count,
      failure_count,
      success_rate_pct,
      avg_tokens,
      avg_duration_ms,
      first_used,
      last_used
    FROM skill_usage_summary
    WHERE ${conditions.join(" AND ")}
    ORDER BY total_count DESC
  `

  const result = await pool.query<SkillUsageSummaryRow>(sql, values)
  return result.rows
}