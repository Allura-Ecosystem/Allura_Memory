import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Projects endpoint — stubbed during dashboard reset.
 * Previously loaded project summaries for Mission Control telemetry.
 * Will be reimplemented with new dashboard design.
 */

export async function GET() {
  return NextResponse.json({ projects: [] })
}
