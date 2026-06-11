/**
 * @allura/sdk — Public API
 * Story 12.3: Standalone SDK for governed Allura Memory operations.
 *
 * This module is the single entry point for consumers of @allura/sdk.
 *
 * @example
 * import { AlluraClient, AlluraSDKError } from "@allura/sdk"
 *
 * const client = new AlluraClient({
 *   baseUrl: "http://localhost:3100",
 *   groupId: "allura-system",
 * })
 *
 * try {
 *   const mem = await client.memory.add({
 *     content: "Task complete: story 12.3 shipped",
 *     userId: "woz-builder",
 *   })
 *   console.log("Stored:", mem.id)
 * } catch (err) {
 *   if (err instanceof AlluraSDKError) {
 *     console.error(`SDK error [${err.code}]:`, err.message)
 *   }
 * }
 */

// ── Client ────────────────────────────────────────────────────────────────────

export { AlluraClient } from "./client"
export type { AlluraClientConfig } from "./client"

// ── Sub-clients ───────────────────────────────────────────────────────────────

export { MemoryClient } from "./memory"
export { ProcessClient } from "./process"

// ── Types ─────────────────────────────────────────────────────────────────────

export { AlluraSDKError } from "./types"
export type { MemoryResult } from "./types"

// ── Validation Helpers (exported for external use) ────────────────────────────

export { validateGroupId, requireField } from "./validation"

// ── Process DSL (server-only — throws in browser contexts) ───────────────────
//
// These re-exports allow server-side consumers to use the DSL directly
// without importing from @/lib/process-engine. Browser bundlers should
// tree-shake these when unused; if imported in a browser context they will
// throw due to the server-only guard in the process engine.

export { defineProcess, step, checkpoint, gate } from "../lib/process-engine/helpers"

export type {
  ProcessDefinition,
  StepDefinition,
  ProcessContext,
  ProcessState,
  StepStatus,
  ProcessStatus,
} from "../lib/process-engine/types"

// ── Process Error Classes (safe to re-export in any environment) ──────────────
//
// These error classes have no server-only dependencies and may be imported
// safely in any environment for isinstance checks against thrown errors.

export {
  ProcessEngineError,
  CircuitBreakerTripError,
  CheckpointBlockedError,
  GateFailedError,
} from "../lib/process-engine/types"
