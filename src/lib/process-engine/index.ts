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
} from "./types"
