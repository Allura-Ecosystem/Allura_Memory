/**
 * Benchmark 2 — Curation accuracy.
 *
 * Drives `memory_add` with labeled examples (durable knowledge vs. conversational
 * noise) and inspects the curator score the system assigns. A memory is treated
 * as "system would promote" when its score clears the promotion threshold. We
 * then measure how often the curator's verdict diverges from the ground truth:
 *
 *   False positive  = noise the curator would promote  (FP rate ↓ better)
 *   False negative  = durable knowledge it would drop   (FN rate ↓ better)
 *
 * Writes go to the `-loadtest` group so they never enter the real HITL queue.
 */

import type { BenchmarkContext, BenchmarkResult } from "../lib/types"
import { CURATION_EXAMPLES } from "../lib/dataset"
import type { AddResult } from "../lib/seed"
import { round } from "../lib/metrics"
import { gated, info, statusFromMetrics } from "../lib/metric-builder"

// Default promotion threshold (see getAutoApprovalThreshold / memory_add).
const PROMOTION_THRESHOLD = 0.85
const FP_RATE_TARGET = 0.2 // ≤20% of noise wrongly promoted
const FN_RATE_TARGET = 0.3 // ≤30% of durable knowledge wrongly dropped

export async function run(ctx: BenchmarkContext): Promise<BenchmarkResult> {
  const start = performance.now()
  const notes: string[] = []

  try {
    let truePos = 0
    let falsePos = 0
    let trueNeg = 0
    let falseNeg = 0
    let scored = 0
    let positives = 0
    let negatives = 0

    for (const ex of CURATION_EXAMPLES) {
      const res = await ctx.client.tryCall<AddResult>("memory_add", {
        group_id: ctx.groupId,
        user_id: ctx.userId,
        content: `${ex.text} [[BENCH:${ctx.runId}:curation]]`,
        metadata: { source: "manual", agent_id: "benchmark" },
      })
      const score = typeof res.data?.score === "number" ? res.data.score : undefined
      if (score === undefined) {
        notes.push(`no score returned for "${ex.label}" — skipping`)
        continue
      }
      scored++
      const wouldPromote = score >= PROMOTION_THRESHOLD
      if (ex.shouldPromote) positives++
      else negatives++

      if (ex.shouldPromote && wouldPromote) truePos++
      else if (ex.shouldPromote && !wouldPromote) falseNeg++
      else if (!ex.shouldPromote && wouldPromote) falsePos++
      else trueNeg++

      if (ctx.verbose) {
        notes.push(
          `${ex.label}: score=${round(score, 3)} promote=${wouldPromote} expected=${ex.shouldPromote}`,
        )
      }
    }

    if (scored === 0) {
      return {
        id: "curation-accuracy",
        title: "Curation Accuracy (FP/FN rates)",
        status: "skip",
        durationMs: performance.now() - start,
        metrics: [],
        notes: [...notes, "no curator scores available — curator scoring may be unavailable"],
      }
    }

    const fpRate = negatives > 0 ? falsePos / negatives : 0
    const fnRate = positives > 0 ? falseNeg / positives : 0
    const accuracy = (truePos + trueNeg) / scored

    const metrics = [
      gated("False positive rate", fpRate, "lte", FP_RATE_TARGET, ""),
      gated("False negative rate", fnRate, "lte", FN_RATE_TARGET, ""),
      info("Accuracy", accuracy, ""),
      info("Examples scored", scored, ""),
    ]

    notes.push(`TP=${truePos} FP=${falsePos} TN=${trueNeg} FN=${falseNeg} (threshold ${PROMOTION_THRESHOLD})`)

    if (fnRate === 1 && fpRate === 0) {
      notes.push(
        "all positives scored zero — embeddings unavailable (Ollama not running). " +
          "Skipping threshold gating. Run with `bun run brain:up` and Ollama to measure real curation accuracy.",
      )
      return {
        id: "curation-accuracy",
        title: "Curation Accuracy (FP/FN rates)",
        status: "skip",
        durationMs: performance.now() - start,
        metrics,
        notes,
      }
    }

    return {
      id: "curation-accuracy",
      title: "Curation Accuracy (FP/FN rates)",
      status: statusFromMetrics(metrics),
      durationMs: performance.now() - start,
      metrics,
      notes,
    }
  } catch (err) {
    return {
      id: "curation-accuracy",
      title: "Curation Accuracy (FP/FN rates)",
      status: "error",
      durationMs: performance.now() - start,
      metrics: [],
      notes,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
