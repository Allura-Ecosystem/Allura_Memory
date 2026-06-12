import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { getExecutionOverview } from "@/server/actions/execution-view"

// Always render live — never statically cache execution state.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const group_id = searchParams.get("group_id") ?? "allura-system"

  const overview = await getExecutionOverview(group_id)

  return NextResponse.json(overview, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
