/**
 * Work Plane — Work Items API
 *
 * GET  /api/work-items?group_id=X&project_id=X&status=X&lane_id=X — list work items. Role: viewer.
 * POST /api/work-items                                              — create work item. Role: curator.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or both methods return 404.
 *
 * Query params (GET):
 * - group_id:   Required tenant identifier
 * - project_id: Required project filter
 * - status:     Optional status filter
 * - lane_id:    Optional lane filter
 *
 * Body params (POST):
 * - group_id:            Required tenant identifier
 * - project_id:          Required project association
 * - title:               Required work item title
 * - description:         Optional description
 * - priority:            Optional priority (default: medium)
 * - owner_id:            Optional owner actor ID
 * - lane_id:             Optional lane ID
 * - acceptance_criteria: Optional acceptance criteria array
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { createWorkItem, listWorkItems } from "@/lib/work-plane/work-item-manager"
import type { WorkItemStatus } from "@/lib/work-plane/types"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── GET /api/work-items ───────────────────────────────────────────────────────

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
    const projectId = searchParams.get("project_id")

    if (!groupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 })
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

    const statusParam = searchParams.get("status")
    const laneId = searchParams.get("lane_id") ?? undefined

    const pool = getPool()
    const workItems = await listWorkItems(pool, {
      projectId,
      groupId: validatedGroupId,
      status: statusParam ? (statusParam as WorkItemStatus) : undefined,
      laneId,
    })

    return NextResponse.json({ work_items: workItems }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/work-items", method: "GET" } })
    console.error("Failed to list work items:", error)
    return NextResponse.json({ error: "Failed to list work items" }, { status: 500 })
  }
}

// ── POST /api/work-items ──────────────────────────────────────────────────────

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
      project_id?: unknown
      title?: unknown
      description?: unknown
      priority?: unknown
      owner_id?: unknown
      lane_id?: unknown
      acceptance_criteria?: unknown
    }

    const {
      group_id,
      project_id,
      title,
      description,
      priority,
      owner_id,
      lane_id,
      acceptance_criteria,
    } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    if (!project_id || typeof project_id !== "string") {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 })
    }
    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 })
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
    const workItem = await createWorkItem(pool, {
      id: crypto.randomUUID(),
      projectId: project_id,
      groupId: validatedGroupId,
      title,
      description: typeof description === "string" ? description : undefined,
      priority: typeof priority === "string" ? (priority as "critical" | "high" | "medium" | "low") : undefined,
      ownerId: typeof owner_id === "string" ? owner_id : undefined,
      laneId: typeof lane_id === "string" ? lane_id : undefined,
      acceptanceCriteria: Array.isArray(acceptance_criteria) ? acceptance_criteria : undefined,
    })

    return NextResponse.json({ work_item: workItem }, { status: 201 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/work-items", method: "POST" } })
    console.error("Failed to create work item:", error)
    return NextResponse.json({ error: "Failed to create work item" }, { status: 500 })
  }
}
