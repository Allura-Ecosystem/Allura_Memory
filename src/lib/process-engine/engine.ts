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
  GateFailedError,
  ProcessEngineError,
} from "./types"
import type {
  ProcessContext,
  ProcessDefinition,
  ProcessState,
  StepDefinition,
  StepStatus,
} from "./types"

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

    // Persist initial snapshot
    await this.stateManager.saveInitialState(state, {
      id: definition.id,
      name: definition.name,
      group_id: definition.group_id,
      stepCount: definition.steps.length,
      stepIds: definition.steps.map((s) => s.id),
    })

    state.status = "running"
    state.updatedAt = now()

    const ctx = buildContext(definition, state, partialCtx)

    return this.executeFrom(definition, state, ctx, 0)
  }

  /**
   * Resume a paused process (e.g., after a checkpoint is approved).
   * Loads state from PostgreSQL, then continues from the blocked step.
   */
  async resume(
    processId: string,
    approvalData: Record<string, unknown> = {},
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

    // Emit resume event
    await insertEvent({
      group_id: state.groupId,
      event_type: "process_resumed",
      agent_id: "process-engine",
      workflow_id: processId,
      metadata: { approvalData, resumedAt: now() },
      status: "completed",
    })

    state.status = "running"
    state.updatedAt = now()

    // We need to reconstruct the definition to continue — callers must supply
    // it by passing back through run() with a pre-built state. For the resume
    // path, we use a minimal synthetic definition derived from stored metadata.
    // Full replay-from-events (Story 12.2) will improve this.
    //
    // For now: resume is a no-op pass-through that marks the paused step as
    // completed and advances from the next step. The caller is responsible for
    // re-invoking run() after receiving a CheckpointBlockedError.
    //
    // Mark the currently blocked step as completed
    const blockedStep = Object.entries(state.stepStates).find(
      ([, s]) => s === "blocked",
    )
    if (blockedStep) {
      state.stepStates[blockedStep[0]] = "completed"
      state.stepResults[blockedStep[0]] = { approved: true, approvalData }
      state.currentStepIndex += 1
    }

    await this.stateManager.saveState(state)
    return state
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
