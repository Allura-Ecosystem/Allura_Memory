/** Workspace-scoped graph-memory readers. */
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import { GetMemoryRequest, GetMemoryResponse, MemorySearchResult } from "./types"

type MemoryRow = {
  id: string; group_id: string; content: string; score: number; created_at: string;
  version: number; tags: string[]; provenance: string; user_id: string | null; deprecated: boolean;
}

function rowToMemorySearchResult(row: MemoryRow): MemorySearchResult {
  return {
    id: row.id, type: "Insight", topic_key: row.id, title: undefined, summary: undefined,
    content: row.content, confidence: row.score, group_id: row.group_id,
    status: row.deprecated ? "deprecated" : "active", created_at: row.created_at,
    updated_at: row.created_at, version: row.version, superseded_by: undefined,
    trace_ref: undefined, tags: row.tags || [], metadata: {},
  }
}

const COLUMNS = `m.id,m.group_id,m.content,m.score,m.created_at,m.version,m.tags,m.provenance,m.user_id,m.deprecated`;
const WORKSPACE_FILTER = `m.group_id=$2 AND m.workspace_id=$3 AND m.workspace_scope_state='workspace_scoped'`;

export async function getMemory(request: GetMemoryRequest): Promise<GetMemoryResponse | null> {
  const { topic_key, group_id, workspace_id, agent_id, version, include_history=false, include_evidence=false } = request;
  return withWorkspaceTransaction({ tenantId: group_id, workspaceId: workspace_id, principalId: agent_id }, async (db) => {
    const params: unknown[] = [topic_key, group_id, workspace_id];
    const versionFilter = version === undefined ? "" : ` AND m.version=$4`;
    if (version !== undefined) params.push(version);
    const result = await db.query<MemoryRow>(
      `SELECT ${COLUMNS} FROM graph_memories m
       WHERE m.id=$1 AND ${WORKSPACE_FILTER} AND m.deprecated=false ${versionFilter}
         AND NOT EXISTS(SELECT 1 FROM graph_supersedes s WHERE s.superseded_id=m.id)
       LIMIT 1`, params,
    );
    if (!result.rows[0]) return null;
    const response: GetMemoryResponse = { current: rowToMemorySearchResult(result.rows[0]) };
    if (include_history) {
      const history = await db.query<MemoryRow>(
        `SELECT ${COLUMNS} FROM graph_supersedes s JOIN graph_memories m ON s.superseded_id=m.id
         WHERE s.newer_id=$1 AND ${WORKSPACE_FILTER} ORDER BY m.version DESC LIMIT 10`,
        [topic_key, group_id, workspace_id],
      );
      response.history = history.rows.map((row) => ({ ...rowToMemorySearchResult(row), superseded_by: topic_key }));
    }
    if (include_evidence) response.evidence = [];
    return response;
  });
}

export async function getCurrentMemory(topic_key: string, group_id: string, workspace_id: string, agent_id: string): Promise<MemorySearchResult | null> {
  return (await getMemory({ topic_key, group_id, workspace_id, agent_id, include_history:false, include_evidence:false }))?.current ?? null;
}

export async function getMemoryHistory(topic_key: string, group_id: string, workspace_id: string, agent_id: string): Promise<MemorySearchResult[]> {
  return withWorkspaceTransaction({ tenantId: group_id, workspaceId: workspace_id, principalId: agent_id }, async (db) => {
    const result = await db.query<MemoryRow>(
      `SELECT ${COLUMNS} FROM graph_memories m WHERE m.id=$1 AND ${WORKSPACE_FILTER}
       ORDER BY m.version DESC LIMIT 20`, [topic_key, group_id, workspace_id],
    );
    return result.rows.map(rowToMemorySearchResult);
  });
}

export async function memoryExists(topic_key: string, group_id: string, workspace_id: string, agent_id: string): Promise<boolean> {
  return withWorkspaceTransaction({ tenantId: group_id, workspaceId: workspace_id, principalId: agent_id }, async (db) => {
    const result = await db.query(
      `SELECT EXISTS(SELECT 1 FROM graph_memories m WHERE m.id=$1 AND ${WORKSPACE_FILTER}) AS exists`,
      [topic_key, group_id, workspace_id],
    );
    return Boolean(result.rows[0]?.exists);
  });
}
