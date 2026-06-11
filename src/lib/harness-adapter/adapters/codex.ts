/**
 * Harness Adapter — Codex CLI Stub
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * Stub adapter for the Codex CLI harness. Full tool execution is not
 * yet implemented; executeTool returns a not-implemented sentinel so
 * callers can detect the gap and fall back gracefully.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/harness-adapter/adapters/codex is server-side only")
}

import { existsSync } from "node:fs"
import type { HarnessAdapter, HarnessCapabilities, HarnessType } from "../types"

export class CodexAdapter implements HarnessAdapter {
  readonly type: HarnessType = "codex"
  readonly name = "Codex CLI"

  readonly capabilities: HarnessCapabilities = {
    supportsStreaming: false,
    supportsMCP: true,
    supportsToolUse: true,
    supportsFileEdit: true,
    maxContextTokens: 200_000,
  }

  /**
   * Stub — Codex tool execution not yet implemented.
   * Returns a sentinel value so callers can detect the gap.
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
   * Returns true when the CODEX_CLI env var is set or the
   * .codex/ directory exists in the working directory.
   */
  isAvailable(): boolean {
    return Boolean(process.env.CODEX_CLI) || existsSync(".codex/")
  }

  /**
   * Returns Codex-specific configuration.
   */
  getConfig(): Record<string, unknown> {
    return {
      settingsPath: ".codex/",
      mcpEnabled: true,
    }
  }
}
