/**
 * Neo4j Graph Adapter — Legacy Implementation (Slice C)
 *
 * Wraps the existing neo4j-driver Cypher queries behind the IGraphAdapter
 * interface. This is the "before" picture — every method maps to exactly
 * one inline Cypher block from canonical-tools.ts.
 *
 * Purpose: Enable side-by-side comparison with RuVectorGraphAdapter
 * during the migration. Feature flag GRAPH_BACKEND=neo4j selects this.
 *
 * After Slice E (Remove Neo4j), this file is archived.
 *
 * ADR: AD-029 — Graph Adapter Pattern for Neo4j → RuVector Migration
 */

import type { Driver } from "neo4j-driver"
import neo4j from "neo4j-driver"
import type { ConfidenceScore, GroupId, MemoryId, MemoryProvenance } from "@/lib/memory/canonical-contracts"
import { CURRENT_SCHEMA_VERSION } from "@/lib/schema-version"
import { resolveAgentName, resolveProjectName } from "./sync-contract-mappings"
import { GraphAdapterError } from "./types"
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

// ── Helper: Neo4j DateTime → ISO string ──────────────────────────────────────

const UNKNOWN_DATE_ISO = "1970-01-01T00:00:00.000Z"

type Neo4jIntegerLike = { low?: number; high?: number; toNumber?: () => number }
type Neo4jRecordLike = { get?: (key: string) => unknown }

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value
  if (value && typeof value === "object") {
    const integer = value as Neo4jIntegerLike
    if (typeof integer.toNumber === "function") return integer.toNumber()
    if (typeof integer.low === "number") return integer.low
  }
  return fallback
}

function dateToISO(date: Date): string {
  return Number.isNaN(date.getTime()) ? UNKNOWN_DATE_ISO : date.toISOString()
}

function neo4jDateToISO(value: unknown): string {
  if (value == null) return UNKNOWN_DATE_ISO
  if (value instanceof Date) return dateToISO(value)
  if (typeof value === "string" || typeof value === "number") return dateToISO(new Date(value))

  if (typeof value === "object") {
    const temporal = value as { toStandardDate?: () => Date; toString?: () => string }

    if (typeof temporal.toStandardDate === "function") {
      return dateToISO(temporal.toStandardDate())
    }

    if ("year" in value) {
      if (typeof temporal.toString === "function") {
        const parsed = new Date(temporal.toString())
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
      }

      const d = value as Record<string, unknown>
      return dateToISO(
        new Date(
          Date.UTC(
            toNumber(d.year),
            toNumber(d.month, 1) - 1,
            toNumber(d.day, 1),
            toNumber(d.hour),
            toNumber(d.minute),
            toNumber(d.second),
            Math.floor(toNumber(d.nanosecond) / 1_000_000)
          )
        )
      )
    }
  }

  return UNKNOWN_DATE_ISO
}

function recordValue(record: Record<string, unknown> | Neo4jRecordLike, key: string): unknown {
  if (typeof (record as Neo4jRecordLike).get === "function") {
    try {
      return (record as Neo4jRecordLike).get?.(key)
    } catch {
      return undefined
    }
  }
  return (record as Record<string, unknown>)[key]
}

function toProvenance(value: string | null | undefined): MemoryProvenance {
  return value === "manual" ? "manual" : "conversation"
}

function recordToNode(record: Record<string, unknown> | Neo4jRecordLike): GraphMemoryNode {
  const get = (key: string) => recordValue(record, key)
  return {
    id: get("id") as MemoryId,
    content: get("content") as string,
    score: (get("score") as number) ?? 0.5,
    provenance: toProvenance(get("provenance") as string | null),
    user_id: (get("user_id") as string) ?? null,
    created_at: neo4jDateToISO(get("created_at")),
    version: (get("version") as { toNumber?: () => number })?.toNumber?.() ?? 1,
    tags: (get("tags") as string[]) || [],
    deprecated: (get("deprecated") as boolean) ?? false,
    deleted_at: get("deleted_at") ? neo4jDateToISO(get("deleted_at")) : null,
    restored_at: get("restored_at") ? neo4jDateToISO(get("restored_at")) : null,
    group_id: (get("group_id") as GroupId | undefined) ?? ("allura-system" as GroupId),
    schema_version: (get("schema_version") as { toNumber?: () => number })?.toNumber?.() ?? CURRENT_SCHEMA_VERSION,
  }
}

function graphSearchRecord(record: Neo4jRecordLike): GraphSearchResult {
  return {
    id: recordValue(record, "id") as MemoryId,
    content: recordValue(record, "content") as string,
    score: ((recordValue(record, "score") as number) ?? 0.5) as ConfidenceScore,
    provenance: toProvenance(recordValue(record, "provenance") as string | null),
    created_at: neo4jDateToISO(recordValue(record, "created_at")),
    usage_count: toNumber(recordValue(record, "usage_count")),
    tags: (recordValue(record, "tags") as string[]) || [],
    relevance: (recordValue(record, "relevance") as number) ?? 0,
    schema_version: toNumber(recordValue(record, "schema_version"), CURRENT_SCHEMA_VERSION),
  }
}

// ── Neo4jGraphAdapter ────────────────────────────────────────────────────────

export class Neo4jGraphAdapter implements IGraphAdapter {
  private driver: Driver

  constructor(driver: Driver) {
    this.driver = driver
  }

  // ── Write Operations ───────────────────────────────────────────────────

  async createMemory(params: {
    id: MemoryId
    group_id: GroupId
    user_id: string | null
    content: string
    score: ConfidenceScore
    provenance: MemoryProvenance
    created_at: string
  }): Promise<MemoryId> {
    const session = this.driver.session()
    try {
      await session.run(
        `CREATE (m:Memory {
          id: $id,
          group_id: $groupId,
          user_id: $userId,
          content: $content,
          score: $score,
          provenance: $provenance,
          created_at: datetime($createdAt),
          schema_version: $schemaVersion,
          deprecated: false
        })`,
        {
          id: params.id,
          groupId: params.group_id,
          userId: params.user_id,
          content: params.content,
          score: params.score,
          provenance: params.provenance,
          createdAt: params.created_at,
          schemaVersion: neo4j.int(CURRENT_SCHEMA_VERSION),
        }
      )
      return params.id
    } catch (error) {
      throw new GraphAdapterError("neo4j", "createMemory", "Failed to create memory node", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async checkDuplicate(params: {
    group_id: GroupId
    user_id: string | null
    content: string
  }): Promise<DuplicateCheckResult> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.group_id = $groupId
           AND ($userId IS NULL OR m.user_id = $userId)
           AND m.content = $content
           AND NOT (m)<-[:SUPERSEDES]-()
         RETURN m.id AS id
         LIMIT 1`,
        { groupId: params.group_id, userId: params.user_id ?? null, content: params.content }
      )
      if (result.records.length > 0) {
        return { existingId: result.records[0].get("id") as MemoryId }
      }
      return { existingId: null }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "checkDuplicate", "Duplicate check failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async supersedesMemory(params: {
    prev_id: MemoryId
    new_id: MemoryId
    group_id: GroupId
    user_id: string | null
    content: string
    version: number
    created_at: string
  }): Promise<GraphSupersedesResult> {
    const session = this.driver.session()
    try {
      await session.run(
        `MATCH (v1:Memory { id: $prevId, group_id: $groupId })
         CREATE (v2:Memory {
           id: $newId,
           group_id: $groupId,
           user_id: $userId,
           content: $content,
           score: v1.score,
           provenance: v1.provenance,
           version: $version,
           created_at: datetime($createdAt),
           schema_version: $schemaVersion,
           deprecated: false
         })
         CREATE (v2)-[:SUPERSEDES]->(v1)
         SET v1.deprecated = true
         SET v1:deprecated`,
        {
          prevId: params.prev_id,
          newId: params.new_id,
          groupId: params.group_id,
          userId: params.user_id,
          content: params.content,
          version: neo4j.int(params.version),
          createdAt: params.created_at,
          schemaVersion: neo4j.int(CURRENT_SCHEMA_VERSION),
        }
      )
      return { newId: params.new_id, newVersion: params.version, success: true }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "supersedesMemory", "SUPERSEDES operation failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async softDeleteMemory(params: {
    id: MemoryId
    group_id: GroupId
    deleted_at: string
  }): Promise<GraphDeleteResult> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.id = $id
           AND m.group_id = $groupId
         SET m.deprecated = true,
             m.deleted_at = datetime($deletedAt)
         RETURN m.id AS id`,
        { id: params.id, groupId: params.group_id, deletedAt: params.deleted_at }
      )
      return { deleted: result.records.length > 0 }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "softDeleteMemory", "Soft-delete failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async restoreMemory(params: {
    id: MemoryId
    group_id: GroupId
    restored_at: string
  }): Promise<GraphRestoreResult> {
    const session = this.driver.session()
    try {
      await session.run(
        `MATCH (m:Memory)
         WHERE m.id = $id
           AND m.group_id = $groupId
         REMOVE m.deprecated
         REMOVE m:deprecated
         WITH m
         OPTIONAL MATCH (newer)-[r:SUPERSEDES]->(m)
         DELETE r
         SET m.restored_at = datetime($restoredAt)
         RETURN m.id AS id`,
        { id: params.id, groupId: params.group_id, restoredAt: params.restored_at }
      )
      return { restored: true }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "restoreMemory", "Restore failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  // ── Read Operations ─────────────────────────────────────────────────────

  async getMemory(params: { id: MemoryId; group_id: GroupId }): Promise<GraphGetResult> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `CALL {
           MATCH (h:InsightHead {group_id: $groupId})
           MATCH (m:Insight {id: h.current_id})
           WHERE m.id = $id OR m.insight_id = $id
           RETURN m.insight_id AS id,
                  m.content AS content,
                  m.confidence AS score,
                  m.source_type AS provenance,
                  m.created_by AS user_id,
                  m.created_at AS created_at,
                  m.version AS version,
                  [] AS tags,
                  false AS deprecated,
                  m.schema_version AS schema_version,
                  0 AS priority
           UNION ALL
           MATCH (m:Memory)
           WHERE m.id = $id
             AND m.group_id = $groupId
             AND NOT (m)<-[:SUPERSEDES]-()
           RETURN m.id AS id,
                m.content AS content,
                m.score AS score,
                m.provenance AS provenance,
                m.user_id AS user_id,
                m.created_at AS created_at,
                m.version AS version,
                m.tags AS tags,
                m.deprecated AS deprecated,
                m.schema_version AS schema_version,
                1 AS priority
         }
         RETURN id, content, score, provenance, user_id, created_at, version,
                tags, deprecated, schema_version
         ORDER BY priority
         LIMIT 1`,
        { id: params.id, groupId: params.group_id }
      )
      if (result.records.length === 0) {
        return { node: null }
      }
      return { node: recordToNode(result.records[0] as unknown as Record<string, unknown>) }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "getMemory", "Get memory failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async searchMemories(params: {
    query: string
    group_id: GroupId
    limit: number
  }): Promise<GraphSearchResult[]> {
    const session = this.driver.session()
    try {
      const insightResult = await session.run(
          `CALL db.index.fulltext.queryNodes('insight_search_index', $query)
           YIELD node AS m, score
           MATCH (h:InsightHead {insight_id: m.insight_id, group_id: $groupId})
           WHERE m.id = h.current_id
             AND m.status = 'active'
           RETURN m.insight_id AS id,
                  m.content AS content,
                  m.confidence AS score,
                  m.source_type AS provenance,
                  m.created_at AS created_at,
                  0 AS usage_count,
                  [] AS tags,
                  m.schema_version AS schema_version,
                  score AS relevance
          ORDER BY relevance DESC, m.confidence DESC
           LIMIT $limit`,
          { query: params.query, groupId: params.group_id, limit: neo4j.int(params.limit) }
        )
      const memoryResult = await session.run(
        `CALL db.index.fulltext.queryNodes('memory_search_index', $query)
         YIELD node AS m, score
         WHERE m.group_id = $groupId
           AND coalesce(m.deprecated, false) = false
           AND NOT (m)<-[:SUPERSEDES]-()
         RETURN m.id AS id,
                m.content AS content,
                m.score AS score,
                m.provenance AS provenance,
                m.created_at AS created_at,
                m.usage_count AS usage_count,
                m.tags AS tags,
                m.schema_version AS schema_version,
                score AS relevance
         ORDER BY relevance DESC, m.score DESC
         LIMIT $limit`,
        { query: params.query, groupId: params.group_id, limit: neo4j.int(params.limit) }
      )

      const seen = new Set<string>()
      return [...insightResult.records, ...memoryResult.records]
        .map((record) => graphSearchRecord(record))
        .sort((a, b) => b.relevance - a.relevance || b.score - a.score)
        .filter((record) => {
          if (seen.has(record.id)) return false
          seen.add(record.id)
          return true
        })
        .slice(0, params.limit)
    } catch (error) {
      throw new GraphAdapterError("neo4j", "searchMemories", "Full-text search failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async listMemories(params: {
    group_id: GroupId
    user_id: string | null
  }): Promise<GraphListResult> {
    const session = this.driver.session()
    try {
      // Count
      const countResult = await session.run(
        `CALL {
           MATCH (h:InsightHead {group_id: $groupId})
           MATCH (i:Insight {id: h.current_id, status: 'active'})
           WHERE i.insight_id IS NOT NULL
             AND ($userId IS NULL OR i.created_by = $userId)
           RETURN count(i) AS count
           UNION ALL
           MATCH (m:Memory)
           WHERE m.group_id = $groupId
             AND m.id IS NOT NULL
             AND ($userId IS NULL OR m.user_id = $userId)
             AND NOT (m)<-[:SUPERSEDES]-()
           RETURN count(m) AS count
         }
         RETURN sum(count) AS total`,
        { groupId: params.group_id, userId: params.user_id ?? null }
      )
      const total = countResult.records[0]?.get("total")?.toNumber?.() ?? 0

      // Data
      const result = await session.run(
        `CALL {
           MATCH (h:InsightHead {group_id: $groupId})
           MATCH (m:Insight {id: h.current_id, status: 'active'})
           WHERE m.insight_id IS NOT NULL
             AND ($userId IS NULL OR m.created_by = $userId)
           RETURN m.insight_id AS id,
                  m.content AS content,
                  m.confidence AS score,
                  m.source_type AS provenance,
                  m.created_by AS user_id,
                  m.created_at AS created_at,
                  m.version AS version,
                  [] AS tags,
                  false AS deprecated,
                  null AS deleted_at,
                  null AS restored_at,
                  m.group_id AS group_id,
                  m.schema_version AS schema_version
           UNION ALL
           MATCH (m:Memory)
           WHERE m.group_id = $groupId
             AND m.id IS NOT NULL
             AND ($userId IS NULL OR m.user_id = $userId)
             AND NOT (m)<-[:SUPERSEDES]-()
           RETURN m.id AS id,
                m.content AS content,
                m.score AS score,
                m.provenance AS provenance,
                m.user_id AS user_id,
                m.created_at AS created_at,
                m.version AS version,
                m.tags AS tags,
                m.deprecated AS deprecated,
                m.deleted_at AS deleted_at,
                m.restored_at AS restored_at,
                m.group_id AS group_id,
                m.schema_version AS schema_version
         }
         RETURN id, content, score, provenance, user_id, created_at, version,
                tags, deprecated, deleted_at, restored_at, group_id, schema_version
         ORDER BY created_at DESC`,
        { groupId: params.group_id, userId: params.user_id ?? null }
      )

      const memories = result.records.map((record) => recordToNode(record as unknown as Neo4jRecordLike))
      return { memories, total }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "listMemories", "List memories failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async countMemories(params: {
    group_id: GroupId
    user_id: string | null
  }): Promise<CountResult> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `CALL {
           MATCH (h:InsightHead {group_id: $groupId})
           MATCH (i:Insight {id: h.current_id, status: 'active'})
           WHERE i.insight_id IS NOT NULL
             AND ($userId IS NULL OR i.created_by = $userId)
           RETURN count(i) AS count
           UNION ALL
           MATCH (m:Memory)
           WHERE m.group_id = $groupId
             AND m.id IS NOT NULL
             AND ($userId IS NULL OR m.user_id = $userId)
             AND NOT (m)<-[:SUPERSEDES]-()
           RETURN count(m) AS count
         }
         RETURN sum(count) AS total`,
        { groupId: params.group_id, userId: params.user_id ?? null }
      )
      return { total: result.records[0]?.get("total")?.toNumber?.() ?? 0 }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "countMemories", "Count failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async checkCanonical(params: { id: MemoryId; group_id: GroupId }): Promise<CanonicalCheckResult> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `CALL {
           MATCH (h:InsightHead {group_id: $groupId})
           MATCH (i:Insight {id: h.current_id, status: 'active'})
           WHERE i.id = $id OR i.insight_id = $id
           RETURN i.insight_id AS id
           UNION ALL
           MATCH (m:Memory)
           WHERE m.id = $id
             AND m.group_id = $groupId
             AND NOT (m)<-[:SUPERSEDES]-()
             AND m.deprecated = false
           RETURN m.id AS id
         }
         RETURN id LIMIT 1`,
        { id: params.id, groupId: params.group_id }
      )
      return { isCanonical: result.records.length > 0 }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "checkCanonical", "Canonical check failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async getVersion(params: { id: MemoryId; group_id: GroupId }): Promise<VersionLookupResult> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `CALL {
           MATCH (h:InsightHead {group_id: $groupId})
           MATCH (i:Insight {id: h.current_id, status: 'active'})
           WHERE i.id = $id OR i.insight_id = $id
           RETURN coalesce(i.version, 1) AS version
           UNION ALL
           MATCH (v1:Memory)
           WHERE v1.id = $id
             AND v1.group_id = $groupId
             AND NOT (v1)<-[:SUPERSEDES]-()
           RETURN coalesce(v1.version, 1) AS version
         }
         RETURN version LIMIT 1`,
        { id: params.id, groupId: params.group_id }
      )
      if (result.records.length === 0) {
        return { version: null, exists: false }
      }
      return {
        version: (result.records[0].get("version") as { toNumber?: () => number })?.toNumber?.() ?? 1,
        exists: true,
      }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "getVersion", "Version lookup failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async exportMemories(params: {
    group_id: GroupId
    user_id: string | null
    offset: number
    limit: number
  }): Promise<GraphExportResult> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `CALL {
           MATCH (h:InsightHead {group_id: $groupId})
           MATCH (i:Insight {id: h.current_id, status: 'active'})
           WHERE i.insight_id IS NOT NULL
             AND ($userId IS NULL OR i.created_by = $userId)
           RETURN i.insight_id AS id,
                  i.content AS content,
                  i.confidence AS score,
                  i.provenance AS provenance,
                  i.created_by AS user_id,
                  i.created_at AS created_at,
                  coalesce(i.version, 1) AS version,
                  i.tags AS tags,
                  i.schema_version AS schema_version
           UNION ALL
           MATCH (m:Memory)
           WHERE m.group_id = $groupId
             AND m.id IS NOT NULL
             AND NOT (m)<-[:SUPERSEDES]-()
             AND m.deprecated = false
             AND ($userId IS NULL OR m.user_id = $userId)
           RETURN m.id AS id,
                  m.content AS content,
                  m.score AS score,
                  m.provenance AS provenance,
                  m.user_id AS user_id,
                  m.created_at AS created_at,
                  coalesce(m.version, 1) AS version,
                  m.tags AS tags,
                  m.schema_version AS schema_version
         }
         RETURN id, content, score, provenance, user_id, created_at, version, tags, schema_version
         ORDER BY created_at DESC
         SKIP $offset
         LIMIT $limit`,
        {
          groupId: params.group_id,
          userId: params.user_id ?? null,
          offset: neo4j.int(params.offset),
          limit: neo4j.int(params.limit),
        }
      )
      return {
        memories: result.records.map((record) => recordToNode(record as unknown as Record<string, unknown>)),
      }
    } catch (error) {
      throw new GraphAdapterError("neo4j", "exportMemories", "Export failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async getDeprecatedMemories(params: {
    ids: string[]
    group_id: GroupId
  }): Promise<Map<string, GraphMemoryNode>> {
    const session = this.driver.session()
    try {
      const result = await session.run(
        `MATCH (m:Memory)
         WHERE m.group_id = $groupId
           AND m.id IN $ids
           AND m.deprecated = true
         RETURN m.id AS id,
                m.content AS content,
                m.score AS score,
                m.provenance AS provenance,
                m.user_id AS user_id,
                m.created_at AS created_at,
                m.version AS version,
                m.tags AS tags,
                m.schema_version AS schema_version`,
        { groupId: params.group_id, ids: params.ids }
      )
      const map = new Map<string, GraphMemoryNode>()
      for (const record of result.records) {
        const node = recordToNode(record as unknown as Record<string, unknown>)
        map.set(node.id, node)
      }
      return map
    } catch (error) {
      throw new GraphAdapterError("neo4j", "getDeprecatedMemories", "Deprecated lookup failed", error instanceof Error ? error : undefined)
    } finally {
      await session.close()
    }
  }

  async linkMemoryContext(params: {
    memory_id: MemoryId
    group_id: GroupId
    agent_id: string | null
    project_id: string | null
  }): Promise<{ authored_by: boolean; relates_to: boolean }> {
    // Skip if nothing to link
    if (!params.agent_id && !params.project_id) {
      return { authored_by: false, relates_to: false }
    }

    // FR-3 Sync Contract: Resolve user_id → Agent name, group_id → Project name
    // using mapping tables from BRIEF-FR3-SYNC-CONTRACT.md
    const resolvedAgentId = params.agent_id ? resolveAgentName(params.agent_id) : null
    const resolvedProjectId = params.project_id ? resolveProjectName(params.project_id) : null

    const session = this.driver.session()
    try {
      let authoredBy = false
      let relatesTo = false

      // FR-3: Wire AUTHORED_BY → Agent (MERGE for idempotency, auto-create if missing)
      if (resolvedAgentId) {
        const result = await session.run(
          `MATCH (m) WHERE m.id = $memoryId AND m.group_id = $groupId AND (m:Memory OR m:Insight)
           MERGE (a:Agent {id: $agentId, group_id: $groupId})
           ON CREATE SET a.name = $agentName,
                         a.role = 'auto-created from promotion',
                         a.model = 'unknown',
                         a.created_at = datetime(),
                         a.last_active = datetime(),
                         a.confidence = 0.0,
                         a.contribution_count = 0,
                         a.learning_count = 0,
                         a.status = 'active'
           MERGE (m)-[:AUTHORED_BY]->(a)
           RETURN true AS linked`,
          {
            memoryId: params.memory_id,
            groupId: params.group_id,
            agentId: resolvedAgentId,
            agentName: resolvedAgentId,
          }
        )
        authoredBy = result.records[0]?.get('linked') ?? false
      }

      // FR-3: Wire CONTRIBUTES_TO → Project (MERGE for idempotency, auto-create if missing)
      if (resolvedProjectId) {
        const result = await session.run(
          `MATCH (m) WHERE m.id = $memoryId AND m.group_id = $groupId AND (m:Memory OR m:Insight)
           MERGE (p:Project {id: $projectId, group_id: $groupId})
           ON CREATE SET p.name = $projectName,
                         p.description = 'auto-created from promotion',
                         p.created_at = datetime(),
                         p.updated_at = datetime(),
                         p.status = 'active'
           MERGE (m)-[:CONTRIBUTES_TO]->(p)
           RETURN true AS linked`,
          {
            memoryId: params.memory_id,
            groupId: params.group_id,
            projectId: resolvedProjectId,
            projectName: resolvedProjectId,
          }
        )
        relatesTo = result.records[0]?.get('linked') ?? false
      }

      return { authored_by: authoredBy, relates_to: relatesTo }
    } catch (error) {
      // Log but don't throw — relationship wiring is best-effort, not blocking
      console.warn(
        `[sync-contract] linkMemoryContext failed for memory=${params.memory_id}:`,
        error instanceof Error ? error.message : error
      )
      return { authored_by: false, relates_to: false }
    } finally {
      await session.close()
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const session = this.driver.session()
      try {
        await session.run("RETURN 1 AS test")
        return true
      } finally {
        await session.close()
      }
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    // Don't close the driver — it's shared (owned by connection.ts)
    // The adapter is a wrapper, not the owner.
  }
}
