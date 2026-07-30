/**
 * Memory Get Functions
 *
 * Retrieve specific memories from PostgreSQL (pgvector) knowledge graph
 * with optional history and evidence linkage.
 */

import type { Pool } from "pg"
import { GetMemoryRequest, GetMemoryResponse, MemorySearchResult } from "./types"

// ── PG Pool singleton ─────────────────────────────────────────────────────

let getPgPool: Pool | null = null;

function getGetPgPool(): Pool {
  if (!getPgPool) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool: PgPool } = require("pg") as { Pool: new (config: Record<string, unknown>) => Pool };
    const password = process.env.POSTGRES_PASSWORD;
    if (!password) {
      throw new Error("POSTGRES_PASSWORD environment variable is required");
    }
    getPgPool = new PgPool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      database: process.env.POSTGRES_DB || "allura",
      user: process.env.POSTGRES_USER || "allura",
      password,
      connectionTimeoutMillis: 10000,
      max: 10,
    });
  }
  return getPgPool!;
}

function rowToMemorySearchResult(row: {
  id: string;
  group_id: string;
  content: string;
  score: number;
  created_at: string;
  version: number;
  tags: string[];
  provenance: string;
  user_id: string | null;
  deprecated: boolean;
}): MemorySearchResult {
  return {
    id: row.id,
    type: "Insight" as const,
    topic_key: row.id,
    title: undefined,
    summary: undefined,
    content: row.content,
    confidence: row.score,
    group_id: row.group_id,
    status: row.deprecated ? ("deprecated" as const) : ("active" as const),
    created_at: row.created_at,
    updated_at: row.created_at,
    version: row.version,
    superseded_by: undefined,
    trace_ref: undefined,
    tags: row.tags || [],
    metadata: {},
  };
}

/**
 * Get a specific memory by topic_key (maps to id in PostgreSQL).
 *
 * @param request - Get parameters
 * @returns Memory with optional history
 */
export async function getMemory(request: GetMemoryRequest): Promise<GetMemoryResponse | null> {
  const { topic_key, group_id, version, include_history = false, include_evidence = false } = request;
  const pool = getGetPgPool();

  let versionFilter = "";
  const params: unknown[] = [topic_key, group_id];
  if (version !== undefined) {
    versionFilter = " AND m.version = $3";
    params.push(version);
  }

  // Get current version (not superseded)
  const result = await pool.query(
    `SELECT m.id, m.group_id, m.content, m.score, m.created_at,
            m.version, m.tags, m.provenance, m.user_id, m.deprecated
     FROM graph_memories m
     WHERE m.id = $1
       AND (m.group_id = $2 OR m.group_id = 'global')
       AND m.deprecated = false
       ${versionFilter}
       AND NOT EXISTS (
         SELECT 1 FROM graph_supersedes s
         WHERE s.superseded_id = m.id
       )
     LIMIT 1`,
    params
  );

  if (result.rows.length === 0) {
    return null;
  }

  const mainResult = rowToMemorySearchResult(result.rows[0] as Record<string, unknown> & {
    id: string; group_id: string; content: string; score: number;
    created_at: string; version: number; tags: string[];
    provenance: string; user_id: string | null; deprecated: boolean;
  });

  const response: GetMemoryResponse = {
    current: mainResult,
  };

  // Get history if requested
  if (include_history) {
    const historyResult = await pool.query(
      `SELECT m.id, m.group_id, m.content, m.score, m.created_at,
              m.version, m.tags, m.provenance, m.user_id, m.deprecated
       FROM graph_supersedes s
       JOIN graph_memories m ON s.superseded_id = m.id
       WHERE s.newer_id = $1
         AND (m.group_id = $2 OR m.group_id = 'global')
       ORDER BY m.version DESC
       LIMIT 10`,
      [topic_key, group_id]
    );

    response.history = historyResult.rows.map((row) => {
      const r = rowToMemorySearchResult(row as Record<string, unknown> & {
        id: string; group_id: string; content: string; score: number;
        created_at: string; version: number; tags: string[];
        provenance: string; user_id: string | null; deprecated: boolean;
      });
      r.superseded_by = topic_key;
      return r;
    });
  }

  // Get evidence if requested (trace_ref not available in current schema)
  if (include_evidence) {
    response.evidence = [];
  }

  return response;
}

/**
 * Get current active version of a memory.
 *
 * @param topic_key - Memory identifier
 * @param group_id - Tenant/group identifier
 * @returns Current memory or null
 */
export async function getCurrentMemory(topic_key: string, group_id: string): Promise<MemorySearchResult | null> {
  const response = await getMemory({
    topic_key,
    group_id,
    include_history: false,
    include_evidence: false,
  });

  return response?.current || null;
}

/**
 * Get memory history (all versions).
 *
 * @param topic_key - Memory identifier
 * @param group_id - Tenant/group identifier
 * @returns Array of historical versions
 */
export async function getMemoryHistory(topic_key: string, group_id: string): Promise<MemorySearchResult[]> {
  const pool = getGetPgPool();

  const result = await pool.query(
    `SELECT m.id, m.group_id, m.content, m.score, m.created_at,
            m.version, m.tags, m.provenance, m.user_id, m.deprecated
     FROM graph_memories m
     WHERE m.id = $1
       AND (m.group_id = $2 OR m.group_id = 'global')
     ORDER BY m.version DESC
     LIMIT 20`,
    [topic_key, group_id]
  );

  return result.rows.map((row) =>
    rowToMemorySearchResult(row as Record<string, unknown> & {
      id: string; group_id: string; content: string; score: number;
      created_at: string; version: number; tags: string[];
      provenance: string; user_id: string | null; deprecated: boolean;
    })
  );
}

/**
 * Check if a topic_key exists.
 *
 * @param topic_key - Memory identifier
 * @param group_id - Tenant/group identifier
 * @returns True if memory exists
 */
export async function memoryExists(topic_key: string, group_id: string): Promise<boolean> {
  const pool = getGetPgPool();

  const result = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM graph_memories
       WHERE id = $1
         AND (group_id = $2 OR group_id = 'global')
     ) AS exists`,
    [topic_key, group_id]
  );

  return Boolean(result.rows[0]?.exists);
}