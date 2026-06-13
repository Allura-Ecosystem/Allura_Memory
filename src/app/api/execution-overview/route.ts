/**
 * Execution Overview API
 *
 * GET /api/execution-overview?group_id=X — get execution overview. Role: viewer.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or the method returns 404.
 *
 * Query params:
 * - group_id: Required tenant identifier
 */

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getExecutionOverview } from "@/server/actions/execution-view"

// Always render live — never statically cache execution state.
export const dynamic = "force-dynamic"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── GET /api/execution-overview ───────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
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

  const overview = await getExecutionOverview(validatedGroupId)

  return NextResponse.json(overview, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
