if (typeof window !== "undefined") throw new Error("server-side only")

import type { LayerResult } from "../types.js"

const SIMILARITY_THRESHOLD = 0.7

/**
 * Normalise a sentence into a word-set for Jaccard comparison.
 * Strips punctuation and lowercases.
 */
function wordSet(sentence: string): Set<string> {
  const words = sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
  return new Set(words)
}

/**
 * Jaccard similarity between two word sets: |A ∩ B| / |A ∪ B|
 */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const w of a) {
    if (b.has(w)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Split text into sentences on `.`, `!`, `?` boundaries.
 * Preserves trailing punctuation on each sentence.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Layer 3 — Semantic deduplication.
 *
 * - Splits content into sentences
 * - Groups sentences with Jaccard similarity > 0.7
 * - Keeps the longest sentence from each group
 * - Replaces remaining duplicates with "(and N similar)"
 */
export function applyDedupLayer(input: string): {
  output: string
  result: LayerResult
} {
  const inputLength = input.length

  const sentences = splitSentences(input)

  if (sentences.length === 0) {
    return {
      output: input,
      result: {
        name: "dedup",
        inputLength,
        outputLength: input.length,
        itemsRemoved: 0,
      },
    }
  }

  const sets = sentences.map(wordSet)
  // Track which sentences have been consumed into a group
  const consumed = new Array<boolean>(sentences.length).fill(false)
  const outputSentences: string[] = []
  let itemsRemoved = 0

  for (let i = 0; i < sentences.length; i++) {
    if (consumed[i]) continue

    // Find all sentences similar to sentence[i]
    const group: number[] = [i]
    for (let j = i + 1; j < sentences.length; j++) {
      if (consumed[j]) continue
      const sim = jaccard(sets[i], sets[j])
      if (sim >= SIMILARITY_THRESHOLD) {
        group.push(j)
        consumed[j] = true
      }
    }
    consumed[i] = true

    // Keep the longest sentence from the group
    let longestIdx = group[0]
    for (const idx of group) {
      if (sentences[idx].length > sentences[longestIdx].length) {
        longestIdx = idx
      }
    }

    const extras = group.length - 1
    if (extras > 0) {
      outputSentences.push(`${sentences[longestIdx]} (and ${extras} similar)`)
      itemsRemoved += extras
    } else {
      outputSentences.push(sentences[longestIdx])
    }
  }

  const output = outputSentences.join(" ").trim()

  return {
    output,
    result: {
      name: "dedup",
      inputLength,
      outputLength: output.length,
      itemsRemoved,
    },
  }
}
