/**
 * Canonical MCP Tools for Allura Memory
 *
 * Implements the 8 canonical memory operations defined in canonical-contracts.ts.
 * This is the ONLY interface exposed to AI agents via MCP.
 *
 * Reference: docs/allura/BLUEPRINT.md
 *
 * Operations:
 * 1. memory_add    - Add a memory (episodic → score → promote/queue)
 * 2. memory_search  - Search memories (RuVector primary → Neo4j fallback → PG traces)
 * 3. memory_get     - Get a single memory by ID
 * 4. memory_list    - List all memories for a user
 * 5. memory_delete  - Soft-delete a memory
 * 6. memory_update  - Append-only versioned update
 * 7. memory_promote - Request curator promotion
 * 8. memory_export  - Export memories
 *
 * Architecture (Slice C - Graph Adapter):
 * - RuVector: Primary backend for episodic retrieval (hybrid vector + BM25)
 * - Graph Adapter: Abstraction layer for semantic operations (Neo4j or PG tables)
 *   - GRAPH_BACKEND=neo4j: Neo4jGraphAdapter (legacy, default)
 *   - GRAPH_BACKEND=ruvector: RuVectorGraphAdapter (new, target for Slice D+)
 * - PostgreSQL: Audit trails and fallback for unembedded events
 *
 * Budget & Circuit Breaker Integration:
 * - memory_add: Budget-enforced (pre-check, post-update). Write-intensive, needs rate limiting.
 * - memory_update, memory_delete, memory_promote: Budget-tracked (record usage after call).
 * - All write ops: Wrapped in circuit breakers for DB calls.
 * - Read ops: Circuit breakers on DB calls, no budget check (reads are cheap).
 * - Fail-open: If budget/circuit breaker can't initialize, requests pass through.
 */

// ── Sub-module imports ────────────────────────────────────────────────────

// ── External imports ──────────────────────────────────────────────────────

import { randomUUID } from "crypto"
import { curatorScore } from "@/lib/curator/score"
import { createProposalDedupChecker, getDedupThreshold, type ProposalCandidate } from "@/lib/dedup/proposal-dedup"
import { tenantQuery } from "@/lib/db/tenant-transaction"
import { classifyPostgresError, DatabaseQueryError, DatabaseUnavailableError } from "@/lib/errors/database-errors"
import { createGraphAdapter } from "@/lib/graph-adapter"
import {
  MemoryAlreadyCanonicalError,
  MemoryNotDeletedError,
  MemoryNotFoundError,
  RecoveryWindowExpiredError,
} from "@/lib/memory/canonical-contracts"
import type {
  ConfidenceScore,
  GroupId,
  MemoryAddRequest,
  MemoryAddResponse,
  MemoryContent,
  MemoryDeleteRequest,
  MemoryDeleteResponse,
  MemoryExportRequest,
  MemoryExportResponse,
  MemoryGetRequest,
  MemoryGetResponse,
  MemoryId,
  MemoryListDeletedRequest,
  MemoryListDeletedResponse,
  MemoryListRequest,
  MemoryListResponse,
  MemoryPromoteRequest,
  MemoryPromoteResponse,
  MemoryProvenance,
  MemoryResponseMeta,
  MemoryRestoreRequest,
  MemoryRestoreResponse,
  MemoryRetrievalStatus,
  MemorySearchRequest,
  MemorySearchResponse,
  MemoryUpdateRequest,
  MemoryUpdateResponse,
  ScopeTuple,
  StorageLocation,
} from "@/lib/memory/canonical-contracts"
import { storeMemory } from "@/lib/ruvector/bridge"
import { searchWithFeedback } from "@/lib/ruvector/retrieval-adapter"
import {
  checkBudget,
  ensureSession,
  getBreakerManager,
  getBudgetEnforcer,
  getHaltedSessions,
  recordToolCall,
  resetHaltedGroup,
  withCircuitBreaker,
} from "./canonical-tools/budget-circuit"
import { getConnections, resetConnections } from "./canonical-tools/connection"
import {
  baseMeta,
  degradedMeta,
  DUPLICATE_THRESHOLD,
  EpisodicMemoryRow,
  generateMemoryId,
  getAutoApprovalThreshold,
  getRecentUsageCount,
  neo4jDateToISO,
  parseEpisodicTags,
  RECOVERY_WINDOW_DAYS,
  sortDedupedMemories,
  toMemoryId,
  toProvenance,
  validateGroupId,
} from "./canonical-tools/validation-utils"

// ── Canonical Operations ───────────────────────────────────────────────────

/**
 * Run a canonical query inside a transaction carrying the tenant RLS context
 * (app.current_group_id + app.current_workspace_id). getConnections() returns
 * the restricted app pool; without these GUCs, forced RLS (including the
 * workspace_scope_restrictive_policy added by migration 39) rejects writes
 * and filters every read to zero rows. Every tenant-scoped canonical query
 * must go through this helper.
 */
function tenantPgQuery<T extends import("pg").QueryResultRow>(
  groupId: GroupId,
  principalId: string,
  pg: import("pg").Pool,
  sql: string,
  values?: unknown[],
  workspaceId?: string,
): Promise<import("pg").QueryResult<T>> {
  return tenantQuery<T>(
    workspaceId
      ? { tenantId: groupId, principalId, workspaceId }
      : { tenantId: groupId, principalId },
    sql,
    values,
    pg,
  )
}

function requireVerifiedWorkspaceScope(request: { group_id: GroupId; scope?: ScopeTuple }): ScopeTuple & { workspace_id: string; agent_id: string } {
  const scope = request.scope
  if (!scope?.workspace_id || !scope.agent_id || scope.group_id !== request.group_id) {
    throw new Error("verified MCP workspace scope is required")
  }
  return scope as ScopeTuple & { workspace_id: string; agent_id: string }
}

/**
 * 1. memory_add
 *
 * Add a memory for a user.
 *
 * Flow:
 * 1. Validate group_id and content
 * 2. Write to PostgreSQL (events table, append-only)
 * 3. Score content
 * 4. If score >= threshold: queue in canonical_proposals for HITL review
 * 5. Return memory ID and storage location
 */
export async function memory_add(request: MemoryAddRequest): Promise<MemoryAddResponse> {
  const AUTO_APPROVAL_THRESHOLD = getAutoApprovalThreshold()

  console.log(`[DEBUG memory_add] AUTO_APPROVAL_THRESHOLD=${AUTO_APPROVAL_THRESHOLD}; HITL promotion enforced`)

  const groupId = validateGroupId(request.group_id)
  const agentId = request.metadata?.agent_id || request.scope?.agent_id || "api"
  const traceType = request.trace_type || "conversation"
  const scope = request.scope || { group_id: groupId }
  const memoryId = generateMemoryId()
  const createdAt = new Date().toISOString()
  const startTime = Date.now()

  console.log(`[memory_add] scope: group=${groupId} project=${scope.project_id || "none"} agent=${agentId} session=${scope.session_id || "none"} trace_type=${traceType}`)

  // Budget pre-check: memory_add is write-intensive, enforce budget before proceeding
  const budgetResult = await checkBudget(groupId, agentId, "memory_add")
  if (!budgetResult.allowed) {
    throw new Error(
      `Budget exceeded for ${agentId} in ${groupId}: ${budgetResult.reason ?? "rate limit reached"}. Memory was NOT stored.`
    )
  }

  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()
    const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

    // Write to PostgreSQL (episodic) — wrapped in circuit breaker
    const eventResult = await withCircuitBreaker("postgres", groupId, "memory_add:insert_event", async () =>
      tenantPgQuery(groupId, agentId, pg,
        `INSERT INTO events (
      group_id, workspace_id, event_type, agent_id, status, metadata, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id`,
        [
          groupId,
          scope.workspace_id ?? null,
          "memory_add",
          agentId,
          "completed",
          JSON.stringify({
            memory_id: memoryId,
            user_id: request.user_id,
            content: request.content,
            source: request.metadata?.source || "conversation",
            conversation_id: request.metadata?.conversation_id,
            trace_type: traceType,
            scope: {
              group_id: groupId,
              project_id: scope.project_id || null,
              agent_id: agentId,
              session_id: scope.session_id || null,
            },
          }),
          createdAt,
        ],
        scope.workspace_id
      )
    )

    const eventId = eventResult.rows[0].id

    // ── Project to RuVector (allura_memories) for immediate semantic searchability ──
    // Every episodic write is also projected to the vector store so that
    // memory_search can find it via RuVector without waiting for curator promotion.
    // This is idempotent: re-running the projection for the same content is safe
    // because the bridge inserts a new row each time (BIGSERIAL id).
    try {
      const sessionId = request.metadata?.conversation_id || `episodic-${eventId}`
      await storeMemory({
        userId: groupId,
        sessionId,
        content: request.content,
        memoryType: "episodic",
        metadata: {
          memory_id: memoryId,
          event_id: String(eventId),
          source: request.metadata?.source || "conversation",
        },
      })
      console.info(`[memory_add] Projected to RuVector: memory_id=${memoryId} event_id=${eventId}`)
    } catch (ruvectorErr) {
      // Projection failure is non-blocking: episodic memory is already persisted in PG.
      // Search will fall back to ILIKE on events table.
      const msg = ruvectorErr instanceof Error ? ruvectorErr.message : String(ruvectorErr)
      console.warn(`[memory_add] RuVector projection failed (non-blocking): ${msg}`)
    }

    // 3. Score content
    // Map MemoryProvenance ('conversation'|'manual') to curatorScore source ('conversation'|'manually_added')
    const scoreSource: "conversation" | "manually_added" =
      request.metadata?.source === "manual" ? "manually_added" : "conversation"
    const scoreResult = await curatorScore({
      content: request.content,
      source: scoreSource,
      usageCount: 0,
      daysSinceCreated: 0,
    })
    const { confidence: score, reasoning, tier } = scoreResult
    const threshold = request.threshold || AUTO_APPROVAL_THRESHOLD

    // 4. Check promotion eligibility
    if (score < threshold) {
      // Below threshold: episodic only
      return {
        id: memoryId,
        stored: "episodic",
        score,
        created_at: createdAt,
        meta: baseMeta(["postgres"]),
      }
    }

    // Score meets threshold: always queue for human approval.
    //
    // Governance invariant (HITL Promotion Lock): no memory_add path may write
    // directly to the canonical graph. PROMOTION_MODE=auto is intentionally
    // ignored here; promotion must flow through canonical_proposals and curator
    // approval. This preserves the Allura canon rule: no autonomous promotion.
    {
      // Queue for human approval with dedup check

      // Check for near-duplicate proposals before inserting
      const dedupThreshold = getDedupThreshold()
      const dedupChecker = createProposalDedupChecker(undefined, dedupThreshold)

      try {
        const existingRows = await tenantPgQuery<{
          id: string
          content: string
          score: number
          status: string
          created_at: string
        }>(groupId, agentId, pg,
          `SELECT id, content, score, status, created_at
         FROM canonical_proposals
         WHERE group_id = $1
           AND status IN ('pending', 'approved')
         ORDER BY created_at DESC
         LIMIT 100`,
          [groupId],
          scope.workspace_id
        )

        const existingProposals: ProposalCandidate[] = existingRows.rows.map((row) => ({
          id: row.id,
          content: row.content,
          score: Number(row.score),
          status: row.status,
          created_at: row.created_at,
        }))

        const dedupResult = dedupChecker.checkProposals(request.content, existingProposals)

        if (dedupResult.isDuplicate && dedupResult.existingProposal) {
          // Skip duplicate — log and return existing
          console.warn(
            `[dedup] Skipping duplicate proposal for group_id=${groupId}: ` +
              `similarity=${dedupResult.similarity.toFixed(4)} threshold=${dedupResult.threshold} ` +
              `existing_proposal_id=${dedupResult.existingProposal.id} ` +
              `new_content_preview="${request.content.slice(0, 80)}..."`
          )

          return {
            id: memoryId,
            stored: "episodic",
            score,
            pending_review: true,
            created_at: createdAt,
            meta: baseMeta(["postgres"]),
            duplicate: true,
            duplicate_of: dedupResult.existingProposal.id,
            similarity: dedupResult.similarity,
          }
        }
      } catch (dedupError) {
        // Dedup check is non-blocking: log warning and proceed with insert
        console.warn("[dedup] Proposal dedup check failed, proceeding with insert:", dedupError)
      }

      // Skip proposal queue for load-test group_ids — test writes must not pollute HITL queue
      if (groupId.endsWith("-loadtest")) {
        return {
          id: memoryId,
          stored: "episodic",
          score,
          created_at: createdAt,
          meta: baseMeta(["postgres"]),
        }
      }

      // SOC2 mode: Queue for human approval — circuit-breaker wrapped PG insert
      await withCircuitBreaker("postgres", groupId, "memory_add:insert_proposal", async () =>
        tenantPgQuery(groupId, agentId, pg,
          `INSERT INTO canonical_proposals (
          id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [randomUUID(), groupId, scope.workspace_id ?? null, request.content, score, reasoning, tier, "pending", eventId, createdAt],
          scope.workspace_id
        )
      )

      return {
        id: memoryId,
        stored: "episodic",
        score,
        pending_review: true,
        created_at: createdAt,
        meta: baseMeta(["postgres"]),
      }
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "memory_add", "INSERT events")
    }
    throw error
  } finally {
    recordToolCall(groupId, agentId, "memory_add", Date.now() - startTime, true)
  }
}

/**
 * 2. memory_search
 *
 * Search memories with RuVector as primary backend.
 * Priority: RuVector (episodic hybrid: vector + BM25) → Neo4j (semantic) → PostgreSQL (traces).
 * Results merged by relevance score with source attribution.
 */
export async function memory_search(request: MemorySearchRequest): Promise<MemorySearchResponse> {
  // Validate
  const groupId = validateGroupId(request.group_id)
  const limit = Math.floor(request.limit || 10)
  const startTime = Date.now()
  const retrievalStatus = request.status || "approved" // Default: approved-only retrieval

  // Scope was injected from a verified MCP principal at the transport boundary.
  const scope = requireVerifiedWorkspaceScope(request)
  console.log(`[memory_search] scope: group=${groupId} project=${scope.project_id || "none"} agent=${scope.agent_id || "none"} session=${scope.session_id || "none"} status=${retrievalStatus}`)

  // ── Approved-only filter ──────────────────────────────────────────────────
  // When status is 'approved' (default), skip episodic stores and return only
  // canonical Neo4j insights. This prevents unapproved traces from polluting
  // production reasoning.
  if (retrievalStatus === "approved") {
    return searchApprovedOnly(request, groupId, limit, startTime, scope)
  }

  const storesUsed: Array<"postgres" | "neo4j" | "ruvector" | "graph"> = []
  const warnings: string[] = []
  let searchMeta = baseMeta([])

  // ── STEP 1: Primary search — RuVector (episodic hybrid: vector + BM25) ─────────
  let ruvectorResults: Array<{
    id: MemoryId
    content: MemoryContent
    score: ConfidenceScore
    provenance: MemoryProvenance
    created_at: string
    usage_count: number
    tags: string[]
  }> = []
  let ruvectorTrajectoryId: string | undefined

  try {
    const ruvectorResult = await searchWithFeedback(groupId, request.query, {
      limit: request.limit ?? 10,
      threshold: 0.3, // Lower threshold for recall
    })

    ruvectorTrajectoryId = ruvectorResult.trajectoryId
    ruvectorResults = ruvectorResult.memories.map((m) => ({
      id: m.id as MemoryId,
      content: m.content as MemoryContent,
      score: m.score as ConfidenceScore,
      provenance: "conversation" as MemoryProvenance, // RuVector stores episodic
      created_at: new Date().toISOString(), // Bridge doesn't return created_at
      usage_count: 0,
      tags: [],
    }))

    if (ruvectorResults.length > 0) {
      storesUsed.push("ruvector")
    }
  } catch (ruvectorErr) {
    // RuVector failure — log warning and continue to fallback
    const msg = ruvectorErr instanceof Error ? ruvectorErr.message : String(ruvectorErr)
    console.warn("[memory_search] RuVector primary search failed:", msg)
    warnings.push(`ruvector_unavailable: ${msg}`)
  }

  // ── STEP 2: Fallback 1 — Neo4j (semantic full-text) ───────────────────────────
  let semanticResults: Array<{
    id: MemoryId
    content: string
    score: number
    provenance: MemoryProvenance
    created_at: string
    usage_count: number
    relevance: number
    tags: string[]
  }> = []

  if (ruvectorResults.length < limit) {
    try {
      const { pg, neo4j: neo4jDriver } = await getConnections()
      const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })
      const graphResults = await graphAdapter.searchMemories({
        query: request.query,
        group_id: groupId,
        workspace_id: scope.workspace_id,
        principal_id: scope.agent_id,
        limit: limit - ruvectorResults.length,
      })

      semanticResults = graphResults.map((item) => ({
        id: item.id,
        content: item.content,
        score: item.score,
        provenance: item.provenance,
        created_at: item.created_at,
        usage_count: item.usage_count,
        tags: item.tags,
        relevance: item.relevance,
      }))

      if (semanticResults.length > 0) {
        storesUsed.push("graph")
      }
    } catch (error) {
      console.warn("[degraded] Graph adapter fallback unavailable in memory_search:", error)
      warnings.push("graph_unavailable")
    }
  }

  // ── STEP 3: Fallback 2 — PostgreSQL (episodic traces without embeddings) ──────
  let episodicResults: Array<{
    id: MemoryId
    content: MemoryContent
    score: ConfidenceScore
    provenance: MemoryProvenance
    created_at: string
    usage_count: number
    tags: string[]
  }> = []

  const totalSoFar = ruvectorResults.length + semanticResults.length
  if (totalSoFar < limit) {
    try {
      const { pg } = await getConnections()
      const result = await tenantPgQuery<EpisodicMemoryRow>(
        groupId, scope.agent_id, pg,
        `SELECT metadata->>'memory_id' AS id, metadata->>'content' AS content, 
              metadata->>'source' AS provenance,
              metadata->>'tags' AS tags,
              created_at
       FROM events
      WHERE group_id = $1
        AND event_type = 'memory_add'
        AND ($2::text IS NULL OR metadata->>'user_id' = $2)
        AND metadata->>'content' ILIKE '%' || $3 || '%'
      ORDER BY created_at DESC
      LIMIT $4`,
        [groupId, request.user_id || null, request.query, limit - totalSoFar],
        scope.workspace_id
      )

      episodicResults = result.rows.map((row) => ({
        id: toMemoryId(row.id),
        content: row.content,
        score: 0.5, // Episodic without embedding scores lower
        provenance: toProvenance(row.provenance),
        created_at: row.created_at,
        usage_count: 0,
        tags: parseEpisodicTags(row.tags),
      }))

      if (episodicResults.length > 0) {
        storesUsed.push("postgres")
      }
    } catch (error) {
      console.warn("[degraded] PostgreSQL fallback unavailable in memory_search:", error)
      warnings.push("postgres_unavailable")
    }
  }

  // ── STEP 4: Merge results ────────────────────────────────────────────────────
  const semantic = semanticResults.map((item) => ({
    id: item.id,
    content: item.content,
    score: item.score,
    source: "semantic" as const,
    provenance: item.provenance,
    created_at: item.created_at,
    usage_count: item.usage_count,
    tags: item.tags,
  }))

  const episodic = episodicResults.map((item) => ({
    ...item,
    source: "episodic" as const,
  }))

  const ruvector = ruvectorResults.map((item) => ({
    ...item,
    source: "episodic" as const, // RuVector stores episodic memories
  }))

  // Combine, dedupe by ID, sort by score
  const seen = new Set<string>()
  const combined = [...ruvector, ...semantic, ...episodic]
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const latency = Date.now() - startTime

  // Build final metadata
  searchMeta = {
    ...searchMeta,
    stores_used: storesUsed.length > 0 ? storesUsed : ([] as Array<"postgres" | "neo4j" | "ruvector">),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(ruvectorTrajectoryId !== undefined
      ? { ruvector_trajectory_id: ruvectorTrajectoryId, ruvector_count: ruvectorResults.length }
      : {}),
  }

  return {
    results: combined,
    count: combined.length,
    latency_ms: latency,
    meta: searchMeta,
  }
}

/**
 * Approved-only search — returns only canonical Neo4j insights.
 * Used when status filter is 'approved' (the default).
 * Falls back to native memory_search if Neo4j is unavailable.
 */
async function searchApprovedOnly(
  request: MemorySearchRequest,
  groupId: GroupId,
  limit: number,
  startTime: number,
  scope: ScopeTuple & { workspace_id: string; agent_id: string }
): Promise<MemorySearchResponse> {
  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()
    const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

    const graphResults = await graphAdapter.searchMemories({
      query: request.query,
      group_id: groupId,
      workspace_id: scope.workspace_id,
      principal_id: scope.agent_id,
      limit,
    })

    const results = graphResults.map((item) => ({
      id: item.id,
      content: item.content,
      score: item.score,
      source: "semantic" as StorageLocation,
      provenance: item.provenance,
      created_at: item.created_at,
      usage_count: item.usage_count,
      tags: item.tags,
    }))

    const elapsed = Date.now() - startTime
    console.log(
      `[memory_search:approved] ${results.length} approved insights for "${request.query}" in ${elapsed}ms`
    )

    return {
      results,
      count: results.length,
      latency_ms: elapsed,
      meta: {
        contract_version: "v1",
        degraded: false,
        stores_used: ["graph"],
        stores_attempted: ["graph"],
        warnings: [],
      },
    }
  } catch (error) {
    const elapsed = Date.now() - startTime
    const msg = error instanceof Error ? error.message : String(error)
    console.warn(`[memory_search:approved] Neo4j unavailable (${elapsed}ms): ${msg}`)

    // Return explicit no_approved_memory — NOT silent empty array
    return {
      results: [],
      count: 0,
      latency_ms: elapsed,
      meta: {
        contract_version: "v1",
        degraded: true,
        degraded_reason: "graph_unavailable",
        stores_used: [],
        stores_attempted: ["graph"],
        warnings: [`no_approved_memory: graph backend unavailable — ${msg}`],
      },
    }
  }
}

/**
 * 3. memory_get
 *
 * Retrieve a single memory by ID.
 * Returns memory from either store (episodic or semantic).
 */
export async function memory_get(request: MemoryGetRequest): Promise<MemoryGetResponse> {
  // Validate
  const groupId = validateGroupId(request.group_id)
  const scope = requireVerifiedWorkspaceScope(request)

  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()
    const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

    // Try graph adapter first (semantic) - secondary store, degradation acceptable
    let getMeta = baseMeta(["postgres", "graph"])
    try {
      const graphResult = await graphAdapter.getMemory({
        id: request.id, group_id: groupId, workspace_id: scope.workspace_id, principal_id: scope.agent_id,
      })

      if (graphResult.node) {
        const node = graphResult.node

        // Query recent usage from PG events table (uses migration-18 index)
        const recentUsage = await getRecentUsageCount(pg, groupId, request.id)

        return {
          id: node.id,
          content: node.content,
          score: node.score,
          source: "semantic",
          provenance: node.provenance,
          user_id: node.user_id ?? "",
          created_at: node.created_at,
          version: node.version,
          usage_count: recentUsage ?? 0,
          recent_usage_count: recentUsage,
          tags: node.tags,
          meta: getMeta,
        }
      }
    } catch (error) {
      console.warn("[degraded] Graph adapter unavailable in memory_get:", error)
      getMeta = degradedMeta(["postgres"])
    }

    // Fall back to PostgreSQL (episodic)
    const result = await tenantPgQuery<EpisodicMemoryRow>(
      groupId, scope.agent_id, pg,
      `SELECT metadata->>'memory_id' AS id, metadata->>'content' AS content,
            metadata->>'source' AS provenance,
            metadata->>'user_id' AS user_id,
            metadata->>'tags' AS tags,
            created_at
     FROM events
     WHERE metadata->>'memory_id' = $1
       AND group_id = $2
       AND event_type = 'memory_add'`,
      [request.id, groupId],
      scope.workspace_id
    )

    if (result.rows.length === 0) {
      throw new MemoryNotFoundError(request.id)
    }

    const row = result.rows[0]

    // Query recent usage from PG events table (uses migration-18 index)
    const recentUsage = await getRecentUsageCount(pg, groupId, request.id)

    return {
      id: toMemoryId(row.id),
      content: row.content,
      score: 0.5, // Episodic memories don't have scores
      source: "episodic",
      provenance: toProvenance(row.provenance),
      user_id: row.user_id || "unknown",
      created_at: row.created_at,
      usage_count: recentUsage ?? 0,
      recent_usage_count: recentUsage,
      tags: parseEpisodicTags(row.tags),
      meta: getMeta,
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "memory_get", "SELECT events by memory_id")
    }
    throw error
  }
}

/**
 * 4. memory_list
 *
 * List all memories for a user within a tenant.
 * Returns from both stores, merged and sorted.
 *
 * Pagination strategy: fetch all matching records from both stores,
 * deduplicate by id, sort, then slice in application code.
 * This produces correct total counts and non-overlapping pages,
 * unlike per-store LIMIT/OFFSET which misses/duplicates promoted memories.
 *
 * TODO Phase 3: cursor-based pagination when total > 5000
 */
export async function memory_list(request: MemoryListRequest): Promise<MemoryListResponse> {
  // Validate
  const groupId = validateGroupId(request.group_id)
  const scope = requireVerifiedWorkspaceScope(request)
  const limit = request.limit || 50
  const offset = request.offset || 0
  const sort = request.sort || "created_at_desc"

  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()
    const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

    // Parallel query both stores — no LIMIT/OFFSET; we paginate in application code
    let listMeta = baseMeta(["postgres", "graph"])

    // PG: fetch count + data (no LIMIT/OFFSET on data)
    const [pgCountResult, episodicResults, semanticResults] = await Promise.all([
      // Total count from PG
      tenantPgQuery<{ total_count: string }>(
        groupId, scope.agent_id, pg,
        `SELECT COUNT(*) AS total_count
         FROM events
         WHERE group_id = $1
           AND ($2::text IS NULL OR metadata->>'user_id' = $2)
           AND event_type = 'memory_add'`,
        [groupId, request.user_id ?? null],
        scope.workspace_id
      ),

      // PG data (no LIMIT/OFFSET — all rows for merge)
      tenantPgQuery<EpisodicMemoryRow>(
        groupId, scope.agent_id, pg,
        `SELECT metadata->>'memory_id' AS id, metadata->>'content' AS content,
                metadata->>'source' AS provenance,
                metadata->>'user_id' AS user_id,
                metadata->>'tags' AS tags,
                created_at
         FROM events
         WHERE group_id = $1
           AND ($2::text IS NULL OR metadata->>'user_id' = $2)
           AND event_type = 'memory_add'
         ORDER BY created_at DESC`,
        [groupId, request.user_id ?? null],
        scope.workspace_id
      ),

      // Graph adapter — fetch all + count in one pass
      (async () => {
        try {
          const graphResult = await graphAdapter.listMemories({
            group_id: groupId,
            workspace_id: scope.workspace_id,
            principal_id: scope.agent_id,
            user_id: request.user_id ?? null,
          })

          const memories = graphResult.memories.map((node) => ({
            id: node.id,
            content: node.content,
            score: node.score,
            source: "semantic" as const,
            provenance: node.provenance,
            user_id: node.user_id ?? "",
            created_at: node.created_at,
            version: node.version,
            usage_count: 0,
            recent_usage_count: null as number | null,
            tags: node.tags,
          }))

          return { memories, total: graphResult.total }
        } catch (err) {
          console.warn("[degraded] Graph adapter query error in memory_list:", err)
          listMeta = degradedMeta(["postgres"])
          return { memories: [], total: 0 }
        }
      })(),
    ])

    // Map PG rows to canonical shape
    const episodic = episodicResults.rows.map((row) => ({
      id: toMemoryId(row.id),
      content: row.content,
      score: 0.5,
      source: "episodic" as const,
      provenance: toProvenance(row.provenance),
      user_id: row.user_id || "unknown",
      created_at: row.created_at,
      usage_count: 0,
      recent_usage_count: null as number | null,
      tags: parseEpisodicTags(row.tags),
    }))

    // Deduplicate by id (promoted memories exist in both stores;
    // when id collides, prefer semantic version which has score/version)
    const seen = new Set<string>()
    const deduped = [...semanticResults.memories, ...episodic].filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    // Sort according to sort param
    const sorted = sortDedupedMemories(deduped, sort)

    // Compute total across both stores after dedup
    const pgTotal = parseInt(pgCountResult.rows[0]?.total_count ?? "0", 10)
    const neo4jTotal = semanticResults.total
    // When both stores are up, total = deduped.length (most accurate).
    // In degraded mode (one store failed), use the available store's count
    // plus the other store's count as approximation.
    const total = listMeta.degraded
      ? pgTotal + neo4jTotal // approximate: can't dedup across failed store
      : deduped.length

    // Slice for requested page
    const page = sorted.slice(offset, offset + limit)
    const has_more = offset + limit < total

    return {
      memories: page,
      total,
      has_more,
      meta: listMeta,
    }
  } catch (error) {
    // Classify known database errors so callers can distinguish
    // "DB is down" from "query is broken" from "legitimate empty result"
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    // If it's a raw pg error from the query, classify it
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "memory_list", "SELECT events")
    }
    console.error("memory_list error:", error)
    throw error
  }
}

/**
 * 5. memory_delete
 *
 * Soft-delete a memory.
 * - Appends deletion event to PostgreSQL (append-only)
 * - Marks Neo4j node as deprecated (if promoted)
 * - Original rows remain for audit trail
 */
export async function memory_delete(request: MemoryDeleteRequest): Promise<MemoryDeleteResponse> {
  // Validate
  const groupId = validateGroupId(request.group_id)
  const deletedAt = new Date().toISOString()
  const startTime = Date.now()

  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()

    // 1. Append deletion event to PostgreSQL — circuit-breaker wrapped
    await withCircuitBreaker("postgres", groupId, "memory_delete:insert_event", async () =>
      tenantPgQuery(groupId, request.user_id, pg,
        `INSERT INTO events (
        group_id, workspace_id, event_type, agent_id, status, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          groupId,
          request.scope?.workspace_id ?? null,
          "memory_delete",
          request.user_id,
          "completed",
          JSON.stringify({
            memory_id: request.id,
            user_id: request.user_id,
          }),
          deletedAt,
        ],
        request.scope?.workspace_id
      )
    )

    // 2. Mark graph node as deprecated (if exists) — secondary store, degradation acceptable
    let deleteMeta = baseMeta(["postgres", "graph"])
    try {
      const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })
      await withCircuitBreaker("graph", groupId, "memory_delete:mark_deprecated", async () =>
        graphAdapter.softDeleteMemory({ id: request.id, group_id: groupId, deleted_at: deletedAt })
      )
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Circuit breaker open")) {
        throw error
      }
      console.warn("[degraded] Graph adapter unavailable in memory_delete:", error)
      deleteMeta = degradedMeta(["postgres"])
    }

    recordToolCall(groupId, request.user_id, "memory_delete", Date.now() - startTime, true)

    return {
      id: request.id,
      deleted: true,
      deleted_at: deletedAt,
      recovery_days: RECOVERY_WINDOW_DAYS,
      meta: deleteMeta,
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "memory_delete", "INSERT memory_delete event")
    }
    throw error
  }
}

/**
 * 6. memory_update
 *
 * Append-only versioned update.
 * - Appends audit event to PostgreSQL (always, append-only)
 * - If memory exists in Neo4j: creates new node + SUPERSEDES relationship, marks old deprecated
 * - If episodic-only or Neo4j unavailable: returns stored='episodic' with degradedMeta
 * - PG errors fail loudly; Neo4j errors degrade gracefully
 */
export async function memory_update(request: MemoryUpdateRequest): Promise<MemoryUpdateResponse> {
  const groupId = validateGroupId(request.group_id)
  const scope = requireVerifiedWorkspaceScope(request)
  const newId = generateMemoryId()
  const updatedAt = new Date().toISOString()
  const agentId = String(request.metadata?.agent_id ?? request.user_id)
  const startTime = Date.now()

  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()

    // 1. Append audit event to PostgreSQL (mandatory, append-only) — circuit-breaker wrapped
    await withCircuitBreaker("postgres", groupId, "memory_update:insert_event", async () =>
      tenantPgQuery(groupId, agentId, pg,
        `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          groupId,
          request.scope?.workspace_id ?? null,
          "memory_update",
          agentId,
          "completed",
          JSON.stringify({
            new_memory_id: newId,
            previous_memory_id: request.id,
            user_id: request.user_id,
            content: request.content,
            reason: request.reason,
            ...request.metadata,
          }),
          updatedAt,
        ],
        request.scope?.workspace_id
      )
    )

    // 2. Attempt graph adapter SUPERSEDES versioning — circuit-breaker wrapped
    try {
      return await withCircuitBreaker("graph", groupId, "memory_update:supersedes", async () => {
        const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

        const versionResult = await graphAdapter.getVersion({ id: request.id as MemoryId, group_id: groupId })

        if (!versionResult.exists) {
          return {
            id: newId,
            previous_id: request.id as MemoryId,
            stored: "episodic" as const,
            version: 1,
            updated_at: updatedAt,
            meta: baseMeta(["postgres"]),
          }
        }

        const prevVersion = versionResult.version ?? 1
        const newVersion = prevVersion + 1

        await graphAdapter.supersedesMemory({
          prev_id: request.id as MemoryId,
          new_id: newId,
          group_id: groupId,
          workspace_id: scope.workspace_id,
          principal_id: scope.agent_id,
          user_id: request.user_id,
          content: request.content,
          version: newVersion,
          created_at: updatedAt,
        })

        return {
          id: newId,
          previous_id: request.id as MemoryId,
          stored: "semantic" as const,
          version: newVersion,
          updated_at: updatedAt,
          meta: baseMeta(["postgres", "graph"]),
        }
      })
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Circuit breaker open")) {
        throw error
      }
      console.warn("[degraded] Graph adapter unavailable in memory_update:", error)
      recordToolCall(groupId, agentId, "memory_update", Date.now() - startTime, true)
      return {
        id: newId,
        previous_id: request.id as MemoryId,
        stored: "episodic",
        version: 1,
        updated_at: updatedAt,
        meta: degradedMeta(["postgres"]),
      }
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "memory_update", "INSERT memory_update event")
    }
    throw error
  } finally {
    recordToolCall(groupId, agentId, "memory_update", Date.now() - startTime, true)
  }
}

/**
 * 7. memory_promote
 *
 * Request curator promotion for an episodic memory.
 * Never auto-promotes — always routes through canonical_proposals for HITL.
 * Idempotent: returns existing proposal_id if a pending proposal already exists.
 * Fails loudly on Neo4j errors (promotion must be observable).
 */
export async function memory_promote(request: MemoryPromoteRequest): Promise<MemoryPromoteResponse> {
  const groupId = validateGroupId(request.group_id)
  const queuedAt = new Date().toISOString()

  const { pg, neo4j: neo4jDriver } = await getConnections()
  const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

  // 1. Check if already canonical in graph layer — fails loudly (no silent fallback)
  const canonicalResult = await graphAdapter.checkCanonical({ id: request.id, group_id: groupId })
  if (canonicalResult.isCanonical) {
    return {
      id: request.id,
      proposal_id: "",
      status: "already_canonical",
      queued_at: queuedAt,
      meta: baseMeta(["graph"]),
    }
  }

  // 2. Check for existing pending proposal (idempotency)
  const existingProposal = await tenantPgQuery<{ id: string }>(
    groupId, request.curator_id ?? request.user_id, pg,
    `SELECT id FROM canonical_proposals
     WHERE group_id = $1
       AND status = 'pending'
       AND content LIKE '%' || $2 || '%'
     LIMIT 1`,
    [groupId, request.id],
    request.scope?.workspace_id
  )
  if (existingProposal.rows.length > 0) {
    return {
      id: request.id,
      proposal_id: existingProposal.rows[0].id,
      status: "queued",
      queued_at: queuedAt,
      meta: baseMeta(["postgres"]),
    }
  }

  // 3. Dedup: check for near-duplicate proposals using text similarity
  const dedupThreshold = getDedupThreshold()
  const dedupChecker = createProposalDedupChecker(undefined, dedupThreshold)

  // 4. Fetch memory content from PG
  const memoryRow = await tenantPgQuery<{ id: string; content: string; event_id: string }>(
    groupId, request.curator_id ?? request.user_id, pg,
    `SELECT metadata->>'memory_id' AS id,
            metadata->>'content' AS content,
            id AS event_id
     FROM events
     WHERE group_id = $1
       AND event_type = 'memory_add'
       AND metadata->>'memory_id' = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [groupId, request.id],
    request.scope?.workspace_id
  )

  if (memoryRow.rows.length === 0) {
    throw new MemoryNotFoundError(request.id)
  }

  const { content, event_id } = memoryRow.rows[0]

  // 4. Score content
  const scoreResult = await curatorScore({
    content,
    source: "conversation",
    usageCount: 0,
    daysSinceCreated: 0,
  })

  // 4b. Dedup: check for near-duplicate proposals before inserting
  try {
    const dedupRows = await tenantPgQuery<{
      id: string
      content: string
      score: number
      status: string
      created_at: string
    }>(groupId, request.curator_id ?? request.user_id, pg,
      `SELECT id, content, score, status, created_at
       FROM canonical_proposals
       WHERE group_id = $1
         AND status IN ('pending', 'approved')
       ORDER BY created_at DESC
       LIMIT 100`,
      [groupId],
      request.scope?.workspace_id
    )

    const dedupCandidates: ProposalCandidate[] = dedupRows.rows.map((row) => ({
      id: row.id,
      content: row.content,
      score: Number(row.score),
      status: row.status,
      created_at: row.created_at,
    }))

    const dedupResult = dedupChecker.checkProposals(content, dedupCandidates)

    if (dedupResult.isDuplicate && dedupResult.existingProposal) {
      console.warn(
        `[dedup] Skipping duplicate promote proposal for group_id=${groupId}: ` +
          `similarity=${dedupResult.similarity.toFixed(4)} threshold=${dedupResult.threshold} ` +
          `existing_proposal_id=${dedupResult.existingProposal.id} ` +
          `content_preview="${content.slice(0, 80)}..."`
      )

      return {
        id: request.id,
        proposal_id: dedupResult.existingProposal.id,
        status: "queued",
        queued_at: queuedAt,
        meta: baseMeta(["postgres"]),
      }
    }
  } catch (dedupErr) {
    console.warn("[dedup] Proposal dedup check failed in memory_promote, proceeding with insert:", dedupErr)
  }

  // 5. Insert proposal
  const proposalId = randomUUID()
  await tenantPgQuery(
    groupId, request.curator_id ?? request.user_id, pg,
    `INSERT INTO canonical_proposals
       (id, group_id, workspace_id, content, score, reasoning, tier, status, trace_ref, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)`,
    [proposalId, groupId, request.scope?.workspace_id ?? null, content, scoreResult.confidence, scoreResult.reasoning, scoreResult.tier, event_id, queuedAt],
    request.scope?.workspace_id
  )

  // 6. Append audit event
  await tenantPgQuery(
    groupId, request.curator_id ?? request.user_id, pg,
    `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      groupId,
      request.scope?.workspace_id ?? null,
      "memory_promote_requested",
      request.curator_id ?? request.user_id,
      "completed",
      JSON.stringify({
        memory_id: request.id,
        proposal_id: proposalId,
        rationale: request.rationale,
        score: scoreResult.confidence,
      }),
      queuedAt,
    ],
    request.scope?.workspace_id
  )

  return {
    id: request.id,
    proposal_id: proposalId,
    status: "queued",
    queued_at: queuedAt,
    meta: baseMeta(["postgres"]),
  }
}

/**
 * 8. memory_export
 *
 * Export memories filtered by group_id and optional canonical status.
 * canonical_only=true  → Neo4j only; throws DatabaseUnavailableError if Neo4j is down.
 * canonical_only=false → Both stores; deduplicates by memory_id (Neo4j wins).
 */
export async function memory_export(request: MemoryExportRequest): Promise<MemoryExportResponse> {
  const groupId = validateGroupId(request.group_id)
  const limit = Math.min(request.limit ?? 1000, 10000)
  const offset = request.offset ?? 0
  const exportedAt = new Date().toISOString()

  const { pg, neo4j: neo4jDriver } = await getConnections()
  const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

  // Canonical memories from graph layer
  let canonicalMemories: MemoryGetResponse[] = []
  let graphFailed = false

  try {
    const graphResult = await graphAdapter.exportMemories({
      group_id: groupId,
      user_id: request.user_id ?? null,
      offset,
      limit,
    })

    canonicalMemories = graphResult.memories.map((node) => ({
      id: node.id,
      content: node.content,
      score: node.score,
      source: "semantic" as const,
      provenance: node.provenance,
      user_id: node.user_id ?? "",
      created_at: node.created_at,
      version: node.version,
      usage_count: 0,
      recent_usage_count: null as number | null,
      tags: node.tags,
      meta: baseMeta(["graph"]),
    }))
  } catch (error) {
    if (request.canonical_only) {
      // canonical_only=true: no fallback — fail loudly
      throw new DatabaseUnavailableError("memory_export:graph", error instanceof Error ? error : undefined)
    }
    console.warn("[degraded] Graph adapter unavailable in memory_export:", error)
    graphFailed = true
  }

  if (request.canonical_only) {
    return {
      memories: canonicalMemories,
      count: canonicalMemories.length,
      exported_at: exportedAt,
      canonical_count: canonicalMemories.length,
      episodic_count: 0,
      meta: baseMeta(["graph"]),
    }
  }

  // Episodic memories from PostgreSQL
  const canonicalIds = new Set(canonicalMemories.map((m) => m.id))

  const pgResult = await tenantPgQuery<EpisodicMemoryRow>(
    groupId, request.user_id ?? "api", pg,
    `SELECT metadata->>'memory_id' AS id,
            metadata->>'content' AS content,
            metadata->>'source' AS provenance,
            metadata->>'user_id' AS user_id,
            metadata->>'tags' AS tags,
            created_at
     FROM events
     WHERE group_id = $1
       AND event_type = 'memory_add'
       AND ($2::text IS NULL OR metadata->>'user_id' = $2)
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [groupId, request.user_id ?? null, limit, offset],
    request.scope?.workspace_id
  )

  // Deduplicate: Neo4j wins on collision
  const episodicMemories: MemoryGetResponse[] = pgResult.rows
    .filter((row) => !canonicalIds.has(row.id as MemoryId))
    .map((row) => ({
      id: toMemoryId(row.id),
      content: row.content,
      score: 0.5,
      source: "episodic" as const,
      provenance: toProvenance(row.provenance),
      user_id: row.user_id ?? "",
      created_at: row.created_at,
      version: 1,
      usage_count: 0,
      recent_usage_count: null as number | null,
      tags: parseEpisodicTags(row.tags),
    }))

  const allMemories = [...canonicalMemories, ...episodicMemories]
  const exportMeta = graphFailed ? degradedMeta(["postgres"]) : baseMeta(["postgres", "graph"])

  return {
    memories: allMemories,
    count: allMemories.length,
    exported_at: exportedAt,
    canonical_count: canonicalMemories.length,
    episodic_count: episodicMemories.length,
    meta: exportMeta,
  }
}

// ── 9. memory_restore ────────────────────────────────────────────────────────

/**
 * Restore a soft-deleted memory within the recovery window (30 days).
 *
 * Flow:
 * 1. Find delete event in PostgreSQL within recovery window
 * 2. Remove deprecated flag + SUPERSEDES relationship in Neo4j
 * 3. Append restore event to PostgreSQL (append-only, no UPDATE)
 * 4. Return restore confirmation
 *
 * Constraints:
 * - No UPDATE on PostgreSQL events table (append-only)
 * - RESTORE appends event_type='memory_restore' row
 * - Graph adapter: remove deprecated flag, remove SUPERSEDES relationships
 * - group_id scoped on every query
 */
export async function memory_restore(request: MemoryRestoreRequest): Promise<MemoryRestoreResponse> {
  const groupId = validateGroupId(request.group_id)
  const restoredAt = new Date().toISOString()
  const startTime = Date.now()

  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()

    // 1. Verify memory was deleted within the recovery window
    const deleteEventResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "memory_restore:find_delete_event",
      async () =>
        tenantPgQuery<{ id: string; created_at: string; metadata: Record<string, unknown> }>(
          groupId, request.user_id, pg,
          `SELECT id, created_at, metadata
         FROM events
         WHERE group_id = $1
           AND event_type = 'memory_delete'
           AND metadata->>'memory_id' = $2
           AND created_at >= NOW() - INTERVAL '${RECOVERY_WINDOW_DAYS} days'
         ORDER BY created_at DESC
         LIMIT 1`,
          [groupId, request.id],
          request.scope?.workspace_id
        )
    )

    if (deleteEventResult.rows.length === 0) {
      // Check if a memory_delete event exists at all (outside window = expired)
      const anyDeleteResult = await withCircuitBreaker(
        "postgres",
        groupId,
        "memory_restore:find_any_delete",
        async () =>
          tenantPgQuery<{ id: string }>(
            groupId, request.user_id, pg,
            `SELECT id FROM events WHERE group_id = $1 AND event_type = 'memory_delete' AND metadata->>'memory_id' = $2 LIMIT 1`,
            [groupId, request.id],
            request.scope?.workspace_id
          )
      )

      if (anyDeleteResult.rows.length === 0) {
        throw new MemoryNotDeletedError(request.id)
      }
      throw new RecoveryWindowExpiredError(request.id)
    }

    // 2. Restore in graph layer — remove deprecated flag and SUPERSEDES relationships
    let restoreMeta = baseMeta(["postgres", "graph"])
    try {
      const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })
      await withCircuitBreaker("graph", groupId, "memory_restore:restore_node", async () =>
        graphAdapter.restoreMemory({ id: request.id, group_id: groupId, restored_at: restoredAt })
      )
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Circuit breaker open")) {
        throw error
      }
      console.warn("[degraded] Graph adapter unavailable in memory_restore:", error)
      restoreMeta = degradedMeta(["postgres"])
    }

    // 3. Append restore event to PostgreSQL (append-only)
    await withCircuitBreaker("postgres", groupId, "memory_restore:insert_event", async () =>
      tenantPgQuery(groupId, request.user_id, pg,
        `INSERT INTO events (group_id, workspace_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          groupId,
          request.scope?.workspace_id ?? null,
          "memory_restore",
          request.user_id,
          "completed",
          JSON.stringify({
            memory_id: request.id,
            user_id: request.user_id,
            deleted_at: deleteEventResult.rows[0].created_at,
          }),
          restoredAt,
        ],
        request.scope?.workspace_id
      )
    )

    recordToolCall(groupId, request.user_id, "memory_restore", Date.now() - startTime, true)

    return {
      id: request.id,
      restored: true,
      restored_at: restoredAt,
      meta: restoreMeta,
    }
  } catch (error) {
    if (error instanceof MemoryNotDeletedError || error instanceof RecoveryWindowExpiredError) {
      throw error
    }
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "memory_restore", "SELECT/INSERT events")
    }
    throw error
  }
}

// ── 10. memory_list_deleted ──────────────────────────────────────────────────

/**
 * List soft-deleted memories within the 30-day recovery window.
 *
 * Flow:
 * 1. Query PostgreSQL for memory_delete events within recovery window
 * 2. For each deleted memory, find the most recent memory_add event (pre-deletion content)
 * 3. Cross-reference Neo4j for semantic memories that are deprecated
 * 4. Return list with recovery_days_remaining
 *
 * Constraints:
 * - group_id scoped on every query
 * - No UPDATE on PostgreSQL events table (append-only)
 * - Only events within recovery window
 */
export async function memory_list_deleted(request: MemoryListDeletedRequest): Promise<MemoryListDeletedResponse> {
  const groupId = validateGroupId(request.group_id)
  const limit = request.limit || 50
  const offset = request.offset || 0

  try {
    const { pg, neo4j: neo4jDriver } = await getConnections()
    const graphAdapter = createGraphAdapter({ pg, neo4j: neo4jDriver ?? undefined })

    let listMeta = baseMeta(["postgres", "graph"])

    // 1. Find memory_delete events within the recovery window, grouped by memory_id
    const deleteEventsResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "memory_list_deleted:find_deletes",
      async () =>
        tenantPgQuery<{ memory_id: string; user_id: string; deleted_at: string }>(
          groupId, request.user_id ?? "api", pg,
          `SELECT DISTINCT ON (metadata->>'memory_id')
           metadata->>'memory_id' AS memory_id,
           metadata->>'user_id' AS user_id,
           created_at AS deleted_at
         FROM events
         WHERE group_id = $1
           AND event_type = 'memory_delete'
           AND ($2::text IS NULL OR metadata->>'user_id' = $2)
           AND created_at >= NOW() - INTERVAL '${RECOVERY_WINDOW_DAYS} days'
         ORDER BY metadata->>'memory_id', created_at DESC`,
          [groupId, request.user_id ?? null],
          request.scope?.workspace_id
        )
    )

    if (deleteEventsResult.rows.length === 0) {
      return { memories: [], total: 0, has_more: false, meta: listMeta }
    }

    // 2. For each deleted memory, find the pre-deletion content from the most recent memory_add event
    const deletedMemoryIds = deleteEventsResult.rows.map((r) => r.memory_id)

    // Build memory content lookup from PG add events
    const addEventsResult = await withCircuitBreaker(
      "postgres",
      groupId,
      "memory_list_deleted:find_add_events",
      async () =>
        tenantPgQuery<{
          memory_id: string
          content: string
          source: string
          provenance: string
          user_id: string
          created_at: string
          score: string
          tags: string
        }>(groupId, request.user_id ?? "api", pg,
          `SELECT DISTINCT ON (metadata->>'memory_id')
           metadata->>'memory_id' AS memory_id,
           metadata->>'content' AS content,
           metadata->>'source' AS source,
           metadata->>'provenance' AS provenance,
           metadata->>'user_id' AS user_id,
           created_at,
           metadata->>'score' AS score,
           metadata->>'tags' AS tags
         FROM events
         WHERE group_id = $1
           AND event_type = 'memory_add'
           AND metadata->>'memory_id' = ANY($2)
         ORDER BY metadata->>'memory_id', created_at DESC`,
          [groupId, deletedMemoryIds],
          request.scope?.workspace_id
        )
    )

    const addByMemoryId = new Map(addEventsResult.rows.map((r) => [r.memory_id, r]))

    // 3. Cross-reference graph adapter for deprecated memories
    let graphMemories: Map<
      string,
      {
        content: string
        score: number
        provenance: string
        user_id: string
        created_at: string
        version: number
        tags: string[]
      }
    > = new Map()
    try {
      const deprecatedNodes = await graphAdapter.getDeprecatedMemories({
        ids: deletedMemoryIds,
        group_id: groupId,
      })
      graphMemories = new Map(
        [...deprecatedNodes.entries()].map(([id, node]) => [
          id,
          {
            content: node.content,
            score: node.score,
            provenance: node.provenance,
            user_id: node.user_id ?? "unknown",
            created_at: node.created_at,
            version: node.version,
            tags: node.tags,
          },
        ])
      )
    } catch (error) {
      console.warn("[degraded] Graph adapter unavailable in memory_list_deleted:", error)
      listMeta = degradedMeta(["postgres"])
    }

    // 4. Merge PG and graph results — prefer graph when available
    const now = Date.now()
    const memories = deleteEventsResult.rows
      .map((delRow) => {
        const addRow = addByMemoryId.get(delRow.memory_id)
        const graphData = graphMemories.get(delRow.memory_id)

        const content = graphData?.content ?? addRow?.content ?? "(content unavailable)"
        const provenance = toProvenance(graphData?.provenance ?? addRow?.provenance)
        const userId = graphData?.user_id ?? addRow?.user_id ?? delRow.user_id ?? "unknown"
        const createdAt = graphData?.created_at ?? addRow?.created_at ?? delRow.deleted_at
        const score = (graphData?.score ?? parseFloat(addRow?.score ?? "0.5")) || 0.5
        const version = graphData?.version ?? 1
        const tags = graphData?.tags ?? parseEpisodicTags(addRow?.tags ?? null)
        const source: StorageLocation = graphData ? "semantic" : "episodic"

        const deletedAtDate = new Date(delRow.deleted_at)
        const recoveryDeadline = new Date(deletedAtDate.getTime() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
        const daysRemaining = Math.max(0, Math.ceil((recoveryDeadline.getTime() - now) / (24 * 60 * 60 * 1000)))

        return {
          id: delRow.memory_id as MemoryId,
          content: content as MemoryContent,
          source,
          provenance,
          user_id: userId,
          created_at: createdAt,
          deleted_at: delRow.deleted_at,
          recovery_days_remaining: daysRemaining,
          score: score as ConfidenceScore,
          tags,
          version,
        }
      })
      .filter((m) => m.content !== "(content unavailable)" || graphMemories.has(m.id as string))
      .sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime())

    const total = memories.length
    const page = memories.slice(offset, offset + limit)
    const has_more = offset + limit < total

    return {
      memories: page,
      total,
      has_more,
      meta: listMeta,
    }
  } catch (error) {
    if (error instanceof DatabaseUnavailableError || error instanceof DatabaseQueryError) {
      throw error
    }
    if (error instanceof Error && (error as Error & { code?: string }).code) {
      throw classifyPostgresError(error, "memory_list_deleted", "SELECT events")
    }
    throw error
  }
}

// ── Export for MCP Server ─────────────────────────────────────────────────

export const canonicalMemoryTools = {
  memory_add,
  memory_search,
  memory_get,
  memory_list,
  memory_delete,
  memory_update,
  memory_promote,
  memory_export,
  memory_restore,
  memory_list_deleted,
}

export { getBudgetEnforcer, getBreakerManager, ensureSession, checkBudget, recordToolCall, withCircuitBreaker, resetHaltedGroup, getHaltedSessions }

export { resetConnections }
