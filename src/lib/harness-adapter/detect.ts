/**
 * Harness Adapter — Auto-Detection
 * Story 12.7: Multi-Harness Adapter Interface for Allura Memory
 *
 * Detects which AI agent harness is currently active by inspecting
 * environment variables and filesystem markers. Server-only.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("@/lib/harness-adapter/detect is server-side only")
}

import { existsSync } from "node:fs"
import type { HarnessDetectionResult } from "./types"

/**
 * Detect which AI agent harness is currently active.
 *
 * Checks environment variables first (authoritative when set by the harness
 * launcher), then falls back to filesystem markers.
 *
 * Returns a result with confidence 0–1 and a human-readable evidence string.
 * Falls back to "generic" with confidence 0.5 when nothing matches.
 */
export function detectHarness(): HarnessDetectionResult {
  // Claude Code — env set by `claude` launcher or .claude/ settings dir present
  if (process.env.CLAUDE_CODE ?? existsSync(".claude/settings.json")) {
    return {
      detected: "claude-code",
      confidence: 0.95,
      evidence: "CLAUDE_CODE env or .claude/ directory",
    }
  }

  // Codex CLI — env set by `codex` launcher or .codex/ directory present
  if (process.env.CODEX_CLI ?? existsSync(".codex/")) {
    return {
      detected: "codex",
      confidence: 0.9,
      evidence: "CODEX_CLI env or .codex/ directory",
    }
  }

  // Cursor — env set by Cursor editor or .cursor/ directory present
  if (process.env.CURSOR_SESSION ?? existsSync(".cursor/")) {
    return {
      detected: "cursor",
      confidence: 0.9,
      evidence: "CURSOR_SESSION env or .cursor/ directory",
    }
  }

  return {
    detected: "generic",
    confidence: 0.5,
    evidence: "no specific harness detected",
  }
}
