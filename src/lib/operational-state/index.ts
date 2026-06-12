/**
 * Operational State Contract: Story 13.2 (Live Operational Truth)
 *
 * Command Center surfaces must never fabricate confidence. Every operational
 * card resolves to exactly one honest state with a declared source and
 * freshness:
 *
 *   ready    - live data fetched, non-empty, within freshness window
 *   empty    - live data fetched successfully but the set is empty
 *   stale    - live data fetched but older than its freshness window
 *   error    - the source responded with a failure
 *   degraded - the source could not be reached at all (no answer)
 *
 * This module is the single source of truth for that mapping so every surface
 * (Governance, Schedules, Dreams, Settings, Teams) renders truthfully and is
 * testable in isolation. It contains NO secrets and never embeds source
 * internals in user-facing fields.
 */

export type OperationalStatus = "ready" | "empty" | "stale" | "error" | "degraded"

export interface OperationalSource {
  /** Stable identifier for the data source, e.g. "curator-queue". */
  id: string
  /** System of record, e.g. "allura-brain", "postgres", "ollama". */
  systemOfRecord: string
}

/**
 * The outcome of attempting to read a source.
 * - `null`            -> the source could not be reached at all -> degraded
 * - `{ ok: false }`   -> the source answered with a failure     -> error
 * - `{ ok: true }`    -> the source answered with data
 */
export type SourceOutcome<T> =
  | null
  | { ok: false; error: string }
  | { ok: true; data: T; fetchedAt: string }

export interface OperationalSurface<T> {
  status: OperationalStatus
  source: OperationalSource
  /** ISO-8601 timestamp the data was fetched; null when unknown/unreached. */
  fetchedAt: string | null
  /** Age of the data in ms at evaluation time; null when unknown. */
  ageMs: number | null
  /** The payload, present only when status is "ready" or "stale". */
  data: T | null
  /** User-facing recovery action when not ready; null when ready. */
  recovery: string | null
  /** Sanitized, user-safe error detail; null unless status is "error". */
  error: string | null
}

export interface ResolveInput<T> {
  source: OperationalSource
  outcome: SourceOutcome<T>
  /** Predicate marking a successful-but-empty payload. Default: never empty. */
  isEmpty?: (data: T) => boolean
  /** Freshness window in ms. Older successful data becomes "stale". */
  freshnessMs?: number
  /** Evaluation clock (ms since epoch). Defaults to Date.now(). */
  now?: number
  /** Optional recovery hint shown for error/degraded states. */
  recoveryHint?: string
}

const DEFAULT_FRESHNESS_MS = 60_000

/**
 * Resolve a source read into a single honest operational surface state.
 *
 * Pure and deterministic: given the same inputs it always returns the same
 * surface. This is what the Story 13.2 contract tests pin.
 */
export function resolveOperationalSurface<T>(input: ResolveInput<T>): OperationalSurface<T> {
  const {
    source,
    outcome,
    isEmpty = () => false,
    freshnessMs = DEFAULT_FRESHNESS_MS,
    now = Date.now(),
    recoveryHint,
  } = input

  // Degraded: the source could not be reached at all.
  if (outcome === null) {
    return {
      status: "degraded",
      source,
      fetchedAt: null,
      ageMs: null,
      data: null,
      recovery: recoveryHint ?? `Check that ${source.systemOfRecord} is reachable, then retry.`,
      error: null,
    }
  }

  // Error: the source answered with a failure.
  if (outcome.ok === false) {
    return {
      status: "error",
      source,
      fetchedAt: null,
      ageMs: null,
      data: null,
      recovery: recoveryHint ?? `${source.id} reported an error. Retry or inspect source logs.`,
      error: outcome.error,
    }
  }

  // Success: classify empty / stale / ready.
  const ageMs = Math.max(0, now - new Date(outcome.fetchedAt).getTime())

  if (isEmpty(outcome.data)) {
    return {
      status: "empty",
      source,
      fetchedAt: outcome.fetchedAt,
      ageMs,
      data: null,
      recovery: null,
      error: null,
    }
  }

  if (ageMs > freshnessMs) {
    return {
      status: "stale",
      source,
      fetchedAt: outcome.fetchedAt,
      ageMs,
      data: outcome.data,
      recovery: `Data is older than ${Math.round(freshnessMs / 1000)}s. Refresh to update.`,
      error: null,
    }
  }

  return {
    status: "ready",
    source,
    fetchedAt: outcome.fetchedAt,
    ageMs,
    data: outcome.data,
    recovery: null,
    error: null,
  }
}

/** True when a surface is safe to render as authoritative live data. */
export function isAuthoritative(status: OperationalStatus): boolean {
  return status === "ready"
}
