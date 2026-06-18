/**
 * Benchmark 4 — Latency profile.
 *
 * Measures wall-clock round-trip latency (as a real client observes it) for the
 * two hot-path operations, `memory_search` and `memory_add`, and reports the
 * P50 / P95 / P99 distribution. A short warmup phase absorbs cold-start and
 * connection-pool spin-up so the steady-state numbers are representative.
 *
 * Thresholds are deliberately generous acceptance bars (local stack); tighten
 * them per-environment. Iteration counts are configurable via `--latency-iters`.
 */

import type { BenchmarkContext, BenchmarkResult } from "../lib/types"
import type { AddResult, SearchResult } from "../lib/seed"
import { mean, percentile } from "../lib/metrics"
import { gated, info, statusFromMetrics } from "../lib/metric-builder"

const WARMUP = 5
const SEARCH_P95_TARGET_MS = 2_500
const ADD_P95_TARGET_MS = 2_500
// A latency profile is only trustworthy if the calls actually succeeded.
// Rejected calls (e.g. a circuit breaker / write-budget fast-fail) must NOT be
// counted as fast successes, so we gate on a minimum success rate.
const MIN_SUCCESS_RATE = 0.95

const SEARCH_QUERIES = [
  "dual database architecture",
  "human in the loop promotion",
  "vector embeddings cosine distance",
  "append only execution traces",
  "tenant namespace isolation",
]

export async function run(ctx: BenchmarkContext, iters: number): Promise<BenchmarkResult> {
  const start = performance.now()
  const notes: string[] = []

  try {
    // ── Warmup (not measured) ─────────────────────────────────────────────────
    for (let i = 0; i < WARMUP; i++) {
      await ctx.client.tryCall<SearchResult>("memory_search", {
        query: SEARCH_QUERIES[i % SEARCH_QUERIES.length],
        group_id: ctx.groupId,
        limit: 5,
        status: "all",
      })
    }

    // ── Search latency (successful calls only) ────────────────────────────────
    const searchLat: number[] = []
    let searchFail = 0
    for (let i = 0; i < iters; i++) {
      const res = await ctx.client.tryCall<SearchResult>("memory_search", {
        query: SEARCH_QUERIES[i % SEARCH_QUERIES.length],
        group_id: ctx.groupId,
        limit: 5,
        status: "all",
      })
      if (res.ok) searchLat.push(res.latencyMs)
      else searchFail++
    }

    // ── Add latency (successful calls only) ───────────────────────────────────
    const addLat: number[] = []
    let addFail = 0
    for (let i = 0; i < iters; i++) {
      const res = await ctx.client.tryCall<AddResult>("memory_add", {
        group_id: ctx.groupId,
        user_id: ctx.userId,
        content: `latency probe ${i} [[BENCH:${ctx.runId}:latency]]`,
        metadata: { source: "manual", agent_id: "benchmark" },
      })
      if (res.ok) addLat.push(res.latencyMs)
      else addFail++
    }

    const searchSuccessRate = (iters - searchFail) / iters
    const addSuccessRate = (iters - addFail) / iters
    notes.push(`iterations: ${iters} per op (after ${WARMUP} warmup searches)`)
    if (searchFail > 0) notes.push(`memory_search failed ${searchFail}/${iters} calls (excluded from latency)`)
    if (addFail > 0)
      notes.push(
        `memory_add failed ${addFail}/${iters} calls (excluded from latency) — ` +
          `likely a write-budget / circuit-breaker fast-fail`,
      )

    // Success-rate gates run FIRST so a rejected write path fails loudly rather
    // than masquerading as ultra-low latency. Percentiles cover only successes.
    const metrics = [
      gated("search success rate", searchSuccessRate, "gte", MIN_SUCCESS_RATE, ""),
      info("search mean", mean(searchLat), "ms"),
      info("search P50", percentile(searchLat, 50), "ms"),
      gated("search P95", percentile(searchLat, 95), "lte", SEARCH_P95_TARGET_MS, "ms"),
      info("search P99", percentile(searchLat, 99), "ms"),
      gated("add success rate", addSuccessRate, "gte", MIN_SUCCESS_RATE, ""),
      info("add mean", mean(addLat), "ms"),
      info("add P50", percentile(addLat, 50), "ms"),
      gated("add P95", percentile(addLat, 95), "lte", ADD_P95_TARGET_MS, "ms"),
      info("add P99", percentile(addLat, 99), "ms"),
    ]

    return {
      id: "latency-profile",
      title: "Latency Profile (P50/P95/P99)",
      status: statusFromMetrics(metrics),
      durationMs: performance.now() - start,
      metrics,
      notes,
    }
  } catch (err) {
    return {
      id: "latency-profile",
      title: "Latency Profile (P50/P95/P99)",
      status: "error",
      durationMs: performance.now() - start,
      metrics: [],
      notes,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
