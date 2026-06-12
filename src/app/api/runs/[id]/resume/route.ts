/**
 * Process Engine — Resume Run API
 *
 * POST /api/runs/:id/resume — resume a paused run after checkpoint approval.
 * Role: curator.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or this route returns 404.
 *
 * Body params:
 * - group_id:    Required tenant identifier (must match allura-* pattern)
 * - approved_by: Required — audit-grade attribution for who approved the checkpoint.
 *                MANDATORY: do not accept requests without this field.
 *
 * Write order (events-first):
 *   1. INSERT checkpoint_resumed event with approved_by in metadata
 *   2. UPDATE process_runs snapshot status → "running"
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

// ── POST /api/runs/:id/resume ─────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Process engine is not enabled" }, { status: 404 })
  }

  const roleCheck = requireRole(request, "curator")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { id } = await params
    const body = await request.json() as {
      group_id?: unknown
      approved_by?: unknown
    }

    const { group_id, approved_by } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    if (!approved_by || typeof approved_by !== "string") {
      return NextResponse.json({ error: "approved_by is required" }, { status: 400 })
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

    if (run.status !== "paused") {
      return NextResponse.json(
        { error: `Run cannot be resumed: current status is "${run.status}" (expected "paused")` },
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
        "checkpoint_resumed",
        validatedGroupId,
        JSON.stringify({
          process_id: id,
          approved_by,
          resumed_at: now,
        }),
      ],
    )

    // Update snapshot — optimistic concurrency via updated_at
    const updatedRun = await updateRunSnapshot(pool, {
      id,
      groupId: validatedGroupId,
      status: "running",
      stateJson: {
        ...(run.state_json as Record<string, unknown>),
        status: "running",
        updatedAt: now,
      },
      expectedUpdatedAt: run.updated_at,
    })

    if (updatedRun === null) {
      return NextResponse.json(
        { error: "Concurrent modification detected — please retry" },
        { status: 409 },
      )
    }

    return NextResponse.json({ run: updatedRun }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/runs/[id]/resume", method: "POST" } })
    console.error("Failed to resume run:", error)
    return NextResponse.json({ error: "Failed to resume run" }, { status: 500 })
  }
}
