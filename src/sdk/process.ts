/**
 * @allura/sdk — Process Client
 * Story 12.3: Re-exports the process DSL helpers as a typed SDK surface.
 *
 * The process client wraps the DSL helpers for ergonomic access via the
 * AlluraClient. Full HTTP-based process execution will be added in a future
 * story when a /api/process endpoint exists.
 *
 * IMPORTANT: The DSL helpers (defineProcess, step, checkpoint, gate) are
 * server-only. Importing them from this module in a browser context will
 * throw at runtime due to server-only guards in the process engine.
 *
 * For client-side usage, import only the type exports from this module.
 */

import type { AlluraClientConfig } from "./client"

// ── Re-export process DSL types (environment-agnostic) ───────────────────────

export type {
  ProcessDefinition,
  StepDefinition,
  ProcessContext,
  ProcessState,
  StepStatus,
  ProcessStatus,
} from "../lib/process-engine/types"

// ── ProcessClient ─────────────────────────────────────────────────────────────

/**
 * ProcessClient provides access to the process DSL helpers.
 *
 * The helpers are lazy-loaded via dynamic import so that bundlers targeting
 * browser environments can tree-shake them out when unused.
 *
 * Server-only note: defineProcess, step, checkpoint, and gate will throw
 * in browser environments due to the server-only guard in the process engine.
 */
export class ProcessClient {
  constructor(
    // config retained for future HTTP process execution endpoint
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly _config: AlluraClientConfig,
  ) {}

  /**
   * Get the process DSL helpers.
   *
   * This is an async accessor to enable lazy loading.
   * In server environments, these helpers are available synchronously via:
   *   import { defineProcess, step, checkpoint, gate } from "@allura/sdk"
   *
   * @throws Error in browser environments (server-only guard)
   */
  async helpers(): Promise<{
    defineProcess: typeof import("../lib/process-engine/helpers").defineProcess
    step: typeof import("../lib/process-engine/helpers").step
    checkpoint: typeof import("../lib/process-engine/helpers").checkpoint
    gate: typeof import("../lib/process-engine/helpers").gate
  }> {
    const mod = await import("../lib/process-engine/helpers")
    return {
      defineProcess: mod.defineProcess,
      step: mod.step,
      checkpoint: mod.checkpoint,
      gate: mod.gate,
    }
  }
}
