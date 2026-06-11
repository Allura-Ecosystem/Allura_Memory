if (typeof window !== "undefined") throw new Error("server-side only")

import type { CompressionOptions, CompressionResult } from "./types.js"
import { estimateTokens } from "./token-estimator.js"
import { applyStructuralLayer } from "./layers/structural.js"
import { applySummarizationLayer } from "./layers/summarize.js"
import { applyDedupLayer } from "./layers/dedup.js"

export type { CompressionOptions, CompressionResult, LayerResult } from "./types.js"
export { estimateTokens } from "./token-estimator.js"

const DEFAULTS: Required<CompressionOptions> = {
  maxTokens: 0, // 0 = no limit
  enableStructural: true,
  enableSummarization: true,
  enableDedup: true,
  summaryMaxLength: 200,
}

/**
 * ContextCompressor — 3-layer context compression.
 *
 * Layer 1: Structural pruning
 *   Remove duplicate system prompts, stale tool results, formatting noise,
 *   and collapsed blank lines.
 *
 * Layer 2: Summarization (local, no LLM)
 *   Truncate oversized paragraphs and merge short-line runs.
 *
 * Layer 3: Semantic dedup
 *   Collapse near-duplicate sentences via Jaccard similarity, keeping
 *   the longest and appending "(and N similar)".
 */
export class ContextCompressor {
  compress(context: string, options?: CompressionOptions): CompressionResult {
    const opts: Required<CompressionOptions> = { ...DEFAULTS, ...options }
    const original = context
    const originalTokenEstimate = estimateTokens(original)
    const layers: CompressionResult["layers"] = []

    let current = context

    // Layer 1: Structural
    if (opts.enableStructural) {
      const { output, result } = applyStructuralLayer(current)
      current = output
      layers.push(result)
    }

    // Layer 2: Summarization
    if (opts.enableSummarization) {
      const { output, result } = applySummarizationLayer(
        current,
        opts.summaryMaxLength
      )
      current = output
      layers.push(result)
    }

    // Layer 3: Semantic dedup
    if (opts.enableDedup) {
      const { output, result } = applyDedupLayer(current)
      current = output
      layers.push(result)
    }

    const compressed = current
    const compressedTokenEstimate = estimateTokens(compressed)

    const reductionPercent =
      originalTokenEstimate === 0
        ? 0
        : Math.round(
            ((originalTokenEstimate - compressedTokenEstimate) /
              originalTokenEstimate) *
              100
          )

    return {
      original,
      compressed,
      originalTokenEstimate,
      compressedTokenEstimate,
      reductionPercent,
      layers,
    }
  }
}
