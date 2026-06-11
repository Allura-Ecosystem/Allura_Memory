import { describe, it, expect } from "vitest"
import { ContextCompressor } from "./index.js"
import { applyStructuralLayer } from "./layers/structural.js"
import { applySummarizationLayer } from "./layers/summarize.js"
import { applyDedupLayer } from "./layers/dedup.js"
import { estimateTokens } from "./token-estimator.js"

// ---------------------------------------------------------------------------
// Token estimator
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0)
  })

  it("approximates at ~4 chars per token", () => {
    // 40 chars → ceil(40/4) = 10
    expect(estimateTokens("a".repeat(40))).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Layer 1: Structural pruning
// ---------------------------------------------------------------------------

describe("structural layer", () => {
  it("removes duplicate system prompt blocks", () => {
    const block = "<system>You are a helpful assistant.</system>"
    const input = `${block}\n\nSome content here.\n\n${block}`
    const { output, result } = applyStructuralLayer(input)
    // Second occurrence should be removed
    const occurrences = (output.match(/<system>/g) ?? []).length
    expect(occurrences).toBe(1)
    expect(result.itemsRemoved).toBeGreaterThanOrEqual(1)
  })

  it("collapses runs of empty lines to a single blank line", () => {
    const input = "Line one\n\n\n\n\nLine two"
    const { output } = applyStructuralLayer(input)
    // No more than two consecutive newlines
    expect(output).not.toMatch(/\n{3,}/)
  })

  it("removes identical tool result blocks", () => {
    const block =
      "<tool_result><result>42</result></tool_result>"
    const input = `Question\n\n${block}\n\nMiddle\n\n${block}`
    const { output, result } = applyStructuralLayer(input)
    const count = (output.match(/<tool_result>/g) ?? []).length
    expect(count).toBe(1)
    expect(result.itemsRemoved).toBeGreaterThanOrEqual(1)
  })

  it("strips formatting noise tags", () => {
    const input = "Hello <b>world</b> and <em>friends</em>."
    const { output } = applyStructuralLayer(input)
    expect(output).not.toMatch(/<b>|<\/b>|<em>|<\/em>/)
    expect(output).toContain("world")
    expect(output).toContain("friends")
  })

  it("reports correct layer name", () => {
    const { result } = applyStructuralLayer("hello")
    expect(result.name).toBe("structural")
  })
})

// ---------------------------------------------------------------------------
// Layer 2: Summarization
// ---------------------------------------------------------------------------

describe("summarization layer", () => {
  it("truncates paragraphs exceeding summaryMaxLength", () => {
    const longParagraph = "x".repeat(500)
    const { output, result } = applySummarizationLayer(longParagraph, 200)
    expect(output).toContain("[truncated")
    expect(output.length).toBeLessThan(longParagraph.length)
    expect(result.itemsRemoved).toBeGreaterThanOrEqual(1)
  })

  it("preserves short paragraphs unchanged", () => {
    const short = "This is a short paragraph."
    const { output } = applySummarizationLayer(short, 200)
    expect(output).toContain(short)
  })

  it("reports correct layer name", () => {
    const { result } = applySummarizationLayer("hello")
    expect(result.name).toBe("summarization")
  })

  it("handles empty input", () => {
    const { output } = applySummarizationLayer("", 200)
    expect(output).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Layer 3: Semantic dedup
// ---------------------------------------------------------------------------

describe("dedup layer", () => {
  it("groups near-duplicate sentences and keeps the longest", () => {
    const input =
      "The quick brown fox jumps over the lazy dog. " +
      "The quick brown fox jumped over the lazy dog. " +
      "A completely different thought about cats."
    const { output, result } = applyDedupLayer(input)
    // Two fox sentences should be merged
    expect(output).toContain("(and 1 similar)")
    // Cats sentence should remain
    expect(output).toContain("cats")
    expect(result.itemsRemoved).toBe(1)
  })

  it("does not merge clearly distinct sentences", () => {
    const input =
      "Allura stores episodic memory in PostgreSQL. " +
      "Neo4j holds the semantic knowledge graph. " +
      "RuVector provides hybrid search with BM25 and ANN."
    const { output, result } = applyDedupLayer(input)
    expect(result.itemsRemoved).toBe(0)
    expect(output).not.toContain("similar")
  })

  it("reports correct layer name", () => {
    const { result } = applyDedupLayer("hello world.")
    expect(result.name).toBe("dedup")
  })

  it("handles empty input", () => {
    const { output } = applyDedupLayer("")
    expect(output).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

describe("ContextCompressor — full pipeline", () => {
  const compressor = new ContextCompressor()

  it("returns all three layer results when all layers enabled", () => {
    const result = compressor.compress("Hello world.")
    const names = result.layers.map((l) => l.name)
    expect(names).toContain("structural")
    expect(names).toContain("summarization")
    expect(names).toContain("dedup")
  })

  it("achieves >= 40% reduction on a contrived repetitive input", () => {
    // Build a context with lots of repetition
    const systemBlock = "<system>You are an AI assistant.</system>"
    const toolBlock =
      "<tool_result><result>success</result></tool_result>"
    const longPara = "This is a very long description of what happened. ".repeat(10)
    const dupSentence =
      "The agent processed the request successfully. " +
      "The agent completed the request successfully. " +
      "The agent handled the request successfully. "

    const parts = [
      systemBlock,
      systemBlock,
      systemBlock,
      "",
      longPara,
      "",
      toolBlock,
      toolBlock,
      "",
      dupSentence.repeat(3),
    ]

    const context = parts.join("\n")
    const result = compressor.compress(context)

    expect(result.reductionPercent).toBeGreaterThanOrEqual(40)
    expect(result.originalTokenEstimate).toBeGreaterThan(
      result.compressedTokenEstimate
    )
  })

  it("disabling structural layer skips that layer", () => {
    const result = compressor.compress("Hello world.", {
      enableStructural: false,
    })
    const names = result.layers.map((l) => l.name)
    expect(names).not.toContain("structural")
    expect(names).toContain("summarization")
    expect(names).toContain("dedup")
  })

  it("disabling summarization layer skips that layer", () => {
    const result = compressor.compress("Hello world.", {
      enableSummarization: false,
    })
    const names = result.layers.map((l) => l.name)
    expect(names).toContain("structural")
    expect(names).not.toContain("summarization")
    expect(names).toContain("dedup")
  })

  it("disabling dedup layer skips that layer", () => {
    const result = compressor.compress("Hello world.", {
      enableDedup: false,
    })
    const names = result.layers.map((l) => l.name)
    expect(names).toContain("structural")
    expect(names).toContain("summarization")
    expect(names).not.toContain("dedup")
  })

  it("disabling all layers returns original unchanged", () => {
    const text = "Hello world."
    const result = compressor.compress(text, {
      enableStructural: false,
      enableSummarization: false,
      enableDedup: false,
    })
    expect(result.compressed).toBe(text)
    expect(result.reductionPercent).toBe(0)
    expect(result.layers).toHaveLength(0)
  })

  it("empty input returns empty result with 0% reduction", () => {
    const result = compressor.compress("")
    expect(result.compressed).toBe("")
    expect(result.reductionPercent).toBe(0)
    expect(result.originalTokenEstimate).toBe(0)
    expect(result.compressedTokenEstimate).toBe(0)
  })

  it("result shape is complete", () => {
    const result = compressor.compress("Test input for shape check.")
    expect(result).toHaveProperty("original")
    expect(result).toHaveProperty("compressed")
    expect(result).toHaveProperty("originalTokenEstimate")
    expect(result).toHaveProperty("compressedTokenEstimate")
    expect(result).toHaveProperty("reductionPercent")
    expect(result).toHaveProperty("layers")
    expect(Array.isArray(result.layers)).toBe(true)
  })
})
