import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

export interface MemoryStats {
  episodic_count: number;
  semantic_count: number;
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
    const [pgStats, pgIds, graphResult] = await Promise.all([
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
      // graph_memories: active (non-deprecated) memory nodes
      getPool().query<{ id: string }>(
        `SELECT id FROM graph_memories
         WHERE group_id = $1
           AND ($2::text IS NULL OR user_id = $2)
           AND deprecated = false`,
        [groupId, userId],
      ),
    ]);

    const uniqueIds = new Set<string>();
    pgIds.rows.forEach((r) => { if (r.id) uniqueIds.add(r.id); });
    graphResult.rows.forEach((r) => { if (r.id) uniqueIds.add(r.id); });

    const semantic_count = graphResult.rows.length;
    const row = pgStats.rows[0];

    return NextResponse.json({
      episodic_count: parseInt(row.episodic_count, 10),
      semantic_count,
      search_count: parseInt(row.search_count, 10),
      total_count: uniqueIds.size,
      last_activity: row.last_activity?.toISOString() ?? null,
    } satisfies MemoryStats);
  } catch (error) {
    console.error("memory_stats error:", error);
    return NextResponse.json({ error: "Failed to fetch memory stats" }, { status: 500 });
  }
}