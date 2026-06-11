/**
 * POST /api/mcp-catalog/deny
 *
 * Deny a tool candidate, logging the denial as a ToolApproval event.
 */

import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"
import { denyCandidate } from "@/lib/mcp-catalog/registry"
import { captureException } from "@/lib/observability/sentry"

export async function POST(request: NextRequest) {
  const auth = await withPermission(request, "memory:write", "admin")
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const { candidate_id, decided_by, rationale } = body

    if (!candidate_id) {
      return NextResponse.json({ error: "candidate_id is required" }, { status: 400 })
    }
    if (!decided_by) {
      return NextResponse.json({ error: "decided_by is required" }, { status: 400 })
    }

    const approval = await denyCandidate(candidate_id, decided_by, rationale || `Denied by ${decided_by}`)

    return NextResponse.json({ approval })
  } catch (error) {
    if (error instanceof Error && (error.message.includes("not found") || error.message.includes("already"))) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    captureException(error, { tags: { route: "/api/mcp-catalog/deny", method: "POST" } })
    return NextResponse.json({ error: "Failed to deny candidate" }, { status: 500 })
  }
}