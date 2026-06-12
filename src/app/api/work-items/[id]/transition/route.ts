/**
 * Work Plane — Work Item Transition API
 *
 * POST /api/work-items/:id/transition — transition work item status. Role: curator.
 *
 * Feature flag: PROCESS_ENGINE_ENABLED must be "true" or the method returns 404.
 *
 * Body params:
 * - group_id:            Required tenant identifier
 * - to_status:           Required target status
 * - actor_id:            Required actor performing the transition
 * - reason:              Optional reason text
 * - evidence_id:         Optional evidence packet ID
 * - expected_updated_at: Required for optimistic concurrency; returns 409 on stale
 *
 * After a successful transition, a work_item_transition event is appended to
 * the events table (append-only — never mutated).
 *
 * Returns:
 * - 200 with updated work item on success
 * - 400 on invalid transition (from_status → to_status not in adjacency map)
 * - 409 on stale optimistic lock
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { getPool } from "@/lib/postgres/connection"
import { getWorkItem, transitionWorkItem } from "@/lib/work-plane/work-item-manager"
import type { WorkItemStatus } from "@/lib/work-plane/types"

// ── Feature flag guard ────────────────────────────────────────────────────────

function isEnabled(): boolean {
  return process.env.PROCESS_ENGINE_ENABLED === "true"
}

// ── POST /api/work-items/:id/transition ───────────────────────────────────────

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
      to_status?: unknown
      actor_id?: unknown
      reason?: unknown
      evidence_id?: unknown
      expected_updated_at?: unknown
    }

    const { group_id, to_status, actor_id, reason, evidence_id, expected_updated_at } = body

    if (!group_id || typeof group_id !== "string") {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }
    if (!to_status || typeof to_status !== "string") {
      return NextResponse.json({ error: "to_status is required" }, { status: 400 })
    }
    if (!actor_id || typeof actor_id !== "string") {
      return NextResponse.json({ error: "actor_id is required" }, { status: 400 })
    }
    if (!expected_updated_at || typeof expected_updated_at !== "string") {
      return NextResponse.json({ error: "expected_updated_at is required" }, { status: 400 })
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

    // Read current state before transition to capture from_status for the event
    const current = await getWorkItem(pool, { id, groupId: validatedGroupId })
    if (current === null) {
      return NextResponse.json({ error: "Work item not found" }, { status: 404 })
    }

    const fromStatus = current.status

    const updated = await transitionWorkItem(pool, {
      id,
      groupId: validatedGroupId,
      toStatus: to_status as WorkItemStatus,
      actorId: actor_id,
      reason: typeof reason === "string" ? reason : undefined,
      evidenceId: typeof evidence_id === "string" ? evidence_id : undefined,
      expectedUpdatedAt: expected_updated_at,
    })

    // transitionWorkItem returns null on stale lock OR invalid transition.
    // Re-read current state to distinguish: if the row still has fromStatus,
    // the lock timestamp may be stale; treat as 409. If transition was invalid,
    // the adjacency graph rejected it before the UPDATE, so we return 400.
    if (updated === null) {
      // Distinguish stale lock (409) from invalid transition (400).
      // Perform a fresh read to check whether the timestamp changed.
      const fresh = await getWorkItem(pool, { id, groupId: validatedGroupId })
      if (fresh !== null && fresh.updated_at !== expected_updated_at) {
        return NextResponse.json(
          { error: "Update conflict — work item was modified since last read" },
          { status: 409 },
        )
      }
      return NextResponse.json(
        { error: `Invalid transition: ${fromStatus} → ${to_status}` },
        { status: 400 },
      )
    }

    // Append transition event to events table (append-only)
    try {
      const metadata = {
        work_item_id: id,
        from_status: fromStatus,
        to_status: to_status,
        reason: typeof reason === "string" ? reason : null,
        evidence_id: typeof evidence_id === "string" ? evidence_id : null,
      }
      await pool.query(
        `INSERT INTO events (group_id, event_type, agent_id, status, metadata, created_at)
         VALUES ($1, 'work_item_transition', $2, 'completed', $3, NOW())`,
        [validatedGroupId, actor_id, JSON.stringify(metadata)],
      )
    } catch (eventError) {
      // Log but do not fail the response — the transition succeeded; the event
      // is best-effort and should not roll back a completed state change.
      captureException(eventError, {
        tags: { route: "/api/work-items/[id]/transition", phase: "event_insert" },
      })
      console.error("Failed to insert transition event:", eventError)
    }

    return NextResponse.json({ work_item: updated }, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/work-items/[id]/transition", method: "POST" } })
    console.error("Failed to transition work item:", error)
    return NextResponse.json({ error: "Failed to transition work item" }, { status: 500 })
  }
}
