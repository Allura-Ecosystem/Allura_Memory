/**
 * Tenant-Scoped Curator Config
 *
 * Story 22.4: Reads per-tenant curator configuration from the `tenants.config`
 * JSONB column. Each tenant can independently tune:
 *   - promotion_threshold: score threshold for auto-promotion (default: 0.7)
 *   - auto_approval_mode: "conservative" | "balanced" | "aggressive" (default: "balanced")
 *   - curator_schedule_hours: hours between curator cycles (default: 1)
 *   - drift_audit_enabled: whether drift audit runs for this tenant (default: true)
 *
 * Falls back to global defaults when the tenant config is empty or a key is missing.
 * Config changes take effect on the next watchdog/curator cycle — no restart required.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("server-side only");
}

import { getPool } from "@/lib/postgres/connection";
import { validateGroupId } from "@/lib/validation/group-id";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AutoApprovalMode = "conservative" | "balanced" | "aggressive";

export interface TenantCuratorConfig {
  /** Score threshold for auto-promotion (0.0-1.0). Default: 0.7 */
  promotion_threshold: number;
  /** Auto-approval mode. Default: "balanced" */
  auto_approval_mode: AutoApprovalMode;
  /** Hours between curator cycles. Default: 1 */
  curator_schedule_hours: number;
  /** Whether drift audit runs for this tenant. Default: true */
  drift_audit_enabled: boolean;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_TENANT_CONFIG: TenantCuratorConfig = {
  promotion_threshold: 0.7,
  auto_approval_mode: "balanced",
  curator_schedule_hours: 1,
  drift_audit_enabled: true,
};

/**
 * Mode-specific threshold adjustments.
 * When auto_approval_mode is set, it adjusts the effective promotion_threshold:
 *   - conservative: +0.10 (higher bar)
 *   - balanced:     +0.00 (use threshold as-is)
 *   - aggressive:   -0.10 (lower bar)
 */
const MODE_ADJUSTMENTS: Record<AutoApprovalMode, number> = {
  conservative: 0.10,
  balanced: 0.00,
  aggressive: -0.10,
};

// ── Config Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a raw JSONB config object into a validated TenantCuratorConfig.
 * Falls back to defaults for missing or invalid values.
 */
export function parseTenantConfig(raw: Record<string, unknown> | null | undefined): TenantCuratorConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_TENANT_CONFIG };
  }

  const config: TenantCuratorConfig = { ...DEFAULT_TENANT_CONFIG };

  // promotion_threshold
  if (typeof raw["promotion_threshold"] === "number") {
    const pt = raw["promotion_threshold"] as number;
    if (pt >= 0 && pt <= 1) {
      config.promotion_threshold = pt;
    }
  }

  // auto_approval_mode
  if (typeof raw["auto_approval_mode"] === "string") {
    const mode = raw["auto_approval_mode"] as string;
    if (mode === "conservative" || mode === "balanced" || mode === "aggressive") {
      config.auto_approval_mode = mode as AutoApprovalMode;
    }
  }

  // curator_schedule_hours
  if (typeof raw["curator_schedule_hours"] === "number") {
    const hours = raw["curator_schedule_hours"] as number;
    if (hours > 0 && hours <= 168) {
      config.curator_schedule_hours = hours;
    }
  }

  // drift_audit_enabled
  if (typeof raw["drift_audit_enabled"] === "boolean") {
    config.drift_audit_enabled = raw["drift_audit_enabled"] as boolean;
  }

  return config;
}

// ── DB Query ──────────────────────────────────────────────────────────────────

/**
 * Get the curator config for a specific tenant.
 *
 * Reads from the `tenants.config` JSONB column. Falls back to defaults
 * if the tenant doesn't exist or config is empty.
 *
 * @param groupId - The tenant group_id
 * @returns The resolved TenantCuratorConfig (never null — always returns defaults)
 */
export async function getTenantConfig(groupId: string): Promise<TenantCuratorConfig> {
  const validated = validateGroupId(groupId);
  const pool = getPool();
  const result = await pool.query(
    "SELECT config FROM tenants WHERE group_id = $1 AND active = TRUE",
    [validated]
  );

  if ((result.rowCount ?? 0) === 0) {
    // Tenant not found or inactive — return defaults
    return { ...DEFAULT_TENANT_CONFIG };
  }

  const rawConfig = result.rows[0]["config"] as Record<string, unknown> | null;
  return parseTenantConfig(rawConfig);
}

/**
 * Get the effective promotion threshold for a tenant, adjusted by auto_approval_mode.
 *
 * The base promotion_threshold is adjusted by the mode:
 *   conservative: +0.10, balanced: +0.00, aggressive: -0.10
 *
 * The result is clamped to [0.0, 1.0].
 *
 * @param groupId - The tenant group_id
 * @returns The effective score threshold
 */
export async function getEffectiveScoreThreshold(groupId: string): Promise<number> {
  const config = await getTenantConfig(groupId);
  const adjusted = config.promotion_threshold + MODE_ADJUSTMENTS[config.auto_approval_mode];
  return Math.max(0.0, Math.min(1.0, adjusted));
}

/**
 * Resolve a WatchdogConfig's scoreThreshold from tenant config if available,
 * falling back to the provided default.
 *
 * This is the main integration point for watchdog.ts — it tries tenant config
 * first, and if the tenant isn't registered or has no config, uses the default.
 *
 * @param groupId - The tenant group_id
 * @param fallbackThreshold - Fallback threshold if tenant config is empty (default: 0.7)
 * @returns The score threshold to use
 */
type ConfigQueryClient = Pick<import("pg").PoolClient, "query">;

/**
 * Resolve a score threshold using the caller's already-authorized database
 * client. Workspace-governed callers use this inside their strict app-role
 * transaction rather than opening an owner-pool connection.
 */
export async function resolveScoreThresholdWithClient(
  client: ConfigQueryClient,
  groupId: string,
  fallbackThreshold: number = 0.7,
): Promise<number> {
  const validated = validateGroupId(groupId);
  const result = await client.query(
    "SELECT config FROM tenants WHERE group_id = $1 AND active = TRUE",
    [validated]
  );

  if ((result.rowCount ?? 0) === 0) {
    return fallbackThreshold;
  }

  const rawConfig = result.rows[0]["config"] as Record<string, unknown> | null;
  if (!rawConfig || typeof rawConfig["promotion_threshold"] !== "number") {
    return fallbackThreshold;
  }

  const threshold = rawConfig["promotion_threshold"] as number;
  if (threshold < 0 || threshold > 1) {
    return fallbackThreshold;
  }

  // Apply mode adjustment if present
  const mode = rawConfig["auto_approval_mode"];
  let adjusted = threshold;
  if (typeof mode === "string" && mode in MODE_ADJUSTMENTS) {
    adjusted = threshold + MODE_ADJUSTMENTS[mode as AutoApprovalMode];
  }

  return Math.max(0.0, Math.min(1.0, adjusted));
}

/**
 * Resolve a score threshold from the default owner-pool path used by legacy
 * group-scoped callers. Workspace-scoped callers must use
 * resolveScoreThresholdWithClient inside withWorkspaceTransaction.
 */
export async function resolveScoreThreshold(
  groupId: string,
  fallbackThreshold: number = 0.7,
): Promise<number> {
  return resolveScoreThresholdWithClient(getPool(), groupId, fallbackThreshold);
}