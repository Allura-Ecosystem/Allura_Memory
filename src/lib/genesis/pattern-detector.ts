/**
 * Genesis Engine — Pattern Detector
 * Story 2.2: Genesis Engine (Pattern Proposal)
 *
 * Analyses agent trajectories (`agent_trajectories` — Story 1.3) and skill
 * usage events (`skill_usage_events` — Story 1.2) over a configurable window
 * (default 7 days) and detects reusable patterns that should become skills
 * or workflows:
 *
 *   1. Repeated action sequences — the same ordered sequence of actions
 *      performed by the same agent 3+ times.
 *   2. High-frequency tasks — the same `task_type` performed 10+ times
 *      across the window.
 *   3. Failed-then-succeeded patterns — a task_type that fails and then
 *      later succeeds (a learning/correction signal worth codifying).
 *
 * Reads are NOT routed through the kernel (only writes are — AD-40). The
 * queries are tenant-scoped: group_id is mandatory and parameterised. The
 * detector is pure with respect to its inputs — callers can inject a mock
 * fetcher for unit tests (`TrajectoryFetcher`), or use the default
 * PostgreSQL fetcher.
 *
 * Reference: docs/allura/BLUEPRINT.md (Genesis Engine)
 */

// Server-only guard — the default fetcher touches the pg pool.
if (typeof window !== "undefined") {
  throw new Error("pattern-detector can only be used server-side");
}

import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Pattern categories the detector can emit. */
export type PatternType =
  | "repeated_action_sequence"
  | "high_frequency_task"
  | "failed_then_succeeded";

/** A raw trajectory row projected from `agent_trajectories`. */
export interface TrajectoryPoint {
  id: number;
  agent_id: string;
  action: string;
  task_type: string;
  success: boolean;
  created_at: Date;
}

/** A raw skill usage row projected from `skill_usage_events`. */
export interface SkillUsagePoint {
  id: number;
  skill_name: string;
  success: boolean;
  created_at: Date;
}

/** Combined evidence window the detector operates on. */
export interface DetectionWindow {
  group_id: string;
  trajectories: TrajectoryPoint[];
  skillUsage: SkillUsagePoint[];
}

/** A single detected pattern, ready to hand to the proposal generator. */
export interface DetectedPattern {
  pattern_type: PatternType;
  pattern_description: string;
  frequency: number;
  suggested_skill: string;
  confidence: number;
  /** Free-form evidence bag the proposal generator may include. */
  evidence?: Record<string, unknown>;
}

/** Detection configuration. */
export interface DetectionConfig {
  /** Lookback window in days (default 7). */
  window_days?: number;
  /** Min repetitions for a repeated_action_sequence (default 3). */
  min_sequence_repetitions?: number;
  /** Min count for a high_frequency_task (default 10). */
  min_task_frequency?: number;
  /** Length of action sequence to consider (default 3 actions). */
  sequence_length?: number;
}

/** Default detection thresholds. */
export const DEFAULT_CONFIG: Required<DetectionConfig> = {
  window_days: 7,
  min_sequence_repetitions: 3,
  min_task_frequency: 10,
  sequence_length: 3,
};

/** Fetcher abstraction so unit tests can inject synthetic data. */
export type TrajectoryFetcher = (
  group_id: string,
  window_days: number
) => Promise<DetectionWindow>;

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT POSTGRESQL FETCHER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch trajectories and skill usage from PostgreSQL over the window.
 * Reads are direct (not kernel-gated) — only writes flow through
 * syscall_mutate (AD-40). group_id is parameterised for tenant isolation.
 */
export async function fetchDetectionWindow(
  group_id: string,
  window_days: number
): Promise<DetectionWindow> {
  const pool = getPool();
  const since = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000);

  const trajResult = await pool.query<{
    id: number;
    agent_id: string;
    action: string;
    task_type: string;
    success: boolean;
    created_at: Date;
  }>(
    `SELECT id, agent_id, action, task_type, success, created_at
     FROM agent_trajectories
     WHERE group_id = $1 AND created_at >= $2
     ORDER BY created_at ASC`,
    [group_id, since]
  );

  const skillResult = await pool.query<{
    id: number;
    skill_name: string;
    success: boolean;
    created_at: Date;
  }>(
    `SELECT id, skill_name, success, created_at
     FROM skill_usage_events
     WHERE group_id = $1 AND created_at >= $2
     ORDER BY created_at ASC`,
    [group_id, since]
  );

  return {
    group_id,
    trajectories: trajResult.rows.map((r) => ({
      ...r,
      created_at:
        r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    })),
    skillUsage: skillResult.rows.map((r) => ({
      ...r,
      created_at:
        r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect repeated ordered action sequences per agent.
 *
 * Slides a window of `sequence_length` actions over each agent's
 * chronological action stream and counts how many times each distinct
 * sequence appears. Any sequence appearing `>= min_sequence_repetitions`
 * is a candidate pattern.
 */
export function detectRepeatedSequences(
  window: DetectionWindow,
  config: Required<DetectionConfig>
): DetectedPattern[] {
  const { min_sequence_repetitions, sequence_length } = config;
  const patterns: DetectedPattern[] = [];

  if (sequence_length < 2) return patterns;

  // Group trajectories by agent, preserving chronological order (ASC).
  const byAgent = new Map<string, TrajectoryPoint[]>();
  for (const t of window.trajectories) {
    let bucket = byAgent.get(t.agent_id);
    if (!bucket) {
      bucket = [];
      byAgent.set(t.agent_id, bucket);
    }
    bucket.push(t);
  }

  for (const [agent_id, points] of byAgent) {
    if (points.length < sequence_length) continue;

    // Count each distinct sequence of `sequence_length` actions.
    const counts = new Map<string, number>();
    for (let i = 0; i <= points.length - sequence_length; i++) {
      const seq = points
        .slice(i, i + sequence_length)
        .map((p) => p.action)
        .join(" → ");
      counts.set(seq, (counts.get(seq) ?? 0) + 1);
    }

    for (const [sequence, count] of counts) {
      if (count >= min_sequence_repetitions) {
        const confidence = Math.min(
          1.0,
          0.4 + 0.1 * (count - min_sequence_repetitions)
        );
        patterns.push({
          pattern_type: "repeated_action_sequence",
          pattern_description: `Agent "${agent_id}" repeats the action sequence [${sequence}] ${count} times within the window.`,
          frequency: count,
          suggested_skill: suggestSkillName(
            `sequence:${sequence}`,
            window.group_id
          ),
          confidence: roundConfidence(confidence),
          evidence: {
            agent_id,
            sequence,
            repetitions: count,
            sequence_length,
          },
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect high-frequency task types — the same `task_type` appearing
 * `>= min_task_frequency` times across the window (regardless of agent).
 */
export function detectHighFrequencyTasks(
  window: DetectionWindow,
  config: Required<DetectionConfig>
): DetectedPattern[] {
  const { min_task_frequency } = config;
  const patterns: DetectedPattern[] = [];

  const counts = new Map<string, number>();
  for (const t of window.trajectories) {
    counts.set(t.task_type, (counts.get(t.task_type) ?? 0) + 1);
  }

  for (const [task_type, count] of counts) {
    if (count >= min_task_frequency) {
      // Confidence scales with frequency above threshold, capped at 1.0.
      const confidence = Math.min(
        1.0,
        0.5 + 0.05 * (count - min_task_frequency)
      );
      patterns.push({
        pattern_type: "high_frequency_task",
        pattern_description: `Task type "${task_type}" was performed ${count} times within the window — a candidate for a dedicated skill/workflow.`,
        frequency: count,
        suggested_skill: suggestSkillName(`task:${task_type}`, window.group_id),
        confidence: roundConfidence(confidence),
        evidence: { task_type, count },
      });
    }
  }

  return patterns;
}

/**
 * Detect failed-then-succeeded patterns — a task_type that has at least one
 * failure followed by at least one success in the window. This signals a
 * recoverable/correctable workflow worth codifying.
 */
export function detectFailedThenSucceeded(
  window: DetectionWindow,
  config: Required<DetectionConfig>
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  // Group by task_type, preserving chronological order (ASC).
  const byTask = new Map<string, TrajectoryPoint[]>();
  for (const t of window.trajectories) {
    let bucket = byTask.get(t.task_type);
    if (!bucket) {
      bucket = [];
      byTask.set(t.task_type, bucket);
    }
    bucket.push(t);
  }

  for (const [task_type, points] of byTask) {
    let seenFailure = false;
    let recoveryCount = 0;
    for (const p of points) {
      if (!p.success) {
        seenFailure = true;
      } else if (seenFailure) {
        recoveryCount++;
      }
    }

    if (seenFailure && recoveryCount > 0) {
      const failures = points.filter((p) => !p.success).length;
      const successes = points.filter((p) => p.success).length;
      // Confidence: more recoveries → higher; more failures → higher (more to learn from).
      const confidence = Math.min(
        1.0,
        0.3 + 0.1 * recoveryCount + 0.02 * failures
      );
      patterns.push({
        pattern_type: "failed_then_succeeded",
        pattern_description: `Task type "${task_type}" failed ${failures} time(s) then succeeded ${recoveryCount} time(s) — a correctable workflow worth codifying.`,
        frequency: failures + recoveryCount,
        suggested_skill: suggestSkillName(
          `recovery:${task_type}`,
          window.group_id
        ),
        confidence: roundConfidence(confidence),
        evidence: {
          task_type,
          failures,
          recoveries: recoveryCount,
          total_attempts: successes + failures,
        },
      });
    }
  }

  return patterns;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all three detectors over a window and return the merged, deduplicated
 * list of detected patterns sorted by confidence DESC then frequency DESC.
 *
 * Pure function — takes the window explicitly so unit tests inject synthetic
 * data without touching PostgreSQL.
 */
export function detectPatterns(
  window: DetectionWindow,
  config: DetectionConfig = {}
): DetectedPattern[] {
  const cfg: Required<DetectionConfig> = { ...DEFAULT_CONFIG, ...config };

  const patterns = [
    ...detectRepeatedSequences(window, cfg),
    ...detectHighFrequencyTasks(window, cfg),
    ...detectFailedThenSucceeded(window, cfg),
  ];

  // Deduplicate by (pattern_type, suggested_skill) keeping the highest
  // frequency/confidence variant.
  const seen = new Map<string, DetectedPattern>();
  for (const p of patterns) {
    const key = `${p.pattern_type}::${p.suggested_skill}`;
    const existing = seen.get(key);
    if (!existing || p.frequency > existing.frequency) {
      seen.set(key, p);
    }
  }

  return [...seen.values()].sort(
    (a, b) =>
      b.confidence - a.confidence || b.frequency - a.frequency
  );
}

/**
 * End-to-end detection: validate group_id, fetch the window from
 * PostgreSQL (or the injected fetcher), and run the detectors.
 */
export async function runDetection(
  group_id: string,
  config: DetectionConfig = {},
  fetcher: TrajectoryFetcher = fetchDetectionWindow
): Promise<DetectedPattern[]> {
  let validatedGroupId: string;
  try {
    validatedGroupId = validateGroupId(group_id);
  } catch (error) {
    const message =
      error instanceof GroupIdValidationError
        ? error.message
        : `Invalid group_id: ${String(group_id)}`;
    throw new Error(`Genesis detection skipped: ${message}`);
  }

  const cfg: Required<DetectionConfig> = { ...DEFAULT_CONFIG, ...config };
  const window = await fetcher(validatedGroupId, cfg.window_days);
  return detectPatterns(window, cfg);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive a deterministic, lowercase, hyphenated skill name from a pattern key.
 * Strips non-[a-z0-9-] characters and collapses runs of hyphens.
 */
export function suggestSkillName(patternKey: string, group_id: string): string {
  const cleaned = patternKey
    .toLowerCase()
    .replace(/[^a-z0-9-:]/g, "-")
    .replace(/:+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Prefix with group hint to keep names unique across tenants.
  const tenantHint = (group_id || "allura").replace(/^allura-/, "");
  return `${tenantHint}-${cleaned}`.slice(0, 64);
}

/** Round confidence to 4 decimal places and clamp to [0.0, 1.0]. */
function roundConfidence(value: number): number {
  const clamped = Math.max(0.0, Math.min(1.0, value));
  return Math.round(clamped * 10000) / 10000;
}