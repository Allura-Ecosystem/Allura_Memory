import "server-only"

import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import type { ResolvedWorkspaceScope } from "@/lib/db/workspace-scope"

/**
 * Server-owned dashboard read boundary.
 *
 * Every function is READ-ONLY and runs inside `withWorkspaceTransaction`, which
 * binds the restricted app role and sets the transaction-local
 * `app.current_group_id` / `app.current_workspace_id` / `app.current_principal`
 * GUCs that RLS enforces. No function here uses the owner pool, and no function
 * accepts a caller-supplied tenant/workspace beyond the server-derived scope.
 *
 * Each surface returns a discriminated state so a page can render a truthful
 * live, empty, degraded, or error state without fabricating data.
 */

export type DashboardState<T> =
  | { state: "live"; data: T; fetchedAt: string }
  | { state: "empty"; fetchedAt: string }
  | { state: "degraded"; message: string }
  | { state: "error"; message: string }

export interface OverviewData {
  memories: number
  events: number
  proposals: number
  workItems: number
  graphMemories: number
}

export interface WorkItemRow {
  id: string
  title: string
  status: string
  priority: string
  projectId: string
  updatedAt: string
}

export interface MemoryRow {
  id: string
  content: string
  memoryType: string
  createdAt: string
}

export interface TeamRow {
  agentId: string
  events: number
  lastSeen: string
}

export interface GraphData {
  memories: number
  superseded: number
  structuralNodes: number
  structuralEdges: number
}

function nowIso(): string {
  return new Date().toISOString()
}

async function runRead<T>(
  scope: ResolvedWorkspaceScope,
  read: (client: import("pg").PoolClient) => Promise<T>,
): Promise<DashboardState<T>> {
  try {
    const data = await withWorkspaceTransaction(scope, read)
    return { state: "live", data, fetchedAt: nowIso() }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard read failed"
    return { state: "degraded", message }
  }
}

/** Overview surface: tenant/workspace-scoped counts across the governed stores. */
export async function getOverview(scope: ResolvedWorkspaceScope): Promise<DashboardState<OverviewData>> {
  return runRead(scope, async (client) => {
    const result = await client.query<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM allura_memories
           WHERE group_id = $1 AND workspace_id = $2 AND deleted_at IS NULL) AS memories,
         (SELECT COUNT(*) FROM events
           WHERE group_id = $1 AND workspace_id = $2) AS events,
         (SELECT COUNT(*) FROM canonical_proposals
           WHERE group_id = $1) AS proposals,
         (SELECT COUNT(*) FROM work_items
           WHERE group_id = $1) AS work_items,
         (SELECT COUNT(*) FROM graph_memories
           WHERE group_id = $1 AND workspace_id = $2 AND deprecated = false) AS graph_memories`,
      [scope.tenantId, scope.workspaceId],
    )
    const row = result.rows[0] ?? {}
    return {
      memories: Number(row.memories ?? 0),
      events: Number(row.events ?? 0),
      proposals: Number(row.proposals ?? 0),
      workItems: Number(row.work_items ?? 0),
      graphMemories: Number(row.graph_memories ?? 0),
    }
  })
}

/** Work-board surface: tenant-scoped work items, newest first. */
export async function getWorkItems(scope: ResolvedWorkspaceScope): Promise<DashboardState<WorkItemRow[]>> {
  return runRead(scope, async (client) => {
    const result = await client.query<WorkItemRow>(
      `SELECT id, title, status, priority, project_id AS "projectId", updated_at AS "updatedAt"
         FROM work_items
        WHERE group_id = $1
        ORDER BY updated_at DESC, id
        LIMIT 200`,
      [scope.tenantId],
    )
    return result.rows
  })
}

/** Search surface: recent tenant/workspace-scoped memories. */
export async function getRecentMemories(scope: ResolvedWorkspaceScope): Promise<DashboardState<MemoryRow[]>> {
  return runRead(scope, async (client) => {
    const result = await client.query<MemoryRow>(
      `SELECT id::text AS id, content, memory_type AS "memoryType", created_at AS "createdAt"
         FROM allura_memories
        WHERE group_id = $1 AND workspace_id = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC, id
        LIMIT 50`,
      [scope.tenantId, scope.workspaceId],
    )
    return result.rows
  })
}

/** Teams surface: agent activity derived from the append-only event ledger. */
export async function getTeams(scope: ResolvedWorkspaceScope): Promise<DashboardState<TeamRow[]>> {
  return runRead(scope, async (client) => {
    const result = await client.query<TeamRow>(
      `SELECT agent_id AS "agentId", COUNT(*)::int AS events, MAX(created_at) AS "lastSeen"
         FROM events
        WHERE group_id = $1 AND workspace_id = $2
        GROUP BY agent_id
        ORDER BY events DESC, "lastSeen" DESC
        LIMIT 200`,
      [scope.tenantId, scope.workspaceId],
    )
    return result.rows
  })
}

/** Graph surface: versioned knowledge-graph counts (RuVector backend). */
export async function getGraphStats(scope: ResolvedWorkspaceScope): Promise<DashboardState<GraphData>> {
  return runRead(scope, async (client) => {
    const result = await client.query<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM graph_memories
           WHERE group_id = $1 AND workspace_id = $2 AND deprecated = false) AS memories,
         (SELECT COUNT(*) FROM graph_supersedes
           WHERE group_id = $1 AND workspace_id = $2) AS superseded,
         (SELECT COUNT(*) FROM graph_structural_nodes
           WHERE group_id = $1 AND workspace_id = $2) AS structural_nodes,
         (SELECT COUNT(*) FROM graph_structural_edges
           WHERE group_id = $1 AND workspace_id = $2) AS structural_edges`,
      [scope.tenantId, scope.workspaceId],
    )
    const row = result.rows[0] ?? {}
    return {
      memories: Number(row.memories ?? 0),
      superseded: Number(row.superseded ?? 0),
      structuralNodes: Number(row.structural_nodes ?? 0),
      structuralEdges: Number(row.structural_edges ?? 0),
    }
  })
}

/**
 * Derive a server-owned workspace scope from a server-issued principal.
 * The workspace must already be present on the principal; a missing workspace
 * is a caller error and throws rather than silently widening scope.
 */
export function resolveDashboardScope(user: {
  id: string
  groupId: string
  workspaceId?: string
}): ResolvedWorkspaceScope {
  if (!user.workspaceId) {
    throw new Error("dashboard scope requires a server-issued workspaceId")
  }
  return { tenantId: user.groupId, workspaceId: user.workspaceId, principalId: user.id }
}

/** Convert a live-but-empty read into an explicit empty state. */
export function emptyWhen<T>(
  state: DashboardState<T>,
  isEmpty: (data: T) => boolean,
): DashboardState<T> {
  if (state.state === "live" && isEmpty(state.data)) {
    return { state: "empty", fetchedAt: state.fetchedAt }
  }
  return state
}
