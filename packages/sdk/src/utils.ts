/**
 * @allura/sdk — Internal utilities
 *
 * Retry with exponential backoff, group_id validation,
 * and request/response helpers.
 */

import { AlluraError, ConnectionError, RetryExhaustedError , ValidationError } from "./errors.js";
import { GroupIdSchema } from "./types.js";

// ── Constants ───────────────────────────────────────────────────────────────

/** Default request timeout in milliseconds */
export const DEFAULT_TIMEOUT = 5000;

/** Default number of retry attempts */
export const DEFAULT_RETRIES = 3;

/** Base delay for exponential backoff (milliseconds) */
export const BASE_BACKOFF_MS = 200;

/** Maximum backoff delay (milliseconds) */
export const MAX_BACKOFF_MS = 10_000;

/** Jitter factor (0 to 1) to add randomness to backoff */
export const JITTER_FACTOR = 0.25;

// ── group_id Validation ────────────────────────────────────────────────────

/**
 * Validate a group_id against the Allura naming convention.
 * Must match ^allura-[a-z0-9-]+$ (ARCH-001 tenant isolation).
 *
 * @throws {import("./errors.js").ValidationError} if group_id is invalid
 */
export function validateGroupId(groupId: string): void {
  const result = GroupIdSchema.safeParse(groupId);
  if (!result.success) {
    const { error } = result;
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const path = issue.path.join(".") || "group_id";
      if (!fields[path]) {
        fields[path] = [];
      }
      fields[path].push(issue.message);
    }
    throw new ValidationError(
      `Invalid group_id: "${groupId}". Must match pattern ^allura-[a-z0-9-]+$`,
      fields
    );
  }
}

// ── Import ValidationError for the function above ────────────────────────────


// ── Exponential Backoff ─────────────────────────────────────────────────────

/**
 * Calculate backoff delay with jitter.
 *
 * Formula: min(BASE_BACKOFF * 2^attempt + random_jitter, MAX_BACKOFF)
 *
 * @param attempt - Zero-indexed attempt number
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number): number {
  const exponentialDelay = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = exponentialDelay * JITTER_FACTOR * Math.random();
  const totalDelay = exponentialDelay + jitter;
  return Math.min(totalDelay, MAX_BACKOFF_MS);
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable.
 *
 * Retryable: ConnectionError, 429 RateLimitError, 5xx ServerError.
 * Not retryable: 400 ValidationError, 401 AuthenticationError, 404 NotFoundError.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ConnectionError) return true;
  if (error instanceof AlluraError) {
    if (error.statusCode === 429) return true;
    if (error.statusCode >= 500) return true;
    return false;
  }
  // Network errors are retryable
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  return false;
}

/**
 * Execute a function with retry and exponential backoff.
 *
 * @param fn - The async function to execute
 * @param retries - Number of retries AFTER the first attempt (0 = single
 *   attempt, no retries). Must be a finite non-negative integer.
 * @returns The result of the function
 * @throws {RetryExhaustedError} if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = DEFAULT_RETRIES
): Promise<T> {
  let lastError: Error = new Error("No attempts made");

  // Guard against non-finite or negative retry counts: NaN/Infinity would
  // otherwise produce a silent no-op or an unbounded retry loop.
  if (!Number.isFinite(retries) || retries < 0) {
    retries = 0;
  }

  // `retries` is the number of retries AFTER the first attempt, so the
  // function always runs at least once (retries: 0 = single attempt).
  const attempts = Math.max(1, retries + 1);

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryable(error)) {
        throw error;
      }

      if (attempt < attempts - 1) {
        const backoff = calculateBackoff(attempt);
        await sleep(backoff);
      }
    }
  }

  // If no retries were configured, surface the original error rather than
  // wrapping it — RetryExhaustedError is only meaningful when retries were
  // actually attempted and all of them failed.
  if (retries <= 0) {
    throw lastError;
  }

  throw new RetryExhaustedError(retries, lastError);
}

// ── HTTP Helpers ─────────────────────────────────────────────────────────────

/**
 * Build request headers with optional Bearer token.
 */
export function buildHeaders(
  authToken?: string,
  contentType: string = "application/json"
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept": "application/json",
    "User-Agent": "@allura/sdk/0.1.0",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  return headers;
}

/**
 * Normalize a base URL by removing trailing slashes.
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}