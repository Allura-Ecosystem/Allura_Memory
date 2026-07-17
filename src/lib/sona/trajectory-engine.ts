/**
 * SONA Trajectory Engine
 * Story 1.3: Trajectory Recording
 *
 * Captures agent execution trajectories for the Self-Observing Neural
 * Architecture (SONA). Every memory_add, memory_search, and curator
 * operation records an append-only row in `agent_trajectories` through the
 * kernel syscall_mutate (AD-40) path — never a direct DB write.
 *
 * Invariants:
 * - group_id is required and validated before any write.
 * - Recording is ASYNC and fire-and-forget: it must never block the caller's
 *   response path or surface a failure to the agent. A recording failure is
 *   logged to stderr only.
 * - All writes flow through `syscall_mutate({ target: "agent_trajectories" })`.
 *
 * Reference: docs/allura/BLUEPRINT.md (SONA)
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("trajectory-engine can only be used server-side");
}

import { createHash } from "node:crypto";

import { syscall_mutate, type SyscallContext } from "@/kernel/syscalls";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical agent actions tracked by SONA. */
export type TrajectoryAction =
  | "memory_add"
  | "memory_search"
  | "memory_get"
  | "memory_list"
  | "memory_list_deleted"
  | "memory_delete"
  | "memory_update"
  | "memory_promote"
  | "memory_restore"
  | "memory_export"
  | "curator_approve"
  | "curator_reject"
  | "curator_score"
  | "curator_propose";

/** High-level task taxonomy for aggregation. */
export type TaskType =
  | "ingest"
  | "retrieve"
  | "curate"
  | "govern"
  | "lifecycle"
  | "unknown";

/** Input to `recordTrajectory`. */
export interface TrajectoryRecord {
  /** Required: tenant namespace (format: allura-*). */
  group_id: string;
  /** Required: agent identifier (e.g. "memory-coordinator", "curator-watchdog"). */
  agent_id: string;
  /** Required: canonical action performed. */
  action: TrajectoryAction;
  /** Optional: task taxonomy bucket — defaults to a mapping from action. */
  task_type?: TaskType;
  /** Optional: opaque input payload, hashed for the audit row. */
  input?: unknown;
  /** Optional: opaque output payload, hashed for the audit row. */
  output?: unknown;
  /** Required: whether the wrapped operation succeeded. */
  success: boolean;
  /** Required: wall-clock duration of the operation in milliseconds. */
  duration_ms: number;
}

/** Row shape persisted to `agent_trajectories`. */
export interface TrajectoryRow {
  id: number;
  group_id: string;
  agent_id: string;
  action: string;
  task_type: string;
  input_hash: string | null;
  output_hash: string | null;
  success: boolean;
  duration_ms: number;
  created_at: Date;
}

/** Result of `recordTrajectory` — `recorded` is false when validation fails. */
export interface RecordResult {
  recorded: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map an action to its default task taxonomy bucket.
 */
export function defaultTaskType(action: TrajectoryAction): TaskType {
  switch (action) {
    case "memory_add":
    case "memory_update":
    case "memory_restore":
      return "ingest";
    case "memory_search":
    case "memory_get":
    case "memory_list":
    case "memory_list_deleted":
    case "memory_export":
      return "retrieve";
    case "curator_approve":
    case "curator_reject":
    case "curator_score":
    case "curator_propose":
    case "memory_promote":
      return "curate";
    case "memory_delete":
      return "lifecycle";
    default:
      return "unknown";
  }
}

/**
 * Hash an opaque payload to a short hex digest for the audit row.
 * `null` and `undefined` produce `null` so the column stays nullable.
 */
export function hashPayload(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null;
  try {
    const serialized =
      typeof payload === "string"
        ? payload
        : JSON.stringify(payload, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v
          );
    return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
  } catch {
    // Non-serialisable payload — fall back to a coarse hash of the type tag.
    return createHash("sha256")
      .update(typeof payload)
      .digest("hex")
      .slice(0, 16);
  }
}

/**
 * Build the SyscallContext for a trajectory write. The kernel stamps
 * group_id from the proof claims, but we also pass it in the context so
 * policy evaluation has tenant scope.
 */
function buildContext(record: TrajectoryRecord, groupId: string): SyscallContext {
  return {
    actor: record.agent_id,
    group_id: groupId,
    permission_tier: "plugin",
    audit_context: {
      subsystem: "sona",
      action: record.action,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a trajectory row through the kernel syscall_mutate path.
 *
 * This function is ASYNC but callers should treat it as fire-and-forget:
 * use `recordTrajectoryAsync` (below) for the non-blocking wrapper. Any
 * validation or kernel failure is returned in the `RecordResult` and never
 * thrown — trajectory recording must not break the wrapped operation.
 */
export async function recordTrajectory(
  record: TrajectoryRecord
): Promise<RecordResult> {
  // 1. Validate group_id up front — refuse to write without tenant scope.
  let groupId: string;
  try {
    groupId = validateGroupId(record.group_id);
  } catch (error) {
    const message =
      error instanceof GroupIdValidationError
        ? error.message
        : `Invalid group_id: ${String(record.group_id)}`;
    console.error(`[sona] trajectory recording skipped: ${message}`);
    return { recorded: false, error: message };
  }

  // 2. Validate duration is a non-negative integer.
  const durationMs = Math.max(0, Math.trunc(record.duration_ms ?? 0));

  // 3. Build the kernel mutation payload. group_id is stamped by the kernel
  //    from the proof claims (AD-40), but we also include it in the data bag
  //    so the resolver writes it to the column.
  const inputHash = hashPayload(record.input);
  const outputHash = hashPayload(record.output);
  const taskType = record.task_type ?? defaultTaskType(record.action);

  const mutationData = {
    group_id: groupId,
    agent_id: record.agent_id,
    action: record.action,
    task_type: taskType,
    input_hash: inputHash,
    output_hash: outputHash,
    success: record.success,
    duration_ms: durationMs,
  };

  try {
    const result = await syscall_mutate(
      {
        type: "insert",
        target: "pg:agent_trajectories",
        data: mutationData,
      },
      buildContext(record, groupId)
    );

    if (!result.success) {
      // Kernel/policy failure — log and swallow. Never surface to caller.
      console.error(
        `[sona] trajectory write failed for agent=${record.agent_id} action=${record.action}: ${result.error ?? "unknown kernel error"}`
      );
      return { recorded: false, error: result.error };
    }

    return { recorded: true };
  } catch (error) {
    // Defensive: syscall_mutate already returns a failed SyscallResult on
    // internal errors, but we guard against unexpected throws too.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sona] trajectory recording threw: ${message}`);
    return { recorded: false, error: message };
  }
}

/**
 * Fire-and-forget wrapper around `recordTrajectory`.
 *
 * Schedules the write on the next tick so the caller's response path is never
 * blocked. Any failure is logged inside `recordTrajectory` and never
 * propagated. This is the entry point the MCP server and curator use.
 */
export function recordTrajectoryAsync(record: TrajectoryRecord): void {
  // setImmediate keeps this off the caller's stack and avoids unhandled
  // rejection warnings — the inner promise is fully self-contained.
  setImmediate(() => {
    void recordTrajectory(record).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[sona] async trajectory recording failed: ${message}`);
    });
  });
}

/**
 * Wrap an async operation with trajectory recording.
 *
 * Measures wall-clock duration, captures success/failure, and records the
 * trajectory asynchronously (non-blocking). Returns the original operation's
 * result unchanged — trajectory recording never alters the wrapped path.
 *
 * Usage:
 *   const result = await withTrajectory(
 *     { group_id, agent_id: "memory-coordinator", action: "memory_add" },
 *     () => canonicalTools.memory_add(request)
 *   );
 */
export async function withTrajectory<T>(
  meta: {
    group_id: string;
    agent_id: string;
    action: TrajectoryAction;
    task_type?: TaskType;
    input?: unknown;
  },
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  let success = true;
  let output: unknown;
  try {
    output = await operation();
    return output as T;
  } catch (error) {
    success = false;
    throw error;
  } finally {
    const duration_ms = Date.now() - start;
    recordTrajectoryAsync({
      group_id: meta.group_id,
      agent_id: meta.agent_id,
      action: meta.action,
      task_type: meta.task_type,
      input: meta.input,
      output: success ? output : undefined,
      success,
      duration_ms,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// QUERY HELPERS (used by the /api/trajectories routes)
// ─────────────────────────────────────────────────────────────────────────────

/** Filter parameters for listing trajectories. */
export interface TrajectoryQueryParams {
  group_id: string;
  agent_id?: string;
  action?: TrajectoryAction;
  task_type?: TaskType;
  from?: string; // ISO 8601
  to?: string; // ISO 8601
  success?: boolean;
  limit?: number;
  offset?: number;
}

/** Parsed row from the `agent_trajectories` table. */
export interface TrajectoryListRow {
  id: number;
  group_id: string;
  agent_id: string;
  action: string;
  task_type: string;
  input_hash: string | null;
  output_hash: string | null;
  success: boolean;
  duration_ms: number;
  created_at: string;
}

/**
 * Query the `agent_trajectories` table directly via the pg pool.
 *
 * Reads are NOT routed through the kernel (only writes are — AD-40). The
 * query is tenant-scoped: group_id is mandatory and parameterised.
 */
export async function queryTrajectories(
  params: TrajectoryQueryParams
): Promise<{ rows: TrajectoryListRow[]; total: number }> {
  // Lazy import so unit tests don't pull the pg pool unless they exercise it.
  const { getPool } = await import("@/lib/postgres/connection");

  const conditions: string[] = ["group_id = $1"];
  const values: unknown[] = [params.group_id];
  let paramIdx = 2;

  if (params.agent_id) {
    conditions.push(`agent_id = $${paramIdx++}`);
    values.push(params.agent_id);
  }
  if (params.action) {
    conditions.push(`action = $${paramIdx++}`);
    values.push(params.action);
  }
  if (params.task_type) {
    conditions.push(`task_type = $${paramIdx++}`);
    values.push(params.task_type);
  }
  if (params.success !== undefined) {
    conditions.push(`success = $${paramIdx++}`);
    values.push(params.success);
  }
  if (params.from) {
    conditions.push(`created_at >= $${paramIdx++}`);
    values.push(new Date(params.from));
  }
  if (params.to) {
    conditions.push(`created_at <= $${paramIdx++}`);
    values.push(new Date(params.to));
  }

  const where = conditions.join(" AND ");
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 10_000);
  const offset = Math.max(params.offset ?? 0, 0);

  const pool = getPool();
  const countSql = `SELECT COUNT(*)::int AS total FROM agent_trajectories WHERE ${where}`;
  const countResult = await pool.query(countSql, values);
  const total = countResult.rows[0]?.total ?? 0;

  const listSql = `SELECT id, group_id, agent_id, action, task_type, input_hash, output_hash, success, duration_ms, created_at FROM agent_trajectories WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  const listValues = [...values, limit, offset];
  const listResult = await pool.query(listSql, listValues);

  const rows = listResult.rows.map((r) => ({
    ...r,
    created_at:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
  })) as TrajectoryListRow[];

  return { rows, total };
}

/** Per-agent aggregation row returned by `/api/trajectories/stats`. */
export interface TrajectoryStatsRow {
  agent_id: string;
  action: string;
  total: number;
  successful: number;
  failed: number;
  success_rate: number;
  avg_duration_ms: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
}

/**
 * Aggregate per-agent success rate and action counts.
 *
 * Uses PostgreSQL percentile_cont for latency percentiles. group_id is
 * mandatory and parameterised.
 */
export async function trajectoryStats(
  params: { group_id: string; from?: string; to?: string }
): Promise<TrajectoryStatsRow[]> {
  const { getPool } = await import("@/lib/postgres/connection");

  const conditions: string[] = ["group_id = $1"];
  const values: unknown[] = [params.group_id];
  let paramIdx = 2;

  if (params.from) {
    conditions.push(`created_at >= $${paramIdx++}`);
    values.push(new Date(params.from));
  }
  if (params.to) {
    conditions.push(`created_at <= $${paramIdx++}`);
    values.push(new Date(params.to));
  }

  const where = conditions.join(" AND ");
  const sql = `
    SELECT
      agent_id,
      action,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE success)::int AS successful,
      COUNT(*) FILTER (WHERE NOT success)::int AS failed,
      CASE WHEN COUNT(*) = 0 THEN 0 ELSE COUNT(*) FILTER (WHERE success)::float / COUNT(*) END AS success_rate,
      COALESCE(AVG(duration_ms), 0)::float AS avg_duration_ms,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p50_duration_ms,
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 0)::int AS p95_duration_ms
    FROM agent_trajectories
    WHERE ${where}
    GROUP BY agent_id, action
    ORDER BY agent_id, action
  `;

  const pool = getPool();
  const result = await pool.query(sql, values);
  return result.rows as TrajectoryStatsRow[];
}