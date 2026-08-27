/**
 * Story 26.4 AC-2 -- retry policy is operator-configured, worker-immutable,
 * and auditable.
 *
 * No real wall-clock sleeping: every test injects a recording sleeper, so
 * backoff growth is asserted from the recorded delays rather than by
 * actually waiting.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  backoffDelayMs,
  resolveRetryConfig,
  RETRY_DEFAULTS,
  RETRY_ENV_VARS,
  type RetryConfig,
  withRetry,
} from "../retry"

const ENV_KEYS = Object.values(RETRY_ENV_VARS)

function recordingSleeper() {
  const delays: number[] = []
  return { delays, sleep: async (ms: number) => void delays.push(ms) }
}

const FAST: RetryConfig = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 }

describe("Story 26.4 AC-2 — resolveRetryConfig", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key]
  })

  it("falls back to the documented safe defaults when nothing is set", () => {
    expect(resolveRetryConfig()).toEqual(RETRY_DEFAULTS)
  })

  it("reads operator-supplied values from the environment", () => {
    process.env[RETRY_ENV_VARS.maxAttempts] = "5"
    process.env[RETRY_ENV_VARS.baseDelayMs] = "250"
    process.env[RETRY_ENV_VARS.maxDelayMs] = "9000"
    expect(resolveRetryConfig()).toEqual({ maxAttempts: 5, baseDelayMs: 250, maxDelayMs: 9000 })
  })

  it("degrades a malformed value to the default rather than disabling retry", () => {
    process.env[RETRY_ENV_VARS.maxAttempts] = "not-a-number"
    expect(resolveRetryConfig().maxAttempts).toBe(RETRY_DEFAULTS.maxAttempts)
  })

  it("rejects zero and negative attempt counts (never a zero-attempt no-op)", () => {
    process.env[RETRY_ENV_VARS.maxAttempts] = "0"
    expect(resolveRetryConfig().maxAttempts).toBe(RETRY_DEFAULTS.maxAttempts)
    process.env[RETRY_ENV_VARS.maxAttempts] = "-4"
    expect(resolveRetryConfig().maxAttempts).toBe(RETRY_DEFAULTS.maxAttempts)
  })

  it("is read fresh on every call, so the worker cannot cache a stale policy", () => {
    expect(resolveRetryConfig().maxAttempts).toBe(RETRY_DEFAULTS.maxAttempts)
    process.env[RETRY_ENV_VARS.maxAttempts] = "7"
    expect(resolveRetryConfig().maxAttempts).toBe(7)
  })
})

describe("Story 26.4 AC-2 — backoffDelayMs", () => {
  it("grows exponentially from the base delay", () => {
    const config: RetryConfig = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 100_000 }
    expect(backoffDelayMs(1, config)).toBe(100)
    expect(backoffDelayMs(2, config)).toBe(200)
    expect(backoffDelayMs(3, config)).toBe(400)
  })

  it("clamps at maxDelayMs so backoff cannot grow without bound", () => {
    const config: RetryConfig = { maxAttempts: 20, baseDelayMs: 100, maxDelayMs: 500 }
    expect(backoffDelayMs(10, config)).toBe(500)
  })
})

describe("Story 26.4 AC-2 — withRetry", () => {
  it("returns immediately on first success without sleeping", async () => {
    const { delays, sleep } = recordingSleeper()
    const fn = vi.fn().mockResolvedValue("ok")

    const outcome = await withRetry(fn, { config: FAST, sleep })

    expect(outcome).toEqual({ value: "ok", succeeded: true, attempts: 1, lastError: null })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it("succeeds on the Nth attempt after N-1 failures", async () => {
    const { delays, sleep } = recordingSleeper()
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient 1"))
      .mockRejectedValueOnce(new Error("transient 2"))
      .mockResolvedValue("recovered")

    const outcome = await withRetry(fn, { config: FAST, sleep })

    expect(outcome.succeeded).toBe(true)
    expect(outcome.value).toBe("recovered")
    expect(outcome.attempts).toBe(3)
    expect(fn).toHaveBeenCalledTimes(3)
    // Two failures -> two backoff sleeps, growing exponentially.
    expect(delays).toEqual([10, 20])
  })

  it("exhausts and reports failure without throwing (fail-soft, auditable)", async () => {
    const { delays, sleep } = recordingSleeper()
    const fn = vi.fn().mockRejectedValue(new Error("source is down"))

    const outcome = await withRetry(fn, { config: FAST, sleep })

    expect(outcome.succeeded).toBe(false)
    expect(outcome.value).toBeNull()
    expect(outcome.attempts).toBe(3)
    expect(outcome.lastError).toMatch(/source is down/)
    expect(fn).toHaveBeenCalledTimes(3)
    // Last attempt is not followed by a pointless sleep.
    expect(delays).toEqual([10, 20])
  })

  it("honours an operator-raised attempt limit", async () => {
    const { sleep } = recordingSleeper()
    const fn = vi.fn().mockRejectedValue(new Error("down"))

    const outcome = await withRetry(fn, {
      config: { maxAttempts: 6, baseDelayMs: 1, maxDelayMs: 2 },
      sleep,
    })

    expect(outcome.attempts).toBe(6)
    expect(fn).toHaveBeenCalledTimes(6)
  })

  it("stringifies a non-Error throw so lastError is always reportable", async () => {
    const { sleep } = recordingSleeper()
    const outcome = await withRetry(
      () => Promise.reject("plain string failure"),
      { config: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 }, sleep },
    )

    expect(outcome.succeeded).toBe(false)
    expect(outcome.lastError).toBe("plain string failure")
  })
})
