import { NextRequest, NextResponse } from "next/server"
import { type EventInsert, insertEvent } from "@/lib/postgres/queries/insert-trace"

/**
 * POST /api/trace — Internal trace endpoint for TraceMiddleware
 *
 * Accepts trace payloads from the Next.js middleware (Edge Runtime)
 * and writes them to PostgreSQL via the Node.js runtime connection pool.
 *
 * INTENTIONALLY INTERNAL-ONLY — NOT a public API.
 * This route exists solely so the Edge Runtime middleware can fire-and-forget
 * trace writes without importing pg directly. It is NOT protected by Clerk/RBAC
 * because the Edge middleware cannot attach auth headers to its own internal
 * calls. Instead, it is protected by the x-internal-trace: allura-trace-middleware
 * shared secret header. Any request missing that header receives 403.
 *
 * DO NOT add withPermission() or requireRole() guards here — doing so would
 * break the TraceMiddleware which has no mechanism to obtain a Clerk session token.
 */

interface TracePayload {
  group_id: string
  event_type: string
  agent_id: string
  metadata: Record<string, unknown>
  status: string
}

export async function POST(request: NextRequest) {
  // Guard: only accept internal calls from middleware
  const internalHeader = request.headers.get("x-internal-trace")
  if (internalHeader !== "allura-trace-middleware") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const payload: TracePayload = await request.json()

    // Validate required fields
    if (!payload.group_id || !payload.event_type || !payload.agent_id) {
      return NextResponse.json(
        { error: "Missing required fields: group_id, event_type, agent_id" },
        { status: 400 }
      )
    }

    const event: EventInsert = {
      group_id: payload.group_id,
      event_type: payload.event_type,
      agent_id: payload.agent_id,
      metadata: payload.metadata,
      status: (payload.status as EventInsert["status"]) ?? "completed",
    }

    await insertEvent(event)

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    // Don't let trace failures bubble up — log and return error
    console.error("[TraceEndpoint] Failed to write trace:", error)
    return NextResponse.json(
      { error: "Trace write failed" },
      { status: 500 }
    )
  }
}