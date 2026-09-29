/**
 * ControlPlane-backed Trace API
 *
 * Replaces the direct PostgreSQL implementation with RuVix controlPlane syscalls.
 * All trace operations now flow through the controlPlane for proof-gated mutation.
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { logTrace, TraceLog } from "@/lib/postgres/trace-logger"

const TRACE_TYPES = ["contribution", "decision", "learning", "error"] as const

/**
 * GET /api/memory/traces
 *
 * Query traces with group_id enforcement.
 * Query params:
 * - group_id: Required tenant identifier (format: allura-*)
 * - limit: Max number of traces (default: 50)
 * - offset: Pagination offset (default: 0)
 * - type: Trace type filter (contribution | decision | learning | error)
 */
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
    const group_id = roleCheck.user.groupId
    const workspace_id = roleCheck.user.workspaceId
    if (!workspace_id) return unauthorizedResponse("Authenticated workspace scope is required")
    if (
      (searchParams.has("group_id") && searchParams.get("group_id") !== group_id) ||
      (searchParams.has("workspace_id") && searchParams.get("workspace_id") !== workspace_id)
    ) {
      return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 })
    }

    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")
    const type = searchParams.get("type")
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return NextResponse.json({ error: "limit must be an integer between 1 and 200" }, { status: 400 })
    }
    if (!Number.isInteger(offset) || offset < 0) {
      return NextResponse.json({ error: "offset must be a non-negative integer" }, { status: 400 })
    }
    if (type !== null && !TRACE_TYPES.includes(type as (typeof TRACE_TYPES)[number])) {
      return NextResponse.json({ error: `type must be one of: ${TRACE_TYPES.join(", ")}` }, { status: 400 })
    }

    const { queryWorkspaceTraces } = await import("@/lib/postgres/traces")
    const traces = await queryWorkspaceTraces({
      group_id,
      workspace_id,
      principal_id: roleCheck.user.id,
      limit,
      offset,
      type: type || undefined,
    })

    return NextResponse.json({ traces })
  } catch (error) {
    console.error("Failed to fetch traces")
    return NextResponse.json({ error: "Failed to fetch traces" }, { status: 500 })
  }
}

/**
 * POST /api/memory/traces
 *
 * Log a trace with RuVix controlPlane proof-gated mutation.
 * Body:
 * - group_id: Required tenant identifier (format: allura-*)
 * - type: Trace type (contribution | decision | learning | error)
 * - content: Trace content (required)
 * - agent: Agent identifier (default: 'api')
 * - metadata: Optional metadata object
 * - confidence: Confidence score (0.0-1.0, default: 0.5)
 */
export async function POST(request: NextRequest) {
  const roleCheck = requireRole(request, "curator")
  if (!roleCheck.user) {
    return unauthorizedResponse()
  }
  if (!roleCheck.allowed) {
    return forbiddenResponse(roleCheck)
  }

  try {
    const body = await request.json()
    const { type = "contribution", content, metadata, confidence = 0.5 } = body
    const validatedGroupId = roleCheck.user.groupId
    const workspace_id = roleCheck.user.workspaceId
    if (!workspace_id) return unauthorizedResponse("Authenticated workspace scope is required")
    if (
      (body.group_id !== undefined && body.group_id !== validatedGroupId) ||
      (body.workspace_id !== undefined && body.workspace_id !== workspace_id)
    ) {
      return NextResponse.json({ error: "Forged memory scope is forbidden" }, { status: 403 })
    }

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 })
    }
    if (!TRACE_TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${TRACE_TYPES.join(", ")}` }, { status: 400 })
    }
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      return NextResponse.json({ error: "confidence must be between 0 and 1" }, { status: 400 })
    }

    // Build controlPlane-backed trace log
    const traceLog: TraceLog = {
      agent_id: roleCheck.user.id,
      group_id: validatedGroupId,
      workspace_id,
      session_id: roleCheck.user.sessionId,
      trace_type: type,
      content,
      confidence,
      metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {},
    }

    // Log through controlPlane (proof-gated)
    const trace = await logTrace(traceLog)

    return NextResponse.json({ success: true, trace })
  } catch (error) {
    console.error("Failed to log trace via controlPlane")

    // Check if it's a controlPlane initialization error
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    if (errorMessage.includes("RUVIX_CONTROL_PLANE_SECRET") || errorMessage.includes("controlPlane")) {
      return NextResponse.json({ error: "Trace service unavailable" }, { status: 503 })
    }

    return NextResponse.json({ error: "Failed to log trace" }, { status: 500 })
  }
}
