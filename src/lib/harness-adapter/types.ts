/**
 * Harness Adapter — Core Type Definitions
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * Defines the common interface that lets the process engine and SDK
 * work across different AI agent harnesses (Claude Code, Codex, Cursor, etc.)
 * without coupling to any harness-specific implementation.
 */

// ── Harness Identity ──────────────────────────────────────────────────────────

export type HarnessType = "claude-code" | "codex" | "cursor" | "generic"

// ── Capabilities ──────────────────────────────────────────────────────────────

/**
 * Declares what a harness can do at runtime.
 * Consumers use this to decide whether to activate advanced features.
 */
export interface HarnessCapabilities {
  /** Whether the harness streams tool output incrementally */
  supportsStreaming: boolean
  /** Whether the harness exposes an MCP surface for tool calls */
  supportsMCP: boolean
  /** Whether the harness can invoke structured tool calls */
  supportsToolUse: boolean
  /** Whether the harness has direct file-edit capabilities */
  supportsFileEdit: boolean
  /** Maximum context window in tokens for this harness */
  maxContextTokens: number
}

// ── Adapter Interface ─────────────────────────────────────────────────────────

/**
 * Adapter for a specific AI agent harness.
 *
 * Adapters are lightweight shims — they translate Allura tool names to
 * harness-specific names and carry capability metadata. They do NOT
 * implement the actual tool logic; that remains in the process engine.
 */
export interface HarnessAdapter {
  /** Canonical harness identifier */
  type: HarnessType
  /** Human-readable name */
  name: string
  /** Static capability declaration for this harness */
  capabilities: HarnessCapabilities

  /**
   * Execute a tool call through this harness.
   * Adapters translate Allura tool names to harness-specific names.
   * In most cases the call is delegated to MCP — the return value
   * is harness-specific and should be treated as opaque.
   */
  executeTool(toolName: string, args: Record<string, unknown>): Promise<unknown>

  /**
   * Check whether this harness is currently active and available.
   * Detection is based on environment variables and filesystem markers.
   */
  isAvailable(): boolean

  /**
   * Return harness-specific configuration (e.g. settings paths, flags).
   * Values must not include secrets.
   */
  getConfig(): Record<string, unknown>
}

// ── Detection Result ──────────────────────────────────────────────────────────

/**
 * Result of auto-detecting the active harness from the environment.
 */
export interface HarnessDetectionResult {
  /** The harness type that was detected */
  detected: HarnessType
  /** Confidence in the detection, 0–1 */
  confidence: number
  /** Human-readable description of what triggered the detection */
  evidence: string
}
