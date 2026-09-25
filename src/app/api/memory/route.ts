/**
 * Canonical Memory REST API
 *
 * Implements the 5 canonical memory operations via REST.
 * Matches the MCP tools interface exactly.
 *
 * Reference: docs/allura/BLUEPRINT.md
 *
 * Endpoints:
 * - POST /api/memory (memory_add)
 * - GET /api/memory (memory_list)
 * - GET /api/memory/search (memory_search)
 * - GET /api/memory/[id] (memory_get)
 * - DELETE /api/memory/[id] (memory_delete)
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { DatabaseQueryError, DatabaseUnavailableError } from "@/lib/errors/database-errors"
import { MemoryNotFoundError } from "@/lib/memory/canonical-contracts"
import type {
  GroupId,
  MemoryAddRequest,
  MemoryDeleteRequest,
  MemoryGetRequest,
  MemoryListDeletedRequest,
  MemoryListRequest,
  MemoryResponseMeta,
  MemorySearchRequest,
 UserId } from "@/lib/memory/canonical-contracts"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { resolveApiTenant } from "@/lib/auth/web-principal"
import {
  memory_add,
  memory_delete,
  memory_get,
  memory_list,
  memory_list_deleted,
  memory_search,
} from "@/mcp/canonical-tools"

// ── Error Handling ────────────────────────────────────────────────────────

function handleError(error: unknown, route: string, method: string): NextResponse {
  captureException(new Error("Memory API request failed"), { tags: { route, method } })
  console.error("Memory API request failed")

  if (error instanceof GroupIdValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

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

  if (error instanceof Error) {
    if (error.message.includes("Invalid group_id")) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (error.message.includes("not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
  }

  return NextResponse.json({ error: "Internal server error" }, { status: 500 })
}

// ── POST /api/memory (memory_add) ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  // A memory write is a curator action; role and tenant come from auth.
  const roleCheck = requireRole(request, "curator")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const body = await request.json()

    // Validate group_id format (ARCH-001: enforces allura-* pattern)
    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(body.group_id)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    if (resolveApiTenant(roleCheck.user, validatedGroupId).status !== "ok") {
      return NextResponse.json({ error: "TENANT_MISMATCH" }, { status: 403 })
    }
    if (!roleCheck.user.workspaceId || !roleCheck.user.sessionId) {
      return NextResponse.json({ error: "AUTH_MISSING" }, { status: 401 })
    }

    if (!body.user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 })
    }

    if (!body.content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 })
    }

    const addRequest: MemoryAddRequest = {
      group_id: validatedGroupId as GroupId,
      user_id: body.user_id,
      content: body.content,
      scope: { group_id: validatedGroupId as GroupId, workspace_id: roleCheck.user.workspaceId,
        agent_id: roleCheck.user.id, session_id: roleCheck.user.sessionId },
      // canonical memory_add prioritizes metadata.agent_id over scope.agent_id.
      // Never let caller metadata replace the verified web actor.
      metadata: { ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata : {}), agent_id: roleCheck.user.id },
      threshold: body.threshold,
    }

    const response = await memory_add(addRequest)

    return jsonWithDegradation(response)
  } catch (error) {
    return handleError(error, "/api/memory", "POST")
  }
}

// ── GET /api/memory (memory_list) ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth: require viewer or above role
  const roleCheck = requireRole(request, "viewer")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const { searchParams } = new URL(request.url)

    // Validate group_id format (ARCH-001: enforces allura-* pattern)
    const rawGroupId = searchParams.get("group_id")
    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(rawGroupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json({ error: `Invalid group_id: ${error.message}` }, { status: 400 })
      }
      throw error
    }

    if (!rawGroupId) {
      return NextResponse.json({ error: "group_id is required" }, { status: 400 })
    }

    if (resolveApiTenant(roleCheck.user, validatedGroupId).status !== "ok") {
      return NextResponse.json({ error: "TENANT_MISMATCH" }, { status: 403 })
    }
    if (!roleCheck.user.workspaceId || !roleCheck.user.sessionId) {
      return NextResponse.json({ error: "AUTH_MISSING" }, { status: 401 })
    }
    const scope = { group_id: validatedGroupId as GroupId, workspace_id: roleCheck.user.workspaceId,
      agent_id: roleCheck.user.id, session_id: roleCheck.user.sessionId }

    // Check if this is a search request
    const query = searchParams.get("query")
    if (query) {
      // Route to memory_search
      const searchRequest: MemorySearchRequest = {
        query,
        group_id: validatedGroupId as GroupId,
        scope,
        user_id: searchParams.get("user_id") || undefined,
        limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 10,
        min_score: searchParams.get("min_score") ? parseFloat(searchParams.get("min_score")!) : undefined,
        include_global: searchParams.get("include_global") !== "false",
      }

      const response = await memory_search(searchRequest)
      return jsonWithDegradation(response)
    }

    // Check if this is a deleted-memory list request
    const status = searchParams.get("status")
    if (status === "deleted") {
      const listDeletedRequest: MemoryListDeletedRequest = {
        group_id: validatedGroupId as GroupId,
        scope,
        user_id: searchParams.get("user_id") || undefined,
        limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50,
        offset: searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0,
      }

      const response = await memory_list_deleted(listDeletedRequest)
      return jsonWithDegradation(response)
    }

    // Otherwise, route to memory_list
    const rawUserId = searchParams.get("user_id")
    const listRequest: MemoryListRequest = {
      group_id: validatedGroupId as GroupId,
      scope,
      user_id: rawUserId ? (rawUserId as UserId) : undefined,
      limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 50,
      offset: searchParams.get("offset") ? parseInt(searchParams.get("offset")!) : 0,
      sort:
        (searchParams.get("sort") as "created_at_desc" | "created_at_asc" | "score_desc" | "score_asc") ||
        "created_at_desc",
    }

    const response = await memory_list(listRequest)

    return jsonWithDegradation(response)
  } catch (error) {
    return handleError(error, "/api/memory", "GET")
  }
}

// ── Degraded Response Helper ────────────────────────────────────────────────
//
// When a canonical tool returns partial data (e.g. Neo4j unavailable),
// the response includes meta.degraded = true. We must NOT silently return
// HTTP 200 — callers need to distinguish "complete results" from "partial results".
//
// Strategy:
// - meta.degraded === true  → HTTP 206 Partial Content + Warning header
// - meta.degraded === false → HTTP 200 OK (normal)
// - no meta field           → HTTP 200 OK (backward compat)
//
// Issue #14: PostgreSQL errors now propagate as thrown exceptions (503/500).
// Neo4j degraded mode returns partial data with meta.degraded = true (206).

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
