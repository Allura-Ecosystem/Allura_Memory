/**
 * Memory Search Functions
 *
 * Search and retrieve memories from the knowledge graph
 * with PostgreSQL trace evidence linkage.
 *
 * Uses IGraphAdapter (RuVector — PostgreSQL + pgvector) for all searches.
 */

import type { Pool } from "pg"
import { createGraphAdapter } from "@/lib/graph-adapter"
import type { IGraphAdapter } from "@/lib/graph-adapter"
import type { GroupId } from "@/lib/memory/canonical-contracts"
import { MemorySearchRequest, MemorySearchResponse, MemorySearchResult } from "./types"

// ── PG Pool singleton ─────────────────────────────────────────────────────

let searchPgPool: Pool | null = null;

function getSearchPgPool(): Pool {
  if (!searchPgPool) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool: PgPool } = require("pg") as { Pool: new (config: Record<string, unknown>) => Pool };
    const password = process.env.POSTGRES_PASSWORD;
    if (!password) {
      throw new Error("POSTGRES_PASSWORD environment variable is required");
    }
    searchPgPool = new PgPool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: parseInt(process.env.POSTGRES_PORT || "5432"),
      database: process.env.POSTGRES_DB || "allura",
      user: process.env.POSTGRES_USER || "allura",
      password,
      connectionTimeoutMillis: 10000,
      max: 10,
    });
  }
  return searchPgPool!;
}

let searchAdapterInstance: IGraphAdapter | null = null;

function getSearchAdapter(): IGraphAdapter {
  if (!searchAdapterInstance) {
    const pool = getSearchPgPool();
    searchAdapterInstance = createGraphAdapter({ pg: pool });
  }
  return searchAdapterInstance;
}

// ── Adapter-based search ──────────────────────────────────────────────────

async function searchMemoriesAdapter(request: MemorySearchRequest): Promise<MemorySearchResponse> {
  const startTime = Date.now();
  const { query, group_id, limit = 10 } = request;

  const adapter = getSearchAdapter();
  const results = await adapter.searchMemories({
    query,
    group_id: group_id as unknown as GroupId,
    limit,
  });

  const mapped: MemorySearchResult[] = results.map((r) => ({
    id: r.id,
    type: "Insight" as const,
    topic_key: r.id,
    title: undefined,
    summary: undefined,
    content: r.content,
    confidence: r.score,
    group_id,
    status: "active" as const,
    created_at: r.created_at,
    updated_at: r.created_at,
    version: 1,
    superseded_by: undefined,
    trace_ref: undefined,
    tags: r.tags,
    metadata: { relevance_score: r.relevance },
  }));

  const queryTimeMs = Date.now() - startTime;

  return {
    results: mapped,
    total: mapped.length,
    query_time_ms: queryTimeMs,
    group_id,
  };
}

async function getMemoriesByTypeAdapter(
  _type: string,
  group_id: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  const adapter = getSearchAdapter();
  const listResult = await adapter.listMemories({
    group_id: group_id as unknown as GroupId,
    user_id: null,
  });

  return listResult.memories.slice(0, limit).map((m) => ({
    id: m.id,
    type: "Insight" as const,
    topic_key: m.id,
    title: undefined,
    summary: undefined,
    content: m.content,
    confidence: m.score,
    group_id,
    status: m.deprecated ? ("deprecated" as const) : ("active" as const),
    created_at: m.created_at,
    updated_at: m.created_at,
    version: m.version,
    superseded_by: undefined,
    trace_ref: undefined,
    tags: m.tags,
  }));
}

async function searchAgentsAdapter(query: string, group_id: string): Promise<MemorySearchResult[]> {
  const pool = getSearchPgPool();
  const result = await pool.query(
    `SELECT node_id, props FROM graph_structural_nodes
     WHERE label = 'Agent'
       AND group_id = $1
       AND (props->>'name' ILIKE $2 OR props->>'capabilities' ILIKE $2)
     ORDER BY (props->>'confidence')::real DESC
     LIMIT 20`,
    [group_id, `%${query}%`]
  );

  return result.rows.map((row) => {
    const props = row.props as Record<string, unknown>;
    return {
      id: row.node_id,
      type: "Agent" as const,
      topic_key: row.node_id,
      title: (props.name as string) || undefined,
      summary: (props.description as string) || undefined,
      content: (props.definition as string) || "",
      confidence: (props.confidence as number) || 0.5,
      group_id,
      status: "active" as const,
      created_at: (props.created_at as string) || new Date().toISOString(),
      updated_at: (props.updated_at as string) || (props.created_at as string) || new Date().toISOString(),
      version: 1,
      superseded_by: undefined,
      trace_ref: undefined,
      tags: (props.tags as string[]) || [],
    };
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search for memories in the knowledge graph.
 *
 * @param request - Search parameters
 * @returns Search results with metadata
 */
export async function searchMemories(request: MemorySearchRequest): Promise<MemorySearchResponse> {
  return searchMemoriesAdapter(request);
}

/**
 * Get memories by type for a specific group.
 *
 * @param type - Memory node type
 * @param group_id - Tenant/group identifier
 * @param limit - Maximum results
 * @returns Matching memories
 */
export async function getMemoriesByType(
  type: string,
  group_id: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  return getMemoriesByTypeAdapter(type, group_id, limit);
}

/**
 * Search for agent definitions in the knowledge graph.
 *
 * @param query - Agent name or capability search
 * @param group_id - Tenant/group identifier
 * @returns Matching agent memories
 */
export async function searchAgents(query: string, group_id: string): Promise<MemorySearchResult[]> {
  return searchAgentsAdapter(query, group_id);
}