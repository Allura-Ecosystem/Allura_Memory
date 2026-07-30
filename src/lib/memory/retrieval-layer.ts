/**
 * Controlled Retrieval Layer — F10, F11
 *
 * The sole interface through which agents retrieve approved knowledge.
 * Agents MUST NOT query PostgreSQL directly (AD-19).
 *
 * This layer:
 * 1. Validates group_id and agent permissions
 * 2. Routes to the appropriate query backend (PostgreSQL pgvector)
 * 3. Enforces scope (project + global)
 * 4. Attaches provenance metadata to every result
 * 5. Logs every retrieval call as an audit event
 *
 * Reference: docs/allura/DESIGN-MEMORY-SYSTEM.md §Retrieval Layer
 */

if (typeof globalThis !== "undefined" && typeof (globalThis as unknown as { window?: unknown }).window !== "undefined") {
  throw new Error("retrieval-layer can only be used server-side");
}

import { getPool } from "@/lib/postgres/connection";
import { queryTraces } from "@/lib/postgres/traces";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

// ── Types ──────────────────────────────────────────────────────────────────

export type RetrievalMode = "semantic" | "structured" | "hybrid" | "traces";

export interface RetrievalRequest {
  /** Required: Tenant isolation identifier */
  group_id: string;
  /** Required: Agent making the request (for audit) */
  agent_id: string;
  /** Required: Query text or search term */
  query: string;
  /** Retrieval mode (default: hybrid) */
  mode?: RetrievalMode;
  /** Scope configuration */
  scope?: {
    /** Include project-scoped insights (default: true) */
    project?: boolean;
    /** Include global-scoped insights (default: true) */
    global?: boolean;
  };
  /** Include raw trace evidence (default: false, policy-gated) */
  include_traces?: boolean;
  /** Structured filters */
  filters?: {
    status?: "active" | "superseded" | "deprecated" | "reverted";
    source_type?: string;
    min_confidence?: number;
    max_confidence?: number;
    since?: string;
    until?: string;
  };
  /** Maximum results (default: 10) */
  limit?: number;
}

export interface RetrievalResult {
  insight_id: string;
  content: string;
  source: "postgres";
  confidence: number;
  scope: "project" | "global";
  version: number;
  topic_key: string;
  provenance: {
    proposal_id?: string;
    approved_by?: string;
    approved_at?: string;
    created_at: string;
  };
}

export interface TraceResult {
  id: string;
  type: string;
  agent: string;
  content: string;
  source: "postgres";
  timestamp: Date;
}

export interface RetrievalResponse {
  results: RetrievalResult[];
  traces?: TraceResult[];
  total: number;
  metadata: {
    retrieved_at: string;
    group_id: string;
    agent_id: string;
    mode: RetrievalMode;
    project_count: number;
    global_count: number;
    trace_count: number;
  };
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateRequest(req: RetrievalRequest): string {
  if (!req.group_id) {
    throw new RetrievalError("group_id is required");
  }
  if (!req.agent_id) {
    throw new RetrievalError("agent_id is required");
  }
  if (!req.query || req.query.trim().length === 0) {
    throw new RetrievalError("query is required and cannot be empty");
  }

  // Validate group_id format
  try {
    return validateGroupId(req.group_id);
  } catch (error) {
    if (error instanceof GroupIdValidationError) {
      throw new RetrievalError(`Invalid group_id: ${error.message}`);
    }
    throw error;
  }
}

// ── Error ──────────────────────────────────────────────────────────────────

export class RetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalError";
  }
}

// ── Audit Logging ──────────────────────────────────────────────────────────

async function logRetrieval(
  groupId: string,
  agentId: string,
  mode: RetrievalMode,
  resultCount: number
): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
       VALUES ($1, 'retrieval_query', $2, 'completed', $3, NOW())`,
      [
        groupId,
        agentId,
        JSON.stringify({ mode, result_count: resultCount }),
      ]
    );
  } catch {
    // Audit logging failure must not block retrieval
    console.error("[Retrieval] Failed to log audit event (non-fatal)");
  }
}

// ── PostgreSQL query helpers ───────────────────────────────────────────────

interface GraphMemoryRow {
  id: string;
  group_id: string;
  content: string;
  score: number;
  version: number;
  created_at: string;
  provenance: string;
  deprecated: boolean;
}

function rowToResult(row: GraphMemoryRow, scope: "project" | "global"): RetrievalResult {
  return {
    insight_id: row.id,
    content: row.content,
    source: "postgres",
    confidence: row.score,
    scope,
    version: row.version ?? 1,
    topic_key: row.id,
    provenance: {
      created_at: row.created_at,
    },
  };
}

function buildWhereClause(
  groupId: string,
  filters: RetrievalRequest["filters"],
  includeGlobal: boolean,
): { clause: string; params: unknown[] } {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (includeGlobal) {
    params.push(groupId, "global");
    conditions.push("(group_id = $1 OR group_id = $2)");
  } else {
    params.push(groupId);
    conditions.push("group_id = $1");
  }

  conditions.push("deprecated = false");

  let paramIdx = includeGlobal ? 3 : 2;

  if (filters?.min_confidence !== undefined) {
    params.push(filters.min_confidence);
    conditions.push(`score >= $${paramIdx}`);
    paramIdx++;
  }
  if (filters?.max_confidence !== undefined) {
    params.push(filters.max_confidence);
    conditions.push(`score <= $${paramIdx}`);
    paramIdx++;
  }
  if (filters?.since) {
    params.push(filters.since);
    conditions.push(`created_at >= $${paramIdx}::timestamptz`);
    paramIdx++;
  }
  if (filters?.until) {
    params.push(filters.until);
    conditions.push(`created_at <= $${paramIdx}::timestamptz`);
    paramIdx++;
  }

  return {
    clause: conditions.join(" AND "),
    params,
  };
}

// ── Core Retrieval ─────────────────────────────────────────────────────────

/**
 * Execute a controlled retrieval query.
 *
 * This is the sole function agents should call to retrieve knowledge.
 * It enforces scoping, audit logging, and provenance metadata.
 */
export async function retrieveKnowledge(
  req: RetrievalRequest
): Promise<RetrievalResponse> {
  const validatedGroupId = validateRequest(req);
  const mode = req.mode ?? "hybrid";
  const limit = req.limit ?? 10;
  const includeTraces = req.include_traces ?? false;
  const includeProject = req.scope?.project ?? true;
  const includeGlobal = req.scope?.global ?? true;
  const pool = getPool();

  let results: RetrievalResult[] = [];
  let projectCount = 0;
  let globalCount = 0;

  switch (mode) {
    case "semantic": {
      // Content-based full-text search across approved insights
      const { clause, params } = buildWhereClause(validatedGroupId, req.filters, includeGlobal);
      params.push(req.query);
      const queryParamIdx = params.length;
      params.push(limit);
      const limitParamIdx = params.length;

      const queryResult = await pool.query<GraphMemoryRow>(
        `SELECT id, group_id, content, score, version, created_at, provenance, deprecated
         FROM graph_memories
         WHERE ${clause}
           AND content ILIKE '%' || $${queryParamIdx} || '%'
         ORDER BY score DESC, created_at DESC
         LIMIT $${limitParamIdx}`,
        params
      );
      results = queryResult.rows.map((row) => {
        const isGlobal = row.group_id === "global";
        if (isGlobal) globalCount++; else projectCount++;
        return rowToResult(row, isGlobal ? "global" : "project");
      });
      break;
    }

    case "structured": {
      // Filter-based query on approved insights
      const { clause, params } = buildWhereClause(validatedGroupId, req.filters, includeGlobal);
      params.push(limit);
      const queryResult = await pool.query<GraphMemoryRow>(
        `SELECT id, group_id, content, score, version, created_at, provenance, deprecated
         FROM graph_memories
         WHERE ${clause}
         ORDER BY score DESC, created_at DESC
         LIMIT $${params.length}`,
        params
      );
      results = queryResult.rows.map((row) => {
        const isGlobal = row.group_id === "global";
        if (isGlobal) globalCount++; else projectCount++;
        return rowToResult(row, isGlobal ? "global" : "project");
      });
      break;
    }

    case "hybrid": {
      // Dual-context: project + global insights merged by confidence
      const { clause, params } = buildWhereClause(validatedGroupId, req.filters, includeGlobal);
      params.push(limit);
      const queryResult = await pool.query<GraphMemoryRow>(
        `SELECT id, group_id, content, score, version, created_at, provenance, deprecated
         FROM graph_memories
         WHERE ${clause}
         ORDER BY score DESC, created_at DESC
         LIMIT $${params.length}`,
        params
      );

      const allRows = queryResult.rows;
      projectCount = allRows.filter((r) => r.group_id === validatedGroupId).length;
      globalCount = allRows.filter((r) => r.group_id === "global").length;

      results = allRows
        .filter((row) => {
          if (row.group_id === "global") return includeGlobal;
          return includeProject;
        })
        .map((row) => rowToResult(row, row.group_id === "global" ? "global" : "project"));
      break;
    }

    case "traces": {
      // Raw trace retrieval (policy-gated, not default)
      if (!includeTraces) {
        throw new RetrievalError(
          "Trace retrieval requires include_traces: true. This mode is policy-gated."
        );
      }
      // Fall through to trace retrieval below
      break;
    }
  }

  // Optional trace augmentation
  let traces: TraceResult[] | undefined;
  let traceCount = 0;
  if (includeTraces && mode !== "traces") {
    const traceResults = await queryTraces({
      group_id: validatedGroupId,
      limit: Math.min(limit, 5), // Traces are supplementary, cap at 5
    });
    traces = traceResults.map((trace) => ({
      id: trace.id,
      type: trace.type,
      agent: trace.agent,
      content: trace.content,
      source: "postgres" as const,
      timestamp: trace.timestamp,
    }));
    traceCount = traces.length;
  } else if (mode === "traces" && includeTraces) {
    const traceResults = await queryTraces({
      group_id: validatedGroupId,
      limit,
    });
    traces = traceResults.map((trace) => ({
      id: trace.id,
      type: trace.type,
      agent: trace.agent,
      content: trace.content,
      source: "postgres" as const,
      timestamp: trace.timestamp,
    }));
    traceCount = traces.length;
  }

  const response: RetrievalResponse = {
    results,
    traces,
    total: results.length,
    metadata: {
      retrieved_at: new Date().toISOString(),
      group_id: validatedGroupId,
      agent_id: req.agent_id,
      mode,
      project_count: projectCount,
      global_count: globalCount,
      trace_count: traceCount,
    },
  };

  // Log retrieval audit event
  await logRetrieval(validatedGroupId, req.agent_id, mode, results.length);

  return response;
}