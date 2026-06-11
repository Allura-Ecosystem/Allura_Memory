/**
 * Harness Adapter — Generic Fallback
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * Fallback adapter used when no specific harness is detected.
 * Declares a conservative capability set and delegates tool calls
 * via a basic not-implemented sentinel. Callers can use this adapter
 * as a baseline when no harness-specific behaviour is required.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/harness-adapter/adapters/generic is server-side only")
}

import type { HarnessAdapter, HarnessCapabilities, HarnessType } from "../types"

export class GenericAdapter implements HarnessAdapter {
  readonly type: HarnessType = "generic"
  readonly name = "Generic"

  /**
   * Conservative capability set — assumes the least capable harness.
   * Specific adapters override individual flags where they are known.
   */
  readonly capabilities: HarnessCapabilities = {
    supportsStreaming: false,
    supportsMCP: false,
    supportsToolUse: false,
    supportsFileEdit: false,
    maxContextTokens: 128_000,
  }

  /**
   * Generic fallback — tool execution is not harness-specific.
   * Returns a sentinel so callers can handle the no-harness case.
   */
  executeTool(
    toolName: string,
    _args: Record<string, unknown>,
  ): Promise<unknown> {
    return Promise.resolve({
      tool: toolName,
      status: "not_implemented",
      harness: this.type,
    })
  }

  /**
   * The generic adapter is always available as the fallback.
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * No harness-specific configuration.
   */
  getConfig(): Record<string, unknown> {
    return {}
  }
}
