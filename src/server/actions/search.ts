"use server"

// Server-only guard
if (typeof window !== "undefined") {
  throw new Error("search actions are server-side only")
}

import { getPool } from "@/lib/postgres/connection"
import { retrieveMemories } from "@/lib/ruvector/bridge"

// ── Types ─────────────────────────────────────────────────────────────────────

export type SearchResultType = "run" | "work-item" | "project" | "evidence" | "handoff" | "memory" | "definition"

export interface SearchResult {
  id: string
  type: SearchResultType
  title: string
  summary: string
  score?: number
  created_at: string
  metadata?: Record<string, unknown>
}

export interface UnifiedSearchOptions {
  types?: SearchResultType[]
  group_id: string
  limit?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20
const PER_TYPE_LIMIT = 10

function isoOrString(val: unknown): string {
  if (val instanceof Date) return val.toISOString()
  return String(val)
}

// ── Per-entity search helpers (direct SQL for text ILIKE) ────────────────────

async function searchRuns(
  query: string,
  groupId: string,
  limit: number,
): Promise<SearchResult[]> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, definition_id, status, started_at, state_json
     FROM process_runs
     WHERE group_id = $1
       AND (
         definition_id ILIKE $2
         OR status ILIKE $2
         OR state_json::text ILIKE $2
       )
     ORDER BY started_at DESC
     LIMIT $3`,
    [groupId, `%${query}%`, limit],
  )

  return result.rows.map(
    (row): SearchResult => ({
      id: String(row.id),
      type: "run",
      title: `Run: ${row.definition_id} (${row.status})`,
      summary: `Status: ${row.status} — started ${isoOrString(row.started_at)}`,
      created_at: isoOrString(row.started_at),
      metadata: {
        definition_id: row.definition_id,
        status: row.status,
      },
    }),
  )
}

async function searchDefinitions(
  query: string,
  groupId: string,
  limit: number,
): Promise<SearchResult[]> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, revision, name, created_at
     FROM process_definitions
     WHERE group_id = $1
       AND deleted_at IS NULL
       AND (name ILIKE $2 OR id ILIKE $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [groupId, `%${query}%`, limit],
  )

  return result.rows.map(
    (row): SearchResult => ({
      id: `${String(row.id)}:${String(row.revision)}`,
      type: "definition",
      title: String(row.name),
      summary: `Definition ID: ${String(row.id)} · Revision ${String(row.revision)}`,
      created_at: isoOrString(row.created_at),
      metadata: {
        definition_id: row.id,
        revision: row.revision,
      },
    }),
  )
}

async function searchWorkItems(
  query: string,
  groupId: string,
  limit: number,
): Promise<SearchResult[]> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, project_id, title, description, status, priority, created_at
     FROM work_items
     WHERE group_id = $1
       AND (title ILIKE $2 OR description ILIKE $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [groupId, `%${query}%`, limit],
  )

  return result.rows.map(
    (row): SearchResult => ({
      id: String(row.id),
      type: "work-item",
      title: String(row.title),
      summary: row.description
        ? `${String(row.description).slice(0, 120)}${String(row.description).length > 120 ? "…" : ""}`
        : `Status: ${String(row.status)} · Priority: ${String(row.priority)}`,
      created_at: isoOrString(row.created_at),
      metadata: {
        project_id: row.project_id,
        status: row.status,
        priority: row.priority,
      },
    }),
  )
}

async function searchProjects(
  query: string,
  groupId: string,
  limit: number,
): Promise<SearchResult[]> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, name, description, status, created_at
     FROM projects
     WHERE group_id = $1
       AND (name ILIKE $2 OR description ILIKE $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [groupId, `%${query}%`, limit],
  )

  return result.rows.map(
    (row): SearchResult => ({
      id: String(row.id),
      type: "project",
      title: String(row.name),
      summary: row.description
        ? `${String(row.description).slice(0, 120)}${String(row.description).length > 120 ? "…" : ""}`
        : `Status: ${String(row.status)}`,
      created_at: isoOrString(row.created_at),
      metadata: { status: row.status },
    }),
  )
}

async function searchEvidence(
  query: string,
  groupId: string,
  limit: number,
): Promise<SearchResult[]> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, work_item_id, run_id, actor_id, packet_type, content, created_at
     FROM evidence_packets
     WHERE group_id = $1
       AND (
         actor_id ILIKE $2
         OR packet_type ILIKE $2
         OR content::text ILIKE $2
       )
     ORDER BY created_at DESC
     LIMIT $3`,
    [groupId, `%${query}%`, limit],
  )

  return result.rows.map(
    (row): SearchResult => ({
      id: String(row.id),
      type: "evidence",
      title: `Evidence: ${String(row.packet_type)} by ${String(row.actor_id)}`,
      summary: `Work item: ${row.work_item_id ?? "—"} · Run: ${row.run_id ?? "—"}`,
      created_at: isoOrString(row.created_at),
      metadata: {
        work_item_id: row.work_item_id,
        run_id: row.run_id,
        actor_id: row.actor_id,
        packet_type: row.packet_type,
      },
    }),
  )
}

async function searchHandoffs(
  query: string,
  groupId: string,
  limit: number,
): Promise<SearchResult[]> {
  const pool = getPool()
  const result = await pool.query(
    `SELECT id, work_item_id, from_actor_id, to_actor_id, message, status, created_at
     FROM handoffs
     WHERE group_id = $1
       AND (
         from_actor_id ILIKE $2
         OR to_actor_id ILIKE $2
         OR message ILIKE $2
       )
     ORDER BY created_at DESC
     LIMIT $3`,
    [groupId, `%${query}%`, limit],
  )

  return result.rows.map(
    (row): SearchResult => ({
      id: String(row.id),
      type: "handoff",
      title: `Handoff: ${String(row.from_actor_id)} → ${String(row.to_actor_id)}`,
      summary: row.message
        ? `${String(row.message).slice(0, 120)}${String(row.message).length > 120 ? "…" : ""}`
        : `Status: ${String(row.status)}`,
      created_at: isoOrString(row.created_at),
      metadata: {
        work_item_id: row.work_item_id,
        from_actor_id: row.from_actor_id,
        to_actor_id: row.to_actor_id,
        status: row.status,
      },
    }),
  )
}

async function searchMemories(
  query: string,
  groupId: string,
  limit: number,
): Promise<SearchResult[]> {
  try {
    const result = await retrieveMemories({
      userId: groupId,
      query,
      limit,
      searchMode: "hybrid",
    })

    return result.memories.map(
      (m): SearchResult => ({
        id: String(m.id),
        type: "memory",
        title: `Memory: ${String(m.memoryType)}`,
        summary: m.content.slice(0, 160) + (m.content.length > 160 ? "…" : ""),
        score: m.score,
        created_at: new Date().toISOString(), // RuVector does not return created_at
        metadata: { memoryType: m.memoryType },
      }),
    )
  } catch {
    // RuVector may be unavailable — degrade gracefully
    return []
  }
}

// ── Dedup + merge ─────────────────────────────────────────────────────────────

/**
 * Merge and rank results: memory results (with score) come first, then
 * structured entity results sorted by recency.
 */
function mergeResults(
  memoryResults: SearchResult[],
  structuredResults: SearchResult[],
  limit: number,
): SearchResult[] {
  // Sort memories by score desc, structured by created_at desc
  const sortedMemories = [...memoryResults].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const sortedStructured = [...structuredResults].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  // Merge: memory results first (they have relevance scores), then structured
  const merged = [...sortedMemories, ...sortedStructured]
  return merged.slice(0, limit)
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Unified search across all Allura entity types.
 *
 * For memories/events: uses retrieveMemories() (hybrid vector ANN + BM25 RRF).
 * For structured entities: direct SQL ILIKE across name/title/description fields.
 * Results are merged: RuVector scored results first, then text matches by recency.
 *
 * @param query    Search string; returns empty array if blank.
 * @param options  group_id (mandatory), optional type filter, optional limit.
 * @returns        Merged, ranked SearchResult array.
 */
export async function unifiedSearch(
  query: string,
  options: UnifiedSearchOptions,
): Promise<SearchResult[]> {
  const { group_id, types, limit = DEFAULT_LIMIT } = options

  // Empty query → return nothing (not everything)
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const allTypes: SearchResultType[] = types && types.length > 0
    ? types
    : ["run", "work-item", "project", "evidence", "handoff", "memory", "definition"]

  const memoryTypes: SearchResultType[] = ["memory"]
  const structuredTypes: SearchResultType[] = allTypes.filter((t) => t !== "memory")
  const includeMemory = allTypes.includes("memory")

  // Launch structured searches in parallel
  const structuredPromises: Array<Promise<SearchResult[]>> = []

  if (structuredTypes.includes("run")) {
    structuredPromises.push(searchRuns(trimmed, group_id, PER_TYPE_LIMIT))
  }
  if (structuredTypes.includes("definition")) {
    structuredPromises.push(searchDefinitions(trimmed, group_id, PER_TYPE_LIMIT))
  }
  if (structuredTypes.includes("work-item")) {
    structuredPromises.push(searchWorkItems(trimmed, group_id, PER_TYPE_LIMIT))
  }
  if (structuredTypes.includes("project")) {
    structuredPromises.push(searchProjects(trimmed, group_id, PER_TYPE_LIMIT))
  }
  if (structuredTypes.includes("evidence")) {
    structuredPromises.push(searchEvidence(trimmed, group_id, PER_TYPE_LIMIT))
  }
  if (structuredTypes.includes("handoff")) {
    structuredPromises.push(searchHandoffs(trimmed, group_id, PER_TYPE_LIMIT))
  }

  const [memoryResults, ...structuredChunks] = await Promise.all([
    includeMemory ? searchMemories(trimmed, group_id, PER_TYPE_LIMIT) : Promise.resolve([] as SearchResult[]),
    ...structuredPromises,
  ])

  const structuredResults = structuredChunks.flat()

  return mergeResults(memoryResults, structuredResults, limit)
}

// Re-export type alias used by the UI
export type { SearchResultType as SearchType }
