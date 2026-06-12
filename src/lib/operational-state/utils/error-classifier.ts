/**
 * Error classifier for operational-state sources.
 *
 * Determines whether a caught error represents a connection-level failure
 * (UNREACHABLE) vs. a legitimate query-level failure. Sources use this to
 * decide whether to return `null` (degraded: source unreachable) or
 * `{ ok: false }` (error: query failed).
 *
 * The regex is intentionally specific. The original broad tokens `connection`
 * and `pool` matched ordinary query error messages like "lost connection during
 * query" or "connection pool timeout on idle slot", misclassifying query
 * failures as degraded state. The tightened tokens below match only the
 * concrete OS/driver signals that indicate the server cannot be reached at all.
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("error-classifier is server-side only")
}

/**
 * Specific tokens that identify a connection-level failure:
 *
 * - `ECONNREFUSED`          — TCP connection refused (server not running)
 * - `password`              — auth failure (wrong credentials)
 * - `authentication`        — auth failure (e.g. "authentication failed for user")
 * - `getaddrinfo`           — DNS resolution failure
 * - `ENOTFOUND`             — DNS name not found
 * - `ETIMEDOUT`             — TCP connect timeout
 * - `connection refused`    — human-readable form of ECONNREFUSED
 * - `terminated unexpectedly` — pg driver: server process crashed mid-session
 * - `pool is destroyed`     — pg-pool: pool was shut down before query completed
 * - `Client was closed`     — pg driver: client closed before query finished
 * - `Connection terminated` — pg driver: connection terminated unexpectedly
 */
const UNREACHABLE_RE =
  /ECONNREFUSED|password|authentication|getaddrinfo|ENOTFOUND|ETIMEDOUT|connection refused|terminated unexpectedly|pool is destroyed|Client was closed|Connection terminated/i

/**
 * Returns `true` when the error indicates a connection-level failure —
 * i.e. the database server could not be reached or authentication failed.
 *
 * Returns `false` for all other errors, including legitimate query failures
 * (missing tables, constraint violations, syntax errors, etc.).
 */
export function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return UNREACHABLE_RE.test(message)
}
