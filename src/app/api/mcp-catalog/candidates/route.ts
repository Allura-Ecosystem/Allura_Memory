/**
 * GET /api/mcp-catalog/candidates
 *
 * List tool candidates, optionally filtered by status.
 */

import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"
import { listCandidates } from "@/lib/mcp-catalog/registry"
import { captureException } from "@/lib/observability/sentry"

export async function GET(request: NextRequest) {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") as "candidate" | "approved" | "denied" | "deprecated" | null

    const candidates = await listCandidates(status || undefined)
    return NextResponse.json({ candidates, count: candidates.length })
  } catch (error) {
    captureException(error, { tags: { route: "/api/mcp-catalog/candidates", method: "GET" } })
    return NextResponse.json({ error: "Failed to list candidates" }, { status: 500 })
  }
}