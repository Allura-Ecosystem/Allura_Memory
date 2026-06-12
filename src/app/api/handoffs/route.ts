/**
 * Work Plane — Handoffs API
 *
 * GET  /api/handoffs?group_id=X&to_actor_id=X — list pending handoffs. Role: viewer.
 * POST /api/handoffs                           — create handoff. Role: curator.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or both methods return 404.
 *
 * Query params (GET):
 * - group_id:    Required tenant identifier
 * - to_actor_id: Optional filter — only return handoffs for this recipient actor
 *
 * Body params (POST):
 * - group_id:      Required tenant identifier
 * - from_actor_id: Required originating actor
 * - to_actor_id:   Required recipient actor
 * - message:       Optional handoff message
 * - work_item_id:  Optional work item association
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { createHandoff, listPendingHandoffs } from "@/lib/work-plane/handoff-manager"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── GET /api/handoffs ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
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

    const toActorId = searchParams.get("to_actor_id") ?? undefined

    const pool = getPool()
    const handoffs = await listPendingHandoffs(pool, {
      groupId: validatedGroupId,
      toActorId,
    })

    return NextResponse.json({ handoffs }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/handoffs", method: "GET" } })
    console.error("Failed to list handoffs:", error)
    return NextResponse.json({ error: "Failed to list handoffs" }, { status: 500 })
  }
}

// ── POST /api/handoffs ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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
    const body = await request.json() as {
      group_id?: unknown
      from_actor_id?: unknown
      to_actor_id?: unknown
      message?: unknown
      work_item_id?: unknown
    }

    const { group_id, from_actor_id, to_actor_id, message, work_item_id } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    if (!from_actor_id || typeof from_actor_id !== "string") {
      return NextResponse.json({ error: "from_actor_id is required" }, { status: 400 })
    }
    if (!to_actor_id || typeof to_actor_id !== "string") {
      return NextResponse.json({ error: "to_actor_id is required" }, { status: 400 })
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
    const handoff = await createHandoff(pool, {
      id: crypto.randomUUID(),
      groupId: validatedGroupId,
      fromActorId: from_actor_id,
      toActorId: to_actor_id,
      message: typeof message === "string" ? message : undefined,
      workItemId: typeof work_item_id === "string" ? work_item_id : undefined,
    })

    return NextResponse.json({ handoff }, { status: 201 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/handoffs", method: "POST" } })
    console.error("Failed to create handoff:", error)
    return NextResponse.json({ error: "Failed to create handoff" }, { status: 500 })
  }
}
