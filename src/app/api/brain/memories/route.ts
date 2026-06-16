import { NextRequest, NextResponse } from "next/server"
import { brainClient } from "@/lib/brain-client"

export const dynamic = "force-dynamic"

const GROUP_ID = "allura-system"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("user_id") ?? "ronin704"
  const limit = Number(searchParams.get("limit")) || 50
  const offset = Number(searchParams.get("offset")) || 0
  const sort = searchParams.get("sort") ?? "created_at_desc"

  try {
    const result = await brainClient.listMemories(GROUP_ID, userId, {
      limit,
      offset,
      sort,
    })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brain list failed"
    return NextResponse.json({ error: message, memories: [], total: 0 }, { status: 502 })
  }
}
