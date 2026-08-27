/**
 * Retry-with-backoff for advisory source polling (Story 26.4 AC-2).
 *
 * AC-2 requires that "polling cadence, checkpoints, retry behavior, and
 * source freshness expectations are security-owner-configured and auditable;
 * the worker cannot alter its own schedule."
 *
 * Cadence is externally fixed by the systemd timer -- the worker has no code
 * path that can rewrite its own unit file. This module supplies the other
 * half: retry and checkpoint behavior that is likewise *read* from the
 * environment and never *written* by the worker. Every knob below is an env
 * var an operator sets outside this process; there is deliberately no setter,
 * no config-file write, and no in-process mutation of these values. The
 * worker can observe its retry policy and report on it; it cannot change it.
 *
 * Convention mirrors src/lib/containment/feature-flags.ts exactly: read fresh
 * on every call (never cached at module load), fall back to a safe default on
 * anything unparseable, and expose the exact env var name via a helper so
 * error messages and docs can name the knob an operator actually has to set.
 */

if (typeof window !== "undefined") {
  throw new Error("server-side only")
}

export const RETRY_ENV_VARS = {
  maxAttempts: "THREAT_DISCOVERY_RETRY_MAX_ATTEMPTS",
  baseDelayMs: "THREAT_DISCOVERY_RETRY_BASE_DELAY_MS",
  maxDelayMs: "THREAT_DISCOVERY_RETRY_MAX_DELAY_MS",
} as const

export const RETRY_DEFAULTS = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5_000,
} as const

export interface RetryConfig {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export interface RetryOutcome<T> {
  /** The successful value, or null if every attempt failed. */
  value: T | null
  /** True when an attempt eventually succeeded. */
  succeeded: boolean
  /** How many attempts were actually made (1 when it succeeded first try). */
  attempts: number
  /** The final error message when all attempts failed; null on success. */
  lastError: string | null
}

/**
 * Read a positive-integer env var, falling back to `fallback` when unset,
 * non-numeric, negative, or zero. A malformed operator-supplied value must
 * degrade to the safe default rather than disabling retry outright or
 * looping forever.
 */
function readPositiveInt(envVar: string, fallback: number): number {
  const raw = process.env[envVar]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

/**
 * Resolve the current retry policy from the environment. Read fresh on every
 * call -- an operator changing an env var and restarting the unit takes
 * effect on the next cycle without a code change.
 */
export function resolveRetryConfig(): RetryConfig {
  return {
    maxAttempts: readPositiveInt(RETRY_ENV_VARS.maxAttempts, RETRY_DEFAULTS.maxAttempts),
    baseDelayMs: readPositiveInt(RETRY_ENV_VARS.baseDelayMs, RETRY_DEFAULTS.baseDelayMs),
    maxDelayMs: readPositiveInt(RETRY_ENV_VARS.maxDelayMs, RETRY_DEFAULTS.maxDelayMs),
  }
}

/**
 * Exponential backoff with a hard cap: base * 2^(attempt-1), clamped to
 * maxDelayMs. Attempt 1 has already happened when this is consulted, so the
 * first *delay* uses attempt=1 -> baseDelayMs.
 */
export function backoffDelayMs(attempt: number, config: RetryConfig): number {
  const exponential = config.baseDelayMs * 2 ** Math.max(0, attempt - 1)
  return Math.min(exponential, config.maxDelayMs)
}

/**
 * Injectable sleep. Tests pass a no-op/recording sleeper so the suite never
 * spends real wall-clock time in backoff; production uses the real timer.
 */
export type Sleeper = (ms: number) => Promise<void>

const realSleep: Sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run `fn`, retrying on a thrown error up to the configured attempt limit
 * with exponential backoff between attempts.
 *
 * This never throws: an exhausted retry returns `{ succeeded: false, value:
 * null }`. That is deliberate and matches the fail-soft posture the three
 * source adapters already use -- one dead source must not abort a discovery
 * cycle for the others. The caller gets the attempt count so the failure is
 * *auditable* rather than silent, which is the part AC-2 actually asks for.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { config?: RetryConfig; sleep?: Sleeper } = {},
): Promise<RetryOutcome<T>> {
  const config = options.config ?? resolveRetryConfig()
  const sleep = options.sleep ?? realSleep

  let lastError: string | null = null

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const value = await fn()
      return { value, succeeded: true, attempts: attempt, lastError: null }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      if (attempt < config.maxAttempts) {
        await sleep(backoffDelayMs(attempt, config))
      }
    }
  }

  return { value: null, succeeded: false, attempts: config.maxAttempts, lastError }
}
