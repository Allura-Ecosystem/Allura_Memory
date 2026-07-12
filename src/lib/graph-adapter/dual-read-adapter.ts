/**
 * Dual-Read Graph Adapter — Validation Layer (Slice C+)
 *
 * Wraps two underlying graph adapters (Neo4j + RuVector) and:
 * - For READ methods: calls both, compares results, logs divergence to PostgreSQL
 * - For WRITE methods: writes to both (Neo4j remains authoritative)
 *
 * Feature flag: GRAPH_DUAL_READ=true enables this validation mode
 *
 * Purpose: Catch divergence between backends before removing Neo4j
 *
 * ADR: AD-029 — Graph Adapter Pattern for Neo4j → RuVector Migration
 */

import type { Pool } from "pg"
import neo4j from "neo4j-driver"
import type { MemoryId, GroupId } from "@/lib/memory/canonical-contracts"
import { logTrace } from "../postgres/trace-logger"
import { insertEvent } from "../postgres/queries/insert-trace"
import type { IGraphAdapter, GraphMemoryNode, GraphSearchResult, GraphGetResult, GraphListResult, CountResult, DuplicateCheckResult, VersionLookupResult, CanonicalCheckResult, GraphExportResult, GraphDeleteResult, GraphSupersedesResult, GraphRestoreResult } from "./types"
import { GraphAdapterError } from "./types"

// ── Dual-Read State ──────────────────────────────────────────────────────────

/**
 * Result of comparing two values for divergence
 */
export interface DivergenceRecord {
  query: string
  neo4jValue: unknown
  ruvectorValue: unknown
  diff: string
  timestamp: string
}

/**
 * Dual-Read Adapter configuration
 */
export interface DualReadAdapterConfig {
  /** Both adapters must be provided */
  neo4jAdapter: IGraphAdapter
  ruvectorAdapter: IGraphAdapter
  /** PostgreSQL pool for logging divergence events */
  pgPool?: Pool
}

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Deep equality check with specific tolerance for graph data
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return a === b
  if (typeof a !== "object" || typeof b !== "object") return false

  // Handle Array
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  // Handle Map
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false
    for (const [key, val] of a) {
      if (!b.has(key) || !deepEqual(val, b.get(key))) return false
    }
    return true
  }

  // Handle plain objects
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!bKeys.includes(key) || !deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false
    }
  }
  return true
}

/**
 * Stringify a value for logging, handling circular references
 */
function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (typeof val.toISOString === "function") return val.toISOString()
        if (typeof val.toNumber === "function") return val.toNumber()
      }
      return val
    }, 2)
  } catch {
    return String(value)
  }
}

/**
 * Generate diff string between two values
 */
function generateDiff(a: unknown, b: unknown): string {
  const aStr = stringifySafe(a)
  const bStr = stringifySafe(b)
  if (aStr === bStr) return "No difference"
  
  // Simple diff: show what changed
  const diffLines: string[] = []
  diffLines.push(`Neo4j:   ${aStr.substring(0, 200)}`)
  diffLines.push(`RuVector: ${bStr.substring(0, 200)}`)
  if (aStr.length > 200 || bStr.length > 200) {
    diffLines.push("... (truncated)")
  }
  return diffLines.join("\n")
}

/**
 * Log divergence event to PostgreSQL events table (append-only)
 */
async function logDivergenceEvent(params: {
  query: string
  neo4jResult: unknown
  ruvectorResult: unknown
  diff: string
}): Promise<void> {
  try {
    await insertEvent({
      group_id: "allura-system",
      event_type: "graph_dual_read_divergence",
      agent_id: "graph-adapter-dual-read",
      metadata: {
        query: params.query,
        neo4j_result: params.neo4jResult,
        ruvector_result: params.ruvectorResult,
      },
      outcome: {
        diff: params.diff,
        detected_at: new Date().toISOString(),
      },
      status: "completed",
      confidence: 1,
      evidence_ref: "graph-dual-read-validation",
    })
  } catch (error) {
    // Log to console as fallback (don't throw - this is non-critical)
    console.error(`[DualRead] Failed to log divergence event:`, error)
  }
}

// ── DualReadAdapter Implementation ───────────────────────────────────────────

export class DualReadAdapter implements IGraphAdapter {
  private neo4j: IGraphAdapter
  private ruvector: IGraphAdapter

  constructor(config: DualReadAdapterConfig) {
    this.neo4j = config.neo4jAdapter
    this.ruvector = config.ruvectorAdapter
  }

  // ── Write Operations (dual-write, Neo4j authoritative) ─────────────────────

  async createMemory(params: {
    id: MemoryId
    group_id: GroupId
    user_id: string | null
    content: string
    score: number
    provenance: "manual" | "conversation"
    created_at: string
  }): Promise<MemoryId> {
    // Write to both, but return Neo4j result as authoritative
    await Promise.all([
      this.neo4j.createMemory(params),
      this.ruvector.createMemory(params),
    ])
    return params.id // Return the input ID (Neo4j would return the same)
  }

  async checkDuplicate(params: {
    group_id: GroupId
    user_id: string | null
    content: string
  }): Promise<DuplicateCheckResult> {
    // Don't compare for duplicate check - write-through
    const neo4jResult = await this.neo4j.checkDuplicate(params)
    await this.ruvector.checkDuplicate(params)
    return neo4jResult
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
    // Write to both, return Neo4j result
    const neo4jResult = await this.neo4j.supersedesMemory(params)
    await this.ruvector.supersedesMemory(params)
    return neo4jResult
  }

  async softDeleteMemory(params: {
    id: MemoryId
    group_id: GroupId
    deleted_at: string
  }): Promise<GraphDeleteResult> {
    // Write to both, return Neo4j result
    const neo4jResult = await this.neo4j.softDeleteMemory(params)
    await this.ruvector.softDeleteMemory(params)
    return neo4jResult
  }

  async restoreMemory(params: {
    id: MemoryId
    group_id: GroupId
    restored_at: string
  }): Promise<GraphRestoreResult> {
    // Write to both, return Neo4j result
    const neo4jResult = await this.neo4j.restoreMemory(params)
    await this.ruvector.restoreMemory(params)
    return neo4jResult
  }

  // ── Read Operations (dual-read with divergence logging) ────────────────────

  async getMemory(params: { id: MemoryId; group_id: GroupId }): Promise<GraphGetResult> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.getMemory(params),
      this.ruvector.getMemory(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `getMemory(id=${params.id}, group_id=${params.group_id})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] getMemory divergence detected for ${params.id}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async searchMemories(params: {
    query: string
    group_id: GroupId
    limit: number
  }): Promise<GraphSearchResult[]> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.searchMemories(params),
      this.ruvector.searchMemories(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `searchMemories(query="${params.query}", group_id=${params.group_id}, limit=${params.limit})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] searchMemories divergence detected for query: ${params.query}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async listMemories(params: {
    group_id: GroupId
    user_id: string | null
  }): Promise<GraphListResult> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.listMemories(params),
      this.ruvector.listMemories(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `listMemories(group_id=${params.group_id}, user_id=${params.user_id ?? "null"})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] listMemories divergence detected for group_id: ${params.group_id}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async countMemories(params: {
    group_id: GroupId
    user_id: string | null
  }): Promise<CountResult> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.countMemories(params),
      this.ruvector.countMemories(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `countMemories(group_id=${params.group_id}, user_id=${params.user_id ?? "null"})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] countMemories divergence detected for group_id: ${params.group_id}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async checkCanonical(params: { id: MemoryId; group_id: GroupId }): Promise<CanonicalCheckResult> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.checkCanonical(params),
      this.ruvector.checkCanonical(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `checkCanonical(id=${params.id}, group_id=${params.group_id})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] checkCanonical divergence detected for ${params.id}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async getVersion(params: { id: MemoryId; group_id: GroupId }): Promise<VersionLookupResult> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.getVersion(params),
      this.ruvector.getVersion(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `getVersion(id=${params.id}, group_id=${params.group_id})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] getVersion divergence detected for ${params.id}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async exportMemories(params: {
    group_id: GroupId
    user_id: string | null
    offset: number
    limit: number
  }): Promise<GraphExportResult> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.exportMemories(params),
      this.ruvector.exportMemories(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `exportMemories(group_id=${params.group_id}, offset=${params.offset}, limit=${params.limit})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] exportMemories divergence detected for group_id: ${params.group_id}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async getDeprecatedMemories(params: {
    ids: string[]
    group_id: GroupId
  }): Promise<Map<string, GraphMemoryNode>> {
    const [neo4jResult, ruvectorResult] = await Promise.all([
      this.neo4j.getDeprecatedMemories(params),
      this.ruvector.getDeprecatedMemories(params),
    ])

    if (!deepEqual(neo4jResult, ruvectorResult)) {
      const diff = generateDiff(neo4jResult, ruvectorResult)
      await logDivergenceEvent({
        query: `getDeprecatedMemories(${params.ids.length} ids, group_id=${params.group_id})`,
        neo4jResult: neo4jResult,
        ruvectorResult: ruvectorResult,
        diff,
      })
      console.warn(`[DualRead] getDeprecatedMemories divergence detected for group_id: ${params.group_id}`)
    }

    return neo4jResult // Return Neo4j result as authoritative
  }

  async linkMemoryContext(params: {
    memory_id: MemoryId
    group_id: GroupId
    agent_id: string | null
    project_id: string | null
  }): Promise<{ authored_by: boolean; relates_to: boolean }> {
    const neo4jResult = await this.neo4j.linkMemoryContext(params)
    await this.ruvector.linkMemoryContext(params)
    return neo4jResult // Return Neo4j result
  }

  async isHealthy(): Promise<boolean> {
    const [neo4jHealthy, ruvectorHealthy] = await Promise.all([
      this.neo4j.isHealthy(),
      this.ruvector.isHealthy(),
    ])
    return neo4jHealthy && ruvectorHealthy // Both must be healthy
  }

  async close(): Promise<void> {
    await Promise.all([
      this.neo4j.close(),
      this.ruvector.close(),
    ])
  }
}

// ── Feature Flag Gate ────────────────────────────────────────────────────────

/**
 * Check if dual-read mode is enabled via feature flag
 */
export function isDualReadEnabled(): boolean {
  return process.env.GRAPH_DUAL_READ?.toLowerCase() === "true"
}

// ── Export Factory Function ──────────────────────────────────────────────────

/**
 * Create a dual-read adapter wrapping Neo4j and RuVector adapters
 * Only activates when GRAPH_DUAL_READ=true
 */
export function createDualReadAdapter(config: {
  neo4jAdapter: IGraphAdapter
  ruvectorAdapter: IGraphAdapter
}): IGraphAdapter {
  if (isDualReadEnabled()) {
    return new DualReadAdapter(config)
  }
  // Return Neo4j adapter directly when feature flag is off
  return config.neo4jAdapter
}
