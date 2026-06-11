import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"

export const dynamic = "force-dynamic"

/**
 * Projects endpoint — stubbed during dashboard reset.
 * Previously loaded project summaries for Mission Control telemetry.
 * Will be reimplemented with new dashboard design.
 */

export async function GET(request: NextRequest) {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof NextResponse) return auth

  return NextResponse.json({ projects: [] })
}
