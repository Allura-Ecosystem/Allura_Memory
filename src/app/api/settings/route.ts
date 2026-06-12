/**
 * Settings API
 *
 * GET /api/settings - Live runtime settings: subsystem health, governance activity, promotion mode.
 *
 * Delegates to settings-source (canonical read-only source) and returns
 * the result as JSON. Auth-gated; requires viewer role.
 *
 * Query params:
 * - group_id: Required tenant identifier (must match allura-* pattern)
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { readSettings, isSettingsEmpty } from "@/lib/operational-state/sources/settings-source"
import type { SettingsSnapshot } from "@/lib/operational-state/sources/settings-source"
import type { SourceOutcome } from "@/lib/operational-state"

export interface SettingsApiResponse {
  status: "ready" | "empty" | "stale" | "error" | "degraded"
  source: { id: string; systemOfRecord: string }
  fetchedAt: string | null
  ageMs: number | null
  data: SettingsSnapshot | null
  recovery: string | null
  error: string | null
}

/**
 * GET /api/settings
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
    const groupId = searchParams.get("group_id")

    if (!groupId) {
      return NextResponse.json(
        { error: "group_id is required" },
        { status: 400 },
      )
    }

    // Validate group_id format (enforces allura-* pattern)
    let validatedGroupId: string
    try {
      validatedGroupId = validateGroupId(groupId)
    } catch (error) {
      if (error instanceof GroupIdValidationError) {
        return NextResponse.json(
          { error: `Invalid group_id: ${error.message}` },
          { status: 400 },
        )
      }
      throw error
    }

    const outcome: SourceOutcome<SettingsSnapshot> = await readSettings(validatedGroupId)
    const now = Date.now()

    // Map SourceOutcome to HTTP response
    // null → 503 degraded (source unreachable)
    // ok:false → 500 error (source answered with failure)
    // ok:true → 200 with data

    if (outcome === null) {
      const response: SettingsApiResponse = {
        status: "degraded",
        source: { id: "settings", systemOfRecord: "postgres:events+mcp:health" },
        fetchedAt: null,
        ageMs: null,
        data: null,
        recovery: "Check that Postgres and MCP health endpoint are reachable, then retry.",
        error: null,
      }
      return NextResponse.json(response, { status: 503 })
    }

    if (outcome.ok === false) {
      const response: SettingsApiResponse = {
        status: "error",
        source: { id: "settings", systemOfRecord: "postgres:events+mcp:health" },
        fetchedAt: null,
        ageMs: null,
        data: null,
        recovery: "Settings source reported an error. Retry or inspect source logs.",
        error: outcome.error,
      }
      return NextResponse.json(response, { status: 500 })
    }

    // Success — classify empty / ready
    const ageMs = Math.max(0, now - new Date(outcome.fetchedAt).getTime())
    const empty = isSettingsEmpty(outcome.data)

    const response: SettingsApiResponse = {
      status: empty ? "empty" : "ready",
      source: { id: "settings", systemOfRecord: "postgres:events+mcp:health" },
      fetchedAt: outcome.fetchedAt,
      ageMs,
      data: empty ? null : outcome.data,
      recovery: empty ? "Update a governance policy or run a gate check to see activity here." : null,
      error: null,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/settings", method: "GET" } })
    console.error("Failed to fetch settings:", error)
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    )
  }
}