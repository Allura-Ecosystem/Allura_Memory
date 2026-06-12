/**
 * Process Engine — Cancel Run API
 *
 * POST /api/runs/:id/cancel — cancel an active run. Role: admin.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or this route returns 404.
 *
 * Body params:
 * - group_id: Required tenant identifier (must match allura-* pattern)
 *
 * Cannot cancel runs that are already in a terminal state ("completed" or "failed").
 *
 * Write order (events-first):
 *   1. INSERT process_failed event with { reason: "cancelled" } in metadata
 *   2. UPDATE process_runs snapshot status → "failed"
 *
 * Returns 409 Conflict when the optimistic lock check fails (concurrent write).
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { getRun, updateRunSnapshot } from "@/lib/process-engine/run-manager"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── POST /api/runs/:id/cancel ─────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Process engine is not enabled" }, { status: 404 })
  }

  const roleCheck = requireRole(request, "admin")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { id } = await params
    const body = await request.json() as { group_id?: unknown }
    const { group_id } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(group_id)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const pool = getPool()

    // Fetch current run snapshot
    const run = await getRun(pool, { id, groupId: validatedGroupId })
    if (run === null) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 })
    }

    if (run.status === "completed" || run.status === "failed") {
      return NextResponse.json(
        { error: `Run cannot be cancelled: already in terminal state "${run.status}"` },
        { status: 409 },
      )
    }

    const now = new Date().toISOString()

    // Events-first write order: INSERT event before updating snapshot
    await pool.query(
      `INSERT INTO events (agent_id, event_type, group_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        "process-engine",
        "process_failed",
        validatedGroupId,
        JSON.stringify({
          process_id: id,
          reason: "cancelled",
          cancelled_at: now,
        }),
      ],
    )

    // Update snapshot — optimistic concurrency via updated_at
    const updatedRun = await updateRunSnapshot(pool, {
      id,
      groupId: validatedGroupId,
      status: "failed",
      stateJson: {
        ...(run.state_json as Record<string, unknown>),
        status: "failed",
        error: "cancelled",
        updatedAt: now,
      },
      expectedUpdatedAt: run.updated_at,
      completedAt: now,
    })

    if (updatedRun === null) {
      return NextResponse.json(
        { error: "Concurrent modification detected — please retry" },
        { status: 409 },
      )
    }

    return NextResponse.json({ run: updatedRun }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/runs/[id]/cancel", method: "POST" } })
    console.error("Failed to cancel run:", error)
    return NextResponse.json({ error: "Failed to cancel run" }, { status: 500 })
  }
}
