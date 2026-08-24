/**
 * Benchmark 1 — Retrieval quality.
 *
 * Seeds a labeled corpus, runs the ground-truth query set against the live
 * `memory_search` tool, and scores the federated retrieval with the standard IR
 * metrics: Precision@K, Recall@K, and Mean Reciprocal Rank.
 *
 * Thresholds mirror the targets documented in the existing mocked benchmark
 * (`src/__tests__/retrieval-benchmark.test.ts`): P@5 ≥ 0.85, R@5 ≥ 0.70,
 * MRR ≥ 0.75. Live numbers depend on embedding-backfill state, so these are the
 * acceptance bar, not a guarantee.
 */

import type { BenchmarkContext, BenchmarkResult } from "../lib/types"
import { RETRIEVAL_CORPUS, RETRIEVAL_QUERIES } from "../lib/dataset"
import { searchKeys, seedCorpus } from "../lib/seed"
import { mean, precisionAtK, recallAtK, reciprocalRank, round } from "../lib/metrics"
import { gated, statusFromMetrics } from "../lib/metric-builder"

const K = 5
const P_AT_K_TARGET = 0.85
const R_AT_K_TARGET = 0.7
const MRR_TARGET = 0.75

export async function run(ctx: BenchmarkContext): Promise<BenchmarkResult> {
  const start = performance.now()
  const notes: string[] = []

  try {
    const seeded = await seedCorpus(ctx.client, {
      groupId: ctx.groupId,
      userId: ctx.userId,
      runId: ctx.runId,
      docs: RETRIEVAL_CORPUS,
    })
    notes.push(`seeded ${seeded} documents into ${ctx.groupId}`)

    const precisions: number[] = []
    const recalls: number[] = []
    const rrs: number[] = []

    for (const q of RETRIEVAL_QUERIES) {
      const { keys, rawCount } = await searchKeys(ctx.client, {
        groupId: ctx.groupId,
        query: q.query,
        k: K,
        runId: ctx.runId,
      })
      const relevant = new Set(q.relevantKeys)
      const p = precisionAtK(keys, relevant, K)
      const r = recallAtK(keys, relevant, K)
      const rr = reciprocalRank(keys, relevant)
      precisions.push(p)
      recalls.push(r)
      rrs.push(rr)
      if (ctx.verbose) {
        notes.push(
          `q="${q.query.slice(0, 40)}" hits=[${keys.join(",")}] raw=${rawCount} P=${round(p, 2)} R=${round(r, 2)} RR=${round(rr, 2)}`,
        )
      }
    }

    const pAtK = mean(precisions)
    const rAtK = mean(recalls)
    const mrr = mean(rrs)

    const metrics = [
      gated(`Precision@${K}`, pAtK, "gte", P_AT_K_TARGET, ""),
      gated(`Recall@${K}`, rAtK, "gte", R_AT_K_TARGET, ""),
      gated("MRR", mrr, "gte", MRR_TARGET, ""),
    ]

    if (pAtK === 0 && rAtK === 0) {
      notes.push(
        "zero retrieval — embeddings unavailable (Ollama not running or not provisioned). " +
          "Skipping threshold gating. Run with `bun run brain:up` and Ollama to measure real retrieval quality.",
      )
      return {
        id: "retrieval-quality",
        title: "Retrieval Quality (P@K, R@K, MRR)",
        status: "skip",
        durationMs: performance.now() - start,
        metrics,
        notes,
      }
    }

    return {
      id: "retrieval-quality",
      title: "Retrieval Quality (P@K, R@K, MRR)",
      status: statusFromMetrics(metrics),
      durationMs: performance.now() - start,
      metrics,
      notes,
    }
  } catch (err) {
    return {
      id: "retrieval-quality",
      title: "Retrieval Quality (P@K, R@K, MRR)",
      status: "error",
      durationMs: performance.now() - start,
      metrics: [],
      notes,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
