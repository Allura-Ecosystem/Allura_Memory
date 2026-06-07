/**
 * Canonical Memory API Contracts (Allura v1)
 *
 * These are the authoritative TypeScript interfaces for the 5 canonical memory operations.
 * All implementations (MCP, REST, internal) MUST conform to these contracts.
 *
 * Reference: docs/allura/BLUEPRINT.md
 *
 * Invariants:
 * - group_id is REQUIRED on every operation (enforced by schema)
 * - group_id MUST match ^allura- (CHECK constraint)
 * - PostgreSQL is append-only (no UPDATE/DELETE on events table)
 * - Neo4j uses SUPERSEDES for versioning (never mutate nodes)
 * - Promotion is HITL-only: eligible memories queue proposals; no autonomous semantic promotion
 */

// ── Core Types ─────────────────────────────────────────────────────────────

/**
 * Tenant namespace - enforced by PostgreSQL CHECK constraint
 * Must match pattern: ^allura-.*
 */
export type GroupId = string & { readonly __brand: unique symbol }

/**
 * Memory identifier - UUID v4
 */
export type MemoryId = string & { readonly __brand: unique symbol }

/**
 * User identifier within a tenant
 */
export type UserId = string

/**
 * Memory content - the actual text stored
 */
export type MemoryContent = string

/**
 * Confidence score (0.0 to 1.0)
 * Determines promotion eligibility (threshold: 0.85 by default)
 */
export type ConfidenceScore = number

/**
 * Storage location indicator
 * - 'episodic': PostgreSQL only (below promotion threshold)
 * - 'semantic': Neo4j (promoted knowledge)
 * - 'both': Both stores after approved semantic promotion
 */
export type StorageLocation = "episodic" | "semantic" | "both"

/**
 * Promotion mode
 *
 * Historical compatibility accepts "auto", but canonical promotion remains
 * HITL-only. Eligible memories queue proposals for human approval before any
 * semantic promotion.
 */
export type PromotionMode = "auto" | "soc2"

/**
 * Memory provenance
 * - 'conversation': Learned from agent interaction
 * - 'manual': Added by user
 */
export type MemoryProvenance = "conversation" | "manual"

/**
 * Memory status in Neo4j
 * - 'active': Current version
 * - 'deprecated': Superseded by newer version
 */
export type MemoryStatus = "active" | "deprecated"

export interface MemoryResponseMeta {
  contract_version: "v1"
  degraded: boolean
  degraded_reason?: "neo4j_unavailable" | "graph_unavailable"
  stores_used: Array<"postgres" | "neo4j" | "ruvector" | "graph">
  stores_attempted: Array<"postgres" | "neo4j" | "graph">
  warnings?: string[]
  /** RuVector trajectory ID for evidence-gated feedback (present when RuVector was used) */
  ruvector_trajectory_id?: string
  /** Number of results returned from RuVector (present when RuVector was used) */
  ruvector_count?: number
}

// ── Request/Response Contracts ───────────────────────────────────────────

/**
 * 1. memory_add
 *
 * Add a memory for a user.
 *
 * Flow:
 * 1. Validate group_id and content
 * 2. Write to PostgreSQL (events table, append-only)
 * 3. Score content (0.0 to 1.0)
 * 4. If score >= threshold: queue in canonical_proposals for HITL review
 * 5. Return memory ID and storage location
 */
/**
 * Scope tuple — full identity context for governed memory operations.
 * Every Allura call carries this; fields default from session metadata
 * when not explicitly provided.
 *
 * Resolution order: explicit parameter → session metadata → defaults
 */
export interface ScopeTuple {
  /** Required: Tenant namespace (format: allura-*) */
  group_id: GroupId
  /** Optional: Project within the tenant */
  project_id?: string
  /** Optional: Agent identity (defaults from session) */
  agent_id?: string
  /** Optional: Session identity (defaults from OpenClaw session key) */
  session_id?: string
}

/**
 * Memory status for retrieval filtering
 * - 'approved': Passed curator + approval (active in Neo4j)
 * - 'proposed': Awaiting approval (in canonical_proposals table)
 * - 'deprecated': Superseded or soft-deleted
 * - 'all': Return regardless of status
 */
export type MemoryRetrievalStatus = "approved" | "proposed" | "deprecated" | "all"

export interface MemoryAddRequest {
  /** Required: Tenant namespace (format: allura-*) */
  group_id: GroupId

  /** Required: User identifier within tenant */
  user_id: UserId

  /** Required: Memory content text */
  content: MemoryContent

  /** Optional: Scope tuple for governed memory (project/agent/session) */
  scope?: ScopeTuple

  /** Optional: Trace type for raw trace ingestion */
  trace_type?: "run" | "tool" | "failure" | "cron" | "conversation"

  /** Optional: Metadata (source, context, etc.) */
  metadata?: {
    source?: MemoryProvenance
    conversation_id?: string
    agent_id?: string
    [key: string]: unknown
  }

  /** Optional: Override promotion threshold (default: 0.85) */
  threshold?: number
}

export interface MemoryAddResponse {
  /** Memory identifier */
  id: MemoryId

  /** Where the memory was stored */
  stored: StorageLocation

  /** Confidence score (0.0 to 1.0) */
  score: ConfidenceScore

  /** Whether memory is pending human review (soc2 mode only) */
  pending_review?: boolean

  /** Timestamp */
  created_at: string

  /** Execution metadata */
  meta?: MemoryResponseMeta

  /** Whether this proposal was a near-duplicate of an existing one */
  duplicate?: boolean

  /** ID of the existing proposal this duplicates (when duplicate=true) */
  duplicate_of?: string

  /** Similarity score with the existing proposal (when duplicate=true) */
  similarity?: number
}

/**
 * 2. memory_search
 *
 * Search memories across both stores.
 * Federated search: PostgreSQL (episodic) + Neo4j (semantic).
 * Results merged by relevance score.
 */
export interface MemorySearchRequest {
  /** Required: Search query */
  query: string

  /** Required: Tenant namespace */
  group_id: GroupId

  /** Optional: Scope tuple for governed retrieval (project/agent/session) */
  scope?: ScopeTuple

  /** Optional: Filter by memory status (default: 'approved' — only approved insights) */
  status?: MemoryRetrievalStatus

  /** Optional: User identifier (scope to user) */
  user_id?: UserId

  /** Optional: Maximum results (default: 10) */
  limit?: number

  /** Optional: Minimum confidence filter */
  min_score?: ConfidenceScore

  /** Optional: Include global memories (default: true) */
  include_global?: boolean
}

export interface MemorySearchResult {
  /** Memory identifier */
  id: MemoryId

  /** Memory content */
  content: MemoryContent

  /** Confidence score */
  score: ConfidenceScore

  /** Storage location */
  source: StorageLocation

  /** Provenance */
  provenance: MemoryProvenance

  /** Timestamp */
  created_at: string

  /** Usage count (how many times retrieved) */
  usage_count?: number

  /** Tags associated with this memory */
  tags?: string[]

  /** Schema version for compatibility checks */
  schema_version?: number
}

export interface MemorySearchResponse {
  /** Search results */
  results: MemorySearchResult[]

  /** Total count */
  count: number

  /** Query execution time (ms) */
  latency_ms: number

  /** Execution metadata */
  meta?: MemoryResponseMeta
}

/**
 * 3. memory_get
 *
 * Retrieve a single memory by ID.
 * Returns memory from either store (episodic or semantic).
 */
export interface MemoryGetRequest {
  /** Required: Memory identifier */
  id: MemoryId

  /** Required: Tenant namespace (for isolation) */
  group_id: GroupId
}

export interface MemoryGetResponse {
  /** Memory identifier */
  id: MemoryId

  /** Memory content */
  content: MemoryContent

  /** Confidence score */
  score: ConfidenceScore

  /** Storage location */
  source: StorageLocation

  /** Provenance */
  provenance: MemoryProvenance

  /** User identifier */
  user_id: UserId

  /** Timestamp */
  created_at: string

  /** Version history (if semantic) */
  version?: number

  /** Superseded by (if deprecated) */
  superseded_by?: MemoryId

  /** Usage count (legacy, always 0 — prefer recent_usage_count) */
  usage_count?: number

  /**
   * How many times this memory was retrieved or searched in the last 30 days.
   * Computed from the events table. null means no tracking data is available
   * (e.g., episodic-only memories with no retrieval events).
   */
  recent_usage_count?: number | null

  /** Tags associated with this memory */
  tags?: string[]

  /** Schema version for compatibility checks */
  schema_version?: number

  /** Execution metadata */
  meta?: MemoryResponseMeta
}

/**
 * 4. memory_list
 *
 * List all memories for a user within a tenant.
 * Returns from both stores, merged and sorted.
 */
export interface MemoryListRequest {
  /** Required: Tenant namespace */
  group_id: GroupId

  /** Optional: User identifier — omit to list all users in the tenant (admin view) */
  user_id?: UserId

  /** Optional: Maximum results (default: 50) */
  limit?: number

  /** Optional: Pagination offset */
  offset?: number

  /** Optional: Sort order (default: 'created_at_desc') */
  sort?: "created_at_desc" | "created_at_asc" | "score_desc" | "score_asc"
}

export interface MemoryListResponse {
  /** Memories */
  memories: MemoryGetResponse[]

  /** Total count */
  total: number

  /** Has more results */
  has_more: boolean

  /** Execution metadata */
  meta?: MemoryResponseMeta
}

/**
 * 5. memory_delete
 *
 * Soft-delete a memory.
 * - Appends deletion event to PostgreSQL (append-only)
 * - Marks Neo4j node as deprecated (if promoted)
 * - Original rows remain for audit trail
 */
export interface MemoryDeleteRequest {
  /** Required: Memory identifier */
  id: MemoryId

  /** Required: Tenant namespace */
  group_id: GroupId

  /** Required: User identifier (for authorization) */
  user_id: UserId
}

export interface MemoryDeleteResponse {
  /** Memory identifier */
  id: MemoryId

  /** Deletion status */
  deleted: boolean

  /** Deletion timestamp */
  deleted_at: string

  /** Recovery window (days) */
  recovery_days: number

  /** Execution metadata */
  meta?: MemoryResponseMeta
}

/**
 * 6. memory_update
 * Append-only versioned update. Creates new version in Neo4j via SUPERSEDES.
 * Appends audit event to PostgreSQL. Never mutates existing rows/nodes.
 */
export interface MemoryUpdateRequest {
  /** Required: Memory identifier to update */
  id: MemoryId
  /** Required: Tenant namespace */
  group_id: GroupId
  /** Required: User identifier */
  user_id: UserId
  /** Required: New memory content */
  content: MemoryContent
  /** Optional: Reason for update (audit trail) */
  reason?: string
  /** Optional: Additional metadata */
  metadata?: Record<string, unknown>
}

export interface MemoryUpdateResponse {
  /** New version's memory identifier */
  id: MemoryId
  /** Superseded version's identifier */
  previous_id: MemoryId
  /** Where the updated memory is stored */
  stored: StorageLocation
  /** Version number (incremented) */
  version: number
  /** Update timestamp */
  updated_at: string
  /** Execution metadata */
  meta?: MemoryResponseMeta
}

/**
 * 7. memory_promote
 * Request curator promotion for an episodic memory.
 * Queues a canonical_proposals entry — never auto-promotes.
 */
export interface MemoryPromoteRequest {
  /** Required: Memory identifier to promote */
  id: MemoryId
  /** Required: Tenant namespace */
  group_id: GroupId
  /** Required: User identifier */
  user_id: UserId
  /** Optional: Rationale for promotion request */
  rationale?: string
  /** Optional: Who is requesting promotion */
  curator_id?: string
}

export interface MemoryPromoteResponse {
  /** Memory identifier */
  id: MemoryId
  /** Created proposal identifier */
  proposal_id: string
  /** 'queued' = new proposal created; 'already_canonical' = already in Neo4j */
  status: "queued" | "already_canonical"
  /** Timestamp when queued */
  queued_at: string
  /** Execution metadata */
  meta?: MemoryResponseMeta
}

/**
 * 8. memory_export
 * Export memory set filtered by group_id and optional canonical status.
 * Fails loudly on DB errors — no silent fallback when canonical_only=true.
 */
export interface MemoryExportRequest {
  /** Required: Tenant namespace */
  group_id: GroupId
  /** Optional: Filter by user */
  user_id?: UserId
  /** Optional: true = Neo4j canonical only; false/undefined = all stores */
  canonical_only?: boolean
  /** Optional: Output format (json only for now) */
  format?: "json"
  /** Optional: Maximum results (default 1000, max 10000) */
  limit?: number
  /** Optional: Pagination offset */
  offset?: number
}

export interface MemoryExportResponse {
  /** Exported memories */
  memories: MemoryGetResponse[]
  /** Total exported count */
  count: number
  /** Export timestamp */
  exported_at: string
  /** How many are canonical (from Neo4j) */
  canonical_count: number
  /** How many are episodic-only (from PostgreSQL) */
  episodic_count: number
  /** Execution metadata */
  meta?: MemoryResponseMeta
}

// ── Governance Contracts (Curator Workflow) ───────────────────────────────

/**
 * Proposal status in curator queue
 */
export type ProposalStatus = "pending" | "approved" | "rejected"

/**
 * Curator proposal (soc2 mode only)
 */
export interface CuratorProposal {
  /** Proposal identifier */
  id: string

  /** Tenant namespace */
  group_id: GroupId

  /** Memory content */
  content: MemoryContent

  /** Confidence score */
  score: ConfidenceScore

  /** Reasoning for score */
  reasoning: string

  /** Tier classification */
  tier: "emerging" | "adoption" | "mainstream"

  /** Status */
  status: ProposalStatus

  /** Trace reference (PostgreSQL BIGSERIAL event ID) */
  trace_ref: number | null

  /** Timestamp */
  created_at: string
}

/**
 * Approve/reject proposal (curator action)
 */
export interface CuratorApproveRequest {
  /** Proposal identifier */
  proposal_id: string

  /** Tenant namespace */
  group_id: GroupId

  /** Decision */
  decision: "approve" | "reject"

  /** Curator identifier */
  curator_id: string

  /** Reasoning */
  rationale?: string
}

export interface CuratorApproveResponse {
  /** Success status */
  success: boolean

  /** Memory ID (if approved) */
  memory_id?: MemoryId

  /** Timestamp */
  decided_at: string
}

// ── Configuration ─────────────────────────────────────────────────────────

/**
 * Memory system configuration
 */
export interface MemoryConfig {
  /** Promotion mode */
  promotion_mode: PromotionMode

  /** Auto-approval threshold (default: 0.85) */
  auto_approval_threshold: number

  /** Duplicate detection threshold (default: 0.95) */
  duplicate_threshold: number

  /** Soft-delete recovery window (days, default: 30) */
  recovery_window_days: number
}

// ── Error Types ────────────────────────────────────────────────────────────

/**
 * Memory API error
 */
export interface MemoryError {
  /** Error code */
  code: "INVALID_GROUP_ID" | "MEMORY_NOT_FOUND" | "UNAUTHORIZED" | "VALIDATION_ERROR" | "INTERNAL_ERROR"

  /** Error message */
  message: string

  /** Additional details */
  details?: Record<string, unknown>
}

/**
 * Validation error for group_id
 */
export class GroupIdValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GroupIdValidationError"
  }
}

/**
 * Memory not found error
 */
export class MemoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Memory not found: ${id}`)
    this.name = "MemoryNotFoundError"
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnauthorizedError"
  }
}

/**
 * Thrown when memory_promote is called on a memory already in Neo4j.
 */
export class MemoryAlreadyCanonicalError extends Error {
  constructor(id: string) {
    super(`Memory is already canonical: ${id}`)
    this.name = "MemoryAlreadyCanonicalError"
  }
}

/**
 * Thrown when a restore is attempted on a memory that is not deleted.
 */
export class MemoryNotDeletedError extends Error {
  constructor(id: string) {
    super(`Memory is not deleted, cannot restore: ${id}`)
    this.name = "MemoryNotDeletedError"
  }
}

/**
 * Thrown when a restore is attempted outside the recovery window.
 */
export class RecoveryWindowExpiredError extends Error {
  constructor(id: string) {
    super(`Recovery window has expired for memory: ${id}`)
    this.name = "RecoveryWindowExpiredError"
  }
}

// ── 9. memory_restore ────────────────────────────────────────────────────────

/**
 * 9. memory_restore
 *
 * Restore a soft-deleted memory within the recovery window (30 days).
 * - Appends restore event to PostgreSQL (append-only, no UPDATE)
 * - Removes deprecated flag and SUPERSEDES relationship in Neo4j
 * - group_id scoped
 * - Fails if outside recovery window or memory not deleted
 */
export interface MemoryRestoreRequest {
  /** Required: Memory identifier to restore */
  id: MemoryId

  /** Required: Tenant namespace */
  group_id: GroupId

  /** Required: User identifier (for audit trail) */
  user_id: UserId
}

export interface MemoryRestoreResponse {
  /** Memory identifier */
  id: MemoryId

  /** Restoration status */
  restored: boolean

  /** Restoration timestamp */
  restored_at: string

  /** Execution metadata */
  meta?: MemoryResponseMeta
}

// ── Governance Contracts (Story 9.1) ─────────────────────────────────────────

/**
 * governance_list_policies — list all 6 canonical invariant policies
 */
export interface GovernanceListPoliciesRequest {
  /** Required: Tenant namespace (format: allura-*) */
  group_id: GroupId
}

export interface GovernancePolicyRecord {
  id: string
  name: string
  description: string
  severity: "critical" | "high" | "medium" | "low"
  invariant_key: string
  overridable: boolean
  version: number
  updated_at: string
}

export interface GovernanceListPoliciesResponse {
  policies: GovernancePolicyRecord[]
  count: number
  meta?: MemoryResponseMeta
}

/**
 * governance_get_policy — retrieve a single policy by ID
 */
export interface GovernanceGetPolicyRequest {
  /** Required: Tenant namespace (format: allura-*) */
  group_id: GroupId
  /** Required: Policy identifier (e.g., pol-001) */
  policy_id: string
}

export interface GovernanceGetPolicyResponse {
  policy: GovernancePolicyRecord
  override_event_id?: string | null
  meta?: MemoryResponseMeta
}

/**
 * governance_check_gate — evaluate the 6 invariants for a proposed action
 */
export interface GovernanceCheckGateRequest {
  /** Required: Tenant namespace (format: allura-*) */
  group_id: GroupId
  /** Required: Action being requested (e.g., "memory_promote", "policy_update") */
  action: string
  /** Optional: Additional context for evaluation */
  context?: Record<string, unknown>
}

export interface GovernanceGateCheck {
  invariant: string
  invariant_key: string
  pass: boolean
  reason: string
}

export interface GovernanceCheckGateResponse {
  pass: boolean
  action: string
  checks: GovernanceGateCheck[]
  checked_at: string
  meta?: MemoryResponseMeta
}

/**
 * governance_update_policy — HITL-gated policy override
 * Requires an explicit approval_ref pointing to an approved + unconsumed
 * canonical_proposals entry. Appends governance_policy_updated and
 * governance_approval_consumed events; never mutates policy in-place.
 */
export interface GovernanceUpdatePolicyRequest {
  /** Required: Tenant namespace (format: allura-*) */
  group_id: GroupId
  /** Required: Policy identifier to override (e.g., pol-001) */
  policy_id: string
  /** Required: Explicit HITL approval reference (canonical_proposals UUID) */
  approval_ref: string
  /** Required: New description override */
  description: string
  /** Required: Who is making this change */
  updated_by: string
  /** Optional: Rationale for the update */
  rationale?: string
}

export interface GovernanceUpdatePolicyResponse {
  policy_id: string
  updated: boolean
  version: number
  event_id?: string
  updated_at: string
  meta?: MemoryResponseMeta
}

/**
 * governance_audit_log — paginated read of governance events
 */
export interface GovernanceAuditLogRequest {
  /** Required: Tenant namespace (format: allura-*) */
  group_id: GroupId
  /** Optional: Filter by event type */
  event_type?: string
  /** Optional: Maximum results (default: 50, max: 500) */
  limit?: number
  /** Optional: Pagination offset */
  offset?: number
}

export interface GovernanceAuditEntry {
  id: string
  event_type: string
  agent_id: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface GovernanceAuditLogResponse {
  entries: GovernanceAuditEntry[]
  count: number
  total: number
  has_more: boolean
  meta?: MemoryResponseMeta
}

// ── Memory List Deleted ──────────────────────────────────────────────────────

/**
 * Request for listing soft-deleted memories within recovery window.
 */
export interface MemoryListDeletedRequest {
  /** Required: Tenant namespace */
  group_id: GroupId

  /** Optional: User identifier — scope to a specific user */
  user_id?: UserId

  /** Optional: Maximum results (default: 50) */
  limit?: number

  /** Optional: Pagination offset */
  offset?: number
}

export interface DeletedMemoryItem {
  /** Memory identifier */
  id: MemoryId

  /** Memory content */
  content: MemoryContent

  /** Storage location before deletion */
  source: StorageLocation

  /** Provenance */
  provenance: MemoryProvenance

  /** User identifier */
  user_id: string

  /** Original creation timestamp */
  created_at: string

  /** Deletion timestamp */
  deleted_at: string

  /** Days remaining in recovery window */
  recovery_days_remaining: number

  /** Confidence score */
  score: ConfidenceScore

  /** Tags */
  tags?: string[]

  /** Version (if semantic) */
  version?: number
}

export interface MemoryListDeletedResponse {
  /** Deleted memories */
  memories: DeletedMemoryItem[]

  /** Total count */
  total: number

  /** Has more results */
  has_more: boolean

  /** Execution metadata */
  meta?: MemoryResponseMeta
}
