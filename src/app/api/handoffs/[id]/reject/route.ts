/**
 * Work Plane — Handoff Reject API
 *
 * POST /api/handoffs/:id/reject — reject a pending handoff. Role: curator.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or the method returns 404.
 *
 * Body params:
 * - group_id: Required tenant identifier
 *
 * Returns:
 * - 200 with updated handoff on success
 * - 404 if the handoff does not exist
 * - 409 if the handoff is not in pending status (already acknowledged or rejected)
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { getHandoff, rejectHandoff } from "@/lib/work-plane/handoff-manager"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── POST /api/handoffs/:id/reject ─────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Process engine is not enabled" }, { status: 404 })
  }

  const roleCheck = requireRole(request, "curator")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { id } = await params
    const body = await request.json() as { group_id?: unknown }
    const { group_id } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(group_id)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const pool = getPool()

    // Check existence before attempting rejection to give accurate 404 vs 409
    const existing = await getHandoff(pool, { id, groupId: validatedGroupId })
    if (existing === null) {
      return NextResponse.json({ error: "Handoff not found" }, { status: 404 })
    }

    const handoff = await rejectHandoff(pool, { id, groupId: validatedGroupId })

    if (handoff === null) {
      // rejectHandoff only operates on status='pending' — the handoff exists
      // but is no longer pending, so this is a conflict.
      return NextResponse.json(
        { error: `Handoff is not pending — current status: ${existing.status}` },
        { status: 409 },
      )
    }

    return NextResponse.json({ handoff }, { status: 200 })
  } catch (error) {
    captureException(error, {
      tags: { route: "/api/handoffs/[id]/reject", method: "POST" },
    })
    console.error("Failed to reject handoff:", error)
    return NextResponse.json({ error: "Failed to reject handoff" }, { status: 500 })
  }
}
