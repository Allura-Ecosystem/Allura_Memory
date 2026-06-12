/**
 * Process Engine — Runs API
 *
 * GET  /api/runs?group_id=X&status=Y — list runs for a tenant. Role: viewer.
 * POST /api/runs                      — start a new run. Role: admin.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or both methods return 404.
 *
 * Query params (GET):
 * - group_id: Required tenant identifier (must match allura-* pattern)
 * - status:   Optional ProcessStatus filter
 *
 * Body params (POST):
 * - group_id:             Required tenant identifier
 * - definition_id:        Required process definition ID to run
 * - definition_revision:  Optional specific revision to pin (latest used if omitted)
 * - actor_id:             Required actor who is starting the run
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { getDefinition, getLatestDefinition } from "@/lib/process-engine/definition-registry"
import { createRun, listRuns } from "@/lib/process-engine/run-manager"
import type { ProcessStatus, ProcessState } from "@/lib/process-engine/types"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── GET /api/runs ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "Process engine is not enabled" }, { status: 404 })
  }

  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get("group_id")

    if (!groupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(groupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const statusParam = searchParams.get("status")
    const status = statusParam as ProcessStatus | undefined

    const pool = getPool()
    const runs = await listRuns(pool, { groupId: validatedGroupId, status: status ?? undefined })

    return NextResponse.json({ runs }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/runs", method: "GET" } })
    console.error("Failed to list runs:", error)
    return NextResponse.json({ error: "Failed to list runs" }, { status: 500 })
  }
}

// ── POST /api/runs ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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
    const body = await request.json() as {
      group_id?: unknown
      definition_id?: unknown
      definition_revision?: unknown
      actor_id?: unknown
    }

    const { group_id, definition_id, definition_revision, actor_id } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    if (!definition_id || typeof definition_id !== "string") {
      return NextResponse.json({ error: "definition_id is required" }, { status: 400 })
    }
    if (!actor_id || typeof actor_id !== "string") {
      return NextResponse.json({ error: "actor_id is required" }, { status: 400 })
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

    // Look up the definition — use specific revision or latest
    let storedDefinition
    if (definition_revision !== undefined && typeof definition_revision === "number") {
      storedDefinition = await getDefinition(pool, {
        id: definition_id,
        revision: definition_revision,
        groupId: validatedGroupId,
      })
    } else {
      storedDefinition = await getLatestDefinition(pool, {
        id: definition_id,
        groupId: validatedGroupId,
      })
    }

    if (storedDefinition === null) {
      return NextResponse.json(
        { error: `Definition "${definition_id}" not found` },
        { status: 404 },
      )
    }

    const runId = crypto.randomUUID()
    const now = new Date().toISOString()

    const initialState: ProcessState = {
      processId: runId,
      definitionId: storedDefinition.id,
      definitionRevision: String(storedDefinition.revision),
      groupId: validatedGroupId,
      status: "pending",
      currentStepIndex: 0,
      stepStates: {},
      stepResults: {},
      startedAt: now,
      updatedAt: now,
    }

    const run = await createRun(pool, {
      id: runId,
      definitionId: storedDefinition.id,
      definitionRevision: storedDefinition.revision,
      groupId: validatedGroupId,
      actorId: actor_id,
      initialState,
    })

    return NextResponse.json({ run }, { status: 201 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/runs", method: "POST" } })
    console.error("Failed to start run:", error)
    return NextResponse.json({ error: "Failed to start run" }, { status: 500 })
  }
}
