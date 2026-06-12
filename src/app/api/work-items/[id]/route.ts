/**
 * Work Plane — Work Item by ID API
 *
 * GET /api/work-items/:id?group_id=X — get work item. Role: viewer.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or the method returns 404.
 *
 * Query params:
 * - group_id: Required tenant identifier
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { getWorkItem } from "@/lib/work-plane/work-item-manager"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── GET /api/work-items/:id ───────────────────────────────────────────────────

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
    const workItem = await getWorkItem(pool, { id, groupId: validatedGroupId })

    if (workItem === null) {
      return NextResponse.json({ error: "Work item not found" }, { status: 404 })
    }

    return NextResponse.json({ work_item: workItem }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/work-items/[id]", method: "GET" } })
    console.error("Failed to get work item:", error)
    return NextResponse.json({ error: "Failed to get work item" }, { status: 500 })
  }
}
