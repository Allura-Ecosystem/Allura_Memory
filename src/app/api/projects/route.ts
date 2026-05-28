import { NextResponse } from "next/server"

import { loadProjectSummaries } from "@/lib/dashboard/project-queries"

export const dynamic = "force-dynamic"

/**
 * Dashboard-support endpoint for Mission Control project telemetry.
 * Public shape intentionally matches /api/agents: non-secret aggregate counts,
 * hard-scoped to allura-system, with no raw event metadata returned.
 */

export async function GET() {
  try {
    const projects = await loadProjectSummaries("allura-system")
    return NextResponse.json({ projects })
  } catch (error) {
    console.error("Failed to fetch dashboard projects:", error)
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 })
  }
}
