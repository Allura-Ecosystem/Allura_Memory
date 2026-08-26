/**
 * RuVector Graph Adapter — PostgreSQL Implementation (Slice C)
 *
 * Replaces Neo4j with PostgreSQL tables for graph-layer operations.
 * Uses two tables:
 *   1. graph_memories — stores Memory nodes (equivalent to Neo4j Memory label)
 *   2. graph_supersedes — adjacency table for SUPERSEDES relationships
 *
 * Why this works:
 * - Neo4j uses SUPERSEDES as a singly-linked list (no multi-hop traversals)
 * - All queries are single-node lookups or full-text search
 * - No path queries, no shortestPath, no relationship diversity
 * - This is table work — PG with tsvector FTS replaces Neo4j fulltext index
 *
 * Feature flag GRAPH_BACKEND=ruvector selects this adapter.
 * After Slice E, this becomes the only adapter and the flag is removed.
 *
 * ADR: AD-029 — Graph Adapter Pattern for Neo4j → RuVector Migration
 */

import type { Pool } from "pg"
import type { ConfidenceScore, GroupId, MemoryId, MemoryProvenance } from "@/lib/memory/canonical-contracts"
import type {
  CanonicalCheckResult,
  CountResult,
  DuplicateCheckResult,
  GraphDeleteResult,
  GraphExportResult,
  GraphGetResult,
  GraphListResult,
  GraphMemoryNode,
  GraphRestoreResult,
  GraphSearchResult,
  GraphSupersedesResult,
  IGraphAdapter,
  VersionLookupResult,
} from "./types"
import { GraphAdapterError } from "./types"
import { withTenantTransaction, withWorkspaceTransaction } from "@/lib/db/tenant-transaction"

// ── Row Types ────────────────────────────────────────────────────────────────

interface GraphMemoryRow {
  id: string
  group_id: string
  user_id: string | null
  content: string
  score: number
  provenance: string
  created_at: Date | string
  version: number
  tags: string[] | null
  deprecated: boolean
  deleted_at: Date | string | null
  restored_at: Date | string | null
}

function rowToNode(row: GraphMemoryRow): GraphMemoryNode {
  return {
    id: row.id as MemoryId,
    group_id: row.group_id as GroupId,
    user_id: row.user_id,
    content: row.content,
    score: row.score as ConfidenceScore,
    provenance: (row.provenance === "manual" ? "manual" : "conversation") as MemoryProvenance,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    version: row.version,
    tags: Array.isArray(row.tags) ? row.tags : [],
    deprecated: row.deprecated,
    deleted_at: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at ? String(row.deleted_at) : null,
    restored_at: row.restored_at instanceof Date ? row.restored_at.toISOString() : row.restored_at ? String(row.restored_at) : null,
  }
}

function requireWorkspaceScope(params: { workspace_id: string; principal_id: string }) {
  const workspaceId = String(params.workspace_id ?? "").trim()
  const principalId = String(params.principal_id ?? "").trim()
  if (!workspaceId || !principalId) throw new Error("verified workspace_id and principal_id are required")
  return { workspaceId, principalId }
}

function retiredTenantOnlyLifecycle(operation: string): void {
  throw new GraphAdapterError(
    "ruvector-graph",
    operation,
    "tenant-only graph lifecycle operation is retired; use a workspace-scoped service",
  )
}

// ── RuVectorGraphAdapter ─────────────────────────────────────────────────────

export class RuVectorGraphAdapter implements IGraphAdapter {
  private pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
  }

  // ── Write Operations ───────────────────────────────────────────────────

  async createMemory(params: {
    id: MemoryId
    group_id: GroupId
    workspace_id: string
    principal_id: string
    user_id: string | null
    content: string
    score: ConfidenceScore
    provenance: MemoryProvenance
    created_at: string
  }): Promise<MemoryId> {
    try {
      const scope = requireWorkspaceScope(params)
      await withWorkspaceTransaction(
        { tenantId: params.group_id, ...scope },
        (db) => db.query(
          `INSERT INTO graph_memories
             (id, group_id, workspace_id, workspace_scope_state, user_id, content, score, provenance, created_at, deprecated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10)`,
          [params.id, params.group_id, scope.workspaceId, "workspace_scoped", params.user_id, params.content, params.score, params.provenance, params.created_at, false],
        ),
      )
      return params.id
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "createMemory", "Failed to create memory node", error instanceof Error ? error : undefined)
    }
  }

  async checkDuplicate(params: {
    group_id: GroupId
    user_id: string | null
    content: string
  }): Promise<DuplicateCheckResult> {
    retiredTenantOnlyLifecycle("checkDuplicate")
    try {
      // Check for non-superseded, non-deprecated exact match
      const result = await this.pool.query<{ id: string }>(
        `SELECT m.id
         FROM graph_memories m
         WHERE m.group_id = $1
           AND ($2::text IS NULL OR m.user_id = $2)
           AND m.content = $3
           AND m.deprecated = false
           AND NOT EXISTS (
             SELECT 1 FROM graph_supersedes s
             WHERE s.superseded_id = m.id
           )
         LIMIT 1`,
        [params.group_id, params.user_id ?? null, params.content]
      )
      if (result.rows.length > 0) {
        return { existingId: result.rows[0].id as MemoryId }
      }
      return { existingId: null }
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "checkDuplicate", "Duplicate check failed", error instanceof Error ? error : undefined)
    }
  }

  async supersedesMemory(params: {
    prev_id: MemoryId
    new_id: MemoryId
    group_id: GroupId
    workspace_id: string
    principal_id: string
    user_id: string | null
    content: string
    version: number
    created_at: string
  }): Promise<GraphSupersedesResult> {
    try {
      const scope = requireWorkspaceScope(params)
      return await withWorkspaceTransaction(
        { tenantId: params.group_id, ...scope },
        async (db) => {
          const prevResult = await db.query<{ score: number; provenance: string }>(
            `SELECT score, provenance FROM graph_memories
             WHERE id = $1 AND group_id = $2 AND workspace_id = $3
               AND workspace_scope_state = $4
             FOR UPDATE`,
            [params.prev_id, params.group_id, scope.workspaceId, "workspace_scoped"],
          )
          const previous = prevResult.rows[0]
          if (!previous) return { newId: params.new_id, newVersion: params.version, success: false }

          await db.query(
            `INSERT INTO graph_memories
               (id, group_id, workspace_id, workspace_scope_state, user_id, content, score, provenance, version, created_at, deprecated)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11)`,
            [params.new_id, params.group_id, scope.workspaceId, "workspace_scoped", params.user_id, params.content, previous.score, previous.provenance, params.version, params.created_at, false],
          )
          await db.query(
            `INSERT INTO graph_supersedes
               (newer_id, superseded_id, group_id, workspace_id, workspace_scope_state, created_at)
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
            [params.new_id, params.prev_id, params.group_id, scope.workspaceId, "workspace_scoped", params.created_at],
          )
          await db.query(
            `UPDATE graph_memories SET deprecated = true
             WHERE id = $1 AND group_id = $2 AND workspace_id = $3
               AND workspace_scope_state = $4`,
            [params.prev_id, params.group_id, scope.workspaceId, "workspace_scoped"],
          )
          return { newId: params.new_id, newVersion: params.version, success: true }
        },
      )
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "supersedesMemory", "SUPERSEDES operation failed", error instanceof Error ? error : undefined)
    }
  }

  async softDeleteMemory(params: {
    id: MemoryId
    group_id: GroupId
    deleted_at: string
  }): Promise<GraphDeleteResult> {
    retiredTenantOnlyLifecycle("softDeleteMemory")
    try {
      const result = await this.pool.query(
        `UPDATE graph_memories
         SET deprecated = true, deleted_at = $1::timestamptz
         WHERE id = $2 AND group_id = $3`,
        [params.deleted_at, params.id, params.group_id]
      )
      return { deleted: (result.rowCount ?? 0) > 0 }
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "softDeleteMemory", "Soft-delete failed", error instanceof Error ? error : undefined)
    }
  }

  async restoreMemory(params: {
    id: MemoryId
    group_id: GroupId
    restored_at: string
  }): Promise<GraphRestoreResult> {
    retiredTenantOnlyLifecycle("restoreMemory")
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")

      // Remove deprecated flag and set restored_at
      await client.query(
        `UPDATE graph_memories
         SET deprecated = false, deleted_at = NULL, restored_at = $1::timestamptz
         WHERE id = $2 AND group_id = $3`,
        [params.restored_at, params.id, params.group_id]
      )

      // Remove incoming SUPERSEDES relationships (equivalent to DELETE r in Neo4j)
      await client.query(
        `DELETE FROM graph_supersedes
         WHERE superseded_id = $1 AND group_id = $2`,
        [params.id, params.group_id]
      )

      await client.query("COMMIT")
      return { restored: true }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw new GraphAdapterError("ruvector-graph", "restoreMemory", "Restore failed", error instanceof Error ? error : undefined)
    } finally {
      client.release()
    }
  }

  // ── Read Operations ─────────────────────────────────────────────────────

  async getMemory(params: { id: MemoryId; group_id: GroupId; workspace_id: string; principal_id: string }): Promise<GraphGetResult> {
    try {
      const scope = requireWorkspaceScope(params)
      const result = await withTenantTransaction(
        { tenantId: params.group_id, ...scope },
        (db) => db.query<GraphMemoryRow>(
          `SELECT m.id, m.group_id, m.user_id, m.content, m.score, m.provenance,
                  m.created_at, m.version, m.tags, m.deprecated, m.deleted_at, m.restored_at
           FROM graph_memories m
           WHERE m.id=$1 AND m.group_id=$2 AND m.workspace_id=$3
             AND m.workspace_scope_state='workspace_scoped' AND m.deprecated=false
             AND NOT EXISTS (
               SELECT 1 FROM graph_supersedes s
               WHERE s.superseded_id=m.id AND s.group_id=m.group_id
                 AND s.workspace_id=m.workspace_id AND s.workspace_scope_state='workspace_scoped'
             )`,
          [params.id, params.group_id, scope.workspaceId],
        ),
        this.pool,
      )
      return { node: result.rows[0] ? rowToNode(result.rows[0]) : null }
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "getMemory", "Get memory failed", error instanceof Error ? error : undefined)
    }
  }

  async searchMemories(params: {
    query: string
    group_id: GroupId
    workspace_id: string
    principal_id: string
    limit: number
  }): Promise<GraphSearchResult[]> {
    try {
      const scope = requireWorkspaceScope(params)
      const result = await withTenantTransaction(
        { tenantId: params.group_id, ...scope },
        (db) => db.query<{
          id: string; content: string; score: number; provenance: string; created_at: Date | string;
          tags: string[] | null; relevance: number
        }>(
          `SELECT m.id,m.content,m.score,m.provenance,m.created_at,m.tags,
                  ts_rank(m.content_tsv,plainto_tsquery('english',$1)) AS relevance
           FROM graph_memories m
           WHERE m.group_id=$2 AND m.workspace_id=$3 AND m.workspace_scope_state='workspace_scoped'
             AND m.deprecated=false
             AND NOT EXISTS (
               SELECT 1 FROM graph_supersedes s
               WHERE s.superseded_id=m.id AND s.group_id=m.group_id
                 AND s.workspace_id=m.workspace_id AND s.workspace_scope_state='workspace_scoped'
             )
             AND m.content_tsv @@ plainto_tsquery('english',$1)
           ORDER BY relevance DESC,m.score DESC LIMIT $4`,
          [params.query, params.group_id, scope.workspaceId, params.limit],
        ),
        this.pool,
      )
      return result.rows.map((row) => ({
        id: row.id as MemoryId, content: row.content, score: row.score as ConfidenceScore,
        provenance: (row.provenance === "manual" ? "manual" : "conversation") as MemoryProvenance,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        usage_count: 0, tags: Array.isArray(row.tags) ? row.tags : [], relevance: row.relevance,
      }))
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "searchMemories", "Full-text search failed", error instanceof Error ? error : undefined)
    }
  }

  async listMemories(params: {
    group_id: GroupId
    workspace_id: string
    principal_id: string
    user_id: string | null
  }): Promise<GraphListResult> {
    try {
      const scope = requireWorkspaceScope(params)
      return await withTenantTransaction(
        { tenantId: params.group_id, ...scope },
        async (db) => {
          const values = [params.group_id, scope.workspaceId, params.user_id ?? null]
          const canonical = `m.group_id=$1 AND m.workspace_id=$2 AND m.workspace_scope_state='workspace_scoped'
            AND ($3::text IS NULL OR m.user_id=$3) AND m.deprecated=false
            AND NOT EXISTS (SELECT 1 FROM graph_supersedes s
              WHERE s.superseded_id=m.id AND s.group_id=m.group_id
                AND s.workspace_id=m.workspace_id AND s.workspace_scope_state='workspace_scoped')`
          const countResult = await db.query<{ total: string }>(`SELECT COUNT(*) AS total FROM graph_memories m WHERE ${canonical}`, values)
          const result = await db.query<GraphMemoryRow>(
            `SELECT m.id,m.group_id,m.user_id,m.content,m.score,m.provenance,m.created_at,m.version,
                    m.tags,m.deprecated,m.deleted_at,m.restored_at
             FROM graph_memories m WHERE ${canonical} ORDER BY m.created_at DESC`, values,
          )
          return { memories: result.rows.map(rowToNode), total: parseInt(countResult.rows[0]?.total ?? "0", 10) }
        },
        this.pool,
      )
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "listMemories", "List memories failed", error instanceof Error ? error : undefined)
    }
  }

  async countMemories(params: {
    group_id: GroupId
    user_id: string | null
  }): Promise<CountResult> {
    retiredTenantOnlyLifecycle("countMemories")
    try {
      const result = await this.pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM graph_memories m
         WHERE m.group_id = $1
           AND ($2::text IS NULL OR m.user_id = $2)
           AND m.deprecated = false
           AND NOT EXISTS (
             SELECT 1 FROM graph_supersedes s
             WHERE s.superseded_id = m.id
           )`,
        [params.group_id, params.user_id ?? null]
      )
      return { total: parseInt(result.rows[0]?.total ?? "0", 10) }
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "countMemories", "Count failed", error instanceof Error ? error : undefined)
    }
  }

  async checkCanonical(params: { id: MemoryId; group_id: GroupId }): Promise<CanonicalCheckResult> {
    retiredTenantOnlyLifecycle("checkCanonical")
    try {
      const result = await this.pool.query<{ id: string }>(
        `SELECT m.id
         FROM graph_memories m
         WHERE m.id = $1
           AND m.group_id = $2
           AND m.deprecated = false
           AND NOT EXISTS (
             SELECT 1 FROM graph_supersedes s
             WHERE s.superseded_id = m.id
           )
         LIMIT 1`,
        [params.id, params.group_id]
      )
      return { isCanonical: result.rows.length > 0 }
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "checkCanonical", "Canonical check failed", error instanceof Error ? error : undefined)
    }
  }

  async getVersion(params: { id: MemoryId; group_id: GroupId }): Promise<VersionLookupResult> {
    retiredTenantOnlyLifecycle("getVersion")
    try {
      const result = await this.pool.query<{ version: number }>(
        `SELECT m.version
         FROM graph_memories m
         WHERE m.id = $1
           AND m.group_id = $2
           AND m.deprecated = false
           AND NOT EXISTS (
             SELECT 1 FROM graph_supersedes s
             WHERE s.superseded_id = m.id
           )`,
        [params.id, params.group_id]
      )
      if (result.rows.length === 0) {
        return { version: null, exists: false }
      }
      return { version: result.rows[0].version, exists: true }
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "getVersion", "Version lookup failed", error instanceof Error ? error : undefined)
    }
  }

  async exportMemories(params: {
    group_id: GroupId
    user_id: string | null
    offset: number
    limit: number
  }): Promise<GraphExportResult> {
    retiredTenantOnlyLifecycle("exportMemories")
    try {
      const result = await this.pool.query<GraphMemoryRow>(
        `SELECT id, group_id, user_id, content, score, provenance,
                created_at, version, tags, deprecated, deleted_at, restored_at
         FROM graph_memories m
         WHERE m.group_id = $1
           AND m.deprecated = false
           AND NOT EXISTS (
             SELECT 1 FROM graph_supersedes s
             WHERE s.superseded_id = m.id
           )
           AND ($2::text IS NULL OR m.user_id = $2)
         ORDER BY m.created_at DESC
         LIMIT $3 OFFSET $4`,
        [params.group_id, params.user_id ?? null, params.limit, params.offset]
      )
      return { memories: result.rows.map(rowToNode) }
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "exportMemories", "Export failed", error instanceof Error ? error : undefined)
    }
  }

  async getDeprecatedMemories(params: {
    ids: string[]
    group_id: GroupId
  }): Promise<Map<string, GraphMemoryNode>> {
    retiredTenantOnlyLifecycle("getDeprecatedMemories")
    try {
      const result = await this.pool.query<GraphMemoryRow>(
        `SELECT id, group_id, user_id, content, score, provenance,
                created_at, version, tags, deprecated, deleted_at, restored_at
         FROM graph_memories
         WHERE group_id = $1
           AND id = ANY($2)
           AND deprecated = true`,
        [params.group_id, params.ids]
      )
      const map = new Map<string, GraphMemoryNode>()
      for (const row of result.rows) {
        const node = rowToNode(row)
        map.set(node.id, node)
      }
      return map
    } catch (error) {
      throw new GraphAdapterError("ruvector-graph", "getDeprecatedMemories", "Deprecated lookup failed", error instanceof Error ? error : undefined)
    }
  }

  async linkMemoryContext(params: {
    memory_id: MemoryId
    group_id: GroupId
    agent_id: string | null
    project_id: string | null
  }): Promise<{ authored_by: boolean; relates_to: boolean }> {
    retiredTenantOnlyLifecycle("linkMemoryContext")
    return { authored_by: false, relates_to: false }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query("SELECT 1 AS test")
      return result.rows.length > 0
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    // Don't close the pool — it's shared (owned by connection.ts)
  }
}