import { NextResponse } from "next/server"
import { brainClient } from "@/lib/brain-client"

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

export async function GET(): Promise<NextResponse> {
  try {
    const report = await brainClient.healthReport(GROUP_ID)
    return NextResponse.json(report)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brain health check failed"
    return NextResponse.json(
      { error: message, overall_status: "unhealthy" as const },
      { status: 503 }
    )
  }
}
