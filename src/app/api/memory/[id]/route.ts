/**
 * Individual Memory REST API
 *
 * GET    /api/memory/[id] - memory_get
 * PUT    /api/memory/[id] - memory_update (append-only, SUPERSEDES)
 * DELETE /api/memory/[id] - memory_delete
 */

import { NextRequest, NextResponse } from "next/server"
import { DatabaseQueryError, DatabaseUnavailableError } from "@/lib/errors/database-errors"
import { MemoryNotFoundError } from "@/lib/memory/canonical-contracts"
import type {
  GroupId,
  MemoryDeleteRequest,
  MemoryGetRequest,
  MemoryId,
  MemoryResponseMeta,
  MemoryUpdateRequest,
 UserId } from "@/lib/memory/canonical-contracts"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { memory_delete, memory_get, memory_update } from "@/mcp/canonical-tools"

// ── Degraded Response Helper ────────────────────────────────────────────────
// See src/app/api/memory/route.ts for rationale (Issue #14).
// When meta.degraded = true, return 206 + Warning header instead of silent 200.

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

// ── GET /api/memory/[id] (memory_get) ──────────────────────────────────────

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)

    const rawGroupId = searchParams.get("group_id")
    if (!rawGroupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(rawGroupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const getRequest: MemoryGetRequest = {
      id: id as MemoryId,
      group_id: validatedGroupId as GroupId,
    }

    const response = await memory_get(getRequest)

    return jsonWithDegradation(response)
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
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

    console.error("Memory GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── PUT /api/memory/[id] (memory_update) ────────────────────────────────────
// Append-only versioned update. Creates new version in graph_memories via SUPERSEDES (graph_supersedes).
// Appends audit event to PostgreSQL. Never mutates existing rows/nodes.

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)

    const rawGroupId = searchParams.get("group_id")
    if (!rawGroupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(rawGroupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    const rawUserId = searchParams.get("user_id")
    if (!rawUserId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 })
    }

    const body = await request.json()
    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json({ error: "content is required and must be a string" }, { status: 400 })
    }

    const updateRequest: MemoryUpdateRequest = {
      id: id as MemoryId,
      group_id: validatedGroupId as GroupId,
      user_id: rawUserId as UserId,
      content: body.content,
      reason: body.reason,
      metadata: body.metadata,
    }

    const response = await memory_update(updateRequest)

    return jsonWithDegradation(response)
  } catch (error) {
    if (error instanceof MemoryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 })
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

    console.error("Memory PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── DELETE /api/memory/[id] (memory_delete) ───────────────────────────────

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)

    const rawGroupId = searchParams.get("group_id")
    if (!rawGroupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(rawGroupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    if (!searchParams.get("user_id")) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 })
    }

    const deleteRequest: MemoryDeleteRequest = {
      id: id as MemoryId,
      group_id: validatedGroupId as GroupId,
      user_id: searchParams.get("user_id") || "",
    }

    const response = await memory_delete(deleteRequest)

    return jsonWithDegradation(response)
  } catch (error) {
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

    console.error("Memory DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
