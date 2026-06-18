/**
 * Shared types for the Allura Memory benchmark harness.
 *
 * The harness is a BLACK-BOX suite: it drives the live Allura Brain MCP gateway
 * (Streamable HTTP at localhost:5888) exactly as a real agent would, and scores
 * the observed behaviour. It never imports server internals — that keeps the
 * numbers honest and makes the harness a true acceptance gate.
 */

import type { BrainClient } from "./client"

/** Outcome of a single benchmark. */
export type BenchmarkStatus = "pass" | "fail" | "skip" | "error"

/** Direction of a threshold comparison. */
export type Comparator = "gte" | "lte"

/** One measured quantity within a benchmark. */
export interface Metric {
  /** Human-readable metric label (e.g. "Precision@5"). */
  name: string
  /** Measured value. */
  value: number
  /** Display unit (e.g. "ms", "%", ""). */
  unit: string
  /** Optional pass/fail threshold for this metric. */
  threshold?: number
  /** Whether higher (`gte`) or lower (`lte`) is better. Required when `threshold` is set. */
  comparator?: Comparator
  /** Computed pass flag when a threshold is present. */
  passed?: boolean
}

/** Result of running one benchmark module. */
export interface BenchmarkResult {
  /** Stable id (e.g. "retrieval-quality"). */
  id: string
  /** Display title. */
  title: string
  /** Aggregate status, derived from metric pass flags or set explicitly. */
  status: BenchmarkStatus
  /** Wall-clock duration of the benchmark in milliseconds. */
  durationMs: number
  /** All metrics produced by the benchmark. */
  metrics: Metric[]
  /** Free-form observations surfaced in the report. */
  notes: string[]
  /** Populated when `status === "error"`. */
  error?: string
}

/** Context handed to every benchmark module. */
export interface BenchmarkContext {
  /** Connected MCP client for the live gateway. */
  client: BrainClient
  /**
   * Base tenant namespace for seed/teardown writes. Always carries the
   * `-loadtest` suffix so writes skip the HITL proposal queue (see
   * `memory_add` in `src/mcp/canonical-tools.ts`) and never pollute the
   * curator queue.
   */
  groupId: string
  /** Unique per-run id used to namespace fixtures so reruns never collide. */
  runId: string
  /** Default user id for seeded memories. */
  userId: string
  /** Emit per-step detail to stderr when true. */
  verbose: boolean
}

/** Signature every benchmark module exports as `run`. */
export type BenchmarkRunner = (ctx: BenchmarkContext) => Promise<BenchmarkResult>
