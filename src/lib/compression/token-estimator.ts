if (typeof window !== "undefined") throw new Error("server-side only")

/**
 * Rough token estimator for English text.
 * Uses ~4 chars per token heuristic — no tiktoken dependency.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
