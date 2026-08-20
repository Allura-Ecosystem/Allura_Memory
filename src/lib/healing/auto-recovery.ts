/**
 * Story 2.3: Self-Healing (Auto-Recovery) — Health monitor + recovery engine
 * ============================================================================
 *
 * This module continuously checks the health of core Allura Memory components
 * and performs automatic recovery actions when a component is unhealthy. All
 * recovery attempts are logged to the `recovery_events` PostgreSQL table
 * through the controlPlane `syscall_mutate` path (AD-40 — tenant-stamped writes).
 *
 * Health checks performed:
 *   1. PostgreSQL   — pg_isready (or a SELECT 1 fallback)
 *   2. MCP container — HTTP GET http://localhost:5888/health
 *   3. Disk space    — df (warn when usage > 90%)
 *   4. Memory usage   — /proc/meminfo (warn when available < threshold)
 *
 * Recovery actions:
 *   - restart-mcp               — `docker restart allura-memory-mcp`
 *   - brain-recover             — `bash scripts/brain-stack.sh recover`
 *   - clear-stale-connections   — terminate idle PostgreSQL connections
 *
 * Policy:
 *   - Max 3 recovery attempts per component per cycle before alerting.
 *   - After 3 failed attempts → alert via Brain memory_add (ALERT) + daily note.
 *
 * All writes to recovery_events go through controlPlane syscall_mutate so the group_id
 * tenant stamp and proof-of-intent audit trail are preserved (AD-40).
 */

import { exec } from "child_process";
import { promisify } from "util";
import { type MutationType, syscall_mutate, type SyscallContext } from "@/control-plane/syscalls";
import { getPool, isPoolHealthy } from "@/lib/postgres/connection";

const execAsync = promisify(exec);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum recovery attempts per component before escalating to an alert. */
export const MAX_RECOVERY_ATTEMPTS = 3;

/** MCP container health endpoint URL. */
export const MCP_HEALTH_URL = process.env.MCP_HEALTH_URL ?? "http://localhost:5888/health";

/** MCP container name (used for docker restart). */
export const MCP_CONTAINER_NAME = process.env.MCP_CONTAINER_NAME ?? "allura-memory-mcp";

/** Brain stack recovery script path. */
export const BRAIN_RECOVER_SCRIPT = "bash scripts/brain-stack.sh recover";

/** Disk usage warning threshold (percent). */
export const DISK_WARNING_THRESHOLD = 90;

/** Memory warning threshold — minimum available MB before alert. */
export const MEMORY_WARNING_THRESHOLD_MB = 512;

/** How many recovery log rows the API returns by default. */
export const RECOVERY_LOG_DEFAULT_LIMIT = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ComponentName = "postgres" | "mcp-container" | "disk" | "memory" | "drift_audit";
export type RecoveryAction =
  | "restart-mcp"
  | "brain-recover"
  | "clear-stale-connections"
  | "no-action"
  | "alert"
  | "re-index"
  | "trigger-watchdog"
  | "drift-escalation";

export interface HealthCheckResult {
  component: ComponentName;
  healthy: boolean;
  warning?: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface RecoveryEventRecord {
  id: number;
  group_id: string;
  component: string;
  action: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface RecoveryDecision {
  component: ComponentName;
  health: HealthCheckResult;
  action: RecoveryAction;
  shouldAlert: boolean;
  attemptCount: number;
}

export interface RecoveryLogEntry {
  component: ComponentName;
  action: RecoveryAction;
  success: boolean;
  errorMessage?: string;
  timestamp: string;
}

export interface SystemHealthReport {
  timestamp: string;
  overall: "healthy" | "degraded" | "unhealthy";
  checks: HealthCheckResult[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift audit types (Story 21.4)
// ─────────────────────────────────────────────────────────────────────────────

/** A RETRIEVAL_DRIFT event from the events table, produced by the drift audit. */
export interface DriftAlertEvent {
  id: number;
  group_id: string;
  event_type: string;
  created_at: string;
  metadata: {
    checks_failed?: number;
    severity?: string;
    details?: Array<{ name: string; passed: boolean; detail: string }>;
  };
}

/** The type of drift detected, determining the recovery action. */
export type DriftType = "index_drift" | "missing_promotions" | "schema_mismatch" | "unknown";

/** Result of a drift recovery attempt. */
export interface DriftRecoveryResult {
  driftType: DriftType;
  action: RecoveryAction;
  success: boolean;
  errorMessage?: string;
  escalated: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Injection points (for unit testing — override via mock or DI)
// ─────────────────────────────────────────────────────────────────────────────

export interface RecoveryDeps {
  execCmd: (cmd: string) => Promise<{ stdout: string; stderr: string }>;
  pgIsReady: () => Promise<boolean>;
  mcpHealthCheck: () => Promise<boolean>;
  getDiskUsage: () => Promise<{ usedPercent: number; mount: string }>;
  getMemoryUsage: () => Promise<{ availableMB: number; totalMB: number }>;
  logRecoveryEvent: (
    component: ComponentName,
    action: RecoveryAction,
    success: boolean,
    errorMessage?: string,
  ) => Promise<void>;
  getRecentAttemptCount: (component: ComponentName, windowMs: number) => Promise<number>;
  sendAlert: (
    component: ComponentName,
    message: string,
  ) => Promise<void>;
  // ── Drift audit deps (Story 21.4) ──────────────────────────────────────────
  /** Query recent RETRIEVAL_DRIFT events from the events table. */
  getDriftAlerts: (windowMs: number) => Promise<DriftAlertEvent[]>;
  /** Send a drift escalation alert via Brain memory_add. */
  sendDriftEscalation: (driftType: string, message: string) => Promise<void>;
}

/** Default implementation of execCmd using child_process.exec. */
async function defaultExec(cmd: string): Promise<{ stdout: string; stderr: string }> {
  return execAsync(cmd, { timeout: 30_000 });
}

/** Default: check PostgreSQL readiness via pg_isready, fall back to SELECT 1. */
async function defaultPgIsReady(): Promise<boolean> {
  try {
    return await isPoolHealthy();
  } catch {
    return false;
  }
}

/** Default: curl the MCP health endpoint. */
async function defaultMcpHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(MCP_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Default: parse df output for root partition. */
async function defaultGetDiskUsage(): Promise<{ usedPercent: number; mount: string }> {
  const { stdout } = await defaultExec("df -P / | tail -1");
  const parts = stdout.trim().split(/\s+/);
  const usedPercent = parseInt(parts[parts.length - 1], 10) || 0;
  const mount = parts[parts.length - 2] || "/";
  return { usedPercent, mount };
}

/** Default: parse /proc/meminfo for available memory. */
async function defaultGetMemoryUsage(): Promise<{ availableMB: number; totalMB: number }> {
  const { stdout } = await defaultExec("cat /proc/meminfo");
  const lines = stdout.split("\n");
  let availableKB = 0;
  let totalKB = 0;
  for (const line of lines) {
    if (line.startsWith("MemAvailable:")) {
      availableKB = parseInt(line.split(":")[1]?.trim() ?? "0", 10);
    }
    if (line.startsWith("MemTotal:")) {
      totalKB = parseInt(line.split(":")[1]?.trim() ?? "0", 10);
    }
  }
  return {
    availableMB: Math.floor(availableKB / 1024),
    totalMB: Math.floor(totalKB / 1024),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery event logging via controlPlane syscall_mutate (AD-40)
// ─────────────────────────────────────────────────────────────────────────────

/** Get the default group_id for recovery operations. */
function getRecoveryGroupId(): string {
  return process.env.ALLURA_RECOVERY_GROUP_ID ?? "allura-system";
}

/** Build a SyscallContext for controlPlane-mutated recovery event writes. */
function buildSyscallContext(): SyscallContext {
  return {
    actor: "auto-recovery",
    group_id: getRecoveryGroupId(),
    permission_tier: "controlPlane",
    budget_cost: 1,
    audit_context: { subsystem: "self-healing" },
  };
}

/**
 * Log a recovery event to the recovery_events table via controlPlane syscall_mutate.
 * This is the AD-40-compliant write path — all writes go through the controlPlane
 * with proof-of-intent and tenant-stamped group_id.
 */
async function defaultLogRecoveryEvent(
  component: ComponentName,
  action: RecoveryAction,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  const data: Record<string, unknown> = {
    group_id: getRecoveryGroupId(),
    component,
    action,
    success,
    error_message: errorMessage ?? null,
  };

  const result = await syscall_mutate(
    {
      type: "insert" as MutationType,
      target: "pg:recovery_events",
      data,
    },
    buildSyscallContext(),
  );

  if (!result.success) {
    console.error(
      `[auto-recovery] Failed to log recovery event via controlPlane: ${result.error}`,
    );
  }
}

/**
 * Count recent recovery attempts for a component within a time window.
 * Used to enforce the max-attempts policy.
 */
async function defaultGetRecentAttemptCount(
  component: ComponentName,
  windowMs: number,
): Promise<number> {
  try {
    const pool = getPool();
    const since = new Date(Date.now() - windowMs).toISOString();
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM recovery_events
       WHERE component = $1 AND created_at >= $2`,
      [component, since],
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  } catch (err) {
    console.error(
      `[auto-recovery] Failed to query recent attempt count: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 0;
  }
}

/**
 * Send an alert via Brain memory_add (event_type=ALERT) + daily note.
 */
async function defaultSendAlert(
  component: ComponentName,
  message: string,
): Promise<void> {
  const alertPayload = {
    event_type: "ALERT",
    component,
    message,
    timestamp: new Date().toISOString(),
    severity: "critical",
  };

  try {
    // Log alert as a recovery event too (via controlPlane mutate)
    await defaultLogRecoveryEvent(component, "alert", true, message);

    // Write a daily note (best-effort)
    const dailyNote = `[ALERT ${new Date().toISOString()}] Component ${component} exceeded max recovery attempts: ${message}`;
    console.warn(`[auto-recovery] ALERT: ${dailyNote}`);

    // In production, this would call Brain memory_add via MCP or internal API.
    // For now, the alert is logged and persisted in recovery_events.
    void alertPayload;
  } catch (err) {
    console.error(
      `[auto-recovery] Failed to send alert: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift alert defaults (Story 21.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default: query recent RETRIEVAL_DRIFT events from the events table.
 * Looks for events within the given time window.
 */
async function defaultGetDriftAlerts(windowMs: number): Promise<DriftAlertEvent[]> {
  try {
    const pool = getPool();
    const since = new Date(Date.now() - windowMs).toISOString();
    const result = await pool.query(
      `SELECT id, group_id, event_type, created_at, metadata
       FROM events
       WHERE event_type = 'RETRIEVAL_DRIFT'
         AND created_at >= $1
       ORDER BY created_at DESC`,
      [since],
    );
    return result.rows as DriftAlertEvent[];
  } catch (err) {
    console.error(
      `[auto-recovery] Failed to query drift alerts: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Default: send a drift escalation alert via Brain memory_add.
 * Writes a DRIFT_ESCALATION event to the events table.
 */
async function defaultSendDriftEscalation(driftType: string, message: string): Promise<void> {
  try {
    const pool = getPool();
    const groupId = getRecoveryGroupId();
    await pool.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata)
       VALUES ($1, 'DRIFT_ESCALATION', 'auto-recovery', 'completed', $2)`,
      [
        groupId,
        JSON.stringify({
          drift_type: driftType,
          message,
          severity: "critical",
          timestamp: new Date().toISOString(),
        }),
      ],
    );
    console.warn(`[auto-recovery] DRIFT_ESCALATION: ${driftType} — ${message}`);
  } catch (err) {
    console.error(
      `[auto-recovery] Failed to send drift escalation: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default deps factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the default dependency set. Tests can override individual functions
 * by providing a partial override.
 */
export function createDefaultDeps(overrides: Partial<RecoveryDeps> = {}): RecoveryDeps {
  return {
    execCmd: defaultExec,
    pgIsReady: defaultPgIsReady,
    mcpHealthCheck: defaultMcpHealthCheck,
    getDiskUsage: defaultGetDiskUsage,
    getMemoryUsage: defaultGetMemoryUsage,
    logRecoveryEvent: defaultLogRecoveryEvent,
    getRecentAttemptCount: defaultGetRecentAttemptCount,
    sendAlert: defaultSendAlert,
    getDriftAlerts: defaultGetDriftAlerts,
    sendDriftEscalation: defaultSendDriftEscalation,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check functions
// ─────────────────────────────────────────────────────────────────────────────

/** Check PostgreSQL health. */
export async function checkPostgres(deps: RecoveryDeps): Promise<HealthCheckResult> {
  try {
    const healthy = await deps.pgIsReady();
    return {
      component: "postgres",
      healthy,
      message: healthy ? "PostgreSQL is ready" : "PostgreSQL is not responding",
      details: { check: "pg_isready" },
    };
  } catch (err) {
    return {
      component: "postgres",
      healthy: false,
      message: `PostgreSQL health check error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Check MCP container health. */
export async function checkMcpContainer(deps: RecoveryDeps): Promise<HealthCheckResult> {
  try {
    const healthy = await deps.mcpHealthCheck();
    return {
      component: "mcp-container",
      healthy,
      message: healthy
        ? "MCP container is healthy"
        : `MCP container health check failed (${MCP_HEALTH_URL})`,
      details: { url: MCP_HEALTH_URL },
    };
  } catch (err) {
    return {
      component: "mcp-container",
      healthy: false,
      message: `MCP container health check error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Check disk space. Warns when usage exceeds threshold. */
export async function checkDiskSpace(deps: RecoveryDeps): Promise<HealthCheckResult> {
  try {
    const { usedPercent, mount } = await deps.getDiskUsage();
    const warning = usedPercent > DISK_WARNING_THRESHOLD;
    return {
      component: "disk",
      healthy: !warning,
      ...(warning ? { warning: true } : {}),
      message: warning
        ? `Disk usage on ${mount} at ${usedPercent}% (threshold ${DISK_WARNING_THRESHOLD}%)`
        : `Disk usage on ${mount} at ${usedPercent}% — OK`,
      details: { usedPercent, mount, threshold: DISK_WARNING_THRESHOLD },
    };
  } catch (err) {
    return {
      component: "disk",
      healthy: false,
      message: `Disk space check error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Check memory usage. Warns when available memory is below threshold. */
export async function checkMemoryUsage(deps: RecoveryDeps): Promise<HealthCheckResult> {
  try {
    const { availableMB, totalMB } = await deps.getMemoryUsage();
    const warning = availableMB < MEMORY_WARNING_THRESHOLD_MB;
    return {
      component: "memory",
      healthy: !warning,
      ...(warning ? { warning: true } : {}),
      message: warning
        ? `Low memory: ${availableMB}MB available (threshold ${MEMORY_WARNING_THRESHOLD_MB}MB)`
        : `Memory OK: ${availableMB}MB available of ${totalMB}MB`,
      details: { availableMB, totalMB, thresholdMB: MEMORY_WARNING_THRESHOLD_MB },
    };
  } catch (err) {
    return {
      component: "memory",
      healthy: false,
      message: `Memory check error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Run all health checks and return a full system health report.
 */
export async function runHealthChecks(deps: RecoveryDeps): Promise<SystemHealthReport> {
  const checks = await Promise.all([
    checkPostgres(deps),
    checkMcpContainer(deps),
    checkDiskSpace(deps),
    checkMemoryUsage(deps),
  ]);

  const anyUnhealthy = checks.some((c) => !c.healthy && !c.warning);
  const anyWarning = checks.some((c) => c.warning);

  const overall: SystemHealthReport["overall"] = anyUnhealthy
    ? "unhealthy"
    : anyWarning
      ? "degraded"
      : "healthy";

  return { timestamp: new Date().toISOString(), overall, checks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery actions
// ─────────────────────────────────────────────────────────────────────────────

/** Restart the MCP container via docker restart. */
export async function restartMcpContainer(
  deps: RecoveryDeps,
): Promise<{ success: boolean; error?: string }> {
  try {
    await deps.execCmd(`docker restart ${MCP_CONTAINER_NAME}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Run the brain:recover script. */
export async function runBrainRecover(
  deps: RecoveryDeps,
): Promise<{ success: boolean; error?: string }> {
  try {
    await deps.execCmd(BRAIN_RECOVER_SCRIPT);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Clear stale PostgreSQL connections (terminate idle connections). */
export async function clearStaleConnections(
  deps: RecoveryDeps,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Terminate idle connections older than 5 minutes
    await deps.execCmd(
      `psql -U ${process.env.POSTGRES_USER ?? "ronin4life"} -d ${process.env.POSTGRES_DB ?? "memory"} -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '5 minutes' AND pid <> pg_backend_pid();"`,
    );
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery decision logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the recovery action for a given health check result.
 * This is the core decision function — pure logic, no side effects.
 *
 * @param health - The health check result for a component
 * @param recentAttempts - Number of recent recovery attempts for this component
 * @returns A recovery decision describing what action to take
 */
export function decideRecoveryAction(
  health: HealthCheckResult,
  recentAttempts: number,
): RecoveryDecision {
  if (health.healthy && !health.warning) {
    return {
      component: health.component,
      health,
      action: "no-action",
      shouldAlert: false,
      attemptCount: recentAttempts,
    };
  }

  // Component is unhealthy or in warning state
  const shouldAlert = recentAttempts >= MAX_RECOVERY_ATTEMPTS;

  // If we've hit the max attempts, escalate to alert instead of retrying
  if (shouldAlert) {
    return {
      component: health.component,
      health,
      action: "alert",
      shouldAlert: true,
      attemptCount: recentAttempts,
    };
  }

  // Choose recovery action based on component
  const actionMap: Record<ComponentName, RecoveryAction> = {
    "mcp-container": "restart-mcp",
    postgres: "brain-recover",
    disk: "no-action", // Disk warnings can't be auto-recovered; alert only
    memory: "clear-stale-connections",
    "drift_audit": "no-action", // Drift recovery is handled by the drift cycle
  };

  const action = health.warning && (health.component === "disk" || health.component === "memory")
    ? health.component === "memory"
      ? "clear-stale-connections"
      : "no-action"
    : actionMap[health.component];

  return {
    component: health.component,
    health,
    action,
    shouldAlert: false,
    attemptCount: recentAttempts + 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main recovery execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a single recovery action for a component and log the result.
 * Returns the log entry of the recovery attempt.
 */
export async function executeRecovery(
  decision: RecoveryDecision,
  deps: RecoveryDeps,
): Promise<RecoveryLogEntry> {
  const { component, action } = decision;
  const timestamp = new Date().toISOString();

  if (action === "no-action") {
    return { component, action, success: true, timestamp };
  }

  if (action === "alert") {
    await deps.sendAlert(component, decision.health.message);
    await deps.logRecoveryEvent(component, "alert", true, decision.health.message);
    return {
      component,
      action: "alert",
      success: true,
      errorMessage: decision.health.message,
      timestamp,
    };
  }

  // Execute the recovery action
  let result: { success: boolean; error?: string };

  switch (action) {
    case "restart-mcp":
      result = await restartMcpContainer(deps);
      break;
    case "brain-recover":
      result = await runBrainRecover(deps);
      break;
    case "clear-stale-connections":
      result = await clearStaleConnections(deps);
      break;
    default:
      result = { success: false, error: `Unknown recovery action: ${action}` };
  }

  // Log the recovery event via controlPlane syscall_mutate (AD-40)
  await deps.logRecoveryEvent(component, action, result.success, result.error);

  return {
    component,
    action,
    success: result.success,
    errorMessage: result.error,
    timestamp,
  };
}

/**
 * Full recovery cycle: run health checks → for each unhealthy component,
 * decide action → execute → log. Returns all recovery log entries.
 *
 * This is the main entry point for the auto-recovery system.
 */
export async function runRecoveryCycle(
  deps: RecoveryDeps = createDefaultDeps(),
  windowMs: number = 300_000,
): Promise<{
  healthReport: SystemHealthReport;
  recoveryLog: RecoveryLogEntry[];
}> {
  const healthReport = await runHealthChecks(deps);
  const recoveryLog: RecoveryLogEntry[] = [];

  for (const check of healthReport.checks) {
    if (check.healthy && !check.warning) continue;

    const recentAttempts = await deps.getRecentAttemptCount(check.component, windowMs);
    const decision = decideRecoveryAction(check, recentAttempts);

    const logEntry = await executeRecovery(decision, deps);
    recoveryLog.push(logEntry);
  }

  return { healthReport, recoveryLog };
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift recovery (Story 21.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a drift alert into a drift type based on the check details.
 * This determines which recovery action to attempt.
 */
export function classifyDriftType(event: DriftAlertEvent): DriftType {
  const details = event.metadata?.details ?? [];
  const failedChecks = details.filter((d) => !d.passed);
  const failedNames = failedChecks.map((d) => d.name);

  if (failedNames.includes("index_coverage")) {
    return "index_drift";
  }
  if (failedNames.includes("count_parity")) {
    return "missing_promotions";
  }
  if (failedNames.includes("reader_writer_parity")) {
    return "schema_mismatch";
  }
  return "unknown";
}

/**
 * Determine the recovery action for a drift type.
 * - index_drift → re-index (trigger re-indexing of proposals)
 * - missing_promotions → trigger-watchdog (run the watchdog to create proposals)
 * - schema_mismatch → alert only (no auto-fix; requires human intervention)
 * - unknown → alert only
 */
export function decideDriftRecoveryAction(driftType: DriftType): RecoveryAction {
  switch (driftType) {
    case "index_drift":
      return "re-index";
    case "missing_promotions":
      return "trigger-watchdog";
    case "schema_mismatch":
      return "alert"; // No auto-fix for schema mismatch
    default:
      return "alert";
  }
}

/**
 * Execute a drift recovery action.
 * Returns the result of the recovery attempt.
 */
export async function executeDriftRecovery(
  driftType: DriftType,
  action: RecoveryAction,
  deps: RecoveryDeps,
): Promise<DriftRecoveryResult> {
  const result: DriftRecoveryResult = {
    driftType,
    action,
    success: false,
    escalated: false,
  };

  if (action === "alert") {
    // Schema mismatch or unknown — alert only, no auto-fix
    await deps.sendDriftEscalation(driftType, `Drift detected (${driftType}) — manual intervention required`);
    await deps.logRecoveryEvent("drift_audit", "alert", true, `Drift type: ${driftType}`);
    result.success = true;
    return result;
  }

  if (action === "re-index") {
    try {
      // Trigger re-indexing by running the brain:recover script
      await deps.execCmd(BRAIN_RECOVER_SCRIPT);
      await deps.logRecoveryEvent("drift_audit", "re-index", true);
      result.success = true;
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await deps.logRecoveryEvent("drift_audit", "re-index", false, errorMsg);
      result.errorMessage = errorMsg;
      return result;
    }
  }

  if (action === "trigger-watchdog") {
    try {
      // Trigger the curator watchdog to create missing proposals
      await deps.execCmd(
        `${process.env.BUN_EXECUTABLE ?? "bun"} src/curator/watchdog.ts --interval 1 --group-id ${getRecoveryGroupId()}`,
      );
      await deps.logRecoveryEvent("drift_audit", "trigger-watchdog", true);
      result.success = true;
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await deps.logRecoveryEvent("drift_audit", "trigger-watchdog", false, errorMsg);
      result.errorMessage = errorMsg;
      return result;
    }
  }

  // Unknown action — log and return failure
  result.errorMessage = `Unknown drift recovery action: ${action}`;
  await deps.logRecoveryEvent("drift_audit", "no-action", false, result.errorMessage);
  return result;
}

/**
 * Run the drift recovery cycle: check for recent RETRIEVAL_DRIFT events,
 * classify each, attempt recovery, and escalate after 3 failed attempts.
 *
 * @param deps - Recovery dependencies (injectable for testing)
 * @param windowMs - Time window to look back for drift events (default 1 hour)
 * @returns Array of drift recovery results
 */
export async function runDriftRecoveryCycle(
  deps: RecoveryDeps = createDefaultDeps(),
  windowMs: number = 3_600_000,
): Promise<DriftRecoveryResult[]> {
  const driftEvents = await deps.getDriftAlerts(windowMs);

  if (driftEvents.length === 0) {
    return [];
  }

  const results: DriftRecoveryResult[] = [];

  for (const event of driftEvents) {
    const driftType = classifyDriftType(event);
    const action = decideDriftRecoveryAction(driftType);

    // Check recent attempt count for drift_audit component
    const recentAttempts = await deps.getRecentAttemptCount("drift_audit", windowMs);

    // After 3 failed recovery attempts, escalate
    if (recentAttempts >= MAX_RECOVERY_ATTEMPTS) {
      await deps.sendDriftEscalation(
        driftType,
        `Drift recovery failed ${recentAttempts} times for type ${driftType} — escalating to human alert`,
      );
      await deps.logRecoveryEvent(
        "drift_audit",
        "drift-escalation",
        true,
        `Escalated after ${recentAttempts} attempts`,
      );
      results.push({
        driftType,
        action: "drift-escalation",
        success: true,
        escalated: true,
      });
      continue;
    }

    // Attempt recovery
    const recoveryResult = await executeDriftRecovery(driftType, action, deps);
    results.push(recoveryResult);
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery log query (for API endpoint)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query recent recovery events from the database.
 * Used by the /api/health/recovery-log endpoint.
 *
 * @param limit - Maximum number of rows to return (default 50)
 * @param componentFilter - Optional component name filter
 */
export async function getRecoveryLog(
  limit: number = RECOVERY_LOG_DEFAULT_LIMIT,
  componentFilter?: string,
): Promise<RecoveryEventRecord[]> {
  const pool = getPool();

  if (componentFilter) {
    const result = await pool.query(
      `SELECT id, group_id, component, action, success, error_message, created_at
       FROM recovery_events
       WHERE component = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [componentFilter, limit],
    );
    return result.rows as RecoveryEventRecord[];
  }

  const result = await pool.query(
    `SELECT id, group_id, component, action, success, error_message, created_at
     FROM recovery_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows as RecoveryEventRecord[];
}