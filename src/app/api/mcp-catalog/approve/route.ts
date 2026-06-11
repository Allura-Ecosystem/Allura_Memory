/**
 * POST /api/mcp-catalog/approve
 *
 * Approve a tool candidate, creating an ApprovedTool and adding it to profiles.
 */

import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"
import { approveCandidate } from "@/lib/mcp-catalog/registry"
import { captureException } from "@/lib/observability/sentry"

export async function POST(request: NextRequest) {
  const auth = await withPermission(request, "memory:write", "admin")
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { candidate_id, decided_by, rationale, profiles } = body

    if (!candidate_id) {
      return NextResponse.json({ error: "candidate_id is required" }, { status: 400 })
    }
    if (!decided_by) {
      return NextResponse.json({ error: "decided_by is required" }, { status: 400 })
    }

    const result = await approveCandidate(
      candidate_id,
      decided_by,
      rationale || `Approved by ${decided_by}`,
      profiles || []
    )

    return NextResponse.json({
      tool: result.tool,
      approval: result.approval,
    })
  } catch (error) {
    if (error instanceof Error && (error.message.includes("not found") || error.message.includes("already"))) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    captureException(error, { tags: { route: "/api/mcp-catalog/approve", method: "POST" } })
    return NextResponse.json({ error: "Failed to approve candidate" }, { status: 500 })
  }
}