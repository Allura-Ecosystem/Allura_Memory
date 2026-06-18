/**
 * Statistical primitives for the benchmark harness.
 *
 * Kept dependency-free and pure so the numbers are auditable and the module is
 * trivially unit-testable. Information-retrieval metrics follow the standard
 * TREC definitions.
 */

/**
 * Nearest-rank percentile over a sample (e.g. `percentile(xs, 95)` → P95).
 * Returns 0 for an empty sample. `p` is clamped to [0, 100].
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const clamped = Math.min(100, Math.max(0, p))
  if (clamped <= 0) return sorted[0]
  const rank = Math.ceil((clamped / 100) * sorted.length)
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1))
  return sorted[idx]
}

/** Arithmetic mean; 0 for an empty sample. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Precision@K — fraction of the top-K retrieved items that are relevant.
 * `isRelevant` judges each retrieved id against the ground truth.
 */
export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (k <= 0) return 0
  const topK = retrieved.slice(0, k)
  if (topK.length === 0) return 0
  const hits = topK.filter((id) => relevant.has(id)).length
  return hits / topK.length
}

/**
 * Recall@K — fraction of all known-relevant items that appear in the top K.
 * Returns 0 when there are no relevant items (undefined recall → treated as 0).
 */
export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0
  const topK = retrieved.slice(0, k)
  const hits = topK.filter((id) => relevant.has(id)).length
  return hits / relevant.size
}

/**
 * Reciprocal rank — 1/rank of the first relevant item (1-indexed), or 0 if none.
 * Averaging this across queries yields MRR.
 */
export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1)
  }
  return 0
}

/** Round to a fixed number of decimals (default 3) for stable reporting. */
export function round(value: number, decimals = 3): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}
