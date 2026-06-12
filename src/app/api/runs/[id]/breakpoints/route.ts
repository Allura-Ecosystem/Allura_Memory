/**
 * Process Engine — Active Breakpoints API
 *
 * GET /api/runs/:id/breakpoints?group_id=X — list active (unresolved) breakpoints.
 * Role: viewer.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or this route returns 404.
 *
 * Query params:
 * - group_id: Required tenant identifier (must match allura-* pattern)
 *
 * A breakpoint is active when a "checkpoint_blocked" event has been recorded for
 * a step but no subsequent "checkpoint_resumed" event exists for that same step_id.
 * This detects checkpoints that are still awaiting human approval.
 *
 * Returns a list of active breakpoints, each containing:
 * - step_id:    The step that is blocked
 * - blocked_at: When the checkpoint was blocked (ISO-8601)
 * - event_id:   The events.id of the checkpoint_blocked event
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── Breakpoint shape ──────────────────────────────────────────────────────────

interface ActiveBreakpoint {
  event_id: string
  step_id: string
  blocked_at: string
}

// ── GET /api/runs/:id/breakpoints ─────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Process engine is not enabled" }, { status: 404 })
  }

  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get("group_id")

    if (!groupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(groupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const pool = getPool()

    // Find checkpoint_blocked events that have no matching checkpoint_resumed for the same step_id.
    // Both events carry step_id in metadata and are scoped to this process run via process_id.
    const result = await pool.query<ActiveBreakpoint>(
      `SELECT
         blocked.id         AS event_id,
         blocked.metadata->>'step_id' AS step_id,
         blocked.created_at AS blocked_at
       FROM events AS blocked
       WHERE blocked.group_id = $1
         AND blocked.event_type = 'checkpoint_blocked'
         AND blocked.metadata->>'process_id' = $2
         AND NOT EXISTS (
           SELECT 1
           FROM events AS resumed
           WHERE resumed.group_id    = $1
             AND resumed.event_type  = 'checkpoint_resumed'
             AND resumed.metadata->>'process_id' = $2
             AND resumed.metadata->>'step_id'    = blocked.metadata->>'step_id'
             AND resumed.created_at > blocked.created_at
         )
       ORDER BY blocked.created_at ASC`,
      [validatedGroupId, id],
    )

    return NextResponse.json({ breakpoints: result.rows }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/runs/[id]/breakpoints", method: "GET" } })
    console.error("Failed to fetch breakpoints:", error)
    return NextResponse.json({ error: "Failed to fetch breakpoints" }, { status: 500 })
  }
}
