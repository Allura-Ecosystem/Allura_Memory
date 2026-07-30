/**
 * Neo4j Stub — DEPRECATED
 *
 * Neo4j has been sunset. All functions are stubs that either no-op or throw.
 * Used by legacy scripts in the scripts/ directory that still import from
 * the old neo4j module paths.
 *
 * @deprecated Neo4j is sunset. Use PostgreSQL (pgvector) instead.
 */

export interface Driver {
  session(): {
    run(_query?: string, _params?: Record<string, unknown>): Promise<{ records: Neo4jRecord[]; summary?: unknown }>
    close(): Promise<void>
  }
  verifyConnectivity(): Promise<void>
  close(): Promise<void>
}

export interface Neo4jRecord {
  get<T = unknown>(key: string): T
  keys: string[]
  length: number
}

export function getDriver(): Driver {
  const throwFn = () => { throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead") }
  return {
    session: () => ({
      run: throwFn as () => Promise<{ records: Neo4jRecord[]; summary?: unknown }>,
      close: async () => {},
    }),
    verifyConnectivity: throwFn as () => Promise<void>,
    close: async () => {},
  }
}

export async function closeDriver(): Promise<void> {}

export async function isDriverHealthy(): Promise<boolean> {
  return false
}

export interface ManagedTransaction {
  run(_query: string, _params?: Record<string, unknown>): Promise<{ records: Neo4jRecord[]; summary?: unknown }>
}

export async function readTransaction<T = { records: Record<string, unknown>[] }>(
  _fn: (tx: ManagedTransaction) => Promise<T>
): Promise<T> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return undefined as T
}

export async function writeTransaction<T = { records: Record<string, unknown>[] }>(
  _fn: (tx: ManagedTransaction) => Promise<T>
): Promise<T> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return undefined as T
}

// Error classes
export class Neo4jConnectionError extends Error {
  constructor(message: string) { super(message); this.name = "Neo4jConnectionError" }
}
export class Neo4jQueryError extends Error {
  constructor(message: string) { super(message); this.name = "Neo4jQueryError" }
}
export class Neo4jPromotionError extends Error {
  constructor(public readonly insightId: string, public readonly cause: Error) {
    super(`Failed to promote insight ${insightId}: ${cause.message}`)
    this.name = "Neo4jPromotionError"
  }
}

// Insight types and functions
export interface InsightInsert {
  insight_id: string
  group_id: string
  content: string
  confidence: number
  topic_key?: string
  source_type?: string
  source_ref?: string
  created_by?: string
  metadata?: Record<string, unknown>
}

export interface InsightRecord {
  id: string
  insight_id?: string
  version: number
  status: string
  content?: string
  confidence?: number
  topic_key?: string
  group_id?: string
  source_type?: string
  source_ref?: string | null
  created_at?: Date | string
  created_by?: string | null
  metadata?: Record<string, unknown>
}

export class InsightValidationError extends Error {
  constructor(message: string) { super(message); this.name = "InsightValidationError" }
}
export class InsightConflictError extends Error {
  constructor(message: string) { super(message); this.name = "InsightConflictError" }
}

export async function createInsight(_payload: InsightInsert): Promise<InsightRecord> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return { id: "", version: 1, status: "active" }
}

export async function createInsightVersion(
  _id: string, _content: string, _confidence: number, _groupId: string, _metadata?: Record<string, unknown>
): Promise<InsightRecord> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return { id: "", version: 1, status: "active" }
}

export async function deprecateInsight(_id: string, _groupId: string): Promise<void> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
}

export async function revertInsightVersion(_id: string, _groupId: string): Promise<void> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
}

// Get insight functions
export interface InsightQueryParams {
  group_id: string
  limit?: number
  offset?: number
  status?: string
  source_type?: string
  min_confidence?: number
  max_confidence?: number
  since?: Date
  until?: Date
}

export interface PaginatedInsights {
  items: never[]
  total: number
  has_more: boolean
}

export async function searchInsights(_query: string, _params: Partial<InsightQueryParams>): Promise<PaginatedInsights> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return { items: [], total: 0, has_more: false }
}

export async function listInsights(_params: InsightQueryParams): Promise<PaginatedInsights> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return { items: [], total: 0, has_more: false }
}

// Dual context functions
export interface DualInsightQueryParams {
  project_group_id: string
  include_global?: boolean
  status?: string
  min_confidence?: number
  limit_per_scope?: number
}

export interface ScopedInsight {
  insight_id: string
  content: string
  confidence: number
  scope: "project" | "global"
  version: number
  topic_key: string
  created_at: Date | null
}

export async function getDualContextSemanticMemory(_params: DualInsightQueryParams): Promise<{
  project_insights: ScopedInsight[]
  global_insights: ScopedInsight[]
}> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return { project_insights: [], global_insights: [] }
}

export async function getMergedDualContextInsights(_params: DualInsightQueryParams): Promise<ScopedInsight[]> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return []
}

// Client functions
export async function getInsightHistory(_id: string, _groupId: string): Promise<InsightRecord[]> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return []
}

// Agent node functions (for initialize-agent-memory.ts)
export async function createAgentGroup(_groupId: string): Promise<void> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
}

export async function initializeDefaultAgents(_groupId: string): Promise<void> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
}

export async function verifyAgentNodes(_groupId: string): Promise<boolean> {
  throw new Error("Neo4j is sunset — use PostgreSQL (pgvector) instead")
  return false
}