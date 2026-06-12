/**
 * Settings Source: Phase 0 Story 7 (Settings surface goes live).
 *
 * Reads runtime configuration truth from two live sources:
 * 1. Postgres `events` table — governance policy/gate activity (read-only)
 * 2. Allura Brain audit_health_report — subsystem health (via direct import)
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
  throw new Error("settings-source is server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import { audit_health_report } from "@/mcp/audit-tools"
import { validateGroupId } from "@/mcp/canonical-tools/validation-utils"
import type { SourceOutcome } from "../index"

export type SubsystemHealth = "healthy" | "unhealthy" | "unknown"

export interface SettingsSnapshot {
  groupId: string
  /** Health of each subsystem from MCP health report */
  subsystemHealth: {
    postgres: SubsystemHealth
    neo4j: SubsystemHealth
    embeddingBackfill: SubsystemHealth
    curatorQueueDepth: SubsystemHealth
    mcpToolAvailability: SubsystemHealth
  }
  /** Number of policy changes recorded (all time) */
  policyChanges: number
  /** Number of gate checks in the last 24 hours */
  gateChecks24h: number
  /** Most recent policy change timestamp; null if none */
  lastPolicyChangeAt: string | null
  /** Current promotion mode from env, sanitized (never leak the raw env value) */
  promotionMode: "auto" | "soc2" | "unknown"
}

const UNREACHABLE = /ECONNREFUSED|password|authentication|getaddrinfo|ENOTFOUND|ETIMEDOUT|connection|terminated|pool/i

/**
 * Map audit_health_report subsystem status to our simplified 3-state model.
 * "degraded" and "unavailable" both map to "unhealthy" in the UI.
 */
function mapSubsystemStatus(
  status: "healthy" | "degraded" | "unavailable",
): SubsystemHealth {
  if (status === "healthy") return "healthy"
  if (status === "degraded" || status === "unavailable") return "unhealthy"
  return "unknown"
}

/**
 * Read live settings truth from Postgres + MCP health report.
 *
 * This is a READ-ONLY source — it never writes to any database.
 */
export async function readSettings(
  groupId: string,
): Promise<SourceOutcome<SettingsSnapshot>> {
  let pool: ReturnType<typeof getPool>
  try {
    pool = getPool()
  } catch {
    // Cannot even construct a pool (missing config): degraded.
    return null
  }

  try {
    // ── Postgres: governance policy/gate activity ──────────────────────────
    const pgResult = await pool.query<{
      policy_changes: string
      gate_checks_24h: string
      last_policy_change_at: string | Date | null
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'governance_policy_updated') AS policy_changes,
         COUNT(*) FILTER (WHERE event_type = 'governance_gate_checked' AND created_at > NOW() - INTERVAL '24 hours') AS gate_checks_24h,
         MAX(created_at) FILTER (WHERE event_type = 'governance_policy_updated') AS last_policy_change_at
       FROM events
       WHERE group_id = $1`,
      [groupId],
    )

    const row = pgResult.rows[0] ?? {
      policy_changes: "0",
      gate_checks_24h: "0",
      last_policy_change_at: null,
    }

    const lastPolicyChangeAt =
      row.last_policy_change_at === null
        ? null
        : row.last_policy_change_at instanceof Date
          ? row.last_policy_change_at.toISOString()
          : new Date(row.last_policy_change_at).toISOString()

    // ── MCP health report: subsystem status ───────────────────────────────
    let subsystemHealth: SettingsSnapshot["subsystemHealth"] = {
      postgres: "unknown",
      neo4j: "unknown",
      embeddingBackfill: "unknown",
      curatorQueueDepth: "unknown",
      mcpToolAvailability: "unknown",
    }

    try {
      const validatedGroupId = validateGroupId(groupId)
      const healthReport = await audit_health_report({ group_id: validatedGroupId })
      subsystemHealth = {
        postgres: mapSubsystemStatus(healthReport.subsystems.postgres.status),
        neo4j: mapSubsystemStatus(healthReport.subsystems.neo4j.status),
        embeddingBackfill: mapSubsystemStatus(
          healthReport.subsystems.embedding_backfill.status,
        ),
        curatorQueueDepth: mapSubsystemStatus(
          healthReport.subsystems.curator_queue.status,
        ),
        mcpToolAvailability: mapSubsystemStatus(
          healthReport.subsystems.mcp_tools.status,
        ),
      }
    } catch {
      // MCP health report failure is non-fatal — subsystem health stays "unknown"
    }

    // ── Promotion mode (sanitized, never leak raw env) ─────────────────────
    const rawMode = process.env.PROMOTION_MODE ?? ""
    const promotionMode: SettingsSnapshot["promotionMode"] =
      rawMode === "auto"
        ? "auto"
        : rawMode === "soc2"
          ? "soc2"
          : "unknown"

    return {
      ok: true,
      data: {
        groupId,
        subsystemHealth,
        policyChanges: Number(row.policy_changes),
        gateChecks24h: Number(row.gate_checks_24h),
        lastPolicyChangeAt,
        promotionMode,
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
    return { ok: false, error: "Settings query failed" }
  }
}

/**
 * True when there is no governance activity at all.
 * A settings surface with no policy changes and no gate checks is "empty"
 * and should show onboarding guidance.
 */
export function isSettingsEmpty(data: SettingsSnapshot): boolean {
  return data.policyChanges === 0 && data.gateChecks24h === 0
}