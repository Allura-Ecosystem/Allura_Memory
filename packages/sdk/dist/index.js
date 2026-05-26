/**
 * @allura/sdk — TypeScript SDK for Allura Memory
 * Copyright (c) Allura Memory Team. MIT License.
 */

// src/types.ts
import { z } from "zod";
var GroupIdSchema = z.string().min(2).max(64).regex(
  /^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
  "group_id must match pattern: ^allura-[a-z0-9-]+$ (ARCH-001 tenant isolation)"
);
var MemoryIdSchema = z.string().uuid({ message: "id must be a valid UUID v4" });
var ConfidenceScoreSchema = z.number().min(0).max(1);
var MemoryAddResponseSchema = z.object({
  id: z.string(),
  stored: z.enum(["episodic", "semantic", "both"]),
  score: z.number().min(0).max(1),
  pending_review: z.boolean().optional(),
  created_at: z.string(),
  meta: z.object({
    contract_version: z.literal("v1"),
    degraded: z.boolean(),
    degraded_reason: z.enum(["neo4j_unavailable", "graph_unavailable"]).optional(),
    stores_used: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    stores_attempted: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    warnings: z.array(z.string()).optional(),
    ruvector_trajectory_id: z.string().optional(),
    ruvector_count: z.number().int().min(0).optional()
  }).optional(),
  duplicate: z.boolean().optional(),
  duplicate_of: z.string().optional(),
  similarity: z.number().optional()
});
var MemorySearchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      score: z.number().min(0).max(1),
      source: z.enum(["episodic", "semantic", "both"]),
      provenance: z.enum(["conversation", "manual"]),
      created_at: z.string(),
      usage_count: z.number().optional()
    })
  ),
  count: z.number().int().min(0),
  latency_ms: z.number().min(0),
  meta: z.object({
    contract_version: z.literal("v1"),
    degraded: z.boolean(),
    degraded_reason: z.enum(["neo4j_unavailable", "graph_unavailable"]).optional(),
    stores_used: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    stores_attempted: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    warnings: z.array(z.string()).optional(),
    ruvector_trajectory_id: z.string().optional(),
    ruvector_count: z.number().int().min(0).optional()
  }).optional()
});
var MemoryGetResponseSchema = z.object({
  id: z.string(),
  content: z.string(),
  score: z.number().min(0).max(1),
  source: z.enum(["episodic", "semantic", "both"]),
  provenance: z.enum(["conversation", "manual"]),
  user_id: z.string(),
  actor: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  approver: z.string().nullable().optional(),
  group_id: z.string().regex(/^allura-.+$/).optional(),
  created_at: z.string(),
  status: z.enum(["approved", "proposed", "pending", "deprecated", "active", "deleted"]).optional(),
  source_event_id: z.string().nullable().optional(),
  proposal_id: z.string().nullable().optional(),
  trace_ref: z.union([z.string(), z.number()]).nullable().optional(),
  evidence: z.array(z.object({
    id: z.string().nullable(),
    type: z.enum(["event", "proposal", "trace", "version"]),
    label: z.string(),
    status: z.enum(["available", "unavailable"])
  })).optional(),
  version: z.number().int().optional(),
  superseded_by: z.string().optional(),
  usage_count: z.number().optional(),
  hash: z.string().nullable().optional(),
  previous_hash: z.string().nullable().optional(),
  meta: z.object({
    contract_version: z.literal("v1"),
    degraded: z.boolean(),
    degraded_reason: z.enum(["neo4j_unavailable", "graph_unavailable"]).optional(),
    stores_used: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    stores_attempted: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    warnings: z.array(z.string()).optional(),
    ruvector_trajectory_id: z.string().optional(),
    ruvector_count: z.number().int().min(0).optional()
  }).optional()
});
var MemoryListResponseSchema = z.object({
  memories: z.array(MemoryGetResponseSchema),
  total: z.number().int().min(0),
  has_more: z.boolean(),
  meta: z.object({
    contract_version: z.literal("v1"),
    degraded: z.boolean(),
    degraded_reason: z.enum(["neo4j_unavailable", "graph_unavailable"]).optional(),
    stores_used: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    stores_attempted: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    warnings: z.array(z.string()).optional(),
    ruvector_trajectory_id: z.string().optional(),
    ruvector_count: z.number().int().min(0).optional()
  }).optional()
});
var MemoryDeleteResponseSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
  deleted_at: z.string(),
  recovery_days: z.number().int().min(0),
  meta: z.object({
    contract_version: z.literal("v1"),
    degraded: z.boolean(),
    degraded_reason: z.enum(["neo4j_unavailable", "graph_unavailable"]).optional(),
    stores_used: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    stores_attempted: z.array(z.enum(["postgres", "neo4j", "graph", "ruvector"])),
    warnings: z.array(z.string()).optional(),
    ruvector_trajectory_id: z.string().optional(),
    ruvector_count: z.number().int().min(0).optional()
  }).optional()
});
var HealthResponseSchema = z.object({
  status: z.string(),
  mode: z.string(),
  interface: z.string(),
  transports: z.array(z.string()),
  mcp_endpoint: z.string(),
  port: z.number(),
  port_source: z.string(),
  auth_enabled: z.boolean(),
  warnings: z.array(z.string()).optional(),
  timestamp: z.string()
});

// src/errors.ts
var AlluraError = class _AlluraError extends Error {
  /** Machine-readable error code */
  code;
  /** HTTP status code (if applicable) */
  statusCode;
  /** Original response body (if available) */
  body;
  constructor(message, code, statusCode, body) {
    super(message);
    this.name = "AlluraError";
    this.code = code;
    this.statusCode = statusCode;
    this.body = body;
    Object.setPrototypeOf(this, _AlluraError.prototype);
  }
};
var AuthenticationError = class _AuthenticationError extends AlluraError {
  constructor(message = "Unauthorized: Invalid or missing Bearer token", body) {
    super(message, "AUTHENTICATION_ERROR", 401, body);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, _AuthenticationError.prototype);
  }
};
var ValidationError = class _ValidationError extends AlluraError {
  /** Field-level validation details */
  fields;
  constructor(message = "Validation error", fields, body) {
    super(message, "VALIDATION_ERROR", 400, body);
    this.name = "ValidationError";
    this.fields = fields;
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
};
var NotFoundError = class _NotFoundError extends AlluraError {
  constructor(message = "Resource not found", body) {
    super(message, "NOT_FOUND", 404, body);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, _NotFoundError.prototype);
  }
};
var RateLimitError = class _RateLimitError extends AlluraError {
  /** Suggested retry delay in seconds */
  retryAfter;
  constructor(message = "Rate limit exceeded", retryAfter, body) {
    super(message, "RATE_LIMIT_ERROR", 429, body);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, _RateLimitError.prototype);
  }
};
var ServerError = class _ServerError extends AlluraError {
  constructor(message = "Internal server error", statusCode = 500, body) {
    super(message, "SERVER_ERROR", statusCode, body);
    this.name = "ServerError";
    Object.setPrototypeOf(this, _ServerError.prototype);
  }
};
var ConnectionError = class _ConnectionError extends AlluraError {
  /** The original cause (if available) */
  cause;
  constructor(message = "Connection failed", cause) {
    super(message, "CONNECTION_ERROR", 0);
    this.name = "ConnectionError";
    this.cause = cause;
    Object.setPrototypeOf(this, _ConnectionError.prototype);
  }
};
var RetryExhaustedError = class _RetryExhaustedError extends AlluraError {
  /** Number of attempts made */
  attempts;
  /** The last error that caused the final retry failure */
  lastError;
  constructor(attempts, lastError) {
    super(
      `All ${attempts} retry attempts exhausted: ${lastError.message}`,
      "RETRY_EXHAUSTED",
      lastError instanceof AlluraError ? lastError.statusCode : 0
    );
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
    this.lastError = lastError;
    Object.setPrototypeOf(this, _RetryExhaustedError.prototype);
  }
};
function createErrorFromResponse(statusCode, body) {
  const message = typeof body === "object" && body !== null && "error" in body ? String(body.error) : `HTTP ${statusCode}`;
  switch (statusCode) {
    case 400:
      return new ValidationError(message, void 0, body);
    case 401:
      return new AuthenticationError(message, body);
    case 404:
      return new NotFoundError(message, body);
    case 429: {
      const retryAfter = typeof body === "object" && body !== null && "retry_after" in body ? Number(body.retry_after) : void 0;
      return new RateLimitError(message, retryAfter, body);
    }
    default:
      if (statusCode >= 500) {
        return new ServerError(message, statusCode, body);
      }
      return new AlluraError(message, "UNKNOWN_ERROR", statusCode, body);
  }
}

// src/utils.ts
var DEFAULT_TIMEOUT = 5e3;
var DEFAULT_RETRIES = 3;
var BASE_BACKOFF_MS = 200;
var MAX_BACKOFF_MS = 1e4;
var JITTER_FACTOR = 0.25;
function validateGroupId(groupId) {
  const result = GroupIdSchema.safeParse(groupId);
  if (!result.success) {
    const { error } = result;
    const fields = {};
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
function calculateBackoff(attempt) {
  const exponentialDelay = BASE_BACKOFF_MS * Math.pow(2, attempt);
  const jitter = exponentialDelay * JITTER_FACTOR * Math.random();
  const totalDelay = exponentialDelay + jitter;
  return Math.min(totalDelay, MAX_BACKOFF_MS);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function isRetryable(error) {
  if (error instanceof ConnectionError) return true;
  if (error instanceof AlluraError) {
    if (error.statusCode === 429) return true;
    if (error.statusCode >= 500) return true;
    return false;
  }
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  return false;
}
async function withRetry(fn, retries = DEFAULT_RETRIES) {
  let lastError = new Error("No attempts made");
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryable(error)) {
        throw error;
      }
      if (attempt < retries - 1) {
        const backoff = calculateBackoff(attempt);
        await sleep(backoff);
      }
    }
  }
  throw new RetryExhaustedError(retries, lastError);
}
function buildHeaders(authToken, contentType = "application/json") {
  const headers = {
    "Content-Type": contentType,
    "Accept": "application/json",
    "User-Agent": "@allura/sdk/0.1.0"
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
}
function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

// src/memory.ts
var MemoryOperations = class {
  request;
  constructor(requestFn) {
    this.request = requestFn;
  }
  /**
   * Add a memory for a user.
   *
   * Flow:
   * 1. Validate group_id
   * 2. Send memory_add request
   * 3. Return typed response with storage location and score
   *
   * @param params - Memory add parameters
   * @returns Memory add response with ID, storage location, and score
   * @throws {ValidationError} if group_id is invalid or content is empty
   * @throws {AuthenticationError} if auth token is invalid
   */
  async add(params) {
    validateGroupId(params.group_id);
    if (!params.content || params.content.trim().length === 0) {
      throw new ValidationError("content must not be empty", {
        content: ["content is required and must not be empty"]
      });
    }
    if (params.threshold !== void 0 && (params.threshold < 0 || params.threshold > 1)) {
      throw new ValidationError("threshold must be between 0 and 1", {
        threshold: ["threshold must be between 0 and 1"]
      });
    }
    return this.request("memory_add", params, MemoryAddResponseSchema);
  }
  /**
   * Search memories across both stores (PostgreSQL + Neo4j).
   * Federated search with results merged by relevance.
   *
   * @param params - Search parameters
   * @returns Search results with relevance scores
   * @throws {ValidationError} if group_id is invalid or query is empty
   */
  async search(params) {
    validateGroupId(params.group_id);
    if (!params.query || params.query.trim().length === 0) {
      throw new ValidationError("query must not be empty", {
        query: ["query is required and must not be empty"]
      });
    }
    if (params.limit !== void 0 && (params.limit < 1 || params.limit > 100)) {
      throw new ValidationError("limit must be between 1 and 100", {
        limit: ["limit must be between 1 and 100"]
      });
    }
    return this.request("memory_search", params, MemorySearchResponseSchema);
  }
  /**
   * Retrieve a single memory by ID.
   *
   * @param params - Get parameters (id and group_id)
   * @returns Memory details
   * @throws {ValidationError} if group_id is invalid
   * @throws {NotFoundError} if memory does not exist
   */
  async get(params) {
    validateGroupId(params.group_id);
    if (!params.id) {
      throw new ValidationError("id is required", {
        id: ["id must be a valid UUID"]
      });
    }
    return this.request("memory_get", params, MemoryGetResponseSchema);
  }
  /**
   * List all memories for a user within a tenant.
   * Returns from both stores, merged and sorted.
   *
   * @param params - List parameters
   * @returns Paginated list of memories
   * @throws {ValidationError} if group_id is invalid
   */
  async list(params) {
    validateGroupId(params.group_id);
    if (params.limit !== void 0 && (params.limit < 1 || params.limit > 1e3)) {
      throw new ValidationError("limit must be between 1 and 1000", {
        limit: ["limit must be between 1 and 1000"]
      });
    }
    if (params.offset !== void 0 && params.offset < 0) {
      throw new ValidationError("offset must be non-negative", {
        offset: ["offset must be >= 0"]
      });
    }
    return this.request("memory_list", params, MemoryListResponseSchema);
  }
  /**
   * Soft-delete a memory.
   * Appends deletion event to PostgreSQL and marks Neo4j node as deprecated.
   * Original rows remain for audit trail.
   *
   * @param params - Delete parameters (id, group_id, user_id)
   * @returns Deletion confirmation
   * @throws {ValidationError} if group_id is invalid
   * @throws {NotFoundError} if memory does not exist
   */
  async delete(params) {
    validateGroupId(params.group_id);
    if (!params.id) {
      throw new ValidationError("id is required", {
        id: ["id must be a valid UUID"]
      });
    }
    return this.request("memory_delete", params, MemoryDeleteResponseSchema);
  }
};

// src/auth.ts
function resolveAuthToken(explicitToken) {
  if (explicitToken) {
    return explicitToken;
  }
  if (typeof process !== "undefined" && process.env) {
    const envToken = process.env.ALLURA_AUTH_TOKEN || process.env.ALLURA_MCP_AUTH_TOKEN;
    if (envToken) {
      return envToken;
    }
  }
  return void 0;
}
function requireAuthToken(token, required) {
  if (required && !token) {
    throw new Error(
      "Authentication required: No Bearer token provided. Set ALLURA_AUTH_TOKEN or pass authToken to AlluraClient."
    );
  }
}
function createAuthHeader(token) {
  if (!token) return void 0;
  return `Bearer ${token}`;
}

// src/client.ts
function createRequestId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `allura-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
var AlluraClient = class {
  // Configuration
  baseUrl;
  authToken;
  timeout;
  retries;
  customFetch;
  // State
  state = "disconnected";
  // Operations
  memory;
  constructor(config) {
    if (!config.baseUrl) {
      throw new Error("AlluraClient requires a baseUrl");
    }
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.authToken = resolveAuthToken(config.authToken);
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.customFetch = config.fetch;
    this.memory = new MemoryOperations(this.makeRequest.bind(this));
  }
  // ── Connection Management ────────────────────────────────────────────────
  /**
   * Verify connectivity to the Allura Memory server.
   * Calls the /health endpoint and validates the response.
   *
   * @returns Health response from the server
   * @throws {ConnectionError} if the server is unreachable
   * @throws {AlluraError} if the server returns an error
   */
  async health() {
    const fetchFn = this.customFetch ?? globalThis.fetch;
    const url = `${this.baseUrl}/health`;
    const headers = buildHeaders(this.authToken);
    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const response = await fetchFn(url, {
            method: "GET",
            headers,
            signal: controller.signal
          });
          if (!response.ok) {
            const body2 = await this.parseResponseBody(response);
            throw createErrorFromResponse(response.status, body2);
          }
          const body = await this.parseResponseBody(response);
          return HealthResponseSchema.parse(body);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new ConnectionError(`Request timed out after ${this.timeout}ms`);
          }
          if (error instanceof AlluraError) {
            throw error;
          }
          throw new ConnectionError(
            `Failed to connect to Allura Memory at ${this.baseUrl}`,
            error instanceof Error ? error : void 0
          );
        } finally {
          clearTimeout(timeoutId);
        }
      },
      this.retries
    );
  }
  /**
   * Connect to the Allura Memory server.
   * Verifies connectivity by calling the health endpoint.
   *
   * @throws {ConnectionError} if the server is unreachable
   */
  async connect() {
    try {
      await this.health();
      this.state = "connected";
    } catch (error) {
      this.state = "error";
      throw error;
    }
  }
  /**
   * Disconnect from the server.
   * No-op for HTTP clients (connections are not persistent).
   */
  async disconnect() {
    this.state = "disconnected";
  }
  /**
   * Get the current connection state.
   */
  getState() {
    return this.state;
  }
  /**
   * Check if the client is connected.
   */
  get isConnected() {
    return this.state === "connected";
  }
  // ── Internal Request Handling ───────────────────────────────────────────
  /**
   * Make a request to the Allura Memory server.
   *
   * Sends an MCP JSON-RPC `tools/call` request to the canonical `/mcp`
   * endpoint and unwraps the tool result payload.
   *
   * @internal
   */
  async makeRequest(method, params, responseSchema) {
    const fetchFn = this.customFetch ?? globalThis.fetch;
    return withRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      try {
        const url = `${this.baseUrl}/mcp`;
        const headers = buildHeaders(this.authToken);
        const body = JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: method,
            arguments: params
          },
          id: createRequestId()
        });
        const response = await fetchFn(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal
        });
        if (!response.ok) {
          const responseBody2 = await this.parseResponseBody(response);
          throw createErrorFromResponse(response.status, responseBody2);
        }
        const responseBody = await this.parseResponseBody(response);
        const toolResult = this.unwrapToolResult(responseBody);
        const validated = responseSchema.parse(toolResult);
        return validated;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new ConnectionError(`Request timed out after ${this.timeout}ms`);
        }
        if (error instanceof AlluraError) {
          throw error;
        }
        if (error instanceof TypeError && error.message.includes("fetch")) {
          throw new ConnectionError(
            `Failed to connect to Allura Memory at ${this.baseUrl}`,
            error
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, this.retries);
  }
  unwrapToolResult(responseBody) {
    const rpc = responseBody;
    if (rpc.error) {
      throw new AlluraError(rpc.error.message ?? "MCP request failed", "MCP_ERROR", 500, rpc.error);
    }
    const result = rpc.result;
    if (!result) {
      return responseBody;
    }
    if (result.isError) {
      const text2 = result.content?.[0]?.text;
      if (text2) {
        try {
          const parsed = JSON.parse(text2);
          throw new AlluraError(parsed.error ?? text2, "MCP_TOOL_ERROR", 500, parsed);
        } catch {
          throw new AlluraError(text2, "MCP_TOOL_ERROR", 500, text2);
        }
      }
      throw new AlluraError("MCP tool request failed", "MCP_TOOL_ERROR", 500);
    }
    const text = result.content?.find((item) => item.type === "text")?.text;
    if (!text) {
      return result;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  /**
   * Parse the response body as JSON.
   * Handles empty responses and non-JSON content types gracefully.
   *
   * @internal
   */
  async parseResponseBody(response) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return {};
      }
    }
    try {
      const text = await response.text();
      if (!text) return {};
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
};
export {
  AlluraClient,
  AlluraError,
  AuthenticationError,
  ConfidenceScoreSchema,
  ConnectionError,
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT,
  GroupIdSchema,
  HealthResponseSchema,
  MemoryAddResponseSchema,
  MemoryDeleteResponseSchema,
  MemoryGetResponseSchema,
  MemoryIdSchema,
  MemoryListResponseSchema,
  MemoryOperations,
  MemorySearchResponseSchema,
  NotFoundError,
  RateLimitError,
  RetryExhaustedError,
  ServerError,
  ValidationError,
  buildHeaders,
  calculateBackoff,
  createAuthHeader,
  createErrorFromResponse,
  isRetryable,
  normalizeBaseUrl,
  requireAuthToken,
  resolveAuthToken,
  validateGroupId,
  withRetry
};
