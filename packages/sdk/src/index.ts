/**
 * @allura/sdk — Public API barrel export
 *
 * This is the main entry point for the @allura/sdk package.
 * Import from `@allura/sdk` to access all types and the client.
 *
 * ```typescript
 * import { AlluraClient } from "@allura/sdk";
 *
 * const client = new AlluraClient({
 *   baseUrl: "http://localhost:3201",
 *   authToken: process.env.ALLURA_AUTH_TOKEN,
 * });
 *
 * const result = await client.memory.add({
 *   group_id: "allura-my-tenant",
 *   user_id: "user-123",
 *   content: "Remember this important fact",
 * });
 * ```
 *
 * Story 24.7 AC-1: typed clients for health/readiness, governed memory,
 * scenario execution, replay, evaluation, and evidence inspection — without
 * importing server internals.
 */

// ── Client ──────────────────────────────────────────────────────────────────

export { AlluraClient } from "./client.js";

// ── Memory Operations ────────────────────────────────────────────────────────

export { MemoryOperations } from "./memory.js";
export type { RequestFn } from "./memory.js";

// ── Harness Operations (scenario/replay/eval/evidence) ───────────────────────

export { HarnessOperations } from "./harness.js";
export type {
  ScenarioRunParams,
  ScenarioReplayParams,
  EvalRunParams,
  EvidenceInspectParams,
  ScenarioRunResponse,
  ScenarioReplayResponse,
  EvalRunResponse,
  EvidenceInspectResponse,
} from "./harness.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type {
  // Core scalars
  GroupId,
  MemoryId,
  UserId,
  MemoryContent,
  ConfidenceScore,
  StorageLocation,
  PromotionMode,
  MemoryProvenance,
  MemoryStatus,
  MemorySortOrder,
  MemoryRetrievalStore,
  // Config
  AlluraClientConfig,
  // Request params
  MemoryAddParams,
  MemorySearchParams,
  MemoryGetParams,
  MemoryListParams,
  MemoryDeleteParams,
  // Responses
  MemoryAddResponse,
  MemorySearchResult,
  MemorySearchResponse,
  MemoryGetResponse,
  MemoryListResponse,
  MemoryDeleteResponse,
  MemoryResponseMeta,
  HealthResponse,
} from "./types.js";

// ── Zod Schemas (for runtime validation) ──────────────────────────────────────

export {
  GroupIdSchema,
  MemoryIdSchema,
  ConfidenceScoreSchema,
  MemoryAddResponseSchema,
  MemorySearchResponseSchema,
  MemoryGetResponseSchema,
  MemoryListResponseSchema,
  MemoryDeleteResponseSchema,
  HealthResponseSchema,
} from "./types.js";

// ── Errors ───────────────────────────────────────────────────────────────────

export {
  AlluraError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ServerError,
  ConnectionError,
  RetryExhaustedError,
  createErrorFromResponse,
} from "./errors.js";

// ── Auth Helpers ─────────────────────────────────────────────────────────────

export { resolveAuthToken, requireAuthToken, createAuthHeader } from "./auth.js";

// ── Utilities ─────────────────────────────────────────────────────────────────

export {
  validateGroupId,
  withRetry,
  calculateBackoff,
  isRetryable,
  buildHeaders,
  normalizeBaseUrl,
  DEFAULT_TIMEOUT,
  DEFAULT_RETRIES,
} from "./utils.js";
