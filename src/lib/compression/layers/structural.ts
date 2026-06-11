if (typeof window !== "undefined") throw new Error("server-side only")

import type { LayerResult } from "../types.js"

// Hash a string to a short fingerprint for dedup tracking
function fingerprint(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return String(h >>> 0)
}

const SYSTEM_PROMPT_PATTERN =
  /(<system>[\s\S]*?<\/system>|<\|system\|>[\s\S]*?<\|end\|>|\[SYSTEM\][\s\S]*?\[\/SYSTEM\])/gi

const TOOL_RESULT_BLOCK_PATTERN =
  /(<tool_result[\s\S]*?<\/tool_result>|<result[\s\S]*?<\/result>)/gi

const FORMATTING_NOISE_PATTERN =
  /<\/?(?:b|i|em|strong|span|div|p|br\s*\/?)>/gi

/**
 * Layer 1 — Structural pruning.
 *
 * Removes:
 * - Duplicate system prompt blocks (keeps first occurrence)
 * - Empty / whitespace-only lines (collapses runs to single blank)
 * - Repeated tool result blocks that are identical (content-hash dedup)
 * - Inline formatting noise tags (<b>, <i>, <em>, <strong>, <span>...)
 */
export function applyStructuralLayer(input: string): {
  output: string
  result: LayerResult
} {
  const inputLength = input.length
  let itemsRemoved = 0
  let text = input

  // 1. Deduplicate system prompt blocks (keep first)
  const seenSystemBlocks = new Set<string>()
  text = text.replace(SYSTEM_PROMPT_PATTERN, (match) => {
    const fp = fingerprint(match)
    if (seenSystemBlocks.has(fp)) {
      itemsRemoved++
      return ""
    }
    seenSystemBlocks.add(fp)
    return match
  })

  // 2. Deduplicate identical tool result blocks (keep first)
  const seenToolResults = new Set<string>()
  text = text.replace(TOOL_RESULT_BLOCK_PATTERN, (match) => {
    const fp = fingerprint(match)
    if (seenToolResults.has(fp)) {
      itemsRemoved++
      return ""
    }
    seenToolResults.add(fp)
    return match
  })

  // 3. Strip inline HTML/XML formatting noise tags
  const beforeNoise = text.length
  text = text.replace(FORMATTING_NOISE_PATTERN, "")
  if (text.length < beforeNoise) itemsRemoved++

  // 4. Collapse runs of blank lines to a single blank line
  const beforeCollapse = text.length
  text = text.replace(/\n{3,}/g, "\n\n")
  if (text.length < beforeCollapse) itemsRemoved++

  // 5. Remove lines that are only whitespace
  const lines = text.split("\n")
  const cleaned: string[] = []
  for (const line of lines) {
    if (line.trim() === "") {
      // Keep at most one blank line in a row
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() !== "") {
        cleaned.push("")
      }
    } else {
      cleaned.push(line)
    }
  }
  text = cleaned.join("\n").trim()

  return {
    output: text,
    result: {
      name: "structural",
      inputLength,
      outputLength: text.length,
      itemsRemoved,
    },
  }
}
