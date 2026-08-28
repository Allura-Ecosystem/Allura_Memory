/**
 * @allura/sdk — Public contract test
 *
 * Proves the public barrel export (`@allura/sdk` → `src/index.ts`) exposes the
 * full documented surface. This addresses the adversarial review finding that
 * existing tests imported retained internal modules directly rather than
 * proving the overwritten public index contract.
 *
 * Story 24.7 AC-1 / AC-2: typed clients and versioned schemas are exported
 * from the public entry point without importing server internals.
 */

import { describe, expect, it } from "vitest";

// Import from the PUBLIC barrel (index.ts), not internal modules.
import {
  AlluraClient,
  AlluraError,
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  RateLimitError,
  RetryExhaustedError,
  ServerError,
  ValidationError,
  createErrorFromResponse,
  MemoryOperations,
  resolveAuthToken,
  requireAuthToken,
  createAuthHeader,
  validateGroupId,
  withRetry,
  calculateBackoff,
  isRetryable,
  buildHeaders,
  normalizeBaseUrl,
  DEFAULT_TIMEOUT,
  DEFAULT_RETRIES,
  GroupIdSchema,
  MemoryIdSchema,
  ConfidenceScoreSchema,
  MemoryAddResponseSchema,
  MemorySearchResponseSchema,
  MemoryGetResponseSchema,
  MemoryListResponseSchema,
  MemoryDeleteResponseSchema,
  HealthResponseSchema,
} from "../src/index.js";

describe("@allura/sdk public contract", () => {
  it("exports the AlluraClient class", () => {
    expect(typeof AlluraClient).toBe("function");
  });

  it("exports the MemoryOperations class", () => {
    expect(typeof MemoryOperations).toBe("function");
  });

  it("exports all error classes", () => {
    expect(typeof AlluraError).toBe("function");
    expect(typeof AuthenticationError).toBe("function");
    expect(typeof ValidationError).toBe("function");
    expect(typeof NotFoundError).toBe("function");
    expect(typeof RateLimitError).toBe("function");
    expect(typeof ServerError).toBe("function");
    expect(typeof ConnectionError).toBe("function");
    expect(typeof RetryExhaustedError).toBe("function");
    expect(typeof createErrorFromResponse).toBe("function");
  });

  it("exports auth helpers", () => {
    expect(typeof resolveAuthToken).toBe("function");
    expect(typeof requireAuthToken).toBe("function");
    expect(typeof createAuthHeader).toBe("function");
  });

  it("exports utility helpers and constants", () => {
    expect(typeof validateGroupId).toBe("function");
    expect(typeof withRetry).toBe("function");
    expect(typeof calculateBackoff).toBe("function");
    expect(typeof isRetryable).toBe("function");
    expect(typeof buildHeaders).toBe("function");
    expect(typeof normalizeBaseUrl).toBe("function");
    expect(DEFAULT_TIMEOUT).toBeGreaterThan(0);
    expect(DEFAULT_RETRIES).toBeGreaterThan(0);
  });

  it("exports versioned Zod schemas for runtime validation", () => {
    expect(typeof GroupIdSchema.parse).toBe("function");
    expect(typeof MemoryIdSchema.parse).toBe("function");
    expect(typeof ConfidenceScoreSchema.parse).toBe("function");
    expect(typeof MemoryAddResponseSchema.parse).toBe("function");
    expect(typeof MemorySearchResponseSchema.parse).toBe("function");
    expect(typeof MemoryGetResponseSchema.parse).toBe("function");
    expect(typeof MemoryListResponseSchema.parse).toBe("function");
    expect(typeof MemoryDeleteResponseSchema.parse).toBe("function");
    expect(typeof HealthResponseSchema.parse).toBe("function");
  });

  it("GroupIdSchema enforces the tenant-isolation contract (ARCH-001)", () => {
    expect(GroupIdSchema.safeParse("allura-my-tenant").success).toBe(true);
    expect(GroupIdSchema.safeParse("not-allura").success).toBe(false);
  });

  it("createErrorFromResponse maps HTTP status codes to typed errors", () => {
    expect(createErrorFromResponse(400, {})).toBeInstanceOf(ValidationError);
    expect(createErrorFromResponse(401, {})).toBeInstanceOf(AuthenticationError);
    expect(createErrorFromResponse(404, {})).toBeInstanceOf(NotFoundError);
    expect(createErrorFromResponse(429, {})).toBeInstanceOf(RateLimitError);
    expect(createErrorFromResponse(500, {})).toBeInstanceOf(ServerError);
  });
});
