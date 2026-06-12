/**
 * Process Engine — Doctor Module
 * Phase 1 Run Kernel (AD-P1-04)
 *
 * Detects 3 run health conditions at launch:
 *   stale              — run is active but has received no event in N minutes
 *   revision_drifted   — run's pinned definition revision < latest in process_definitions
 *   partially_persisted — run snapshot status doesn't match what event replay implies
 *
 * Doctor is READ-ONLY. It never writes to process_runs or process_definitions.
 * Callers are responsible for logging doctor_check events after diagnosis.
 *
 * Runs in its own watchdog cycle (runDoctorCycle), separate from curator watchdog.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/doctor is server-side only")
}

import type { Pool } from "pg"
import type { DoctorFinding, ProcessStatus } from "./types"

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_STALE_THRESHOLD_MINUTES = 60

/** Statuses that indicate an active run that the doctor should monitor. */
const ACTIVE_STATUSES: ProcessStatus[] = ["running", "paused"]

/**
 * Map from canonical event_type suffix to the implied ProcessStatus.
 * Only events that carry an unambiguous status implication are listed.
 */
const EVENT_TYPE_TO_STATUS: Record<string, ProcessStatus> = {
  process_started: "running",
  step_started: "running",
  step_completed: "running",
  step_failed: "failed",
  step_retried: "running",
  checkpoint_blocked: "paused",
  checkpoint_resumed: "running",
  gate_scored: "running",
  gate_error: "failed",
  process_completed: "completed",
  process_failed: "failed",
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveRun {
  id: string
  definition_id: string
  definition_revision: number
  group_id: string
  status: ProcessStatus
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString()
}

// ── Condition: stale ──────────────────────────────────────────────────────────

/**
 * A run is stale when it is active (running|paused) but the last event
 * recorded for it is older than staleThresholdMinutes.
 */
async function checkStale(
  pool: Pool,
  run: ActiveRun,
  staleThresholdMinutes: number,
): Promise<DoctorFinding | null> {
  const result = await pool.query<{ last_event: string | null }>(
    `SELECT MAX(created_at) AS last_event
     FROM events
     WHERE group_id = $1
       AND metadata->>'process_id' = $2`,
    [run.group_id, run.id],
  )

  const lastEventRaw = result.rows[0]?.last_event ?? null

  if (lastEventRaw === null) {
    // No events recorded yet — treat as stale immediately
    return {
      runId: run.id,
      condition: "stale",
      severity: "warning",
      detail: `Run ${run.id} is ${run.status} but has no recorded events.`,
      recommendedAction: "flag",
      detectedAt: nowIso(),
    }
  }

  const lastEventMs = new Date(lastEventRaw).getTime()
  const thresholdMs = staleThresholdMinutes * 60 * 1000
  const ageMs = Date.now() - lastEventMs

  if (ageMs > thresholdMs) {
    const ageMinutes = Math.round(ageMs / 60_000)
    return {
      runId: run.id,
      condition: "stale",
      severity: "warning",
      detail: `Run ${run.id} is ${run.status} but the last event was ${ageMinutes} minutes ago (threshold: ${staleThresholdMinutes}m).`,
      recommendedAction: "flag",
      detectedAt: nowIso(),
    }
  }

  return null
}

// ── Condition: revision_drifted ────────────────────────────────────────────────

/**
 * A run has drifted when the definition has been updated since the run started
 * and the run is still active. The run is pinned to an older revision.
 */
async function checkRevisionDrifted(
  pool: Pool,
  run: ActiveRun,
): Promise<DoctorFinding | null> {
  const result = await pool.query<{ max_revision: number | null }>(
    `SELECT MAX(revision) AS max_revision
     FROM process_definitions
     WHERE group_id = $1
       AND id = $2
       AND deleted_at IS NULL`,
    [run.group_id, run.definition_id],
  )

  const latestRevision = result.rows[0]?.max_revision ?? null

  if (latestRevision === null) {
    // No definition found (definition may have been soft-deleted entirely).
    // This is a different class of problem — not revision drift.
    return null
  }

  if (latestRevision > run.definition_revision) {
    return {
      runId: run.id,
      condition: "revision_drifted",
      severity: "warning",
      detail: `Run ${run.id} is pinned to definition "${run.definition_id}" revision ${run.definition_revision} but the latest revision is ${latestRevision}.`,
      recommendedAction: "flag",
      detectedAt: nowIso(),
    }
  }

  return null
}

// ── Condition: partially_persisted ────────────────────────────────────────────

/**
 * A run is partially persisted when the snapshot status does not match the
 * status implied by the most recent event in the events table.
 *
 * For example: snapshot says "running" but latest event is "checkpoint_blocked"
 * (which implies "paused"). This signals a crash between event INSERT and
 * snapshot UPDATE — exactly the invariant violation that events-first write
 * order is designed to prevent.
 */
async function checkPartiallyPersisted(
  pool: Pool,
  run: ActiveRun,
): Promise<DoctorFinding | null> {
  const result = await pool.query<{ event_type: string }>(
    `SELECT event_type
     FROM events
     WHERE group_id = $1
       AND metadata->>'process_id' = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [run.group_id, run.id],
  )

  const latestEventType = result.rows[0]?.event_type ?? null

  if (latestEventType === null) {
    // No events — nothing to compare against.
    return null
  }

  // Strip any prefix before the last underscore-delimited known keyword.
  // Our canonical event types (process_started, checkpoint_blocked, etc.)
  // are matched directly.
  const impliedStatus = EVENT_TYPE_TO_STATUS[latestEventType] ?? null

  if (impliedStatus === null) {
    // Unknown event type — cannot infer status, skip.
    return null
  }

  if (impliedStatus !== run.status) {
    return {
      runId: run.id,
      condition: "partially_persisted",
      severity: "critical",
      detail: `Run ${run.id} snapshot status is "${run.status}" but the latest event "${latestEventType}" implies "${impliedStatus}". Snapshot may not have been updated after the last event.`,
      recommendedAction: "repair_with_approval",
      detectedAt: nowIso(),
    }
  }

  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Diagnose a single run and return all findings detected.
 * Returns an empty array when the run is healthy.
 *
 * This function is READ-ONLY. The caller is responsible for logging
 * doctor_check events if any findings are produced.
 */
export async function diagnoseRun(
  pool: Pool,
  params: {
    runId: string
    groupId: string
    staleThresholdMinutes?: number
  },
): Promise<DoctorFinding[]> {
  const { runId, groupId, staleThresholdMinutes = DEFAULT_STALE_THRESHOLD_MINUTES } = params

  // Load the run snapshot
  const runResult = await pool.query<ActiveRun>(
    `SELECT id, definition_id, definition_revision, group_id, status
     FROM process_runs
     WHERE id = $1
       AND group_id = $2`,
    [runId, groupId],
  )

  if (runResult.rows.length === 0) {
    return []
  }

  const run = runResult.rows[0]

  // Only run conditions against active runs
  if (!ACTIVE_STATUSES.includes(run.status)) {
    return []
  }

  const findings: DoctorFinding[] = []

  const [stale, drifted, partial] = await Promise.all([
    checkStale(pool, run, staleThresholdMinutes),
    checkRevisionDrifted(pool, run),
    checkPartiallyPersisted(pool, run),
  ])

  if (stale !== null) findings.push(stale)
  if (drifted !== null) findings.push(drifted)
  if (partial !== null) findings.push(partial)

  return findings
}

/**
 * Run a full doctor cycle across all active runs in a tenant.
 * Intended to be called by the doctor watchdog on its own interval.
 *
 * Returns findings for all runs examined. Returns an empty array when
 * the tenant is healthy.
 *
 * This function is READ-ONLY. The caller logs doctor_check events.
 */
export async function runDoctorCycle(
  pool: Pool,
  params: {
    groupId: string
    staleThresholdMinutes?: number
  },
): Promise<DoctorFinding[]> {
  const { groupId, staleThresholdMinutes = DEFAULT_STALE_THRESHOLD_MINUTES } = params

  // Load all active runs in tenant
  const activeRunsResult = await pool.query<ActiveRun>(
    `SELECT id, definition_id, definition_revision, group_id, status
     FROM process_runs
     WHERE group_id = $1
       AND status = ANY($2::text[])`,
    [groupId, ACTIVE_STATUSES],
  )

  if (activeRunsResult.rows.length === 0) {
    return []
  }

  const findings: DoctorFinding[] = []

  // Diagnose each run — sequential to keep DB load predictable.
  // Phase 3 can parallelise if cycle duration becomes a concern.
  for (const run of activeRunsResult.rows) {
    const [stale, drifted, partial] = await Promise.all([
      checkStale(pool, run, staleThresholdMinutes),
      checkRevisionDrifted(pool, run),
      checkPartiallyPersisted(pool, run),
    ])

    if (stale !== null) findings.push(stale)
    if (drifted !== null) findings.push(drifted)
    if (partial !== null) findings.push(partial)
  }

  return findings
}
