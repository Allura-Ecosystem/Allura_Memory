/**
 * RuVector MCP Bridge Module
 *
 * Connects the existing canonical MCP tools to RuVector's vector
 * search capabilities. Provides three primary functions:
 *
 * 1. storeMemory()     — Insert memory with tenant isolation
 * 2. retrieveMemories()— Hybrid search (vector ANN + BM25 with RRF fusion)
 * 3. postFeedback()    — SONA feedback loop for relevance learning
 *
 * Key constraints:
 * - Server-only: throws if imported in browser
 * - Uses existing getRuVectorPool() from connection.ts (no duplicate pool)
 * - Parameterized queries ONLY (no string interpolation)
 * - group_id validation: ^allura-[a-z0-9-]+$
 * - Embedding column type is vector(1024) in PG (qwen3-embedding:8b, Matryoshka 1024d)
 * - Memory IDs are BIGSERIAL (stringified); feedback IDs are UUID v4
 * - Query vectors must be formatted as string literal '[0.1,0.2,...]'::vector
 *   (pg driver cannot send JS arrays to ruvector columns — parser error in vector.rs)
 */

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("RuVector bridge module can only be used server-side")
}

import type { Pool, QueryResult } from "pg"
import { randomUUID } from "node:crypto"

import { checkRuVectorHealth, getRuVectorPool, isRuVectorEnabled } from "./connection"
import { generateEmbedding } from "./embedding-service"
import type {
  AlluraMemoryRow,
  PostFeedbackParams,
  RetrievedMemory,
  RetrieveMemoriesParams,
  RetrieveMemoriesResult,
  RuVectorMemoryType,
  RuVectorReadinessResult,
  StoreMemoryParams,
  StoreMemoryResult,
} from "./types"
import { classifyPostgresError, DatabaseQueryError, DatabaseUnavailableError } from "../errors/database-errors"
import { CURRENT_SCHEMA_VERSION } from "../schema-version"
import { GroupIdValidationError , validateGroupId } from "../validation/group-id"

// ── Bridge-Specific Errors ───────────────────────────────────────────────────

/**
 * Thrown when input validation fails for bridge function parameters.
 * Distinguished from DatabaseQueryError so callers can distinguish
 * "bad input" (400) from "query failed" (500).
 */
export class RuVectorBridgeValidationError extends Error {
  public readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.name = "RuVectorBridgeValidationError"
    this.field = field
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Default retrieval limit */
const DEFAULT_LIMIT = 10

/** Default minimum similarity threshold */
const DEFAULT_THRESHOLD = 0.5

/** Query embedding is optional for retrieval; leave most of the request budget for bounded SQL fallbacks. */
const RETRIEVAL_EMBEDDING_TIMEOUT_MS = 5_000

/** Table name for memories */
const MEMORIES_TABLE = "allura_memories"

/** Table name for SONA feedback */
const FEEDBACK_TABLE = "allura_feedback"

/** Standard RRF constant (k=60 is the widely-adopted default) */
const RRF_K = 60

// ── RRF Fusion ────────────────────────────────────────────────────────────────

/**
 * Row shape returned from vector ANN query.
 */
interface VectorSearchRow {
  id: string
  content: string
  memory_type: RuVectorMemoryType
  vector_score: number
}

/**
 * Row shape returned from BM25 text search query.
 */
interface BM25SearchRow {
  id: string
  content: string
  memory_type: RuVectorMemoryType
  bm25_score: number
}

/**
 * Fuse vector and BM25 results using Reciprocal Rank Fusion (RRF).
 *
 * RRF score = 1/(k+rank_v) + 1/(k+rank_b) where:
 * - k = 60 (standard RRF smoothing constant)
 * - rank_v = rank in vector results (1-indexed)
 * - rank_b = rank in BM25 results (1-indexed)
 *
 * Results appearing in only one list get contribution from that list only.
 * Deduplication: if a memory appears in both lists, its content/memoryType
 * comes from the vector result (higher confidence from structural matching).
 *
 * @param vectorResults - Rows from vector ANN search
 * @param bm25Results - Rows from BM25 text search
 * @param threshold - Minimum RRF score (normalized to 0-1) to include
 * @returns Fused and sorted RetrievedMemory array
 */
function fuseResults(
  vectorResults: VectorSearchRow[],
  bm25Results: BM25SearchRow[],
  threshold: number
): RetrievedMemory[] {
  const rrfScores = new Map<string, number>()
  const contentMap = new Map<string, { content: string; memoryType: RuVectorMemoryType }>()

  // Vector ranks (1-indexed)
  vectorResults.forEach((r, i) => {
    const rank = i + 1
    rrfScores.set(r.id, 1 / (RRF_K + rank))
    contentMap.set(r.id, { content: r.content, memoryType: r.memory_type })
  })

  // BM25 ranks (1-indexed) — add to existing scores
  bm25Results.forEach((r, i) => {
    const rank = i + 1
    const existing = rrfScores.get(r.id) || 0
    rrfScores.set(r.id, existing + 1 / (RRF_K + rank))
    // Only add content if not already present (vector result takes precedence)
    if (!contentMap.has(r.id)) {
      contentMap.set(r.id, { content: r.content, memoryType: r.memory_type })
    }
  })

  // Max possible RRF score for normalization:
  // A result at rank 1 in both lists: 2/(k+1)
  const maxPossibleScore = 2 / (RRF_K + 1)

  // Build result array, normalize scores to 0-1, filter by threshold
  const fused: RetrievedMemory[] = []
  for (const [id, rawScore] of rrfScores) {
    const normalizedScore = rawScore / maxPossibleScore
    if (normalizedScore >= threshold) {
      const entry = contentMap.get(id)
      if (entry) {
        fused.push({
          id,
          content: entry.content,
          memoryType: entry.memoryType,
          score: normalizedScore,
        })
      }
    }
  }

  // Sort by score descending
  fused.sort((a, b) => b.score - a.score)

  return fused
}

// ── storeMemory ─────────────────────────────────────────────────────────────

/**
 * Store a memory in RuVector with tenant isolation.
 *
 * Validates group_id, generates an embedding via Ollama (graceful degradation
 * if Ollama is unreachable), and inserts into allura_memories.
 *
 * @param params - Memory storage parameters
 * @returns Store result with ID and status ("stored" if embedding generated,
 *          "stored_pending_embedding" if embedding failed)
 * @throws GroupIdValidationError if userId doesn't match ^allura-[a-z0-9-]+$
 * @throws DatabaseUnavailableError if RuVector is unreachable
 * @throws DatabaseQueryError if the insert fails
 */
export async function storeMemory(params: StoreMemoryParams): Promise<StoreMemoryResult> {
  const { userId, sessionId, content, memoryType = "episodic", metadata = {} } = params

  // Validate group_id (userId maps to group_id per ARCH-001)
  const groupId = validateGroupId(userId)

  // Validate content is non-empty
  if (!content || content.trim().length === 0) {
    throw new RuVectorBridgeValidationError("content", "content must be a non-empty string")
  }

  // Validate sessionId is non-empty
  if (!sessionId || sessionId.trim().length === 0) {
    throw new RuVectorBridgeValidationError("sessionId", "sessionId must be a non-empty string")
  }

  // Generate embedding before DB insert (graceful degradation if Ollama is down)
  const embedding: number[] | null = await generateEmbedding(content)

  if (embedding === null) {
    console.info(
      `[RuVector Bridge] Embedding generation failed for memory in session ${sessionId} — storing without vector (status: stored_pending_embedding)`
    )
  }

  let pool: Pool
  try {
    pool = getRuVectorPool()
  } catch (error) {
    throw new DatabaseUnavailableError(
      "storeMemory: failed to get RuVector pool",
      error instanceof Error ? error : undefined
    )
  }

  // NOTE(ARCH-001): In Allura's tenant model, userId IS the group_id (tenant).
  // Both user_id and group_id columns receive the same validated value.
  // A future iteration may separate these when per-user isolation within a
  // tenant is needed. Until then: user_id = group_id = validated groupId.
  let result: QueryResult
  try {
    // Format embedding for ruvector type: must be string '[0.1,0.2,...]' or null
    // The pg driver sends JS arrays as PG arrays, but ruvector expects vector literal syntax
    const embeddingValue = embedding ? `[${embedding.join(",")}]` : null

    result = await pool.query(
      `INSERT INTO ${MEMORIES_TABLE}
         (user_id, session_id, content, memory_type, embedding, metadata, group_id, schema_version)
       VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb, $7, $8)
       RETURNING id, created_at`,
      [
        groupId, // user_id — same as group_id per ARCH-001 tenant model
        sessionId,
        content,
        memoryType,
        embeddingValue, // formatted as ruvector literal or null
        JSON.stringify(metadata),
        groupId, // group_id — validated ^allura-[a-z0-9-]+$
        CURRENT_SCHEMA_VERSION,
      ]
    )
  } catch (error) {
    const classified = classifyPostgresError(
      error instanceof Error ? error : new Error(String(error)),
      "storeMemory",
      `INSERT INTO ${MEMORIES_TABLE}`
    )
    throw classified
  }

  const row = result.rows[0]
  return {
    id: String(row.id),
    status: embedding ? "stored" : "stored_pending_embedding",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    groupId,
  }
}

// ── retrieveMemories ─────────────────────────────────────────────────────────

/**
 * Retrieve memories using hybrid search (vector + BM25 with RRF fusion).
 *
 * Search modes:
 * - 'hybrid' (default): Two-pass query — vector ANN via cosine distance
 *   + BM25 via ts_rank, fused with Reciprocal Rank Fusion (RRF).
 * - 'vector': Vector ANN only (requires embeddings).
 * - 'text': BM25 text search only (original ts_rank behavior).
 *
 * Graceful degradation:
 * - If embedding generation fails OR no embeddings exist in the table,
 *   the function falls back to text-only (BM25) search regardless of
 *   the requested searchMode.
 *
 * Returns a trajectoryId for SONA feedback correlation.
 *
 * @param params - Retrieval parameters
 * @returns Search results with trajectory ID and modes used
 * @throws GroupIdValidationError if userId doesn't match ^allura-[a-z0-9-]+$
 * @throws DatabaseUnavailableError if RuVector is unreachable
 * @throws DatabaseQueryError if the query fails
 */
export async function retrieveMemories(params: RetrieveMemoriesParams): Promise<RetrieveMemoriesResult> {
  const { userId, query, limit = DEFAULT_LIMIT, threshold = DEFAULT_THRESHOLD, searchMode = "hybrid" } = params

  // Validate group_id (userId maps to group_id per ARCH-001)
  const groupId = validateGroupId(userId)

  // Validate query is non-empty
  if (!query || query.trim().length === 0) {
    throw new RuVectorBridgeValidationError("query", "query must be a non-empty string")
  }

  // Validate limit bounds
  if (limit < 1 || limit > 100) {
    throw new RuVectorBridgeValidationError("limit", "limit must be between 1 and 100")
  }

  // Validate threshold bounds
  if (threshold < 0 || threshold > 1) {
    throw new RuVectorBridgeValidationError("threshold", "threshold must be between 0.0 and 1.0")
  }

  const trajectoryId = randomUUID()
  const startTime = Date.now()
  const modesUsed: Array<"vector" | "text"> = []

  let pool: Pool
  try {
    pool = getRuVectorPool()
  } catch (error) {
    throw new DatabaseUnavailableError(
      "retrieveMemories: failed to get RuVector pool",
      error instanceof Error ? error : undefined
    )
  }

  // Attempt to generate query embedding for vector search
  let queryEmbedding: number[] | null = null
  if (searchMode !== "text") {
    queryEmbedding = await generateEmbedding(query, RETRIEVAL_EMBEDDING_TIMEOUT_MS)
    if (queryEmbedding === null) {
      console.info(`[RuVector Bridge] Query embedding generation failed for session — falling back to text-only search`)
    }
  }

  // Determine effective mode: only use vector if we have an embedding
  const canUseVector = queryEmbedding !== null && searchMode !== "text"
  const canUseText = searchMode !== "vector"

  // ── Pass 1: Vector ANN search ──────────────────────────────────────────
  let vectorResults: VectorSearchRow[] = []
  if (canUseVector) {
    try {
      // Check if any embeddings exist in the table for this user
      const embeddingCheck = await pool.query(
        `SELECT 1 FROM ${MEMORIES_TABLE}
         WHERE user_id = $1 AND embedding IS NOT NULL AND deleted_at IS NULL
         LIMIT 1`,
        [groupId]
      )

      if (embeddingCheck.rows.length > 0) {
        // Format query vector as ruvector literal string '[0.1,0.2,...]'
        // The pg driver cannot send JS arrays to ruvector columns (parser error in vector.rs)
        const embeddingValue = `[${queryEmbedding!.join(",")}]`

        const vectorResult = await pool.query(
          `SELECT
             id,
             content,
             memory_type,
             1 - (embedding <=> $1::vector) AS vector_score
           FROM ${MEMORIES_TABLE}
           WHERE user_id = $2
             AND embedding IS NOT NULL
             AND deleted_at IS NULL
           ORDER BY embedding <=> $1::vector ASC
           LIMIT $3`,
          [embeddingValue, groupId, limit]
        )

        vectorResults = vectorResult.rows as VectorSearchRow[]
        modesUsed.push("vector")
      } else {
        console.info(`[RuVector Bridge] No embeddings found in table for user ${groupId} — skipping vector pass`)
      }
    } catch (error) {
      // Graceful degradation: classify the error, log appropriately, fall back to text-only
      const classified = classifyPostgresError(
        error instanceof Error ? error : new Error(String(error)),
        "retrieveMemories",
        `SELECT from ${MEMORIES_TABLE} (vector ANN)`
      )
      if (classified instanceof DatabaseUnavailableError) {
        // Connection-level failure in vector pass — rethrow; DB is down, text pass will also fail
        throw classified
      }
      // Query-level failure in vector pass — log and fall back to text-only
      console.warn(`[RuVector Bridge] Vector search failed — falling back to text-only: ${classified.message}`)
      vectorResults = []
    }
  }

  // ── Pass 2: BM25 text search ───────────────────────────────────────────
  let bm25Results: BM25SearchRow[] = []
  if (canUseText) {
    try {
      const bm25Result = await pool.query(
        `SELECT
           id,
           content,
           memory_type,
           ts_rank(
             to_tsvector('english', content),
             plainto_tsquery('english', $1)
           ) AS bm25_score
         FROM ${MEMORIES_TABLE}
         WHERE user_id = $2 AND deleted_at IS NULL
         ORDER BY bm25_score DESC
         LIMIT $3`,
        [query, groupId, limit]
      )

      bm25Results = bm25Result.rows as BM25SearchRow[]
      modesUsed.push("text")
    } catch (error) {
      const classified = classifyPostgresError(
        error instanceof Error ? error : new Error(String(error)),
        "retrieveMemories",
        `SELECT from ${MEMORIES_TABLE} (BM25)`
      )
      throw classified
    }
  }

  // ── Fuse or convert results ────────────────────────────────────────────
  let memories: RetrievedMemory[]

  if (modesUsed.includes("vector") && modesUsed.includes("text")) {
    // Hybrid: fuse with RRF
    memories = fuseResults(vectorResults, bm25Results, threshold)
  } else if (modesUsed.includes("vector")) {
    // Vector-only: normalize vector scores and filter
    const maxScore = vectorResults.length > 0 ? Math.max(...vectorResults.map((r) => r.vector_score), 1) : 1
    memories = vectorResults
      .map((row) => ({
        id: row.id,
        content: row.content,
        memoryType: row.memory_type,
        score: row.vector_score / maxScore,
      }))
      .filter((m) => m.score >= threshold)
  } else {
    // Text-only (BM25): normalize scores and filter (original behavior)
    const maxScore = bm25Results.length > 0 ? Math.max(...bm25Results.map((r) => r.bm25_score), 1) : 1
    memories = bm25Results
      .map((row) => ({
        id: row.id,
        content: row.content,
        memoryType: row.memory_type,
        score: row.bm25_score / maxScore,
      }))
      .filter((m) => m.score >= threshold)
  }

  const total =
    modesUsed.includes("vector") && modesUsed.includes("text")
      ? new Set([...vectorResults, ...bm25Results].map((r) => r.id)).size
      : modesUsed.includes("vector")
        ? vectorResults.length
        : bm25Results.length

  const latencyMs = Date.now() - startTime

  return {
    memories,
    total,
    latencyMs,
    trajectoryId,
    modesUsed,
  }
}

// ── postFeedback ─────────────────────────────────────────────────────────────

/**
 * Post SONA feedback for a retrieval trajectory.
 *
 * This is the SONA feedback loop — it records which memories were
 * relevant and which weren't, allowing RuVector's self-learning
 * to improve future retrieval quality.
 *
 * ONLY fires when retrieval actually happened AND at least one
 * memory was used (usedMemoryIds has length > 0).
 *
 * @param params - Feedback parameters including trajectory ID
 * @throws DatabaseUnavailableError if RuVector is unreachable
 * @throws DatabaseQueryError if the feedback insert fails
 */
export async function postFeedback(params: PostFeedbackParams): Promise<void> {
  const { trajectoryId, relevanceScores, usedMemoryIds = [], userId } = params

  // Guard: don't fire feedback if no memories were used
  if (usedMemoryIds.length === 0) {
    console.info("[RuVector Bridge] Skipping feedback: no memories were used")
    return
  }

  // Validate group_id (userId maps to group_id per ARCH-001)
  const groupId = validateGroupId(userId)

  // Validate trajectoryId is non-empty
  if (!trajectoryId || trajectoryId.trim().length === 0) {
    throw new RuVectorBridgeValidationError("trajectoryId", "trajectoryId must be a non-empty string")
  }

  // Validate relevanceScores has values in 0.0-1.0 range
  for (const score of relevanceScores) {
    if (typeof score !== "number" || score < 0 || score > 1) {
      throw new RuVectorBridgeValidationError("relevanceScores", "relevanceScores must be numbers between 0.0 and 1.0")
    }
  }

  // Validate relevanceScores length matches usedMemoryIds length
  // Each used memory should have a corresponding score
  if (relevanceScores.length !== usedMemoryIds.length) {
    throw new RuVectorBridgeValidationError(
      "relevanceScores",
      `relevanceScores length (${relevanceScores.length}) must match usedMemoryIds length (${usedMemoryIds.length}). ` +
        "Provide one score per memory that was used."
    )
  }

  const feedbackId = randomUUID()
  const createdAt = new Date().toISOString()

  // Partition IDs into relevant (used) and irrelevant (not used)
  const relevantIds = usedMemoryIds
  const irrelevantIds: string[] = []

  let pool: Pool
  try {
    pool = getRuVectorPool()
  } catch (error) {
    throw new DatabaseUnavailableError(
      "postFeedback: failed to get RuVector pool",
      error instanceof Error ? error : undefined
    )
  }

  try {
    // Record feedback in the feedback table
    await pool.query(
      `INSERT INTO ${FEEDBACK_TABLE}
         (id, trajectory_id, relevance_scores, relevant_ids, irrelevant_ids, created_at, group_id)
       VALUES ($1, $2, $3::jsonb, $4::text[], $5::text[], $6, $7)`,
      [feedbackId, trajectoryId, JSON.stringify(relevanceScores), relevantIds, irrelevantIds, createdAt, groupId]
    )
  } catch (error) {
    const classified = classifyPostgresError(
      error instanceof Error ? error : new Error(String(error)),
      "postFeedback",
      `INSERT INTO ${FEEDBACK_TABLE}`
    )
    throw classified
  }

  // Attempt SONA learning if RuVector functions are available.
  // This is best-effort — if the function doesn't exist yet, we log and continue.
  try {
    await pool.query("SELECT ruvector_sona_learn()")
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    // SONA learning is best-effort; log but don't fail the feedback recording
    if (errMsg.includes("does not exist") || errMsg.includes("could not find")) {
      console.info("[RuVector Bridge] ruvector_sona_learn() not available — feedback recorded but learning deferred")
    } else {
      console.warn("[RuVector Bridge] ruvector_sona_learn() failed — feedback still recorded", { error: errMsg })
    }
  }
}

// ── isRuVectorReady ─────────────────────────────────────────────────────────

/**
 * Check if RuVector is enabled and reachable.
 *
 * Performs two checks:
 * 1. isRuVectorEnabled() — checks RUVECTOR_ENABLED env var
 * 2. checkRuVectorHealth() — attempts a lightweight health ping
 *
 * @returns Readiness result with status and optional reason
 */
export async function isRuVectorReady(): Promise<RuVectorReadinessResult> {
  // Check environment variable first
  if (!isRuVectorEnabled()) {
    return {
      ready: false,
      reason: "RUVECTOR_ENABLED is not set to 'true'",
    }
  }

  // Attempt health ping
  try {
    const health = await checkRuVectorHealth()
    if (health.status === "healthy") {
      return { ready: true }
    }

    return {
      ready: false,
      reason: `RuVector health check failed: status=${health.status} latency=${health.latencyMs}ms`,
    }
  } catch (error) {
    return {
      ready: false,
      reason: `RuVector health check error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
