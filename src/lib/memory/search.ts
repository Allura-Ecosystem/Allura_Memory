/**
 * Memory Search Functions
 *
 * Search and retrieve memories from the knowledge graph
 * with PostgreSQL trace evidence linkage.
 *
 * Uses IGraphAdapter (RuVector — PostgreSQL + pgvector) for all searches.
 */

import { MemorySearchRequest, MemorySearchResponse, MemorySearchResult } from "./types"
import { retrieveKnowledge } from "./retrieval-layer"
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"


// ── Adapter-based search ──────────────────────────────────────────────────

async function searchMemoriesAdapter(request: MemorySearchRequest): Promise<MemorySearchResponse> {
  const startTime = Date.now();
  const { query, group_id, workspace_id, agent_id, limit = 10 } = request;
  const controlled = await retrieveKnowledge({group_id,workspace_id,agent_id,query,limit,mode:"semantic"});
  const results = controlled.results;

  const mapped: MemorySearchResult[] = results.map((r) => ({
    id: r.insight_id,
    type: "Insight" as const,
    topic_key: r.insight_id,
    title: undefined,
    summary: undefined,
    content: r.content,
    confidence: r.confidence,
    group_id,
    status: "active" as const,
    created_at: r.provenance.created_at,
    updated_at: r.provenance.created_at,
    version: r.version,
    superseded_by: undefined,
    trace_ref: undefined,
    tags: [],
    metadata: {},
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
  workspace_id: string,
  agent_id: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  const listResult = await retrieveKnowledge({group_id,workspace_id,agent_id,query:"*",limit,mode:"structured"});
  return listResult.results.map((m) => ({
    id: m.insight_id,
    type: "Insight" as const,
    topic_key: m.insight_id,
    title: undefined,
    summary: undefined,
    content: m.content,
    confidence: m.confidence,
    group_id,
    status: "active" as const,
    created_at: m.provenance.created_at,
    updated_at: m.provenance.created_at,
    version: m.version,
    superseded_by: undefined,
    trace_ref: undefined,
    tags: [],
  }));
}

async function searchAgentsAdapter(query: string, group_id: string, workspace_id: string, agent_id: string): Promise<MemorySearchResult[]> {
  const result = await withWorkspaceTransaction({ tenantId: group_id, workspaceId: workspace_id, principalId: agent_id }, (pool) => pool.query(
    `SELECT node_id, props FROM graph_structural_nodes
     WHERE label = 'Agent'
       AND group_id = $1
       AND workspace_id = $2
       AND workspace_scope_state='workspace_scoped'
       AND (props->>'name' ILIKE $3 OR props->>'capabilities' ILIKE $3)
     ORDER BY (props->>'confidence')::real DESC
     LIMIT 20`,
    [group_id, workspace_id, `%${query}%`]
  ));

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
  workspace_id: string,
  agent_id: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  return getMemoriesByTypeAdapter(type, group_id, workspace_id, agent_id, limit);
}

/**
 * Search for agent definitions in the knowledge graph.
 *
 * @param query - Agent name or capability search
 * @param group_id - Tenant/group identifier
 * @returns Matching agent memories
 */
export async function searchAgents(query: string, group_id: string, workspace_id: string, agent_id: string): Promise<MemorySearchResult[]> {
  if (!workspace_id || !agent_id) throw new Error("verified workspace scope is required for agent search");
  return searchAgentsAdapter(query, group_id, workspace_id, agent_id);
}