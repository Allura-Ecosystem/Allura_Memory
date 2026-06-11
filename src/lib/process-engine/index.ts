/**
 * Process Engine — Public API
 * Story 12.1: Process-as-Code Engine for Allura Memory
 *
 * Re-exports the full public surface: engine class, state manager,
 * DSL helpers, and all types.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/process-engine is server-side only")
}

// Engine
export { ProcessEngine } from "./engine"

// State manager (for direct access when needed)
export { ProcessStateManager } from "./state-manager"

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

// Error classes
export {
  ProcessEngineError,
  CircuitBreakerTripError,
  CheckpointBlockedError,
  GateFailedError,
} from "./types"
