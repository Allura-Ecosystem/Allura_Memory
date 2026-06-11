/**
 * Harness Adapter — Cursor Stub
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * Stub adapter for the Cursor AI editor harness. Cursor provides a
 * 200k-token context window and MCP support via its extension API.
 * Full tool execution is not yet implemented.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/harness-adapter/adapters/cursor is server-side only")
}

import { existsSync } from "node:fs"
import type { HarnessAdapter, HarnessCapabilities, HarnessType } from "../types"

export class CursorAdapter implements HarnessAdapter {
  readonly type: HarnessType = "cursor"
  readonly name = "Cursor"

  readonly capabilities: HarnessCapabilities = {
    supportsStreaming: true,
    supportsMCP: true,
    supportsToolUse: true,
    supportsFileEdit: true,
    maxContextTokens: 200_000,
  }

  /**
   * Stub — Cursor tool execution not yet implemented.
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
   * Returns true when the CURSOR_SESSION env var is set or the
   * .cursor/ directory exists in the working directory.
   */
  isAvailable(): boolean {
    return Boolean(process.env.CURSOR_SESSION) || existsSync(".cursor/")
  }

  /**
   * Returns Cursor-specific configuration.
   */
  getConfig(): Record<string, unknown> {
    return {
      settingsPath: ".cursor/",
      mcpEnabled: true,
    }
  }
}
