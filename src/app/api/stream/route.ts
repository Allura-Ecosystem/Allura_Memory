/**
 * GET /api/stream?group_id=...
 * Server-Sent Events endpoint for live dashboard updates.
 * Requires viewer role — exposes tenant event counts and system health.
 */

import { type NextRequest } from "next/server"
import type { HealthResponse } from "@/app/api/health/route"
import { withPermission } from "@/lib/auth/api-auth"
import { getBreakerManager } from "@/lib/circuit-breaker/index"
import { getPool } from "@/lib/postgres/connection"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export interface BreakerStateEntry {
  name: string
  state: "closed" | "open" | "half_open"
}

export interface SnapshotPayload {
  type: "snapshot"
  health: HealthResponse | null
  totalMemories: number
  pendingCount: number
  breakerStates: BreakerStateEntry[]
}

async function collectSnapshot(groupId: string): Promise<SnapshotPayload> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"

  const [health, totalMemories, pendingCount, breakerStates] =
    await Promise.all([
      // Health via HTTP (health route creates its own DB connections)
      fetch(`${appUrl}/api/health?detailed=true`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : null))
        .catch(() => null),

      // Total memories via direct pool query
      getPool()
        .query<{ count: string }>(
          "SELECT COUNT(*) AS count FROM events WHERE group_id = $1",
          [groupId],
        )
        .then((r) => parseInt(r.rows[0]?.count ?? "0", 10))
        .catch(() => 0),

      // Pending curator proposals via direct pool query
      getPool()
        .query<{ count: string }>(
          "SELECT COUNT(*) AS count FROM canonical_proposals WHERE group_id = $1 AND status = 'pending'",
          [groupId],
        )
        .then((r) => parseInt(r.rows[0]?.count ?? "0", 10))
        .catch(() => 0),

      // Circuit breaker states — never throws
      (async (): Promise<BreakerStateEntry[]> => {
        try {
          const manager = getBreakerManager()
          return manager.getAllBreakers().map((entry) => ({
            name: entry.name,
            state: entry.state.state,
          }))
        } catch {
          return []
        }
      })(),
    ])

  return { type: "snapshot", health, totalMemories, pendingCount, breakerStates }
}

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await withPermission(request, "memory:read", "viewer")
  if (auth instanceof Response) return auth

  const { searchParams } = new URL(request.url)
  const groupId = auth.groupId || searchParams.get("group_id") || "allura-system"

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          // Controller already closed
        }
      }

      // Send initial snapshot immediately
      try {
        const snapshot = await collectSnapshot(groupId)
        send(`data: ${JSON.stringify(snapshot)}\n\n`)
      } catch {
        send(`data: ${JSON.stringify({ type: "snapshot", health: null, totalMemories: 0, pendingCount: 0, breakerStates: [] })}\n\n`)
      }

      // Ping every 15s to keep connection alive
      const pingInterval = setInterval(() => {
        send(`data: ${JSON.stringify({ type: "ping" })}\n\n`)
      }, 15_000)

      // Snapshot every 30s
      const snapshotInterval = setInterval(async () => {
        try {
          const snapshot = await collectSnapshot(groupId)
          send(`data: ${JSON.stringify(snapshot)}\n\n`)
        } catch {
          // Skip failed snapshots — client will retry
        }
      }, 30_000)

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval)
        clearInterval(snapshotInterval)
        try {
          controller.close()
        } catch {
          // Already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
