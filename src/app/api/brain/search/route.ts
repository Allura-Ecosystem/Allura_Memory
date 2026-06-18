import { NextRequest, NextResponse } from "next/server"
import { brainClient } from "@/lib/brain-client"

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? searchParams.get("query") ?? ""
  const limit = Number(searchParams.get("limit")) || 10
  const userId = searchParams.get("user_id") ?? undefined

  if (!query.trim()) {
    return NextResponse.json({ results: [], count: 0, latency_ms: 0 })
  }

  try {
    const result = await brainClient.searchMemories(query, GROUP_ID, {
      limit,
      userId,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brain search failed"
    return NextResponse.json({ error: message, results: [], count: 0 }, { status: 502 })
  }
}
