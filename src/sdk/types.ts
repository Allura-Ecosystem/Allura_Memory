/**
 * @allura/sdk — Shared Types
 * Story 12.3: Standalone SDK package for governed memory + process operations.
 *
 * These types are environment-agnostic and safe for use in any JS/TS context.
 */

// ── Memory ────────────────────────────────────────────────────────────────────

/**
 * A memory record returned from Allura Brain.
 * Matches the canonical memory response shape from the REST API.
 */
export interface MemoryResult {
  id: string
  content: string
  userId: string
  groupId: string
  /** Relevance score when returned from search (0–1) */
  score?: number
  /** Data source: "postgres", "neo4j", "ruvector", or "merged" */
  source?: string
  /** Memory lifecycle status */
  status?: string
  createdAt: string
  metadata?: Record<string, unknown>
}

// ── Errors ────────────────────────────────────────────────────────────────────

/**
 * Error thrown by the Allura SDK on request failures or validation errors.
 */
export class AlluraSDKError extends Error {
  public readonly status: number
  public readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "AlluraSDKError"
    this.status = status
    this.code = code
    // Ensure correct prototype chain for instanceof checks
    Object.setPrototypeOf(this, AlluraSDKError.prototype)
  }
}
