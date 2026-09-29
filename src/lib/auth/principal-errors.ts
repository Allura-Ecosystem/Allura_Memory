/**
 * Principal-derivation error types.
 *
 * Deliberately free of the `server-only` guard. Route handlers, pages and
 * their tests need to classify a principal failure without importing the
 * server-only derivation module itself, which would make the class
 * unimportable from any module the bundler treats as client-reachable.
 *
 * Re-exported from `./dashboard-principal` so existing imports keep working.
 */

/**
 * Raised when the session provider cannot be consulted at all — an outage,
 * a rate limit, a transport failure, or missing provider configuration.
 *
 * This is NOT a denial. Callers must classify it as a degraded dependency and
 * must never report it as `forbidden`: an outage rendered as an access denial
 * misinforms the user, misdirects incident response, and at an auth guard
 * sends an already-signed-in user back to a login it cannot complete.
 *
 * An absent or invalid principal is a different outcome and stays `null`.
 */
export class PrincipalProviderUnavailableError extends Error {
  constructor(message = "Session provider unavailable", options?: ErrorOptions) {
    super(message, options)
    this.name = "PrincipalProviderUnavailableError"
  }
}
