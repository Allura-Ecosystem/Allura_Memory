import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth";
import { getPool } from "@/lib/postgres/connection";
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id";

/**
 * GET /api/memory/count
 *
 * Returns the total count of unique active memories for a tenant.
 * Queries PostgreSQL (episodic events + graph_memories), deduplicates,
 * and returns the merged count.
 *
 * Query params:
 *   group_id  — required
 *   user_id   — optional; omit for all users
 */
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
    const [pgResult, graphResult] = await Promise.all([
      // PostgreSQL: Get all memory IDs (episodic layer)
      getPool().query<{ id: string }>(
        `SELECT metadata->>'memory_id' AS id
         FROM events
         WHERE group_id = $1
           AND event_type = 'memory_add'
           AND ($2::text IS NULL OR metadata->>'user_id' = $2)`,
        [groupId, userId],
      ),

      // graph_memories: Get all memory IDs (semantic layer, non-deprecated)
      getPool().query<{ id: string }>(
        `SELECT id FROM graph_memories
         WHERE group_id = $1
           AND ($2::text IS NULL OR user_id = $2)
           AND deprecated = false`,
        [groupId, userId],
      ),
    ]);

    // Deduplicate: Create a Set of all unique memory IDs
    const uniqueIds = new Set<string>();
    pgResult.rows.forEach((row: { id: string | null }) => {
      if (row.id) uniqueIds.add(row.id);
    });
    graphResult.rows.forEach((row: { id: string | null }) => {
      if (row.id) uniqueIds.add(row.id);
    });

    return NextResponse.json({ count: uniqueIds.size });
  } catch (error) {
    console.error("memory_count error:", error);
    return NextResponse.json({ error: "Failed to count memories" }, { status: 500 });
  }
}