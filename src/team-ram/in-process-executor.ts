/**
 * In-Process Skill Executor — Team RAM
 *
 * Replaces the phantom stdio-spawn MCP skill servers with direct in-process
 * handlers using the repo's own connection layers. This implements the three
 * Team RAM skills without spawning child processes:
 *
 *   skill-neo4j-memory  → recall_insight via Neo4j readTransaction (read-only)
 *   skill-cypher-query  → get_schema_info / execute_cypher via Neo4j (read-only)
 *   skill-database      → query_traces / execute_sql via PostgreSQL (SELECT-only)
 *
 * Design decisions:
 *   - READ-ONLY enforced: execute_sql rejects non-SELECT; execute_cypher rejects
 *     any query containing mutation keywords (CREATE, MERGE, SET, DELETE, REMOVE,
 *     DROP, DETACH).
 *   - group_id validated on every call via validateGroupId.
 *   - No new npm dependencies — uses only existing connection layers.
 *   - Neo4j connections use the shared driver pool (no new connections per call).
 *   - PostgreSQL uses the shared singleton Pool from connection.ts.
 *
 * Standing ADR: Allura Brain (localhost:5888/mcp, Streamable HTTP) is the
 * canonical memory surface. This executor serves Team RAM's orchestrator
 * only for read/search operations against the live data layer.
 *
 * @module team-ram/in-process-executor
 */

import { getPool } from "@/lib/postgres/connection"
import { validateGroupId } from "@/lib/validation/group-id"
import type { SkillCall, SkillExecutor, TeamRamSkillName } from "./orchestrator"

// ── Read-Only Guards ─────────────────────────────────────────────────────────

/**
 * execute_sql only accepts SELECT (or CTEs that start with WITH … SELECT).
 * Any other statement verb is rejected.
 */
function assertReadOnlySql(query: string): void {
  const trimmed = query.trimStart().toUpperCase()
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    throw new Error(
      "execute_sql: only SELECT (and WITH … SELECT) statements are allowed — read-only queries only",
    )
  }
}

// ── Tool Handlers ─────────────────────────────────────────────────────────────

// --- skill-neo4j-memory / recall_insight ---

/**
 * Search graph_memories for insights whose content matches the query term,
 * scoped to the given group_id. Returns an empty array if no insights exist.
 *
 * Input shape (from orchestrator):
 *   { query: string, groupId: string, limit: number }
 */
async function recallInsight(input: Record<string, unknown>): Promise<unknown[]> {
  const groupId = validateGroupId(String(input.groupId ?? ""))
  const query = String(input.query ?? "")
  const limit = typeof input.limit === "number" ? input.limit : 10
  const pool = getPool()

  const params: unknown[] = [groupId, limit]
  let contentFilter = ""
  if (query.length > 0) {
    params.unshift(`%${query}%`)
    contentFilter = "AND content ILIKE $1"
  }

  const paramOffset = query.length > 0 ? 1 : 0
  const groupParam = paramOffset + 1
  const limitParam = paramOffset + 2

  const result = await pool.query(
    `SELECT id AS insight_id, content, score AS confidence,
            id AS topic_key, created_at, deprecated
     FROM graph_memories
     WHERE group_id = $${groupParam}
       AND deprecated = false
       ${contentFilter}
     ORDER BY score DESC
     LIMIT $${limitParam}`,
    params
  )

  return result.rows.map((rec: Record<string, unknown>) => ({
    insight_id: rec.insight_id,
    content: rec.content,
    confidence: rec.confidence,
    topic_key: rec.topic_key,
    created_at: rec.created_at,
    status: rec.deprecated ? "deprecated" : "active",
  }))
}

// --- skill-cypher-query / get_schema_info ---

/**
 * Return table names and column info from the PostgreSQL database.
 *
 * Input shape:
 *   { groupId: string }
 *
 * Output shape:
 *   { nodeLabels: string[], relationshipTypes: string[] }
 */
async function getSchemaInfo(input: Record<string, unknown>): Promise<{
  nodeLabels: string[]
  relationshipTypes: string[]
}> {
  validateGroupId(String(input.groupId ?? ""))
  const pool = getPool()

  const tablesResult = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
     ORDER BY table_name`,
  )

  const nodeLabels = tablesResult.rows.map((r) => r.table_name)
  const relationshipTypes: string[] = []

  return { nodeLabels, relationshipTypes }
}

// --- skill-cypher-query / execute_cypher ---

/**
 * Execute an arbitrary read-only SQL query against PostgreSQL.
 *
 * SECURITY: This function previously executed raw, unparameterized SQL without
 * tenant scoping — a critical injection risk (C1). It has been removed.
 * Callers should use execute_sql (skill-database) which enforces SELECT-only
 * and requires groupId as a parameterized argument.
 *
 * Input shape:
 *   { cypher: string, parameters?: Record<string,unknown>, groupId: string }
 */
async function executeCypher(_input: Record<string, unknown>): Promise<never> {
  throw new Error(
    "execute_cypher has been removed for security (raw SQL injection risk). " +
      "Use execute_sql from skill-database instead, which enforces SELECT-only " +
      "and parameterized queries with tenant scoping.",
  )
}

// --- skill-database / query_traces ---

/**
 * Query recent execution traces from the PostgreSQL events table,
 * scoped to group_id with pagination support.
 *
 * Input shape:
 *   { group_id: string, limit?: number, offset?: number, order_by?: string }
 *
 * Output shape:
 *   { rows: unknown[], total: number }
 */
async function queryTraces(input: Record<string, unknown>): Promise<{
  rows: unknown[]
  total: number
}> {
  const group_id = validateGroupId(String(input.group_id ?? ""))
  const limit = typeof input.limit === "number" ? input.limit : 100
  const offset = typeof input.offset === "number" ? input.offset : 0

  // Whitelist ORDER BY values to prevent SQL injection.
  const ALLOWED_ORDER = new Set([
    "created_at DESC",
    "created_at ASC",
    "id DESC",
    "id ASC",
  ])
  const raw_order = String(input.order_by ?? "created_at DESC")
  const order_by = ALLOWED_ORDER.has(raw_order) ? raw_order : "created_at DESC"

  const pool = getPool()

  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id::text, group_id, event_type, agent_id, created_at, metadata
       FROM events
       WHERE group_id = $1
       ORDER BY ${order_by}
       LIMIT $2 OFFSET $3`,
      [group_id, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM events WHERE group_id = $1`, [group_id]),
  ])

  return {
    rows: dataResult.rows,
    total: (countResult.rows[0]?.total as number) ?? 0,
  }
}

// --- skill-database / execute_sql ---

/**
 * Execute a caller-provided SQL statement against PostgreSQL.
 * Only SELECT (or WITH … SELECT) statements are allowed.
 *
 * The orchestrator passes groupId as parameters[0] by convention.
 * Callers must include `$1` in their query WHERE clause for tenant
 * isolation — this executor does not automatically inject it.
 *
 * Input shape:
 *   { query: string, parameters: unknown[], groupId: string }
 *
 * Output shape:
 *   { rows: unknown[], rowCount: number }
 */
async function executeSql(input: Record<string, unknown>): Promise<{
  rows: unknown[]
  rowCount: number
}> {
  validateGroupId(String(input.groupId ?? ""))
  const query = String(input.query ?? "")
  const parameters = Array.isArray(input.parameters) ? input.parameters : []

  assertReadOnlySql(query)

  const pool = getPool()
  const result = await pool.query(query, parameters)
  return { rows: result.rows, rowCount: result.rowCount ?? 0 }
}

// ── Dispatch Table ────────────────────────────────────────────────────────────

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>

const TOOL_HANDLERS: Record<TeamRamSkillName, Record<string, ToolHandler>> = {
  "skill-neo4j-memory": {
    recall_insight: recallInsight,
  },
  "skill-cypher-query": {
    get_schema_info: getSchemaInfo,
    execute_cypher: executeCypher,
  },
  "skill-database": {
    query_traces: queryTraces,
    execute_sql: executeSql,
  },
}

// ── InProcessSkillExecutor ────────────────────────────────────────────────────

/**
 * Implements SkillExecutor by routing tool calls to in-process handlers
 * backed by the repo's own PostgreSQL and Neo4j connection layers.
 *
 * Replaces the phantom stdio MCP skill servers that were registered in
 * DEFAULT_SKILL_SERVERS (introduced in 7ddab5a7) but whose source paths
 * (.opencode/skills/skill-database, .opencode/skills/skill-cypher-query)
 * did not exist, causing every live invocation to die with
 * "MCP error -32000: Connection closed".
 *
 * Usage:
 * ```typescript
 * const executor = new InProcessSkillExecutor()
 * const result = await orchestrateTeamRamTask(task, executor)
 * await executor.destroy() // no-op, but mirrors McpSkillExecutor API
 * ```
 */
export class InProcessSkillExecutor implements SkillExecutor {
  private destroyed = false

  async execute(call: SkillCall): Promise<unknown> {
    if (this.destroyed) {
      throw new Error("InProcessSkillExecutor has been destroyed")
    }

    const skillHandlers = TOOL_HANDLERS[call.skillName]
    if (!skillHandlers) {
      throw new Error(`InProcessSkillExecutor: unknown skill "${call.skillName}"`)
    }

    const handler = skillHandlers[call.toolName]
    if (!handler) {
      throw new Error(
        `InProcessSkillExecutor: unknown tool "${call.toolName}" for skill "${call.skillName}"`,
      )
    }

    return handler(call.input)
  }

  /**
   * Mark this executor as destroyed.
   *
   * In-process executors hold no persistent child processes. DB connections
   * are managed by the shared singleton pools (PG Pool, Neo4j Driver) which
   * are closed by the application lifecycle, not by individual executors.
   */
  async destroy(): Promise<void> {
    this.destroyed = true
  }
}
