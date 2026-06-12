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
  /**
   * Optional scored quality-gate configuration (AD-P1-03).
   *
   * When present on a gate-type step, the engine delegates to
   * quality-gate.evaluateGate() instead of the boolean `condition` path.
   * The `evaluate` function returns a numeric score (0-1) with evidence.
   * Gates below threshold retry up to `maxAttempts` times.
   *
   * Omit to use the standard boolean `condition` gate behaviour.
   */
  gateConfig?: {
    threshold: number
    maxAttempts: number
    evaluate: (ctx: ProcessContext<TCtx>) => Promise<{ score: number; evidenceId: string; reasoning: string }>
  }
}

// ── Process Definition ────────────────────────────────────────────────────────

/**
 * A complete process definition: ordered steps with lifecycle hooks.
 */
export interface ProcessDefinition<TCtx = Record<string, unknown>> {
  /** Stable identifier for this process type */
  id: string
  /**
   * Immutable revision of this definition. A run pins the revision it started
   * with; resume must be handed the exact same id + revision to continue
   * (Story 12.2, AD-35). Defaults to "1" when omitted.
   */
  revision?: string
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
  /**
   * Immutable revision of the ProcessDefinition pinned at run start.
   * Resume validates the supplied definition against this value.
   */
  definitionRevision?: string
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

// ── Step Result ──────────────────────────────────────────────────────────────

/**
 * Result returned by a step's execute() function.
 * Engine stores this in ProcessState.stepResults[stepId].
 */
export interface StepResult {
  /** Step-specific return value */
  output: unknown
  /** Optional evidence artifacts produced by this step */
  artifactRefs?: string[]
}

// ── Quality Gate Result ─────────────────────────────────────────────────────

/**
 * Result returned by a scored quality gate (AD-P1-03).
 * Gates return a score (0-1) with evidence. Low scores retry; errors terminate.
 */
export interface GateResult {
  /** Quality score (0-1) */
  score: number
  /** Minimum score to pass */
  threshold: number
  /** Whether the gate passed (score >= threshold) */
  passed: boolean
  /** 1-based attempt number */
  attempt: number
  /** Maximum allowed attempts */
  maxAttempts: number
  /** Link to evidence packet — MANDATORY for passing gates */
  evidenceId: string
  /** Human-readable explanation of the score */
  reasoning: string
}

// ── Doctor Finding ──────────────────────────────────────────────────────────

/**
 * A health finding from the doctor module (AD-P1-04).
 * Phase 1 ships with 3 conditions; 5 more deferred to Phase 2-3.
 */
export type DoctorCondition =
  | "stale"
  | "revision_drifted"
  | "partially_persisted"

export interface DoctorFinding {
  /** Run that the finding applies to */
  runId: string
  /** Which condition was detected */
  condition: DoctorCondition
  /** Finding severity */
  severity: "info" | "warning" | "critical"
  /** Human-readable description */
  detail: string
  /** Recommended next action — repair_with_approval never auto-downgrades status */
  recommendedAction: "flag" | "escalate" | "repair_with_approval"
  /** When the condition was detected (ISO-8601) */
  detectedAt: string
}

// ── Stored Definition Record ────────────────────────────────────────────────

/**
 * A process definition record as stored in PostgreSQL (AD-P1-01).
 * Definitions are tenant-scoped, versioned, and soft-deletable.
 */
export interface StoredDefinition {
  /** Stable identifier for this process type */
  id: string
  /** Immutable revision number (auto-incremented within tenant) */
  revision: number
  /** Tenant isolation key */
  group_id: string
  /** Human-readable name */
  name: string
  /** Full definition as JSON (ProcessDefinition shape) */
  definition_json: Record<string, unknown>
  /** When this revision was created */
  created_at: string
  /** Soft-delete timestamp (null = active) */
  deleted_at: string | null
}

// ── Stored Run Record ───────────────────────────────────────────────────────

/**
 * A process run snapshot as stored in PostgreSQL (AD-P1-02).
 * Read optimization — events are the source of truth.
 */
export interface StoredRun {
  /** Unique run identifier */
  id: string
  /** Definition this run is pinned to */
  definition_id: string
  /** Definition revision pinned at run start */
  definition_revision: number
  /** Tenant isolation key */
  group_id: string
  /** Current run status */
  status: ProcessStatus
  /** Serialized ProcessState */
  state_json: Record<string, unknown>
  /** Actor who started the run */
  actor_id: string | null
  /** When the run started */
  started_at: string
  /** Last snapshot update (used for optimistic concurrency) */
  updated_at: string
  /** When the run completed (null if still active) */
  completed_at: string | null
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

/**
 * Raised when resume() is handed a definition whose id/revision does not match
 * the one the run was pinned to (or no definition at all). This is the explicit
 * "doctor finding" required by Story 12.2 — resume must never silently continue
 * against a definition that has drifted.
 */
export class DefinitionRevisionError extends ProcessEngineError {
  constructor(
    processId: string,
    public readonly expected: { id: string; revision: string },
    public readonly actual: { id: string; revision: string },
  ) {
    super(
      `Definition mismatch for process ${processId}: pinned ${expected.id}@${expected.revision} ` +
        `but resume was given ${actual.id}@${actual.revision}`,
      processId,
    )
    this.name = "DefinitionRevisionError"
  }
}
