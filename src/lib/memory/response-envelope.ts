/**
 * Response Envelope Factory for Allura Memory
 *
 * Provides standard envelope wrapping for all MemoryCoordinator responses.
 * Every tool response follows the { data, meta, error } structure, giving
 * consumers a consistent contract regardless of success or failure.
 *
 * Reference: docs/allura/BLUEPRINT.md (F-002: Response Envelope)
 */

// ── Envelope Types ─────────────────────────────────────────────────────────

/** Metadata attached to every envelope response */
export interface EnvelopeMeta {
  contract_version: "v1"
  tool: string
  group_id: string
  latency_ms: number
  stores_used: Array<"postgres" | "ruvector" | "graph">
  degraded: boolean
  degraded_reason?: string
  warnings?: string[]
}

/** Standard error payload inside an envelope */
export interface EnvelopeError {
  code: number
  message: string
  details?: unknown
}

/**
 * The canonical response envelope for all memory operations.
 *
 * - On success: data is populated, error is null
 * - On failure: data is null, error is populated
 * - meta is always populated with timing and store information
 */
export interface MemoryResponseEnvelope<T> {
  data: T | null
  meta: EnvelopeMeta
  error: EnvelopeError | null
}

// ── Factory Functions ──────────────────────────────────────────────────────

/**
 * Build a success envelope around tool result data.
 *
 * @param data      - The tool's return value
 * @param tool      - Canonical tool name (e.g. "memory_add")
 * @param groupId   - Validated group_id
 * @param startTime - `Date.now()` captured before the tool call
 * @param meta      - Optional partial meta overrides (stores_used, degraded, etc.)
 */
export function successEnvelope<T>(
  data: T,
  tool: string,
  groupId: string,
  startTime: number,
  meta?: Partial<EnvelopeMeta>
): MemoryResponseEnvelope<T> {
  return {
    data,
    meta: {
      contract_version: "v1",
      tool,
      group_id: groupId,
      latency_ms: Date.now() - startTime,
      stores_used: meta?.stores_used ?? [],
      degraded: meta?.degraded ?? false,
      degraded_reason: meta?.degraded_reason,
      warnings: meta?.warnings,
    },
    error: null,
  }
}

/**
 * Build an error envelope for tool failures.
 *
 * @param code      - HTTP-style error code (422 for validation, 500 for internal)
 * @param message   - Human-readable error description
 * @param tool      - Canonical tool name
 * @param groupId   - The group_id from the request (may be invalid, but we include it)
 * @param startTime - `Date.now()` captured before the tool call
 * @param details   - Optional structured details for debugging
 */
export function errorEnvelope(
  code: number,
  message: string,
  tool: string,
  groupId: string,
  startTime: number,
  details?: unknown
): MemoryResponseEnvelope<never> {
  return {
    data: null,
    meta: {
      contract_version: "v1",
      tool,
      group_id: groupId,
      latency_ms: Date.now() - startTime,
      stores_used: [],
      degraded: false,
    },
    error: {
      code,
      message,
      details,
    },
  }
}

/**
 * Build a validation error envelope (always code 422).
 *
 * Convenience wrapper for the most common error case: missing or
 * invalid group_id.
 *
 * @param tool      - Canonical tool name
 * @param groupId   - The (possibly invalid) group_id from the request
 * @param startTime - `Date.now()` captured before the tool call
 * @param message   - Validation error message
 */
export function validationErrorEnvelope(
  tool: string,
  groupId: string,
  startTime: number,
  message: string
): MemoryResponseEnvelope<never> {
  return errorEnvelope(422, message, tool, groupId, startTime)
}