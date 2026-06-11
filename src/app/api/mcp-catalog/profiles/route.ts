/**
 * GET /api/mcp-catalog/profiles
 *
 * List all active tool profiles.
 */

import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"
import { listProfiles } from "@/lib/mcp-catalog/registry"
import { captureException } from "@/lib/observability/sentry"

export async function GET(request: NextRequest) {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth

  try {
    const profiles = await listProfiles()
    return NextResponse.json({ profiles, count: profiles.length })
  } catch (error) {
    captureException(error, { tags: { route: "/api/mcp-catalog/profiles", method: "GET" } })
    return NextResponse.json({ error: "Failed to list profiles" }, { status: 500 })
  }
}