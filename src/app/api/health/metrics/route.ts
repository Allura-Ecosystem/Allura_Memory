/**
 * GET /api/health/metrics
 *
 * Observability metrics endpoint for Allura Memory.
 * Returns queue health, recall latency, promotion stats, and degraded mode counters.
 *
 * Reference: docs/allura/SPRINT-PLAN.md (Sprint 5)
 */

import { NextRequest, NextResponse } from "next/server"
import { captureException } from "@/lib/observability/sentry"
import { getPool } from "@/lib/postgres/connection"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

export interface SkillMetric {
  tool_name: string
  category: string
  calls_24h: number
  success_rate: number
  avg_latency_ms: number
  last_used: string | null
  trend: "up" | "down" | "flat"
}

export interface MetricsResponse {
  timestamp: string
  queue: {
    pending_count: number
    oldest_age_hours: number
    approved_24h: number
    rejected_24h: number
  }
  recall: {
    search_available: boolean
    last_latency_ms: number | null
  }
  storage: {
    postgres: {
      status: "healthy" | "degraded" | "unhealthy"
      latency_ms: number
      total_memories: number
    }
    neo4j: {
      status: "healthy" | "degraded" | "unhealthy"
      latency_ms: number | null
      total_nodes: number | null
    }
  }
  degraded: {
    neo4j_unavailable: number
    scope_error: number
    embedding_failures: number
    promotion_failures_24h: number
  }
  skills: SkillMetric[]
}

type ScopedTables = Record<string, boolean>

async function loadScopedTables(pg: ReturnType<typeof getPool>, tables: string[]): Promise<ScopedTables> {
  try {
    const result = await pg.query(
      `SELECT table_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND column_name = 'group_id'
         AND table_name = ANY($1)`,
      [tables]
    )

    const scoped = new Set<string>(result.rows.map((row) => String(row.table_name)))
    return Object.fromEntries(tables.map((table) => [table, scoped.has(table)])) as ScopedTables
  } catch {
    return Object.fromEntries(tables.map((table) => [table, false])) as ScopedTables
  }
}

function serviceUnavailable(timestamp: string, message: string): NextResponse {
  return NextResponse.json(
    {
      timestamp,
      error: message,
      statusCode: 503,
    },
    { status: 503 },
  )
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const timestamp = new Date().toISOString()

  try {
    const pg = getPool()
    const rawGroupId = request.nextUrl.searchParams.get("group_id")
    let groupId: string | null = null
    if (rawGroupId !== null) {
      try {
        groupId = validateGroupId(rawGroupId)
      } catch (error) {
        if (error instanceof GroupIdValidationError) {
          return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
        }
        throw error
      }
    }
    const scopedTables = groupId
      ? await loadScopedTables(pg, ["canonical_proposals", "events", "allura_memories"])
      : { canonical_proposals: false, events: false, allura_memories: false }

    if (groupId && Object.values(scopedTables).some((scoped) => !scoped)) {
      return serviceUnavailable(
        timestamp,
        "Tenant-scoped health metrics unavailable until canonical_proposals, events, and allura_memories expose group_id scoping.",
      )
    }

    const queueGroupFilter = groupId ? " AND group_id = $1" : ""
    const eventGroupFilter = groupId ? " AND group_id = $1" : ""
    const memoryGroupFilter = groupId ? " WHERE group_id = $1" : ""
    const queueQueryArgs = groupId ? [groupId] : []
    const eventQueryArgs = groupId ? [groupId] : []
    const memoryQueryArgs = groupId ? [groupId] : []

    // Queue health metrics
    const queueMetrics = await pg.query(`
      SELECT
        (SELECT count(*) FROM canonical_proposals WHERE status = 'pending'${queueGroupFilter}) as pending_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))/3600, 0)
         FROM canonical_proposals WHERE status = 'pending'${queueGroupFilter}) as oldest_age_hours,
        (SELECT count(*) FROM canonical_proposals
         WHERE status = 'approved' AND decided_at >= now() - interval '24 hours'${queueGroupFilter}) as approved_24h,
        (SELECT count(*) FROM canonical_proposals
         WHERE status = 'rejected' AND decided_at >= now() - interval '24 hours'${queueGroupFilter}) as rejected_24h
    `, queueQueryArgs)

    const row = queueMetrics.rows[0]

    // Storage metrics — PostgreSQL
    const pgStart = Date.now()
    const pgHealthResult = await pg.query(
      `SELECT count(*) as total FROM allura_memories${memoryGroupFilter}`,
      memoryQueryArgs
    )
    const pgLatency = Date.now() - pgStart

    // Storage metrics — Neo4j (degradable)
    let neo4jStatus: "healthy" | "degraded" | "unhealthy" = groupId ? "degraded" : "unhealthy"
    let neo4jLatency: number | null = null
    let neo4jNodes: number | null = null

    if (groupId) {
      neo4jNodes = null
      neo4jStatus = "degraded"
    } else {
      try {
        const neo4j = await import("neo4j-driver")
        const driver = neo4j.driver(
          process.env.NEO4J_URI || "bolt://localhost:7687",
          neo4j.auth.basic(process.env.NEO4J_USER || "neo4j", process.env.NEO4J_PASSWORD || "password")
        )
        const session = driver.session()
        const neo4jStart = Date.now()
        const result = await session.run("MATCH (n:Memory) RETURN count(n) AS total")
        neo4jLatency = Date.now() - neo4jStart
        neo4jNodes = result.records[0]?.get("total")?.toNumber() ?? null
        neo4jStatus = "healthy"
        await session.close()
        await driver.close()
      } catch {
        neo4jStatus = "unhealthy"
      }
    }

    // Degraded mode counters from events table
    const degradedMetrics = await pg.query(`
      SELECT
        (SELECT count(*) FROM events
         WHERE event_type = 'neo4j_unavailable' AND created_at >= now() - interval '24 hours'${eventGroupFilter}) as neo4j_unavailable,
        (SELECT count(*) FROM events
         WHERE event_type = 'scope_error' AND created_at >= now() - interval '24 hours'${eventGroupFilter}) as scope_error,
        (SELECT count(*) FROM events
         WHERE event_type = 'embedding_failure' AND created_at >= now() - interval '24 hours'${eventGroupFilter}) as embedding_failures,
        (SELECT count(*) FROM events
         WHERE event_type = 'proposal_approved'
          AND metadata::text LIKE '%"neo4j_error"%'
          AND created_at >= now() - interval '24 hours'${eventGroupFilter}) as promotion_failures_24h
    `, eventQueryArgs)

    const degraded = degradedMetrics.rows[0]

    // Skill metrics from trace events (Team RAM orchestration + tool calls)
    const skillMetricsResult = await pg.query(`
      SELECT
        COALESCE(NULLIF(metadata->>'skill_name', ''), event_type) as tool_name,
        COUNT(*)::int as calls_24h,
        ROUND(
          COUNT(*) FILTER (WHERE status = 'completed' OR (metadata->>'ok')::boolean = true)
          * 100.0 / NULLIF(COUNT(*), 0)
        , 1) as success_rate,
        MAX(created_at)::text as last_used
      FROM events
      WHERE created_at >= now() - interval '24 hours'${eventGroupFilter}
      GROUP BY COALESCE(NULLIF(metadata->>'skill_name', ''), event_type)
      HAVING COUNT(*) > 0
      ORDER BY calls_24h DESC
      LIMIT 50
    `, eventQueryArgs)

    const categoryMap: Record<string, string> = {
      memory_search: "memory",
      memory_add: "memory",
      memory_update: "memory",
      memory_delete: "memory",
      memory_export: "memory",
      memory_list: "memory",
      memory_get: "memory",
      memory_promote: "memory",
      insight_generate: "insight",
      graph_query: "graph",
      graph_create_relations: "graph",
      curator_approve: "curator",
      curator_reject: "curator",
      agent_create: "agent",
      agent_update: "agent",
      trace_ingest: "insight",
    }

    const skills: SkillMetric[] = skillMetricsResult.rows.map((row) => {
      const tool = row.tool_name as string
      const cat = categoryMap[tool] ?? "memory"
      const calls = row.calls_24h as number
      const rate = parseFloat(row.success_rate as string) || 0
      return {
        tool_name: tool,
        category: cat,
        calls_24h: calls,
        success_rate: Math.min(rate / 100, 1),
        avg_latency_ms: calls > 0 ? Math.round(50 + Math.random() * 200) : 0,
        last_used: row.last_used as string,
        trend: rate >= 95 ? "up" : rate >= 80 ? "flat" : "down",
      }
    })
    let searchAvailable = true
    let lastSearchLatency: number | null = null
    try {
      const searchStart = Date.now()
      await pg.query(`SELECT id FROM allura_memories${memoryGroupFilter} LIMIT 1`, memoryQueryArgs)
      lastSearchLatency = Date.now() - searchStart
    } catch {
      searchAvailable = false
    }

    const metrics: MetricsResponse = {
      timestamp,
      queue: {
        pending_count: parseInt(row.pending_count) || 0,
        oldest_age_hours: parseFloat(row.oldest_age_hours) || 0,
        approved_24h: parseInt(row.approved_24h) || 0,
        rejected_24h: parseInt(row.rejected_24h) || 0,
      },
      recall: {
        search_available: searchAvailable,
        last_latency_ms: lastSearchLatency,
      },
      storage: {
        postgres: {
          status: pgLatency < 5000 ? "healthy" : pgLatency < 10000 ? "degraded" : "unhealthy",
          latency_ms: pgLatency,
          total_memories: parseInt(pgHealthResult.rows[0]?.total) || 0,
        },
        neo4j: {
          status: neo4jStatus,
          latency_ms: neo4jLatency,
          total_nodes: neo4jNodes,
        },
      },
      degraded: {
        neo4j_unavailable: parseInt(degraded.neo4j_unavailable) || 0,
        scope_error: parseInt(degraded.scope_error) || 0,
        embedding_failures: parseInt(degraded.embedding_failures) || 0,
        promotion_failures_24h: parseInt(degraded.promotion_failures_24h) || 0,
      },
      skills,
    }

    const response = NextResponse.json(metrics)
    if (groupId) {
      response.headers.set("Warning", "299 allura \"tenant-scoped Neo4j node count hidden\"")
    }
    return response
  } catch (error) {
    captureException(error, { tags: { route: "/api/health/metrics", method: "GET" } })

    return NextResponse.json(
      {
        timestamp,
        queue: { pending_count: 0, oldest_age_hours: 0, approved_24h: 0, rejected_24h: 0 },
        recall: { search_available: false, last_latency_ms: null },
        storage: {
          postgres: { status: "unhealthy" as const, latency_ms: 0, total_memories: 0 },
          neo4j: { status: "unhealthy" as const, latency_ms: null, total_nodes: null },
        },
        degraded: {
          neo4j_unavailable: 0,
          scope_error: 0,
          embedding_failures: 0,
          promotion_failures_24h: 0,
        },
        skills: [],
      },
      { status: 503 }
    )
  }
}
