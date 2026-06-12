/**
 * Process Engine — Public API
 * Story 12.1 / 12.2: Process-as-Code Engine + Event-Sourced Replay
 *
 * Re-exports the full public surface: engine class, state manager,
 * replay engine, DSL helpers, and all types.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/process-engine is server-side only")
}

// Engine
export { ProcessEngine } from "./engine"

// State manager (for direct access when needed)
export { ProcessStateManager } from "./state-manager"

// Replay engine (Story 12.2)
export { ReplayEngine } from "./replay"

// Run manager (Phase 1 / AD-P1-02)
export { createRun, getRun, listRuns, updateRunSnapshot } from "./run-manager"
export type { CreateRunParams, GetRunParams, ListRunsParams, UpdateRunSnapshotParams } from "./run-manager"

// Definition registry (Phase 1 / AD-P1-01)
export { createDefinition, getDefinition, getLatestDefinition, listDefinitions, softDeleteDefinition } from "./definition-registry"

// Quality gate (Phase 1 / AD-P1-03)
export { evaluateGate, extractGateConfig } from "./quality-gate"
export type { GateConfig } from "./quality-gate"

// Doctor (Phase 1 / AD-P1-04)
export { diagnoseRun, runDoctorCycle } from "./doctor"

// DSL helpers
export { defineProcess, step, checkpoint, gate } from "./helpers"

// Types
export type {
  StepStatus,
  ProcessStatus,
  ProcessContext,
  StepDefinition,
  ProcessDefinition,
  ProcessState,
  GateResult,
  DoctorFinding,
  DoctorCondition,
  StoredDefinition,
  StoredRun,
} from "./types"

// Replay types (Story 12.2)
export type {
  ReplayOptions,
  ReplayTimeline,
  ReplayTimelineStep,
  ReplayDiff,
} from "./replay"

// Error classes
export {
  ProcessEngineError,
  CircuitBreakerTripError,
  CheckpointBlockedError,
  GateFailedError,
  DefinitionRevisionError,
} from "./types"

// DAG resolver (Story 12.6)
export { DAGResolver } from "./dag"
export type { DAGNode, DAGValidationResult } from "./dag"
