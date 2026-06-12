/**
 * Process Engine — Main Execution Engine
 * Story 12.1: Process-as-Code Engine for Allura Memory
 *
 * Executes ProcessDefinitions sequentially, emitting append-only events to
 * PostgreSQL at each step transition. Enforces:
 *
 *   - Circuit breaker check before every step
 *   - SOC2 checkpoint blocking (pauses process; resumes via resume())
 *   - Gate conditions (pass-through or fail/skip based on required flag)
 *   - Dependency ordering (step won't run until dependsOn steps complete)
 *   - Append-only event trail — never UPDATE, only INSERT
 *
 * Event types emitted (workflow_id = processId, step_id = step.id):
 *   process_step_started          — step execution begins
 *   process_step_completed        — step execution succeeded
 *   process_step_failed           — step execution threw
 *   process_step_skipped          — non-required gate/step skipped
 *   process_checkpoint_blocked    — checkpoint blocked in soc2 mode
 *   process_gate_failed           — gate condition returned false (required)
 *   process_completed             — all steps done successfully
 *   process_failed                — process aborted due to error
 *   process_cancelled             — explicit cancel() call
 *   process_resumed               — resume() called with approval data
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/engine is server-side only")
}

import type { Pool } from "pg"
import { randomUUID } from "crypto"
import { insertEvent } from "@/lib/postgres/queries/insert-trace"
import { getBreakerManager } from "@/lib/circuit-breaker"
import { ProcessStateManager } from "./state-manager"
import {
  CheckpointBlockedError,
  CircuitBreakerTripError,
  DefinitionRevisionError,
  GateFailedError,
  ProcessEngineError,
} from "./types"
import type {
  DoctorFinding,
  GateResult,
  ProcessContext,
  ProcessDefinition,
  ProcessState,
  StepDefinition,
  StepStatus,
} from "./types"
import { DAGResolver } from "./dag"
import { createRun, updateRunSnapshot } from "./run-manager"
import type { CreateRunParams } from "./run-manager"
import { evaluateGate } from "./quality-gate"
import type { GateConfig } from "./quality-gate"
import { diagnoseRun } from "./doctor"
import { ReplayEngine } from "./replay"
import type { ReplayOptions, ReplayTimeline } from "./replay"

// ── Internal Helpers ──────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString()
}

function resolveRequired<TCtx>(
  required: StepDefinition<TCtx>["required"],
  ctx: ProcessContext<TCtx>,
): boolean {
  if (required === undefined || required === true) return true
  if (required === false) return false
  return required(ctx)
}

function buildContext<TCtx>(
  definition: ProcessDefinition<TCtx>,
  state: ProcessState,
  partialCtx: Partial<ProcessContext<TCtx>>,
): ProcessContext<TCtx> {
  return {
    processId: state.processId,
    groupId: state.groupId,
    agentId: partialCtx.agentId ?? "process-engine",
    stepResults: { ...state.stepResults },
    metadata: partialCtx.metadata ?? ({} as TCtx),
    promotionMode: partialCtx.promotionMode ?? "auto",
  }
}

// ── ProcessEngine ─────────────────────────────────────────────────────────────

export class ProcessEngine {
  private stateManager: ProcessStateManager
  /**
   * Tracks the most recent DB `updated_at` for active runs so that
   * updateRunSnapshot can use it for optimistic-concurrency checks.
   * Keyed by processId. Entries are removed when the run reaches a terminal state.
   */
  private _runUpdatedAt: Map<string, string> = new Map()

  constructor(private pool: Pool) {
    this.stateManager = new ProcessStateManager(pool)
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Execute a ProcessDefinition from the beginning.
   * Returns the final ProcessState (completed, failed, or paused).
   */
  async run<TCtx>(
    definition: ProcessDefinition<TCtx>,
    partialCtx: Partial<ProcessContext<TCtx>> = {},
  ): Promise<ProcessState> {
    const processId = randomUUID()

    const state: ProcessState = {
      processId,
      definitionId: definition.id,
      definitionRevision: definition.revision ?? "1",
      groupId: definition.group_id,
      status: "pending",
      currentStepIndex: 0,
      stepStates: {},
      stepResults: {},
      startedAt: now(),
      updatedAt: now(),
    }

    // Initialise all steps as pending
    for (const step of definition.steps) {
      state.stepStates[step.id] = "pending"
    }

    // Persist initial snapshot (append-only event)
    await this.stateManager.saveInitialState(state, {
      id: definition.id,
      revision: definition.revision ?? "1",
      name: definition.name,
      group_id: definition.group_id,
      stepCount: definition.steps.length,
      stepIds: definition.steps.map((s) => s.id),
    })

    // Create run snapshot row in process_runs (lifecycle tracking via run-manager)
    const createRunParams: CreateRunParams = {
      id: processId,
      definitionId: definition.id,
      definitionRevision: parseInt(definition.revision ?? "1", 10),
      groupId: definition.group_id,
      actorId: partialCtx.agentId ?? "process-engine",
      initialState: state,
    }
    const storedRun = await createRun(this.pool, createRunParams)
    this._runUpdatedAt.set(processId, storedRun.updated_at)

    state.status = "running"
    state.updatedAt = now()

    const ctx = buildContext(definition, state, partialCtx)

    return this.executeFrom(definition, state, ctx, 0)
  }

  /**
   * Execute a process with DAG-aware parallel step execution.
   *
   * Steps without unmet dependencies run in parallel (Promise.all).
   * Steps with dependencies wait for all parents in prior groups to complete.
   *
   * If a step in a group fails and is required, later groups that contain
   * steps depending on the failed step are marked as "skipped" with a reason.
   * Non-required step failures continue as in the sequential engine.
   *
   * Checkpoints and gates within a parallel group still block/fail as normal —
   * they are run sequentially within their Promise.all settlement.
   *
   * All events go through insertEvent() with group_id and workflow_id populated.
   */
  async runParallel<TCtx>(
    definition: ProcessDefinition<TCtx>,
    partialCtx: Partial<ProcessContext<TCtx>> = {},
  ): Promise<ProcessState> {
    // ── Validate DAG before starting ─────────────────────────────────────────
    // Cast to base StepDefinition[] — DAGResolver only reads id and dependsOn
    const dagResult = DAGResolver.validate(
      definition.steps as StepDefinition[],
    )
    if (!dagResult.valid) {
      throw new ProcessEngineError(
        `DAG validation failed: ${dagResult.errors.join("; ")}`,
        "unstarted",
      )
    }

    const processId = randomUUID()

    const state: ProcessState = {
      processId,
      definitionId: definition.id,
      definitionRevision: definition.revision ?? "1",
      groupId: definition.group_id,
      status: "pending",
      currentStepIndex: 0,
      stepStates: {},
      stepResults: {},
      startedAt: now(),
      updatedAt: now(),
    }

    // Initialise all steps as pending
    for (const step of definition.steps) {
      state.stepStates[step.id] = "pending"
    }

    await this.stateManager.saveInitialState(state, {
      id: definition.id,
      revision: definition.revision ?? "1",
      name: definition.name,
      group_id: definition.group_id,
      stepCount: definition.steps.length,
      stepIds: definition.steps.map((s) => s.id),
    })

    // Create run snapshot row in process_runs (lifecycle tracking via run-manager)
    const parallelRunParams: CreateRunParams = {
      id: processId,
      definitionId: definition.id,
      definitionRevision: parseInt(definition.revision ?? "1", 10),
      groupId: definition.group_id,
      actorId: partialCtx.agentId ?? "process-engine",
      initialState: state,
    }
    const parallelStoredRun = await createRun(this.pool, parallelRunParams)
    this._runUpdatedAt.set(processId, parallelStoredRun.updated_at)

    state.status = "running"
    state.updatedAt = now()

    const ctx = buildContext(definition, state, partialCtx)

    // Build step lookup map
    const stepMap = new Map<string, StepDefinition<TCtx>>()
    for (const step of definition.steps) {
      stepMap.set(step.id, step)
    }

    // ── Execute group-by-group ────────────────────────────────────────────────
    const { executionOrder } = dagResult

    for (let groupIndex = 0; groupIndex < executionOrder.length; groupIndex++) {
      const group = executionOrder[groupIndex]

      // Check if any step in this group was skipped due to a failed parent.
      // We do this before running the group so we can skip the whole batch.
      const skippedInGroup: string[] = []
      const runnableInGroup: string[] = []

      for (const stepId of group) {
        if (state.stepStates[stepId] === "skipped") {
          skippedInGroup.push(stepId)
        } else {
          runnableInGroup.push(stepId)
        }
      }

      // Run all runnable steps in this group in parallel.
      // Each step collects its own result independently to avoid
      // race conditions on shared mutable state.
      const groupResults = await Promise.allSettled(
        runnableInGroup.map(async (stepId) => {
          const step = stepMap.get(stepId)!

          let result: ProcessState | null = null

          if (step.type === "checkpoint") {
            result = await this.executeCheckpoint(definition, state, ctx, step, groupIndex)
          } else if (step.type === "gate") {
            result = await this.executeGate(definition, state, ctx, step, groupIndex)
          } else {
            result = await this.executeStep(definition, state, ctx, step, groupIndex)
          }

          return { stepId, earlyReturn: result }
        }),
      )

      // Merge results back into state AFTER all steps complete (no concurrent mutation).
      // This resolves the race: steps ran in parallel, but state is updated sequentially.
      const earlyReturns: ProcessState[] = []

      for (const settled of groupResults) {
        if (settled.status === "fulfilled" && settled.value.earlyReturn !== null) {
          earlyReturns.push(settled.value.earlyReturn)
        }
      }

      // Sync ctx with merged state after the full group completes
      Object.assign(ctx, { stepResults: { ...state.stepResults } })
      state.currentStepIndex = Math.max(
        ...runnableInGroup.map((id) => definition.steps.findIndex((s) => s.id === id)),
      )
      state.updatedAt = new Date().toISOString()

      // If any step failed or paused, return the first failure (deterministic: insertion order)
      if (earlyReturns.length > 0) {
        return earlyReturns[0]
      }

      // Mark downstream steps as skipped if their parent failed in this group
      const failedInGroup = runnableInGroup.filter(
        (id) => state.stepStates[id] === "failed",
      )

      if (failedInGroup.length > 0) {
        // Propagate skipped status to all future groups whose steps depend on failed ones
        const failedSet = new Set(failedInGroup)

        for (let futureGroup = groupIndex + 1; futureGroup < executionOrder.length; futureGroup++) {
          for (const futureStepId of executionOrder[futureGroup]) {
            const futureStep = stepMap.get(futureStepId)!
            const hasFailedDep = (futureStep.dependsOn ?? []).some((dep) => failedSet.has(dep))
            if (hasFailedDep) {
              state.stepStates[futureStepId] = "skipped"
              failedSet.add(futureStepId) // propagate transitively

              await insertEvent({
                group_id: state.groupId,
                event_type: "process_step_skipped",
                agent_id: ctx.agentId,
                workflow_id: state.processId,
                step_id: futureStepId,
                metadata: {
                  stepName: futureStep.name,
                  reason: "parent_failed",
                  failedDeps: (futureStep.dependsOn ?? []).filter((d) => failedSet.has(d)),
                },
                status: "completed",
              })
            }
          }
        }
      }
    }

    // ── All groups complete ───────────────────────────────────────────────────
    state.status = "completed"
    state.updatedAt = now()
    state.completedAt = now()

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_completed",
      agent_id: ctx.agentId,
      workflow_id: state.processId,
      metadata: {
        definitionId: state.definitionId,
        stepCount: definition.steps.length,
        completedAt: state.completedAt,
        mode: "parallel",
      },
      status: "completed",
    })

    await this.stateManager.saveState(state)
    // event-first: event was inserted above; snapshot update comes after
    await this._persistRunSnapshot(state)

    if (definition.onComplete) {
      try {
        await definition.onComplete({ ...ctx, stepResults: { ...state.stepResults } })
      } catch {
        // onComplete errors are non-fatal
      }
    }

    return state
  }

  /**
   * Resume a paused process after a checkpoint is approved.
   *
   * Story 12.2 / AD-35 — true continuation:
   *   - When `options.definition` is supplied, the run is continued from the
   *     first incomplete eligible step against the *pinned* definition revision.
   *     Already-completed steps (including side-effecting ones) are NOT
   *     re-executed (idempotent replay — see executeFrom's idempotency guard).
   *     A mismatched id/revision raises a DefinitionRevisionError doctor finding.
   *   - When no definition is supplied, resume falls back to the legacy
   *     audit-only behaviour: it records the approval and advances the index,
   *     leaving the caller to re-invoke run(). This preserves backward
   *     compatibility but cannot itself reach a terminal state.
   *
   * The approved checkpoint is persisted as `completed`, so approval survives a
   * restart and a subsequent resume/replay will not re-block it.
   */
  async resume<TCtx = Record<string, unknown>>(
    processId: string,
    approvalData: Record<string, unknown> = {},
    options: {
      definition?: ProcessDefinition<TCtx>
      agentId?: string
      promotionMode?: "soc2" | "auto"
    } = {},
  ): Promise<ProcessState> {
    const state = await this.stateManager.loadState(processId)
    if (!state) {
      throw new ProcessEngineError(`No process found with id ${processId}`, processId)
    }

    if (state.status !== "paused") {
      throw new ProcessEngineError(
        `Process ${processId} is not paused (current status: ${state.status})`,
        processId,
      )
    }

    const { definition } = options

    // ── Doctor finding: pinned definition must match before continuation ───────
    if (definition) {
      const pinnedRevision = state.definitionRevision ?? "1"
      const suppliedRevision = definition.revision ?? "1"
      if (definition.id !== state.definitionId || suppliedRevision !== pinnedRevision) {
        // Emit an append-only doctor finding, then refuse to continue.
        await insertEvent({
          group_id: state.groupId,
          event_type: "process_resume_rejected",
          agent_id: options.agentId ?? "process-engine",
          workflow_id: processId,
          metadata: {
            reason: "definition_revision_mismatch",
            pinned: { id: state.definitionId, revision: pinnedRevision },
            supplied: { id: definition.id, revision: suppliedRevision },
          },
          status: "failed",
        })
        throw new DefinitionRevisionError(
          processId,
          { id: state.definitionId, revision: pinnedRevision },
          { id: definition.id, revision: suppliedRevision },
        )
      }
    }

    // Emit resume event (append-only, tenant + actor scoped)
    await insertEvent({
      group_id: state.groupId,
      event_type: "process_resumed",
      agent_id: options.agentId ?? "process-engine",
      workflow_id: processId,
      metadata: { approvalData, resumedAt: now() },
      status: "completed",
    })

    state.status = "running"
    state.updatedAt = now()

    // Mark the currently blocked checkpoint as approved/completed. This is
    // idempotent: if it is somehow already completed we leave it untouched.
    const blockedEntry = Object.entries(state.stepStates).find(
      ([, s]) => s === "blocked",
    )
    const blockedStepId = blockedEntry?.[0]
    if (blockedStepId) {
      state.stepStates[blockedStepId] = "completed"
      state.stepResults[blockedStepId] = { approved: true, approvalData }

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_step_completed",
        agent_id: options.agentId ?? "process-engine",
        workflow_id: processId,
        step_id: blockedStepId,
        metadata: { stepType: "checkpoint", approved: true, resumed: true },
        status: "completed",
      })
    }

    // ── Legacy path: no definition → audit-only advance, caller re-runs ────────
    if (!definition) {
      if (blockedStepId) {
        state.currentStepIndex += 1
      }
      await this.stateManager.saveState(state)
      return state
    }

    // ── True continuation: execute remaining steps from the pinned definition ──
    // Ensure every declared step has a state entry (handles definitions whose
    // step set was reconciled). Steps already completed/skipped are preserved
    // and will be skipped by executeFrom's idempotency guard.
    for (const step of definition.steps) {
      if (state.stepStates[step.id] === undefined) {
        state.stepStates[step.id] = "pending"
      }
    }

    const ctx = buildContext(definition, state, {
      agentId: options.agentId,
      promotionMode: options.promotionMode ?? "soc2",
    })

    const blockedIndex = blockedStepId
      ? definition.steps.findIndex((s) => s.id === blockedStepId)
      : state.currentStepIndex - 1

    // Continue from the step immediately after the approved checkpoint.
    return this.executeFrom(definition, state, ctx, blockedIndex + 1)
  }

  /**
   * Load the latest state for a process.
   */
  async getState(processId: string): Promise<ProcessState | null> {
    return this.stateManager.loadState(processId)
  }

  /**
   * Cancel a running or paused process.
   */
  async cancel(processId: string, reason: string): Promise<void> {
    const state = await this.stateManager.loadState(processId)
    if (!state) {
      throw new ProcessEngineError(`No process found with id ${processId}`, processId)
    }

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_cancelled",
      agent_id: "process-engine",
      workflow_id: processId,
      metadata: { reason, cancelledAt: now() },
      status: "cancelled",
    })

    state.status = "failed"
    state.error = `Cancelled: ${reason}`
    state.updatedAt = now()
    state.completedAt = now()

    await this.stateManager.saveState(state)
    // event-first: event was inserted above; snapshot update comes after
    await this._persistRunSnapshot(state)
  }

  /**
   * Diagnose health conditions for a single process run.
   *
   * Delegates to doctor.diagnoseRun() — READ-ONLY; never writes events.
   * Returns an empty array when the run is healthy or not found.
   */
  async diagnose(
    processId: string,
    groupId: string,
    options: { staleThresholdMinutes?: number } = {},
  ): Promise<DoctorFinding[]> {
    return diagnoseRun(this.pool, {
      runId: processId,
      groupId,
      staleThresholdMinutes: options.staleThresholdMinutes,
    })
  }

  /**
   * Reconstruct the full execution timeline for a process by walking its
   * append-only event history.
   *
   * Delegates to ReplayEngine.replay() — READ-ONLY; does not re-execute steps.
   */
  async getTimeline(
    processId: string,
    options: ReplayOptions = {},
  ): Promise<ReplayTimeline> {
    const replayEngine = new ReplayEngine(this.pool)
    return replayEngine.replay(processId, options)
  }

  // ── Internal Execution Loop ─────────────────────────────────────────────────

  private async executeFrom<TCtx>(
    definition: ProcessDefinition<TCtx>,
    state: ProcessState,
    ctx: ProcessContext<TCtx>,
    startIndex: number,
  ): Promise<ProcessState> {
    for (let i = startIndex; i < definition.steps.length; i++) {
      const step = definition.steps[i]
      state.currentStepIndex = i

      // ── Idempotency Guard (Story 12.2 / AD-35) ───────────────────────────
      // Never re-execute a step that already reached a terminal non-failure
      // state. On resume/replay this guarantees completed side effects do not
      // run twice; we only sync ctx forward and move on.
      const persisted = state.stepStates[step.id]
      if (persisted === "completed" || persisted === "skipped") {
        ctx = { ...ctx, stepResults: { ...state.stepResults } }
        continue
      }

      // ── Circuit Breaker Check ────────────────────────────────────────────
      const manager = getBreakerManager()
      const breaker = manager.getOrCreateBreaker(
        `process-engine`,
        state.groupId,
        "tool",
      )
      if (breaker.getState() === "open") {
        const cbError = new CircuitBreakerTripError(state.processId, state.groupId)
        state.status = "failed"
        state.error = cbError.message
        state.updatedAt = now()
        state.completedAt = now()

        await insertEvent({
          group_id: state.groupId,
          event_type: "process_failed",
          agent_id: ctx.agentId,
          workflow_id: state.processId,
          step_id: step.id,
          metadata: { reason: "circuit_breaker_open", stepId: step.id },
          status: "failed",
          error_message: cbError.message,
        })

        await this.stateManager.saveState(state)
        await this._persistRunSnapshot(state)
        return state
      }

      // ── Dependency Check ─────────────────────────────────────────────────
      if (step.dependsOn && step.dependsOn.length > 0) {
        const unmet = step.dependsOn.filter(
          (dep) => state.stepStates[dep] !== "completed",
        )
        if (unmet.length > 0) {
          const err = new ProcessEngineError(
            `Step ${step.id} depends on [${unmet.join(", ")}] which have not completed`,
            state.processId,
            step.id,
          )
          return this.failProcess(state, ctx, step.id, err)
        }
      }

      // ── Dispatch by step type ────────────────────────────────────────────
      if (step.type === "checkpoint") {
        const result = await this.executeCheckpoint(definition, state, ctx, step, i)
        if (result !== null) return result
        // null means: checkpoint passed, continue loop
      } else if (step.type === "gate") {
        const result = await this.executeGate(definition, state, ctx, step, i)
        if (result !== null) return result
      } else {
        // type === "step"
        const result = await this.executeStep(definition, state, ctx, step, i)
        if (result !== null) return result
      }

      // Sync ctx stepResults after each step
      ctx = { ...ctx, stepResults: { ...state.stepResults } }
    }

    // ── All steps complete ───────────────────────────────────────────────────
    state.status = "completed"
    state.updatedAt = now()
    state.completedAt = now()

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_completed",
      agent_id: ctx.agentId,
      workflow_id: state.processId,
      metadata: {
        definitionId: state.definitionId,
        stepCount: definition.steps.length,
        completedAt: state.completedAt,
      },
      status: "completed",
    })

    await this.stateManager.saveState(state)
    // event-first: event was inserted above; snapshot update comes after
    await this._persistRunSnapshot(state)

    // Lifecycle hook
    if (definition.onComplete) {
      try {
        await definition.onComplete({ ...ctx, stepResults: { ...state.stepResults } })
      } catch {
        // onComplete errors are non-fatal; process is already marked complete
      }
    }

    return state
  }

  // ── Step Executors ──────────────────────────────────────────────────────────

  private async executeStep<TCtx>(
    definition: ProcessDefinition<TCtx>,
    state: ProcessState,
    ctx: ProcessContext<TCtx>,
    step: StepDefinition<TCtx>,
    _index: number,
  ): Promise<ProcessState | null> {
    state.stepStates[step.id] = "running"
    state.updatedAt = now()

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_step_started",
      agent_id: ctx.agentId,
      workflow_id: state.processId,
      step_id: step.id,
      metadata: {
        stepName: step.name,
        stepType: step.type,
        stepIndex: _index,
      },
      status: "pending",
    })

    if (!step.execute) {
      // No-op step — mark completed immediately
      state.stepStates[step.id] = "completed"
      state.stepResults[step.id] = null
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_step_completed",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, result: null },
        status: "completed",
      })

      return null
    }

    try {
      const result = await step.execute({ ...ctx, stepResults: { ...state.stepResults } })

      state.stepStates[step.id] = "completed"
      state.stepResults[step.id] = result ?? null
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_step_completed",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, result },
        status: "completed",
      })

      return null
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      const isRequired = resolveRequired(step.required, ctx)

      state.stepStates[step.id] = isRequired ? "failed" : "skipped"
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: isRequired ? "process_step_failed" : "process_step_skipped",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, required: isRequired },
        status: "failed",
        error_message: error.message,
      })

      if (isRequired) {
        return this.failProcess(state, ctx, step.id, error, definition)
      }

      // Non-required — continue
      return null
    }
  }

  private async executeCheckpoint<TCtx>(
    definition: ProcessDefinition<TCtx>,
    state: ProcessState,
    ctx: ProcessContext<TCtx>,
    step: StepDefinition<TCtx>,
    _index: number,
  ): Promise<ProcessState | null> {
    if (ctx.promotionMode !== "soc2") {
      // Auto mode — checkpoint is a pass-through
      state.stepStates[step.id] = "completed"
      state.stepResults[step.id] = { passthrough: true, mode: "auto" }
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_step_completed",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, stepType: "checkpoint", mode: "auto" },
        status: "completed",
      })

      return null
    }

    // SOC2 mode — block the process
    state.stepStates[step.id] = "blocked"
    state.status = "paused"
    state.updatedAt = now()

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_checkpoint_blocked",
      agent_id: ctx.agentId,
      workflow_id: state.processId,
      step_id: step.id,
      metadata: {
        stepName: step.name,
        message: "Human approval required to continue",
        promotionMode: ctx.promotionMode,
      },
      status: "pending",
    })

    await this.stateManager.saveState(state)
    // Persist paused snapshot — the run is now in "paused" status
    await this._persistRunSnapshot(state)

    // Return the paused state — caller must call resume()
    return state
  }

  private async executeGate<TCtx>(
    definition: ProcessDefinition<TCtx>,
    state: ProcessState,
    ctx: ProcessContext<TCtx>,
    step: StepDefinition<TCtx>,
    _index: number,
  ): Promise<ProcessState | null> {
    state.stepStates[step.id] = "running"
    state.updatedAt = now()

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_step_started",
      agent_id: ctx.agentId,
      workflow_id: state.processId,
      step_id: step.id,
      metadata: { stepName: step.name, stepType: "gate" },
      status: "pending",
    })

    // ── Scored gate path (AD-P1-03) ──────────────────────────────────────────
    // When a step carries a gateConfig, delegate to quality-gate.evaluateGate()
    // for scored evaluation with bounded retries and mandatory evidence.
    if (step.gateConfig) {
      const gateConfig: GateConfig = {
        threshold: step.gateConfig.threshold,
        maxAttempts: step.gateConfig.maxAttempts,
        evaluate: step.gateConfig.evaluate as GateConfig["evaluate"],
      }

      let gateAttemptResults: GateResult[]
      let finalGateResult: GateResult

      try {
        const outcome = await evaluateGate(
          gateConfig,
          ctx as unknown as ProcessContext,
        )
        gateAttemptResults = outcome.results
        finalGateResult = outcome.finalResult
      } catch (err) {
        // validateGateConfig threw — config is invalid
        const error = err instanceof Error ? err : new Error(String(err))
        state.stepStates[step.id] = "failed"
        state.updatedAt = now()

        await insertEvent({
          group_id: state.groupId,
          event_type: "process_gate_failed",
          agent_id: ctx.agentId,
          workflow_id: state.processId,
          step_id: step.id,
          metadata: { stepName: step.name, reason: "gate_config_invalid" },
          status: "failed",
          error_message: error.message,
        })

        return this.failProcess(state, ctx, step.id, error, definition)
      }

      const isRequired = resolveRequired(step.required, ctx)

      if (finalGateResult.passed) {
        state.stepStates[step.id] = "completed"
        state.stepResults[step.id] = { passed: true, gateResult: finalGateResult, allAttempts: gateAttemptResults }
        state.updatedAt = now()

        await insertEvent({
          group_id: state.groupId,
          event_type: "process_step_completed",
          agent_id: ctx.agentId,
          workflow_id: state.processId,
          step_id: step.id,
          metadata: {
            stepName: step.name,
            stepType: "gate",
            passed: true,
            score: finalGateResult.score,
            evidenceId: finalGateResult.evidenceId,
            attempts: gateAttemptResults.length,
          },
          status: "completed",
        })

        return null
      }

      // Scored gate failed (exhausted attempts or gate_error)
      if (isRequired) {
        state.stepStates[step.id] = "failed"
        state.updatedAt = now()

        await insertEvent({
          group_id: state.groupId,
          event_type: "process_gate_failed",
          agent_id: ctx.agentId,
          workflow_id: state.processId,
          step_id: step.id,
          metadata: {
            stepName: step.name,
            required: true,
            score: finalGateResult.score,
            threshold: finalGateResult.threshold,
            attempts: gateAttemptResults.length,
            reasoning: finalGateResult.reasoning,
          },
          status: "failed",
          error_message: `Scored gate failed: score ${finalGateResult.score} < threshold ${finalGateResult.threshold} after ${gateAttemptResults.length} attempt(s)`,
        })

        return this.failProcess(
          state,
          ctx,
          step.id,
          new GateFailedError(state.processId, step.id),
          definition,
        )
      }

      // Non-required scored gate that failed — skip
      state.stepStates[step.id] = "skipped"
      state.stepResults[step.id] = {
        passed: false,
        skipped: true,
        gateResult: finalGateResult,
        allAttempts: gateAttemptResults,
      }
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_step_skipped",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, stepType: "gate", passed: false, scored: true },
        status: "completed",
      })

      return null
    }

    // ── Boolean gate path (existing behaviour) ────────────────────────────────
    let passed: boolean
    try {
      if (!step.condition) {
        passed = true
      } else {
        passed = await step.condition({ ...ctx, stepResults: { ...state.stepResults } })
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      state.stepStates[step.id] = "failed"
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_gate_failed",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, reason: "condition_threw" },
        status: "failed",
        error_message: error.message,
      })

      return this.failProcess(state, ctx, step.id, error, definition)
    }

    const isRequired = resolveRequired(step.required, ctx)

    if (passed) {
      state.stepStates[step.id] = "completed"
      state.stepResults[step.id] = { passed: true }
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_step_completed",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, stepType: "gate", passed: true },
        status: "completed",
      })

      return null
    }

    // Gate failed
    if (isRequired) {
      state.stepStates[step.id] = "failed"
      state.updatedAt = now()

      await insertEvent({
        group_id: state.groupId,
        event_type: "process_gate_failed",
        agent_id: ctx.agentId,
        workflow_id: state.processId,
        step_id: step.id,
        metadata: { stepName: step.name, required: true },
        status: "failed",
        error_message: `Gate condition returned false for required step ${step.id}`,
      })

      return this.failProcess(
        state,
        ctx,
        step.id,
        new GateFailedError(state.processId, step.id),
        definition,
      )
    }

    // Non-required gate that failed — skip
    state.stepStates[step.id] = "skipped"
    state.stepResults[step.id] = { passed: false, skipped: true }
    state.updatedAt = now()

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_step_skipped",
      agent_id: ctx.agentId,
      workflow_id: state.processId,
      step_id: step.id,
      metadata: { stepName: step.name, stepType: "gate", passed: false },
      status: "completed",
    })

    return null
  }

  // ── Run Snapshot Helper ─────────────────────────────────────────────────────

  /**
   * Persist updated state to process_runs snapshot (optimistic concurrency).
   *
   * Uses the tracked `updated_at` for the run. Silently no-ops if:
   *   - No entry exists in `_runUpdatedAt` (run was not created via run()) — this
   *     handles resume() paths where we didn't call createRun().
   *   - The optimistic lock misses (stale updatedAt) — non-fatal; the event trail
   *     is the source of truth.
   *
   * INVARIANT: The caller must emit the corresponding event BEFORE calling this.
   */
  private async _persistRunSnapshot(state: ProcessState): Promise<void> {
    const expectedUpdatedAt = this._runUpdatedAt.get(state.processId)
    if (!expectedUpdatedAt) return // run not tracked — no-op

    const isTerminal =
      state.status === "completed" ||
      state.status === "failed"

    const updated = await updateRunSnapshot(this.pool, {
      id: state.processId,
      groupId: state.groupId,
      status: state.status,
      stateJson: state as unknown as Record<string, unknown>,
      expectedUpdatedAt,
      completedAt: isTerminal ? (state.completedAt ?? state.updatedAt) : undefined,
    })

    if (updated) {
      this._runUpdatedAt.set(state.processId, updated.updated_at)
    }

    if (isTerminal) {
      this._runUpdatedAt.delete(state.processId)
    }
  }

  // ── Failure Helper ──────────────────────────────────────────────────────────

  private async failProcess<TCtx>(
    state: ProcessState,
    ctx: ProcessContext<TCtx>,
    stepId: string,
    error: Error,
    definition?: ProcessDefinition<TCtx>,
  ): Promise<ProcessState> {
    state.status = "failed"
    state.error = error.message
    state.updatedAt = now()
    state.completedAt = now()

    await insertEvent({
      group_id: state.groupId,
      event_type: "process_failed",
      agent_id: ctx.agentId,
      workflow_id: state.processId,
      step_id: stepId,
      metadata: {
        definitionId: state.definitionId,
        failedStepId: stepId,
        error: error.message,
      },
      status: "failed",
      error_message: error.message,
    })

    await this.stateManager.saveState(state)
    // event-first: event was inserted above; snapshot update comes after
    await this._persistRunSnapshot(state)

    // Lifecycle hook
    if (definition?.onError) {
      try {
        await definition.onError({ ...ctx, stepResults: { ...state.stepResults } }, error)
      } catch {
        // onError errors are non-fatal
      }
    }

    return state
  }
}
