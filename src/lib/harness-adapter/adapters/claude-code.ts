/**
 * Harness Adapter — Claude Code Implementation
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * Full adapter for the Claude Code harness. Claude Code exposes a 1M-token
 * context window, native MCP support, and direct file-edit capabilities.
 * Allura tools map 1:1 to the MCP surface — executeTool delegates to MCP
 * rather than calling tools directly.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/harness-adapter/adapters/claude-code is server-side only")
}

import { existsSync } from "node:fs"
import type { HarnessAdapter, HarnessCapabilities, HarnessType } from "../types"

export class ClaudeCodeAdapter implements HarnessAdapter {
  readonly type: HarnessType = "claude-code"
  readonly name = "Claude Code"

  readonly capabilities: HarnessCapabilities = {
    supportsStreaming: true,
    supportsMCP: true,
    supportsToolUse: true,
    supportsFileEdit: true,
    maxContextTokens: 1_000_000,
  }

  /**
   * Execute a tool call through Claude Code.
   *
   * Claude Code tools map 1:1 to Allura tools via the MCP surface.
   * In practice the process engine calls this method; the harness
   * handles the actual dispatch. The return value signals delegation.
   */
  executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    // Claude Code dispatches via MCP — signal delegation to caller
    return Promise.resolve({
      tool: toolName,
      args,
      status: "delegated_to_mcp",
    })
  }

  /**
   * Returns true when Claude Code launcher env var is set or the
   * .claude/ settings directory exists in the working directory.
   */
  isAvailable(): boolean {
    return (
      Boolean(process.env.CLAUDE_CODE) || existsSync(".claude/settings.json")
    )
  }

  /**
   * Returns Claude Code-specific configuration.
   * No secrets are included in this config object.
   */
  getConfig(): Record<string, unknown> {
    return {
      settingsPath: ".claude/settings.json",
      mcpEnabled: true,
    }
  }
}
