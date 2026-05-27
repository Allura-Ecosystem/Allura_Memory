/**
 * Legacy Curator Reject API
 *
 * POST /api/curator/reject is kept as a compatibility shim only.
 * All decisions delegate to the governed /api/curator/approve route so
 * rejection shares the same group scope, pending-state guard, audit receipt,
 * transaction, and durable Notion outbox behavior as approval.
 */

import { NextRequest } from "next/server"
import { POST as postCuratorDecision } from "@/app/api/curator/approve/route"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const delegatedUrl = new URL("/api/curator/approve", request.url)

  return postCuratorDecision(new NextRequest(delegatedUrl, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      ...body,
      decision: "reject",
    }),
  }))
}
