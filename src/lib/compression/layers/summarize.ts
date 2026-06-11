if (typeof window !== "undefined") throw new Error("server-side only")

import type { LayerResult } from "../types.js"

const DEFAULT_MAX_LENGTH = 200

/**
 * Layer 2 — Local summarization (no LLM call).
 *
 * - Splits content into paragraphs on double-newline boundaries
 * - Paragraphs over `maxLength` chars are truncated with a note
 * - Consecutive short lines (< 80 chars each) are joined into one paragraph
 *
 * Brain-backed LLM summarization is a future enhancement.
 */
export function applySummarizationLayer(
  input: string,
  summaryMaxLength: number = DEFAULT_MAX_LENGTH
): { output: string; result: LayerResult } {
  const inputLength = input.length
  let itemsRemoved = 0

  // Split on double (or more) newlines to get paragraph blocks
  const paragraphs = input.split(/\n{2,}/)

  const processed: string[] = []

  let shortLineBuffer: string[] = []

  const flushBuffer = (): void => {
    if (shortLineBuffer.length === 0) return
    const joined = shortLineBuffer.join(" ")
    processed.push(joined)
    shortLineBuffer = []
  }

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (trimmed === "") continue

    // Check if this paragraph is itself a run of short lines
    const lines = trimmed.split("\n")
    const allShort = lines.every((l) => l.trim().length < 80)

    if (allShort && lines.length > 1) {
      // Accumulate into buffer to merge with neighbours
      for (const line of lines) {
        const t = line.trim()
        if (t.length > 0) shortLineBuffer.push(t)
      }
      continue
    }

    // Flush any pending short-line buffer before a non-short paragraph
    flushBuffer()

    if (trimmed.length > summaryMaxLength) {
      const truncated = trimmed.slice(0, summaryMaxLength)
      const remaining = trimmed.length - summaryMaxLength
      processed.push(`${truncated}... [truncated, ${remaining} chars]`)
      itemsRemoved++
    } else {
      processed.push(trimmed)
    }
  }

  flushBuffer()

  const output = processed.join("\n\n").trim()

  return {
    output,
    result: {
      name: "summarization",
      inputLength,
      outputLength: output.length,
      itemsRemoved,
    },
  }
}
