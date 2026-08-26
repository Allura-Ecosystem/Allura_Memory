/**
 * Graph Adapter Types — Slice C Interface Contracts
 *
 * Defines the IGraphAdapter interface that abstracts all graph operations
 * currently performed by inline Neo4j Cypher in canonical-tools.ts.
 *
 * Design principle: The adapter captures the 13 Cypher operations as method
 * contracts. Two implementations exist:
 *   1. Neo4jGraphAdapter — wraps existing neo4j-driver (legacy, Slice C)
 *   2. RuVectorGraphAdapter — PostgreSQL tables with adjacency lists (Slice C+)
 *
 * The feature flag GRAPH_BACKEND=neo4j|ruvector selects the implementation.
 * Both adapters MUST produce identical results for the same inputs.
 *
 * ADR: See docs/allura/RISKS-AND-DECISIONS.md AD-029
 *
 * Key observations driving this design:
 * - Neo4j is used for document storage with versioning, NOT graph traversal
 * - SUPERSEDES is the only relationship type
 * - No path queries, no shortestPath, no multi-hop traversals
 * - All queries are single-node lookups or full-text search
 * - This is table work wearing a graph costume — accidental complexity
 */

import type { ConfidenceScore, GroupId, MemoryId, MemoryProvenance } from "@/lib/memory/canonical-contracts"

// ── Graph Memory Node ────────────────────────────────────────────────────────

/**
 * A memory node as stored in the graph layer.
 *
 * Maps to the Neo4j Memory label properties.
 * The RuVectorGraphAdapter stores equivalent data in a PG table.
 */
export interface GraphMemoryNode {
  /** Unique memory identifier (UUID) */
  id: MemoryId
  /** Tenant isolation key */
  group_id: GroupId
  /** User within tenant */
  user_id: string | null
  /** Memory text content */
  content: string
  /** Confidence score (0-1) */
  score: ConfidenceScore
  /** How this memory was created */
  provenance: MemoryProvenance
  /** ISO 8601 creation timestamp */
  created_at: string
  /** Version number (incremented on SUPERSEDES) */
  version: number
  /** Optional tags */
  tags: string[]
  /** Whether this node is soft-deleted */
  deprecated: boolean
  /** When this node was soft-deleted (ISO 8601 or null) */
  deleted_at: string | null
  /** When this node was restored (ISO 8601 or null) */
  restored_at: string | null
  /** Schema version for compatibility checks */
  schema_version?: number
}

/**
 * Result of a full-text search query against the graph layer.
 */
export interface GraphSearchResult {
  /** Memory node data */
  id: MemoryId
  content: string
  score: ConfidenceScore
  provenance: MemoryProvenance
  created_at: string
  usage_count: number
  tags: string[]
  /** Full-text relevance score from the search engine */
  relevance: number
  /** Schema version for compatibility checks */
  schema_version?: number
}

/**
 * Result of a duplicate check.
 */
export interface DuplicateCheckResult {
  /** ID of the existing memory if duplicate found, null otherwise */
  existingId: MemoryId | null
}

/**
 * Result of a version lookup for SUPERSEDES.
 */
export interface VersionLookupResult {
  /** Current version number of the memory, or null if not found */
  version: number | null
  /** Whether the memory exists in the graph layer */
  exists: boolean
}

/**
 * Result of a canonical check (used by memory_promote).
 */
export interface CanonicalCheckResult {
  /** Whether the memory is currently canonical (active, not superseded, not deprecated) */
  isCanonical: boolean
}

/**
 * Result of a count query.
 */
export interface CountResult {
  /** Total count of matching nodes */
  total: number
}

/**
 * Result of a list query (paginated).
 */
export interface GraphListResult {
  /** Memory nodes matching the query */
  memories: GraphMemoryNode[]
  /** Total count (before pagination) */
  total: number
}

/**
 * Result of a single-node lookup.
 */
export interface GraphGetResult {
  /** The memory node, or null if not found */
  node: GraphMemoryNode | null
}

/**
 * Result of a soft-delete operation.
 */
export interface GraphDeleteResult {
  /** Whether the delete was applied (false if node not found) */
  deleted: boolean
}

/**
 * Result of a SUPERSEDES (versioned update) operation.
 */
export interface GraphSupersedesResult {
  /** ID of the new version node */
  newId: MemoryId
  /** Version number of the new node */
  newVersion: number
  /** Whether the operation succeeded */
  success: boolean
}

/**
 * Result of a restore operation.
 */
export interface GraphRestoreResult {
  /** Whether the restore was applied */
  restored: boolean
}

/**
 * Result of an export query.
 */
export interface GraphExportResult {
  /** Exported memory nodes */
  memories: GraphMemoryNode[]
}

// ── IGraphAdapter Interface ──────────────────────────────────────────────────

/**
 * Graph Adapter Interface — abstracts all graph-layer operations.
 *
 * This interface captures every Cypher query currently in canonical-tools.ts
 * as a typed method contract. Implementations MUST produce identical results
 * for the same inputs.
 *
 * Invariants enforced by all implementations:
 * - group_id on every read/write
 * - SUPERSEDES for versioning (never mutate historical nodes)
 * - Soft-delete via deprecated flag (never hard-delete)
 * - Parameterized queries only (no string interpolation)
 *
 * Thread safety: All methods MUST be safe to call concurrently.
 * Error handling: Methods throw GraphAdapterError on failure.
 */
export interface IGraphAdapter {
  // ── Write Operations ───────────────────────────────────────────────────

  /**
   * Create a new memory node.
   * Used by: explicit curator-approved semantic promotion paths.
   *
   * @param node - Memory node data (id, group_id, user_id, content, score, provenance, created_at)
   * @returns The created node's ID
   */
  createMemory(params: {
    id: MemoryId
    group_id: GroupId
    workspace_id: string
    principal_id: string
    user_id: string | null
    content: string
    score: ConfidenceScore
    provenance: MemoryProvenance
    created_at: string
  }): Promise<MemoryId>

  /**
   * Check for exact-match duplicate and return existing ID if found.
   * Used by: memory_add (duplicate check before promotion)
   *
   * @param groupId - Tenant isolation key
   * @param userId - User within tenant (null = any user)
   * @param content - Exact content to match
   * @returns Duplicate check result
   */
  checkDuplicate(params: {
    group_id: GroupId
    user_id: string | null
    content: string
  }): Promise<DuplicateCheckResult>

  /**
   * Create a new version of a memory via SUPERSEDES relationship.
   * Marks the previous version as deprecated.
   * Used by: memory_update
   *
   * @param prevId - ID of the memory to supersede
   * @param newId - ID for the new version
   * @param group_id - Tenant isolation key
   * @param user_id - User within tenant
   * @param content - New content
   * @param version - New version number
   * @param created_at - ISO 8601 timestamp
   * @returns SUPERSEDES result with new version info
   */
  supersedesMemory(params: {
    prev_id: MemoryId
    new_id: MemoryId
    group_id: GroupId
    workspace_id: string
    principal_id: string
    user_id: string | null
    content: string
    version: number
    created_at: string
  }): Promise<GraphSupersedesResult>

  /**
   * Soft-delete a memory (mark as deprecated).
   * Used by: memory_delete
   *
   * @param id - Memory ID to delete
   * @param group_id - Tenant isolation key
   * @param deleted_at - ISO 8601 deletion timestamp
   * @returns Whether the delete was applied
   */
  softDeleteMemory(params: {
    id: MemoryId
    group_id: GroupId
    deleted_at: string
  }): Promise<GraphDeleteResult>

  /**
   * Restore a soft-deleted memory.
   * Removes deprecated flag, removes incoming SUPERSEDES relationships,
   * sets restored_at timestamp.
   * Used by: memory_restore
   *
   * @param id - Memory ID to restore
   * @param group_id - Tenant isolation key
   * @param restored_at - ISO 8601 restore timestamp
   * @returns Whether the restore was applied
   */
  restoreMemory(params: {
    id: MemoryId
    group_id: GroupId
    restored_at: string
  }): Promise<GraphRestoreResult>

  // ── Read Operations ─────────────────────────────────────────────────────

  /**
   * Get a single memory by ID (canonical version only — not superseded).
   * Used by: memory_get
   *
   * @param id - Memory ID
   * @param group_id - Tenant isolation key
   * @returns The memory node, or null if not found
   */
  getMemory(params: { id: MemoryId; group_id: GroupId; workspace_id: string; principal_id: string }): Promise<GraphGetResult>

  /**
   * Full-text search for memories.
   * Used by: memory_search (fallback 1)
   *
   * @param query - Search query string
   * @param group_id - Tenant isolation key
   * @param limit - Maximum results
   * @returns Search results with relevance scores
   */
  searchMemories(params: {
    query: string
    group_id: GroupId
    workspace_id: string
    principal_id: string
    limit: number
  }): Promise<GraphSearchResult[]>

  /**
   * List memories for a user within a tenant.
   * Used by: memory_list
   *
   * @param group_id - Tenant isolation key
   * @param user_id - User filter (null = all users)
   * @returns List result with total count
   */
  listMemories(params: {
    group_id: GroupId
    workspace_id: string
    principal_id: string
    user_id: string | null
  }): Promise<GraphListResult>

  /**
   * Count memories for a user within a tenant.
   * Used by: memory_list (total count)
   *
   * @param group_id - Tenant isolation key
   * @param user_id - User filter (null = all users)
   * @returns Count result
   */
  countMemories(params: {
    group_id: GroupId
    user_id: string | null
  }): Promise<CountResult>

  /**
   * Check if a memory is canonical (active, not superseded, not deprecated).
   * Used by: memory_promote
   *
   * @param id - Memory ID
   * @param group_id - Tenant isolation key
   * @returns Canonical check result
   */
  checkCanonical(params: { id: MemoryId; group_id: GroupId }): Promise<CanonicalCheckResult>

  /**
   * Get the current version of a memory (for SUPERSEDES).
   * Used by: memory_update
   *
   * @param id - Memory ID
   * @param group_id - Tenant isolation key
   * @returns Version lookup result
   */
  getVersion(params: { id: MemoryId; group_id: GroupId }): Promise<VersionLookupResult>

  /**
   * Export canonical (non-superseded, non-deprecated) memories.
   * Used by: memory_export
   *
   * @param group_id - Tenant isolation key
   * @param user_id - User filter (null = all users)
   * @param offset - Pagination offset
   * @param limit - Maximum results
   * @returns Export result
   */
  exportMemories(params: {
    group_id: GroupId
    user_id: string | null
    offset: number
    limit: number
  }): Promise<GraphExportResult>

  /**
   * Get deprecated memories by IDs (for memory_list_deleted cross-reference).
   * Used by: memory_list_deleted
   *
   * @param ids - Memory IDs to look up
   * @param group_id - Tenant isolation key
   * @returns Map of ID → GraphMemoryNode for deprecated memories found
   */
  getDeprecatedMemories(params: {
    ids: string[]
    group_id: GroupId
  }): Promise<Map<string, GraphMemoryNode>>

  /**
   * Link a newly promoted Memory to its authoring Agent and Project.
   * Uses MERGE for idempotency — safe to call multiple times.
   * Silently skips if Agent or Project node doesn't exist in the graph.
   * Used by: memory_add (auto-promotion), Curator pipeline (manual promotion)
   *
   * Phase 3 Sync Contract: Every promoted Memory MUST be anchored to the
   * structural context layer (Agent, Project) so retrieval traversals work.
   *
   * @param memory_id - The Memory node ID to link
   * @param group_id - Tenant isolation key
   * @param agent_id - Agent node ID (e.g., 'agent-brooks'). Null = skip AUTHORED_BY.
   * @param project_id - Project node ID (e.g., 'proj-allura-memory'). Null = skip RELATES_TO.
   */
  linkMemoryContext(params: {
    memory_id: MemoryId
    group_id: GroupId
    agent_id: string | null
    project_id: string | null
  }): Promise<{ authored_by: boolean; relates_to: boolean }>

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Check if the graph backend is healthy and reachable.
   * Used by: health probes, circuit breaker initialization
   */
  isHealthy(): Promise<boolean>

  /**
   * Close connections and clean up resources.
   * Called on shutdown.
   */
  close(): Promise<void>
}

// ── Error Types ──────────────────────────────────────────────────────────────

/**
 * Base error for all graph adapter operations.
 * Distinguishes "graph layer failed" from "query returned no results".
 */
export class GraphAdapterError extends Error {
  public readonly adapter: string
  public readonly operation: string
  public readonly cause?: Error

  constructor(adapter: string, operation: string, message: string, cause?: Error) {
    super(`[${adapter}:${operation}] ${message}`)
    this.name = "GraphAdapterError"
    this.adapter = adapter
    this.operation = operation
    this.cause = cause
  }
}

/**
 * Thrown when the graph backend is unreachable.
 * Triggers degraded mode in canonical-tools.
 */
export class GraphAdapterUnavailableError extends GraphAdapterError {
  constructor(adapter: string, operation: string, cause?: Error) {
    super(adapter, operation, "Graph backend unavailable", cause)
    this.name = "GraphAdapterUnavailableError"
  }
}
