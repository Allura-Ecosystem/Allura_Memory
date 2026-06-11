/**
 * Process Engine — Core Type Definitions
 * Story 12.1: Process-as-Code Engine for Allura Memory
 *
 * Types for defining, executing, and tracking multi-step processes
 * that emit append-only events to PostgreSQL.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("process-engine/types is server-side only")
}

// ── Step & Process Status ─────────────────────────────────────────────────────

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked"

export type ProcessStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "paused"

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Runtime context passed to every step executor and condition.
 * TCtx is the caller-defined metadata bag for the specific process.
 */
export interface ProcessContext<TCtx = Record<string, unknown>> {
  /** Unique identifier for this process run */
  processId: string
  /** Tenant isolation key — must match ^allura-[a-z0-9-]+ */
  groupId: string
  /** Agent or system executing the process */
  agentId: string
  /** Accumulated results from completed steps, keyed by step.id */
  stepResults: Record<string, unknown>
  /** Caller-provided metadata carried through the whole process */
  metadata: TCtx
  /** SOC2 mode: checkpoints block; auto mode: checkpoints pass through */
  promotionMode: "soc2" | "auto"
}

// ── Step Definition ───────────────────────────────────────────────────────────

/**
 * A single unit of work within a process.
 *
 * - type "step"       — executes work, emits started/completed/failed events
 * - type "checkpoint" — in soc2 mode: blocks the process and emits
 *                       process_checkpoint_blocked; in auto mode: pass-through
 * - type "gate"       — evaluates condition(); if false, process fails (or
 *                       skips the step when required resolves to false)
 */
export interface StepDefinition<TCtx = Record<string, unknown>> {
  /** Unique identifier within this process (used as step_id in events) */
  id: string
  /** Human-readable label */
  name: string
  /** Step kind */
  type: "step" | "checkpoint" | "gate"
  /** Work to execute (step/checkpoint types) */
  execute?: (ctx: ProcessContext<TCtx>) => Promise<unknown>
  /** Condition to evaluate (gate type); returning false fails or skips */
  condition?: (ctx: ProcessContext<TCtx>) => boolean | Promise<boolean>
  /**
   * Whether this step is required.
   * - true/undefined — failure causes the process to fail
   * - false          — failure is treated as a skip (process continues)
   * - function       — evaluated at runtime
   */
  required?: boolean | ((ctx: ProcessContext<TCtx>) => boolean)
  /** Step IDs that must complete successfully before this step runs */
  dependsOn?: string[]
}

// ── Process Definition ────────────────────────────────────────────────────────

/**
 * A complete process definition: ordered steps with lifecycle hooks.
 */
export interface ProcessDefinition<TCtx = Record<string, unknown>> {
  /** Stable identifier for this process type */
  id: string
  /** Human-readable name */
  name: string
  /** Tenant isolation key — must match ^allura-[a-z0-9-]+ */
  group_id: string
  /** Ordered list of steps to execute */
  steps: StepDefinition<TCtx>[]
  /** Called once after all steps complete successfully */
  onComplete?: (ctx: ProcessContext<TCtx>) => Promise<void>
  /** Called if any step fails and is required */
  onError?: (ctx: ProcessContext<TCtx>, error: Error) => Promise<void>
}

// ── Process State ─────────────────────────────────────────────────────────────

/**
 * Mutable runtime state of a process run.
 * Persisted as PostgreSQL events — never mutated in-place.
 */
export interface ProcessState {
  /** Unique identifier for this process run */
  processId: string
  /** ID of the ProcessDefinition this run is based on */
  definitionId: string
  /** Tenant isolation key */
  groupId: string
  /** Current overall status */
  status: ProcessStatus
  /** 0-based index of the step currently being processed */
  currentStepIndex: number
  /** Per-step status, keyed by step.id */
  stepStates: Record<string, StepStatus>
  /** Per-step results, keyed by step.id */
  stepResults: Record<string, unknown>
  /** ISO-8601 timestamp when the process started */
  startedAt: string
  /** ISO-8601 timestamp when the state was last updated */
  updatedAt: string
  /** ISO-8601 timestamp when the process completed (success or failure) */
  completedAt?: string
  /** Error message if the process failed */
  error?: string
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class ProcessEngineError extends Error {
  constructor(
    message: string,
    public readonly processId: string,
    public readonly stepId?: string,
  ) {
    super(message)
    this.name = "ProcessEngineError"
  }
}

export class CircuitBreakerTripError extends ProcessEngineError {
  constructor(processId: string, groupId: string) {
    super(`Circuit breaker is open for group ${groupId}`, processId)
    this.name = "CircuitBreakerTripError"
  }
}

export class CheckpointBlockedError extends ProcessEngineError {
  constructor(processId: string, stepId: string) {
    super(`Process paused at checkpoint ${stepId} — awaiting human approval`, processId, stepId)
    this.name = "CheckpointBlockedError"
  }
}

export class GateFailedError extends ProcessEngineError {
  constructor(processId: string, stepId: string) {
    super(`Gate condition failed for step ${stepId}`, processId, stepId)
    this.name = "GateFailedError"
  }
}
