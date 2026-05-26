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

import { z } from "zod";

// ── Core Scalar Types ──────────────────────────────────────────────────────

/** Tenant namespace — must match ^allura-[a-z0-9-]+$ */
export type GroupId = string;

/** Memory identifier — UUID v4 */
export type MemoryId = string;

/** User identifier within a tenant */
export type UserId = string;

/** Memory content text */
export type MemoryContent = string;

/** Confidence score (0.0 to 1.0) */
export type ConfidenceScore = number;

/** Storage location */
export type StorageLocation = "episodic" | "semantic" | "both";

/** Promotion mode */
export type PromotionMode = "auto" | "soc2";

/** Memory provenance */
export type MemoryProvenance = "conversation" | "manual";

/** Memory status in Neo4j */
export type MemoryStatus = "active" | "deprecated";

/** Sort order for memory_list */
export type MemorySortOrder =
  | "created_at_desc"
  | "created_at_asc"
  | "score_desc"
  | "score_asc";

/** Backing stores that can be reported by canonical memory retrieval metadata. */
export type MemoryRetrievalStore = "postgres" | "neo4j" | "graph" | "ruvector";

// ── Zod Schemas ────────────────────────────────────────────────────────────

/** Validates group_id format: ^allura-[a-z0-9-]+$ */
export const GroupIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "group_id must match pattern: ^allura-[a-z0-9-]+$ (ARCH-001 tenant isolation)"
  );

/** Validates UUID v4 format */
export const MemoryIdSchema = z
  .string()
  .uuid({ message: "id must be a valid UUID v4" });

/** Validates confidence score range */
export const ConfidenceScoreSchema = z.number().min(0).max(1);

// ── Request Types ──────────────────────────────────────────────────────────

/** Configuration for AlluraClient */
export interface AlluraClientConfig {
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
export interface MemoryAddParams {
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
export interface MemorySearchParams {
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
export interface MemoryGetParams {
  /** Required: Memory identifier */
  id: MemoryId;
  /** Required: Tenant namespace */
  group_id: GroupId;
}

/** Parameters for memory_list */
export interface MemoryListParams {
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
export interface MemoryDeleteParams {
  /** Required: Memory identifier */
  id: MemoryId;
  /** Required: Tenant namespace */
  group_id: GroupId;
  /** Required: User identifier (for authorization) */
  user_id: UserId;
}

// ── Response Types ──────────────────────────────────────────────────────────

/** Execution metadata included in responses */
export interface MemoryResponseMeta {
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
export interface MemoryAddResponse {
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
export interface MemorySearchResult {
  id: MemoryId;
  content: MemoryContent;
  score: ConfidenceScore;
  source: StorageLocation;
  provenance: MemoryProvenance;
  created_at: string;
  usage_count?: number;
}

/** Response from memory_search */
export interface MemorySearchResponse {
  results: MemorySearchResult[];
  count: number;
  latency_ms: number;
  meta?: MemoryResponseMeta;
}

/** Response from memory_get */
export interface MemoryGetResponse {
  id: MemoryId;
  content: MemoryContent;
  score: ConfidenceScore;
  source: StorageLocation;
  provenance: MemoryProvenance;
  user_id: UserId;
  actor?: UserId | null;
  creator?: UserId | null;
  approver?: UserId | null;
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
export interface MemoryListResponse {
  memories: MemoryGetResponse[];
  total: number;
  has_more: boolean;
  meta?: MemoryResponseMeta;
}

/** Response from memory_delete */
export interface MemoryDeleteResponse {
  id: MemoryId;
  deleted: boolean;
  deleted_at: string;
  recovery_days: number;
  meta?: MemoryResponseMeta;
}

/** Health check response */
export interface HealthResponse {
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

// ── Zod Response Schemas ────────────────────────────────────────────────────

const MemoryRetrievalStoreSchema = z.enum(["postgres", "neo4j", "graph", "ruvector"]);

const MemoryResponseMetaSchema = z.object({
  contract_version: z.literal("v1"),
  degraded: z.boolean(),
  degraded_reason: z.enum(["neo4j_unavailable", "graph_unavailable"]).optional(),
  stores_used: z.array(MemoryRetrievalStoreSchema),
  stores_attempted: z.array(MemoryRetrievalStoreSchema),
  warnings: z.array(z.string()).optional(),
  ruvector_trajectory_id: z.string().optional(),
  ruvector_count: z.number().int().min(0).optional(),
});

export const MemoryAddResponseSchema = z.object({
  id: z.string(),
  stored: z.enum(["episodic", "semantic", "both"]),
  score: z.number().min(0).max(1),
  pending_review: z.boolean().optional(),
  created_at: z.string(),
  meta: MemoryResponseMetaSchema.optional(),
  duplicate: z.boolean().optional(),
  duplicate_of: z.string().optional(),
  similarity: z.number().optional(),
});

export const MemorySearchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      score: z.number().min(0).max(1),
      source: z.enum(["episodic", "semantic", "both"]),
      provenance: z.enum(["conversation", "manual"]),
      created_at: z.string(),
      usage_count: z.number().optional(),
    })
  ),
  count: z.number().int().min(0),
  latency_ms: z.number().min(0),
  meta: MemoryResponseMetaSchema.optional(),
});

export const MemoryGetResponseSchema = z.object({
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
    status: z.enum(["available", "unavailable"]),
  })).optional(),
  version: z.number().int().optional(),
  superseded_by: z.string().optional(),
  usage_count: z.number().optional(),
  hash: z.string().nullable().optional(),
  previous_hash: z.string().nullable().optional(),
  meta: MemoryResponseMetaSchema.optional(),
});

export const MemoryListResponseSchema = z.object({
  memories: z.array(MemoryGetResponseSchema),
  total: z.number().int().min(0),
  has_more: z.boolean(),
  meta: MemoryResponseMetaSchema.optional(),
});

export const MemoryDeleteResponseSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
  deleted_at: z.string(),
  recovery_days: z.number().int().min(0),
  meta: MemoryResponseMetaSchema.optional(),
});

export const HealthResponseSchema = z.object({
  status: z.string(),
  mode: z.string(),
  interface: z.string(),
  transports: z.array(z.string()),
  mcp_endpoint: z.string(),
  port: z.number(),
  port_source: z.string(),
  auth_enabled: z.boolean(),
  warnings: z.array(z.string()).optional(),
  timestamp: z.string(),
});
