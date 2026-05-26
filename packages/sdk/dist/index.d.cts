import { z } from 'zod';

/**
 * @allura/sdk — Public TypeScript types
 *
 * These types mirror the canonical contracts in
 * src/lib/memory/canonical-contracts.ts but are designed for
 * external consumers. They use plain string types (not branded types)
 * for ergonomics, with Zod validation enforcing invariants at runtime.
 *
 * Invariants:
 * - group_id is REQUIRED on every operation (enforced by Zod)
 * - group_id MUST match ^allura- (enforced by Zod)
 * - All responses include optional meta for degraded-mode awareness
 */

/** Tenant namespace — must match ^allura-[a-z0-9-]+$ */
type GroupId = string;
/** Memory identifier — UUID v4 */
type MemoryId = string;
/** User identifier within a tenant */
type UserId = string;
/** Memory content text */
type MemoryContent = string;
/** Confidence score (0.0 to 1.0) */
type ConfidenceScore = number;
/** Storage location */
type StorageLocation = "episodic" | "semantic" | "both";
/** Promotion mode */
type PromotionMode = "auto" | "soc2";
/** Memory provenance */
type MemoryProvenance = "conversation" | "manual";
/** Memory status in Neo4j */
type MemoryStatus = "active" | "deprecated";
/** Sort order for memory_list */
type MemorySortOrder = "created_at_desc" | "created_at_asc" | "score_desc" | "score_asc";
/** Backing stores that can be reported by canonical memory retrieval metadata. */
type MemoryRetrievalStore = "postgres" | "neo4j" | "graph" | "ruvector";
/** Validates group_id format: ^allura-[a-z0-9-]+$ */
declare const GroupIdSchema: z.ZodString;
/** Validates UUID v4 format */
declare const MemoryIdSchema: z.ZodString;
/** Validates confidence score range */
declare const ConfidenceScoreSchema: z.ZodNumber;
/** Configuration for AlluraClient */
interface AlluraClientConfig {
    /** Base URL of the Allura Memory HTTP gateway (e.g., http://localhost:3201) */
    baseUrl: string;
    /** Bearer token for authentication (optional in dev mode) */
    authToken?: string;
    /** Request timeout in milliseconds (default: 5000) */
    timeout?: number;
    /** Number of retry attempts with exponential backoff (default: 3) */
    retries?: number;
    /** Custom fetch implementation (for testing or edge runtimes) */
    fetch?: typeof globalThis.fetch;
}
/** Parameters for memory_add */
interface MemoryAddParams {
    /** Required: Tenant namespace (format: allura-*) */
    group_id: GroupId;
    /** Required: User identifier within tenant */
    user_id: UserId;
    /** Required: Memory content text */
    content: MemoryContent;
    /** Optional: Metadata */
    metadata?: {
        source?: MemoryProvenance;
        conversation_id?: string;
        agent_id?: string;
        [key: string]: unknown;
    };
    /** Optional: Override promotion threshold (default: 0.85) */
    threshold?: number;
}
/** Parameters for memory_search */
interface MemorySearchParams {
    /** Required: Search query */
    query: string;
    /** Required: Tenant namespace */
    group_id: GroupId;
    /** Optional: User identifier (scope to user) */
    user_id?: UserId;
    /** Optional: Maximum results (default: 10) */
    limit?: number;
    /** Optional: Minimum confidence filter */
    min_score?: ConfidenceScore;
    /** Optional: Include global memories (default: true) */
    include_global?: boolean;
}
/** Parameters for memory_get */
interface MemoryGetParams {
    /** Required: Memory identifier */
    id: MemoryId;
    /** Required: Tenant namespace */
    group_id: GroupId;
}
/** Parameters for memory_list */
interface MemoryListParams {
    /** Required: Tenant namespace */
    group_id: GroupId;
    /** Optional: User identifier. Omit only for tenant-scoped/admin listing. */
    user_id?: UserId;
    /** Optional: Maximum results (default: 50) */
    limit?: number;
    /** Optional: Pagination offset */
    offset?: number;
    /** Optional: Sort order (default: created_at_desc) */
    sort?: MemorySortOrder;
}
/** Parameters for memory_delete */
interface MemoryDeleteParams {
    /** Required: Memory identifier */
    id: MemoryId;
    /** Required: Tenant namespace */
    group_id: GroupId;
    /** Required: User identifier (for authorization) */
    user_id: UserId;
}
/** Execution metadata included in responses */
interface MemoryResponseMeta {
    contract_version: "v1";
    degraded: boolean;
    degraded_reason?: "neo4j_unavailable" | "graph_unavailable";
    stores_used: MemoryRetrievalStore[];
    stores_attempted: MemoryRetrievalStore[];
    warnings?: string[];
    /** RuVector trajectory ID for evidence-gated feedback, when RuVector was used. */
    ruvector_trajectory_id?: string;
    /** Number of results returned from RuVector, when available. */
    ruvector_count?: number;
}
/** Response from memory_add */
interface MemoryAddResponse {
    id: MemoryId;
    stored: StorageLocation;
    score: ConfidenceScore;
    pending_review?: boolean;
    created_at: string;
    meta?: MemoryResponseMeta;
    duplicate?: boolean;
    duplicate_of?: string;
    similarity?: number;
}
/** Individual search result */
interface MemorySearchResult {
    id: MemoryId;
    content: MemoryContent;
    score: ConfidenceScore;
    source: StorageLocation;
    provenance: MemoryProvenance;
    created_at: string;
    usage_count?: number;
}
/** Response from memory_search */
interface MemorySearchResponse {
    results: MemorySearchResult[];
    count: number;
    latency_ms: number;
    meta?: MemoryResponseMeta;
}
/** Response from memory_get */
interface MemoryGetResponse {
    id: MemoryId;
    content: MemoryContent;
    score: ConfidenceScore;
    source: StorageLocation;
    provenance: MemoryProvenance;
    user_id: UserId;
    actor?: UserId | null;
    creator?: UserId | null;
    approver?: UserId | null;
    /** Tenant namespace associated with the retrieved memory */
    group_id?: GroupId;
    created_at: string;
    status?: "approved" | "proposed" | "pending" | "deprecated" | "active" | "deleted";
    source_event_id?: string | null;
    proposal_id?: string | null;
    trace_ref?: string | number | null;
    evidence?: Array<{
        id: string | null;
        type: "event" | "proposal" | "trace" | "version";
        label: string;
        status: "available" | "unavailable";
    }>;
    version?: number;
    superseded_by?: MemoryId;
    usage_count?: number;
    hash?: string | null;
    previous_hash?: string | null;
    meta?: MemoryResponseMeta;
}
/** Response from memory_list */
interface MemoryListResponse {
    memories: MemoryGetResponse[];
    total: number;
    has_more: boolean;
    meta?: MemoryResponseMeta;
}
/** Response from memory_delete */
interface MemoryDeleteResponse {
    id: MemoryId;
    deleted: boolean;
    deleted_at: string;
    recovery_days: number;
    meta?: MemoryResponseMeta;
}
/** Health check response */
interface HealthResponse {
    status: string;
    mode: string;
    interface: string;
    transports: string[];
    mcp_endpoint: string;
    port: number;
    port_source: string;
    auth_enabled: boolean;
    warnings?: string[];
    timestamp: string;
}
declare const MemoryAddResponseSchema: z.ZodType<MemoryAddResponse>;
declare const MemorySearchResponseSchema: z.ZodType<MemorySearchResponse>;
declare const MemoryGetResponseSchema: z.ZodType<MemoryGetResponse>;
declare const MemoryListResponseSchema: z.ZodType<MemoryListResponse>;
declare const MemoryDeleteResponseSchema: z.ZodType<MemoryDeleteResponse>;
declare const HealthResponseSchema: z.ZodType<HealthResponse>;
declare class MemoryOperations {
    private readonly request;
    constructor(requestFn: RequestFn);
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
    add(params: MemoryAddParams): Promise<MemoryAddResponse>;
    /**
     * Search memories across both stores (PostgreSQL + Neo4j).
     * Federated search with results merged by relevance.
     *
     * @param params - Search parameters
     * @returns Search results with relevance scores
     * @throws {ValidationError} if group_id is invalid or query is empty
     */
    search(params: MemorySearchParams): Promise<MemorySearchResponse>;
    /**
     * Retrieve a single memory by ID.
     *
     * @param params - Get parameters (id and group_id)
     * @returns Memory details
     * @throws {ValidationError} if group_id is invalid
     * @throws {NotFoundError} if memory does not exist
     */
    get(params: MemoryGetParams): Promise<MemoryGetResponse>;
    /**
     * List all memories for a user within a tenant.
     * Returns from both stores, merged and sorted.
     *
     * @param params - List parameters
     * @returns Paginated list of memories
     * @throws {ValidationError} if group_id is invalid
     */
    list(params: MemoryListParams): Promise<MemoryListResponse>;
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
    delete(params: MemoryDeleteParams): Promise<MemoryDeleteResponse>;
}

/**
 * @allura/sdk — AlluraClient
 *
 * Main client class for interacting with Allura Memory.
 * Uses MCP Streamable HTTP transport via the canonical /mcp endpoint.
 *
 * Usage:
 * ```typescript
 * const client = new AlluraClient({
 *   baseUrl: "http://localhost:3201",
 *   authToken: process.env.ALLURA_AUTH_TOKEN,
 * });
 *
 * // Add a memory
 * const result = await client.memory.add({
 *   group_id: "allura-my-tenant",
 *   user_id: "user-123",
 *   content: "Remember this important fact",
 * });
 *
 * // Search memories
 * const results = await client.memory.search({
 *   query: "important fact",
 *   group_id: "allura-my-tenant",
 * });
 * ```
 */

type ClientState = "disconnected" | "connected" | "error";
declare class AlluraClient {
    private readonly baseUrl;
    private readonly authToken;
    private readonly timeout;
    private readonly retries;
    private readonly customFetch;
    private state;
    readonly memory: MemoryOperations;
    constructor(config: AlluraClientConfig);
    /**
     * Verify connectivity to the Allura Memory server.
     * Calls the /health endpoint and validates the response.
     *
     * @returns Health response from the server
     * @throws {ConnectionError} if the server is unreachable
     * @throws {AlluraError} if the server returns an error
     */
    health(): Promise<HealthResponse>;
    /**
     * Connect to the Allura Memory server.
     * Verifies connectivity by calling the health endpoint.
     *
     * @throws {ConnectionError} if the server is unreachable
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the server.
     * No-op for HTTP clients (connections are not persistent).
     */
    disconnect(): Promise<void>;
    /**
     * Get the current connection state.
     */
    getState(): ClientState;
    /**
     * Check if the client is connected.
     */
    get isConnected(): boolean;
    /**
     * Make a request to the Allura Memory server.
     *
     * Sends an MCP JSON-RPC `tools/call` request to the canonical `/mcp`
     * endpoint and unwraps the tool result payload.
     *
     * @internal
     */
    private makeRequest;
    private unwrapToolResult;
    /**
     * Parse the response body as JSON.
     * Handles empty responses and non-JSON content types gracefully.
     *
     * @internal
     */
    private parseResponseBody;
}

/**
 * @allura/sdk — Custom error classes
 *
 * Hierarchy:
 *   AlluraError
 *   ├── AuthenticationError  (401)
 *   ├── ValidationError       (400)
 *   ├── NotFoundError        (404)
 *   ├── RateLimitError       (429)
 *   ├── ServerError          (500)
 *   └── ConnectionError      (network)
 */
/**
 * Base error class for all Allura SDK errors.
 * Includes machine-readable error code and HTTP status code.
 */
declare class AlluraError extends Error {
    /** Machine-readable error code */
    readonly code: string;
    /** HTTP status code (if applicable) */
    readonly statusCode: number;
    /** Original response body (if available) */
    readonly body?: unknown;
    constructor(message: string, code: string, statusCode: number, body?: unknown);
}
/**
 * Thrown when authentication fails (HTTP 401).
 * The Bearer token is missing, invalid, or expired.
 */
declare class AuthenticationError extends AlluraError {
    constructor(message?: string, body?: unknown);
}
/**
 * Thrown when request validation fails (HTTP 400).
 * Includes group_id format violations and missing required fields.
 */
declare class ValidationError extends AlluraError {
    /** Field-level validation details */
    readonly fields?: Record<string, string[]>;
    constructor(message?: string, fields?: Record<string, string[]>, body?: unknown);
}
/**
 * Thrown when a requested resource is not found (HTTP 404).
 * Includes memory not found and unknown tool errors.
 */
declare class NotFoundError extends AlluraError {
    constructor(message?: string, body?: unknown);
}
/**
 * Thrown when rate limit is exceeded (HTTP 429).
 * Includes retry-after hint when available.
 */
declare class RateLimitError extends AlluraError {
    /** Suggested retry delay in seconds */
    readonly retryAfter?: number;
    constructor(message?: string, retryAfter?: number, body?: unknown);
}
/**
 * Thrown when the server encounters an internal error (HTTP 5xx).
 */
declare class ServerError extends AlluraError {
    constructor(message?: string, statusCode?: number, body?: unknown);
}
/**
 * Thrown when the SDK cannot connect to the Allura server.
 * Network-level errors: DNS failure, connection refused, timeout.
 */
declare class ConnectionError extends AlluraError {
    /** The original cause (if available) */
    readonly cause?: Error;
    constructor(message?: string, cause?: Error);
}
/**
 * Thrown when all retry attempts are exhausted.
 * Wraps the last error that caused the final retry failure.
 */
declare class RetryExhaustedError extends AlluraError {
    /** Number of attempts made */
    readonly attempts: number;
    /** The last error that caused the final retry failure */
    readonly lastError: Error;
    constructor(attempts: number, lastError: Error);
}
/**
 * Create an appropriate AlluraError from an HTTP response.
 *
 * @internal
 */
declare function createErrorFromResponse(statusCode: number, body: unknown): AlluraError;

/**
 * @allura/sdk — Auth helpers
 *
 * Bearer token management for Allura Memory authentication.
 */
/**
 * Resolve an auth token from multiple sources.
 *
 * Priority:
 * 1. Explicit token passed to AlluraClient
 * 2. ALLURA_AUTH_TOKEN environment variable
 * 3. ALLURA_MCP_AUTH_TOKEN environment variable
 * 4. No auth (development mode — server will accept requests without token)
 *
 * @param explicitToken - Token passed directly to the client
 * @returns The resolved token, or undefined if no auth is configured
 */
declare function resolveAuthToken(explicitToken?: string): string | undefined;
/**
 * Validate that an auth token is present when required.
 *
 * @param token - The resolved token
 * @param required - Whether auth is required
 * @throws {Error} if auth is required but no token is available
 */
declare function requireAuthToken(token: string | undefined, required: boolean): void;
/**
 * Create an Authorization header value from a token.
 *
 * @param token - The auth token
 * @returns "Bearer <token>" header value, or undefined if no token
 */
declare function createAuthHeader(token?: string): string | undefined;

/**
 * @allura/sdk — Internal utilities
 *
 * Retry with exponential backoff, group_id validation,
 * and request/response helpers.
 */
/** Default request timeout in milliseconds */
declare const DEFAULT_TIMEOUT = 5000;
/** Default number of retry attempts */
declare const DEFAULT_RETRIES = 3;
/**
 * Validate a group_id against the Allura naming convention.
 * Must match ^allura-[a-z0-9-]+$ (ARCH-001 tenant isolation).
 *
 * @throws {import("./errors.js").ValidationError} if group_id is invalid
 */
declare function validateGroupId(groupId: string): void;
/**
 * Calculate backoff delay with jitter.
 *
 * Formula: min(BASE_BACKOFF * 2^attempt + random_jitter, MAX_BACKOFF)
 *
 * @param attempt - Zero-indexed attempt number
 * @returns Delay in milliseconds
 */
declare function calculateBackoff(attempt: number): number;
/**
 * Determine if an error is retryable.
 *
 * Retryable: ConnectionError, 429 RateLimitError, 5xx ServerError.
 * Not retryable: 400 ValidationError, 401 AuthenticationError, 404 NotFoundError.
 */
declare function isRetryable(error: unknown): boolean;
/**
 * Execute a function with retry and exponential backoff.
 *
 * @param fn - The async function to execute
 * @param retries - Maximum number of retry attempts
 * @returns The result of the function
 * @throws {RetryExhaustedError} if all retries are exhausted
 */
declare function withRetry<T>(fn: () => Promise<T>, retries?: number): Promise<T>;
/**
 * Build request headers with optional Bearer token.
 */
declare function buildHeaders(authToken?: string, contentType?: string): Record<string, string>;
/**
 * Normalize a base URL by removing trailing slashes.
 */
declare function normalizeBaseUrl(url: string): string;

export { AlluraClient, type AlluraClientConfig, AlluraError, AuthenticationError, type ConfidenceScore, ConfidenceScoreSchema, ConnectionError, DEFAULT_RETRIES, DEFAULT_TIMEOUT, type GroupId, GroupIdSchema, type HealthResponse, HealthResponseSchema, type MemoryAddParams, type MemoryAddResponse, MemoryAddResponseSchema, type MemoryContent, type MemoryDeleteParams, type MemoryDeleteResponse, MemoryDeleteResponseSchema, type MemoryGetParams, type MemoryGetResponse, MemoryGetResponseSchema, type MemoryId, MemoryIdSchema, type MemoryListParams, type MemoryListResponse, MemoryListResponseSchema, MemoryOperations, type MemoryProvenance, type MemoryResponseMeta, type MemoryRetrievalStore, type MemorySearchParams, type MemorySearchResponse, MemorySearchResponseSchema, type MemorySearchResult, type MemorySortOrder, type MemoryStatus, NotFoundError, type PromotionMode, RateLimitError, type RequestFn, RetryExhaustedError, ServerError, type StorageLocation, type UserId, ValidationError, buildHeaders, calculateBackoff, createAuthHeader, createErrorFromResponse, isRetryable, normalizeBaseUrl, requireAuthToken, resolveAuthToken, validateGroupId, withRetry };
