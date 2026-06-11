/**
 * GDPR User Data Deletion Endpoint
 *
 * DELETE /api/memory/user/[userId]
 *
 * Soft-deletes all memories for a given user_id within the caller's group_id.
 * Requires `admin` role.
 *
 * Invariants enforced:
 * - Append-only: the PostgreSQL events table is never mutated. A
 *   `user_data_deletion_requested` event is appended for the audit trail.
 * - Neo4j nodes are marked as deprecated (via existing softDeleteMemory),
 *   not physically removed.
 * - group_id is derived from auth context (never from query params).
 *
 * SOC2 / GDPR reference: each deletion request is logged independently of
 * the underlying memory_delete events so auditors can reconstruct the
 * right-to-erasure workflow.
 */

import { NextRequest, NextResponse } from "next/server"
import { DatabaseQueryError, DatabaseUnavailableError } from "@/lib/errors/database-errors"
import { withPermission } from "@/lib/auth/api-auth"
import { getPool } from "@/lib/postgres/connection"
import { memory_delete } from "@/mcp/canonical-tools"
import type { GroupId, MemoryId } from "@/lib/memory/canonical-contracts"
import { validateGroupId, GroupIdValidationError } from "@/lib/validation/group-id"

// ── DELETE /api/memory/user/[userId] ─────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  // Auth: require admin role for user-scoped deletion (GDPR right-to-erasure)
  const authResult = await withPermission(request, "memory:delete", "admin")
  if (authResult instanceof NextResponse) return authResult

  const { groupId } = authResult
  const { userId } = await params

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId path parameter is required" }, { status: 400 })
  }

  // Validate group_id (derived from auth — defense-in-depth double-check)
  let validatedGroupId: string
  try {
    validatedGroupId = validateGroupId(groupId)
  } catch (err) {
    if (err instanceof GroupIdValidationError) {
      return NextResponse.json({ error: `Invalid group_id: ${err.message}` }, { status: 400 })
    }
    throw err
  }

  const requestedAt = new Date().toISOString()
  const pool = getPool()

  try {
    // 1. Find all non-deleted memory IDs for this user within the group.
    //    We query the events table for `memory_add` events by this user and
    //    exclude any already-deleted ones.
    const findResult = await pool.query<{ memory_id: string }>(
      `
      SELECT DISTINCT metadata->>'memory_id' AS memory_id
      FROM events
      WHERE group_id = $1
        AND metadata->>'user_id' = $2
        AND event_type = 'memory_add'
        AND metadata->>'memory_id' IS NOT NULL
        AND metadata->>'memory_id' NOT IN (
          SELECT metadata->>'memory_id'
          FROM events
          WHERE group_id = $1
            AND event_type = 'memory_delete'
            AND metadata->>'memory_id' IS NOT NULL
        )
      `,
      [validatedGroupId, userId],
    )

    const memoryIds = findResult.rows
      .map((r) => r.memory_id)
      .filter((id): id is string => Boolean(id))

    // 2. Append a single `user_data_deletion_requested` audit event — append-only.
    //    This event captures the intent and scope of the erasure request, separate
    //    from the individual memory_delete events that follow.
    await pool.query(
      `
      INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        validatedGroupId,
        "user_data_deletion_requested",
        "gdpr-endpoint",
        "in_progress",
        JSON.stringify({
          user_id: userId,
          memory_count: memoryIds.length,
          requested_at: requestedAt,
        }),
        requestedAt,
      ],
    )

    // 3. Soft-delete each memory — reuses canonical memory_delete which:
    //    - Appends a memory_delete event to PostgreSQL (append-only)
    //    - Marks the Neo4j node as deprecated (SUPERSEDES / :deprecated label)
    //    We iterate sequentially to avoid overwhelming the DB under load.
    const results: { memory_id: string; success: boolean; error?: string }[] = []

    for (const memoryId of memoryIds) {
      try {
        await memory_delete({
          id: memoryId as MemoryId,
          group_id: validatedGroupId as GroupId,
          user_id: userId,
        })
        results.push({ memory_id: memoryId, success: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ memory_id: memoryId, success: false, error: msg })
      }
    }

    const deletedCount = results.filter((r) => r.success).length
    const failedCount = results.filter((r) => !r.success).length

    // 4. Update the audit event status to reflect the final outcome.
    //    NOTE: We append a *new* completion event rather than mutating the
    //    in_progress event — maintaining the append-only invariant.
    const completedAt = new Date().toISOString()
    await pool.query(
      `
      INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        validatedGroupId,
        "user_data_deletion_completed",
        "gdpr-endpoint",
        failedCount === 0 ? "completed" : "partial",
        JSON.stringify({
          user_id: userId,
          deleted_count: deletedCount,
          failed_count: failedCount,
          requested_at: requestedAt,
          completed_at: completedAt,
        }),
        completedAt,
      ],
    )

    return NextResponse.json({
      user_id: userId,
      group_id: validatedGroupId,
      deleted_count: deletedCount,
      failed_count: failedCount,
      requested_at: requestedAt,
      completed_at: completedAt,
    })
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) {
      return NextResponse.json(
        { error: `Service temporarily unavailable: ${err.operation}`, operation: err.operation },
        { status: 503 },
      )
    }

    if (err instanceof DatabaseQueryError) {
      return NextResponse.json(
        { error: `Database query failed: ${err.operation}`, operation: err.operation },
        { status: 500 },
      )
    }

    console.error("GDPR user deletion error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
