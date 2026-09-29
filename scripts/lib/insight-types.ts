/**
 * Insight types shared by session-hydration scripts.
 *
 * Plain data shapes only. Canonical (semantic) writes are governed: they are
 * proposed via `memory_add` and promoted through curator approval (HITL) into
 * the PostgreSQL `graph_memories` / `graph_supersedes` tables. Scripts do not
 * write canonical rows directly.
 */

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
  constructor(message: string) {
    super(message)
    this.name = "InsightValidationError"
  }
}
