/**
 * Typed contract for the Allura Memory retrieval gateway.
 * Enforces structure at the boundary to prevent accidental complexity
 * leaking into downstream consumers.
 */

export interface SearchRequest {
  /** The semantic query string */
  query: string;
  /** Tenant namespace — REQUIRED, enforced by policy */
  group_id: string;
  /** User identifier — must match agent identity */
  user_id: string;
  /** Maximum results to return (capped by config) */
  limit?: number;
  /** Minimum relevance score threshold (0–1) */
  min_score?: number;
  /** Optional key-value filters (e.g., source, conversation_id) */
  filters?: Record<string, string | number | boolean>;
  /** Whether to include global/shared memories */
  include_global?: boolean;
}

export interface MemoryResult {
  /** Unique memory identifier */
  id: string;
  /** Raw content text */
  content: string;
  /** Relevance score (0–1) */
  score: number;
  /** Source store: 'episodic' | 'semantic' | 'merged' */
  source: 'episodic' | 'semantic' | 'merged';
  /** Tenant namespace */
  group_id: string;
  /** User identifier */
  user_id: string;
  /** Optional metadata payload */
  metadata?: Record<string, unknown>;
  /** ISO 8601 creation timestamp */
  created_at?: string;
  /** Schema version of this memory (for compatibility checks) */
  schema_version?: number;
}

export interface SearchResponse {
  /** Retrieved memories, sorted by score desc */
  results: MemoryResult[];
  /** Total matched before limit */
  total: number;
  /** True if any non-fatal degradation occurred */
  degraded: boolean;
  /** Human-readable warnings for degraded paths */
  warnings: string[];
  /** Round-trip latency in milliseconds */
  latency_ms: number;
  /** Contract version for compatibility */
  version: string;
  /** Schema version of the response data */
  schema_version?: number;
}

export interface RetrievalConfig {
  /** Fallback group_id if request omits it (should still be rejected by policy) */
  default_group_id?: string;
  /** Hard cap on results per query */
  max_results: number;
  /** Minimum score threshold below which results are discarded */
  min_score_threshold: number;
  /** PostgreSQL connection string */
  postgres_url: string;
  /** Contract semver */
  version: string;
}

export const DEFAULT_RETRIEVAL_CONFIG: Partial<RetrievalConfig> = {
  max_results: 50,
  min_score_threshold: 0.85,
  version: '1.0.0',
};
