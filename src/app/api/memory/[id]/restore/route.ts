/**
 * Memory Restore API
 *
 * POST /api/memory/[id]/restore - Restore a soft-deleted memory
 *
 * Restores a memory within the 30-day recovery window:
 * - Appends event_type='memory_restore' to PostgreSQL (append-only)
 * - Removes deprecated flag/label in Neo4j
 * - Does NOT update any existing row in PostgreSQL
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { DatabaseQueryError, DatabaseUnavailableError } from "@/lib/errors/database-errors"
import {
  MemoryNotDeletedError,
  MemoryNotFoundError,
  RecoveryWindowExpiredError,
} from "@/lib/memory/canonical-contracts"
import type {
  GroupId,
  MemoryId,
  MemoryResponseMeta,
  MemoryRestoreRequest,
  UserId,
} from "@/lib/memory/canonical-contracts"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { memory_restore } from "@/mcp/canonical-tools"

// ── Degraded Response Helper ────────────────────────────────────────────────

function jsonWithDegradation<T = unknown>(data: T & { meta?: MemoryResponseMeta }): NextResponse<T> {
  const meta = data.meta
  if (meta?.degraded) {
    const warning = meta.degraded_reason ? `299 Allura "${meta.degraded_reason}"` : '299 Allura "partial_data"'
    return NextResponse.json(data, {
      status: 206,
      headers: { Warning: warning },
    })
  }
  return NextResponse.json(data)
}

// ── POST /api/memory/[id]/restore (memory_restore) ───────────────────────────

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Auth: require admin role for restore operations
  const roleCheck = requireRole(request, "admin")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)

    const rawGroupId = searchParams.get("group_id") ?? roleCheck.user.groupId

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(rawGroupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    if (validatedGroupId !== roleCheck.user.groupId) {
      return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 })
    }
    if (!roleCheck.user.workspaceId || !roleCheck.user.sessionId) {
      return unauthorizedResponse("Authenticated workspace and session scope are required")
    }
    if (
      (searchParams.has("workspace_id") && searchParams.get("workspace_id") !== roleCheck.user.workspaceId) ||
      (searchParams.has("user_id") && searchParams.get("user_id") !== roleCheck.user.id)
    ) {
      return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 })
    }

    const restoreRequest: MemoryRestoreRequest = {
      id: id as MemoryId,
      group_id: validatedGroupId as GroupId,
      user_id: roleCheck.user.id as UserId,
      scope: {
        group_id: validatedGroupId as GroupId,
        workspace_id: roleCheck.user.workspaceId,
        agent_id: roleCheck.user.id,
        session_id: roleCheck.user.sessionId,
      },
    }

    const response = await memory_restore(restoreRequest)

    return jsonWithDegradation(response)
  } catch (error) {
    if (error instanceof MemoryNotDeletedError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    if (error instanceof RecoveryWindowExpiredError) {
      return NextResponse.json({ error: error.message }, { status: 410 })
    }

    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json(
        { error: `Service temporarily unavailable: ${error.operation}`, operation: error.operation },
        { status: 503 }
      )
    }

    if (error instanceof DatabaseQueryError) {
      return NextResponse.json(
        { error: `Database query failed: ${error.operation}`, operation: error.operation },
        { status: 500 }
      )
    }

    if (error instanceof Error && error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.error("Memory RESTORE error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
