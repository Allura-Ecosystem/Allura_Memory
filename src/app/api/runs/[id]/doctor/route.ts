/**
 * Process Engine — Run Doctor API
 *
 * GET /api/runs/:id/doctor?group_id=X — get health findings for a run. Role: admin.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or this route returns 404.
 *
 * Query params:
 * - group_id: Required tenant identifier (must match allura-* pattern)
 *
 * Delegates to diagnoseRun() which checks 3 conditions:
 *   stale              — active run with no recent events
 *   revision_drifted   — run pinned to an old definition revision
 *   partially_persisted — snapshot status contradicts latest event
 *
 * Returns an empty findings array when the run is healthy.
 * The doctor module is READ-ONLY — no state mutations occur.
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { diagnoseRun } from "@/lib/process-engine/doctor"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── GET /api/runs/:id/doctor ──────────────────────────────────────────────────

export async function GET(
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
    const findings = await diagnoseRun(pool, { runId: id, groupId: validatedGroupId })

    return NextResponse.json({ findings }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/runs/[id]/doctor", method: "GET" } })
    console.error("Failed to diagnose run:", error)
    return NextResponse.json({ error: "Failed to diagnose run" }, { status: 500 })
  }
}
