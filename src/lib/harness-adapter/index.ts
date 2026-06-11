/**
 * Harness Adapter — Public API
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * Re-exports types, detection, and concrete adapters. Provides
 * getAdapter() as the main entry point for callers that want the
 * correct adapter for the current environment without knowing which
 * harness is active.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/harness-adapter is server-side only")
}

// Detection
export { detectHarness } from "./detect"

// Concrete adapters
export { ClaudeCodeAdapter } from "./adapters/claude-code"
export { CodexAdapter } from "./adapters/codex"
export { CursorAdapter } from "./adapters/cursor"
export { GenericAdapter } from "./adapters/generic"

// Types — exported for SDK consumers
export type {
  HarnessAdapter,
  HarnessType,
  HarnessCapabilities,
  HarnessDetectionResult,
} from "./types"

// ── Factory ────────────────────────────────────────────────────────────────────

import { detectHarness } from "./detect"
import { ClaudeCodeAdapter } from "./adapters/claude-code"
import { CodexAdapter } from "./adapters/codex"
import { CursorAdapter } from "./adapters/cursor"
import { GenericAdapter } from "./adapters/generic"
import type { HarnessAdapter } from "./types"

/**
 * Return the adapter for the current environment.
 *
 * Auto-detects the active harness via detectHarness() and returns the
 * matching concrete adapter. Falls back to GenericAdapter when no
 * harness-specific environment is detected.
 */
export function getAdapter(): HarnessAdapter {
  const detection = detectHarness()
  switch (detection.detected) {
    case "claude-code":
      return new ClaudeCodeAdapter()
    case "codex":
      return new CodexAdapter()
    case "cursor":
      return new CursorAdapter()
    default:
      return new GenericAdapter()
  }
}
