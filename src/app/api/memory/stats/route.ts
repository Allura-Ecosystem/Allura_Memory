import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction";

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
  const groupId = roleCheck.user.groupId;
  const workspaceId = roleCheck.user.workspaceId;
  if (!workspaceId) return unauthorizedResponse("Authenticated workspace scope is required");
  if ((searchParams.has("group_id") && searchParams.get("group_id") !== groupId)
      || (searchParams.has("workspace_id") && searchParams.get("workspace_id") !== workspaceId)) {
    return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 });
  }
  const userId = searchParams.get("user_id") || null;

  try {
    const [pgStats, pgIds, graphResult] = await withWorkspaceTransaction({ tenantId: groupId,
      workspaceId, principalId: roleCheck.user.id }, (db) => Promise.all([
      // Combined PG aggregation
      db.query<{ episodic_count: string; search_count: string; last_activity: Date | null }>(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'memory_add')    AS episodic_count,
           COUNT(*) FILTER (WHERE event_type = 'memory_search') AS search_count,
           MAX(created_at)                                       AS last_activity
         FROM events
         WHERE group_id = $1 AND workspace_id = $2
           AND ($3::text IS NULL OR metadata->>'user_id' = $3)`,
        [groupId, workspaceId, userId],
      ),
      // PG memory IDs for dedup
      db.query<{ id: string | null }>(
        `SELECT metadata->>'memory_id' AS id
         FROM events
         WHERE group_id = $1 AND workspace_id = $2
           AND event_type = 'memory_add'
           AND ($3::text IS NULL OR metadata->>'user_id' = $3)`,
        [groupId, workspaceId, userId],
      ),
      // graph_memories: active (non-deprecated) memory nodes
      db.query<{ id: string }>(
        `SELECT id FROM graph_memories
         WHERE group_id = $1 AND workspace_id = $2
           AND ($3::text IS NULL OR user_id = $3)
           AND deprecated = false`,
        [groupId, workspaceId, userId],
      ),
    ]));

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
