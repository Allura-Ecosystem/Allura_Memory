/**
 * Process Engine — Event-Sourced Replay Engine
 * Story 12.2: Event-Sourced Replay Engine for Allura Memory
 *
 * Provides full timeline reconstruction from append-only PostgreSQL events,
 * dry-run replay, resume-from-checkpoint with validation, and diff/compare
 * between two process executions.
 *
 * Design invariants:
 *   - replay() in dryRun mode writes NO new events
 *   - group_id on every DB query
 *   - append-only: this engine never mutates or deletes events
 *   - resumeFromCheckpoint() delegates execution to ProcessEngine.resume()
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/replay is server-side only")
}

import type { Pool } from "pg"
import { ProcessEngine } from "./engine"
import type { ProcessState, ProcessStatus, StepStatus } from "./types"
import { ProcessEngineError } from "./types"

// ── Public Types ──────────────────────────────────────────────────────────────

export interface ReplayOptions {
  /** Read-only mode — no new events emitted, no side effects */
  dryRun?: boolean
  /** Start timeline slice from this step ID (inclusive) */
  fromStep?: string
  /** Stop timeline slice at this step ID (inclusive) */
  toStep?: string
  /** Include step inputs/outputs in the timeline entries */
  verbose?: boolean
}

export interface ReplayTimeline {
  processId: string
  definitionId: string
  groupId: string
  status: ProcessStatus
  steps: ReplayTimelineStep[]
  /** Wall-clock duration from first to last event (ms) */
  totalDuration: number
  startedAt: string
  completedAt?: string
}

export interface ReplayTimelineStep {
  stepId: string
  stepName: string
  type: "step" | "checkpoint" | "gate"
  status: StepStatus
  startedAt: string
  completedAt?: string
  /** Duration between started and completed events (ms) */
  duration: number
  /** Step output (only populated when verbose: true) */
  result?: unknown
  /** Error message if the step failed */
  error?: string
  /** Gate condition result (gate steps only) */
  gateResult?: boolean
  /** Whether the checkpoint was approved (checkpoint steps only) */
  checkpointApproved?: boolean
}

export interface ReplayDiff {
  processA: { id: string; status: ProcessStatus; stepCount: number }
  processB: { id: string; status: ProcessStatus; stepCount: number }
  /** First step ID where the two timelines diverge; null if identical */
  divergedAtStep: string | null
  differences: Array<{
    stepId: string
    fieldChanged: string
    valueA: unknown
    valueB: unknown
  }>
}

// ── Internal raw event row ────────────────────────────────────────────────────

interface RawEventRow {
  event_type: string
  step_id: string | null
  metadata: Record<string, unknown>
  error_message: string | null
  created_at: Date
}

// ── ReplayEngine ──────────────────────────────────────────────────────────────

export class ReplayEngine {
  private processEngine: ProcessEngine

  constructor(private pool: Pool) {
    this.processEngine = new ProcessEngine(pool)
  }

  /**
   * Reconstruct the full execution timeline for a process by walking its
   * append-only event history. Does NOT re-execute steps.
   *
   * When dryRun is true (default: false), no new events are written.
   * fromStep/toStep slice the resulting step list by step ID.
   */
  async replay(processId: string, options: ReplayOptions = {}): Promise<ReplayTimeline> {
    const { dryRun = false, fromStep, toStep, verbose = false } = options

    // Fetch the group_id by loading the anchor event first (no group_id filter
    // possible without knowing it, so we look it up from the event row directly).
    const anchorResult = await this.pool.query<{ group_id: string }>(
      `SELECT group_id
       FROM events
       WHERE workflow_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [processId],
    )

    if (anchorResult.rows.length === 0) {
      throw new ProcessEngineError(`No events found for process ${processId}`, processId)
    }

    const groupId = anchorResult.rows[0].group_id

    // Fetch ALL events for this process, ordered chronologically
    const eventsResult = await this.pool.query<RawEventRow>(
      `SELECT event_type, step_id, metadata, error_message, created_at
       FROM events
       WHERE workflow_id = $1
         AND group_id = $2
       ORDER BY created_at ASC`,
      [processId, groupId],
    )

    const rows = eventsResult.rows

    // ── Reconstruct top-level process metadata ────────────────────────────────

    const startEvent = rows.find((r) => r.event_type === "process_started")
    const completeEvent = rows.find((r) => r.event_type === "process_completed")
    const failedEvent = rows.find((r) => r.event_type === "process_failed")
    const cancelledEvent = rows.find((r) => r.event_type === "process_cancelled")

    // Determine overall status from events
    let status: ProcessStatus = "pending"
    if (startEvent) status = "running"
    if (completeEvent) status = "completed"
    if (failedEvent || cancelledEvent) status = "failed"

    // Check if process is currently paused (has a checkpoint_blocked without a
    // subsequent resume that advanced past it)
    const checkpointBlockedEvents = rows.filter(
      (r) => r.event_type === "process_checkpoint_blocked",
    )
    const resumedEvents = rows.filter((r) => r.event_type === "process_resumed")
    if (
      checkpointBlockedEvents.length > resumedEvents.length &&
      status === "running"
    ) {
      status = "paused"
    }

    const definitionId =
      (startEvent?.metadata.definitionId as string | undefined) ??
      (startEvent?.metadata.state as { definitionId?: string } | undefined)?.definitionId ??
      "unknown"

    const startedAt = startEvent
      ? startEvent.created_at.toISOString()
      : rows[0]?.created_at.toISOString() ?? new Date().toISOString()

    const completedAt =
      completeEvent?.created_at.toISOString() ??
      failedEvent?.created_at.toISOString() ??
      cancelledEvent?.created_at.toISOString()

    const firstTs = rows[0]?.created_at.getTime() ?? 0
    const lastTs = rows[rows.length - 1]?.created_at.getTime() ?? 0
    const totalDuration = lastTs - firstTs

    // ── Build step timeline ───────────────────────────────────────────────────

    // Collect per-step events grouped by step_id
    const stepEventMap = new Map<string, RawEventRow[]>()

    for (const row of rows) {
      if (!row.step_id) continue
      if (!stepEventMap.has(row.step_id)) {
        stepEventMap.set(row.step_id, [])
      }
      stepEventMap.get(row.step_id)!.push(row)
    }

    // Determine step insertion order from the first event that references each step
    const stepOrder: string[] = []
    const seenStepIds = new Set<string>()
    for (const row of rows) {
      if (row.step_id && !seenStepIds.has(row.step_id)) {
        stepOrder.push(row.step_id)
        seenStepIds.add(row.step_id)
      }
    }

    const allSteps: ReplayTimelineStep[] = []

    for (const stepId of stepOrder) {
      const stepRows = stepEventMap.get(stepId)!
      const timelineStep = this.buildTimelineStep(stepId, stepRows, verbose)
      allSteps.push(timelineStep)
    }

    // ── Apply fromStep / toStep slice ─────────────────────────────────────────

    let steps = allSteps

    if (fromStep !== undefined || toStep !== undefined) {
      const fromIdx = fromStep
        ? allSteps.findIndex((s) => s.stepId === fromStep)
        : 0
      const toIdx = toStep
        ? allSteps.findIndex((s) => s.stepId === toStep)
        : allSteps.length - 1

      if (fromIdx === -1) {
        throw new ProcessEngineError(
          `fromStep '${fromStep}' not found in process ${processId}`,
          processId,
        )
      }
      if (toIdx === -1) {
        throw new ProcessEngineError(
          `toStep '${toStep}' not found in process ${processId}`,
          processId,
        )
      }

      steps = allSteps.slice(fromIdx, toIdx + 1)
    }

    // dryRun guard: no writes anywhere in this path — the above is read-only.
    // The flag is intentionally unused at runtime (the method never writes).
    void dryRun

    return {
      processId,
      definitionId,
      groupId,
      status,
      steps,
      totalDuration,
      startedAt,
      completedAt,
    }
  }

  /**
   * Resume a paused process from its blocked checkpoint.
   *
   * Validates:
   * 1. The process exists and is actually paused
   * 2. There is at least one blocked checkpoint step
   *
   * Then delegates to ProcessEngine.resume() which emits process_resumed
   * and advances state. Returns the updated ProcessState.
   */
  async resumeFromCheckpoint(
    processId: string,
    approvalData: Record<string, unknown> = {},
  ): Promise<ProcessState> {
    // Use replay() to get current state (read-only; dryRun implicit)
    const timeline = await this.replay(processId)

    if (timeline.status !== "paused") {
      throw new ProcessEngineError(
        `Process ${processId} is not paused (current status: ${timeline.status})`,
        processId,
      )
    }

    const blockedCheckpoints = timeline.steps.filter(
      (s) => s.type === "checkpoint" && s.status === "blocked",
    )

    if (blockedCheckpoints.length === 0) {
      throw new ProcessEngineError(
        `Process ${processId} is paused but no blocked checkpoint step was found`,
        processId,
      )
    }

    // Delegate to existing ProcessEngine.resume() which handles event emission
    // and state advancement
    return this.processEngine.resume(processId, approvalData)
  }

  /**
   * List all checkpoint steps in a process that are currently blocked/waiting
   * for human approval.
   */
  async listPendingCheckpoints(processId: string): Promise<ReplayTimelineStep[]> {
    const timeline = await this.replay(processId)
    return timeline.steps.filter(
      (s) => s.type === "checkpoint" && s.status === "blocked",
    )
  }

  /**
   * Compare two process executions side-by-side.
   * Walks matching step IDs in order and records field-level differences.
   * Returns the first step where outcomes diverge and all differences found.
   */
  async diff(processIdA: string, processIdB: string): Promise<ReplayDiff> {
    const [timelineA, timelineB] = await Promise.all([
      this.replay(processIdA, { verbose: true }),
      this.replay(processIdB, { verbose: true }),
    ])

    const processA = {
      id: processIdA,
      status: timelineA.status,
      stepCount: timelineA.steps.length,
    }
    const processB = {
      id: processIdB,
      status: timelineB.status,
      stepCount: timelineB.steps.length,
    }

    const differences: ReplayDiff["differences"] = []
    let divergedAtStep: string | null = null

    // Build a map of stepId → step for B to allow O(1) lookup
    const stepsB = new Map(timelineB.steps.map((s) => [s.stepId, s]))

    for (const stepA of timelineA.steps) {
      const stepB = stepsB.get(stepA.stepId)

      if (!stepB) {
        // Step exists in A but not in B
        if (divergedAtStep === null) divergedAtStep = stepA.stepId
        differences.push({
          stepId: stepA.stepId,
          fieldChanged: "existence",
          valueA: "present",
          valueB: "missing",
        })
        continue
      }

      // Compare key fields
      const fieldsToCompare: Array<keyof ReplayTimelineStep> = [
        "status",
        "error",
        "gateResult",
        "checkpointApproved",
        "result",
      ]

      let stepDiverged = false
      for (const field of fieldsToCompare) {
        const valA = stepA[field]
        const valB = stepB[field]
        // Use JSON comparison to handle object equality for result fields
        if (JSON.stringify(valA) !== JSON.stringify(valB)) {
          if (!stepDiverged) {
            if (divergedAtStep === null) divergedAtStep = stepA.stepId
            stepDiverged = true
          }
          differences.push({
            stepId: stepA.stepId,
            fieldChanged: field,
            valueA: valA,
            valueB: valB,
          })
        }
      }
    }

    // Check for steps in B that are not in A
    const stepIdsA = new Set(timelineA.steps.map((s) => s.stepId))
    for (const stepB of timelineB.steps) {
      if (!stepIdsA.has(stepB.stepId)) {
        if (divergedAtStep === null) divergedAtStep = stepB.stepId
        differences.push({
          stepId: stepB.stepId,
          fieldChanged: "existence",
          valueA: "missing",
          valueB: "present",
        })
      }
    }

    return {
      processA,
      processB,
      divergedAtStep,
      differences,
    }
  }

  // ── Private Helpers ───────────────────────────────────────────────────────────

  /**
   * Build a single ReplayTimelineStep from all raw event rows for that step.
   */
  private buildTimelineStep(
    stepId: string,
    rows: RawEventRow[],
    verbose: boolean,
  ): ReplayTimelineStep {
    const startedRow = rows.find(
      (r) =>
        r.event_type === "process_step_started" ||
        r.event_type === "process_checkpoint_blocked",
    )
    const completedRow = rows.find((r) => r.event_type === "process_step_completed")
    const failedRow = rows.find((r) => r.event_type === "process_step_failed")
    const skippedRow = rows.find((r) => r.event_type === "process_step_skipped")
    const gateFailedRow = rows.find((r) => r.event_type === "process_gate_failed")
    const checkpointBlockedRow = rows.find(
      (r) => r.event_type === "process_checkpoint_blocked",
    )

    // Determine step name from the first event metadata
    const firstRow = rows[0]
    const stepName =
      (firstRow?.metadata.stepName as string | undefined) ??
      stepId

    // Determine step type
    let type: ReplayTimelineStep["type"] = "step"
    const rawType = firstRow?.metadata.stepType as string | undefined
    if (rawType === "checkpoint" || checkpointBlockedRow) {
      type = "checkpoint"
    } else if (rawType === "gate" || gateFailedRow) {
      type = "gate"
    }

    // Determine status
    let status: StepStatus = "pending"
    if (startedRow) status = "running"
    if (completedRow) status = "completed"
    if (failedRow || gateFailedRow) status = "failed"
    if (skippedRow) status = "skipped"
    if (checkpointBlockedRow && !completedRow) status = "blocked"

    // Timestamps
    const startedAt =
      (startedRow ?? checkpointBlockedRow ?? firstRow)?.created_at.toISOString() ??
      new Date().toISOString()

    const endRow = completedRow ?? failedRow ?? skippedRow ?? gateFailedRow
    const completedAt = endRow?.created_at.toISOString()

    const startMs = new Date(startedAt).getTime()
    const endMs = completedAt ? new Date(completedAt).getTime() : startMs
    const duration = endMs - startMs

    // Optional verbose fields
    const result = verbose
      ? (completedRow?.metadata.result ?? undefined)
      : undefined

    const error =
      failedRow?.error_message ??
      gateFailedRow?.error_message ??
      (failedRow?.metadata.error as string | undefined) ??
      (gateFailedRow?.metadata.error as string | undefined) ??
      undefined

    // Gate-specific
    const gateResult: boolean | undefined =
      type === "gate"
        ? ((completedRow?.metadata.passed as boolean | undefined) ??
          (gateFailedRow ? false : undefined))
        : undefined

    // Checkpoint-specific: was it approved (completed after being blocked)?
    const checkpointApproved: boolean | undefined =
      type === "checkpoint"
        ? checkpointBlockedRow !== undefined
          ? completedRow !== undefined
          : undefined
        : undefined

    const step: ReplayTimelineStep = {
      stepId,
      stepName,
      type,
      status,
      startedAt,
      duration,
    }

    if (completedAt !== undefined) step.completedAt = completedAt
    if (result !== undefined) step.result = result
    if (error !== undefined) step.error = error
    if (gateResult !== undefined) step.gateResult = gateResult
    if (checkpointApproved !== undefined) step.checkpointApproved = checkpointApproved

    return step
  }
}
