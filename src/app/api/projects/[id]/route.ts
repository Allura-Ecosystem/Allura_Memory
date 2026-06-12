/**
 * Work Plane — Project by ID API
 *
 * GET   /api/projects/:id?group_id=X — get project. Role: viewer.
 * PATCH /api/projects/:id            — update project. Role: admin.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or both methods return 404.
 *
 * Query params (GET):
 * - group_id: Required tenant identifier
 *
 * Body params (PATCH):
 * - group_id:            Required tenant identifier
 * - name:                Optional updated name
 * - description:         Optional updated description
 * - status:              Optional updated status
 * - expected_updated_at: Required for optimistic concurrency; returns 409 on stale
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { getProject, updateProject } from "@/lib/work-plane/project-manager"
import type { ProjectStatus } from "@/lib/work-plane/types"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── GET /api/projects/:id ─────────────────────────────────────────────────────

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
    const project = await getProject(pool, { id, groupId: validatedGroupId })

    if (project === null) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    return NextResponse.json({ project }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/projects/[id]", method: "GET" } })
    console.error("Failed to get project:", error)
    return NextResponse.json({ error: "Failed to get project" }, { status: 500 })
  }
}

// ── PATCH /api/projects/:id ───────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Process engine is not enabled" }, { status: 404 })
  }

  const roleCheck = requireRole(request, "admin")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { id } = await params
    const body = await request.json() as {
      group_id?: unknown
      name?: unknown
      description?: unknown
      status?: unknown
      expected_updated_at?: unknown
    }

    const { group_id, name, description, status, expected_updated_at } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    if (!expected_updated_at || typeof expected_updated_at !== "string") {
      return NextResponse.json({ error: "expected_updated_at is required" }, { status: 400 })
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
    const project = await updateProject(pool, {
      id,
      groupId: validatedGroupId,
      name: typeof name === "string" ? name : undefined,
      description: typeof description === "string" ? description : undefined,
      status: typeof status === "string" ? (status as ProjectStatus) : undefined,
      expectedUpdatedAt: expected_updated_at,
    })

    if (project === null) {
      return NextResponse.json(
        { error: "Update conflict — project was modified since last read" },
        { status: 409 },
      )
    }

    return NextResponse.json({ project }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/projects/[id]", method: "PATCH" } })
    console.error("Failed to update project:", error)
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 })
  }
}
