import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { readTransaction } from "@/lib/neo4j/connection";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

export interface MemoryStats {
  episodic_count: number;
  semantic_count: number | null;
  search_count: number;
  total_count: number;
  last_activity: string | null;
}

export async function GET(request: NextRequest) {
  const roleCheck = requireRole(request, "viewer");
  if (!roleCheck.user) return unauthorizedResponse();
  if (!roleCheck.allowed) return forbiddenResponse(roleCheck);

  const { searchParams } = new URL(request.url);
  const rawGroupId = searchParams.get("group_id");
  const userId = searchParams.get("user_id") || null;

  let groupId: string;
  try {
    groupId = validateGroupId(rawGroupId);
  } catch (err) {
    if (err instanceof GroupIdValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  try {
    const [pgStats, pgIds, neo4jResult] = await Promise.all([
      // Combined PG aggregation
      getPool().query<{ episodic_count: string; search_count: string; last_activity: Date | null }>(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'memory_add')    AS episodic_count,
           COUNT(*) FILTER (WHERE event_type = 'memory_search') AS search_count,
           MAX(created_at)                                       AS last_activity
         FROM events
         WHERE group_id = $1
           AND ($2::text IS NULL OR metadata->>'user_id' = $2)`,
        [groupId, userId],
      ),
      // PG memory IDs for dedup
      getPool().query<{ id: string | null }>(
        `SELECT metadata->>'memory_id' AS id
         FROM events
         WHERE group_id = $1
           AND event_type = 'memory_add'
           AND ($2::text IS NULL OR metadata->>'user_id' = $2)`,
        [groupId, userId],
      ),
      // Neo4j active Memory nodes
      readTransaction(async (tx) => {
        const result = await tx.run(
          `MATCH (m:Memory)
           WHERE m.group_id = $groupId
             AND ($userId IS NULL OR m.user_id = $userId)
             AND NOT (m)<-[:SUPERSEDES]-()
           RETURN m.id AS id`,
          { groupId, userId: userId ?? null },
        );
        return { ids: result.records.map((r: { get: (k: string) => string }) => r.get("id")) as string[] };
      }).catch((err) => {
        console.warn("[degraded] Neo4j unavailable in memory stats:", err);
        return { ids: null as string[] | null, degraded: true };
      }),
    ]);

    const uniqueIds = new Set<string>();
    pgIds.rows.forEach((r) => { if (r.id) uniqueIds.add(r.id); });

    let semantic_count: number | null = null;
    if (neo4jResult.ids !== null) {
      neo4jResult.ids.forEach((id) => { if (id) uniqueIds.add(id); });
      semantic_count = neo4jResult.ids.length;
    }

    const row = pgStats.rows[0];
    const degraded = neo4jResult.ids === null;
    const response = NextResponse.json({
      episodic_count: parseInt(row.episodic_count, 10),
      semantic_count,
      search_count: parseInt(row.search_count, 10),
      total_count: uniqueIds.size,
      last_activity: row.last_activity?.toISOString() ?? null,
    } satisfies MemoryStats);

    if (degraded) {
      response.headers.set("Warning", '299 Allura "neo4j_unavailable"');
      return new NextResponse(response.body, {
        status: 206,
        headers: response.headers,
      });
    }

    return response;
  } catch (error) {
    console.error("memory_stats error:", error);
    return NextResponse.json({ error: "Failed to fetch memory stats" }, { status: 500 });
  }
}
