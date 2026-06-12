/**
 * Teams API
 *
 * GET /api/teams - Live team rosters: agent manifest + Postgres activity.
 *
 * Delegates to teams-source (canonical read-only source) and returns
 * the result as JSON. Auth-gated; requires viewer role.
 *
 * Query params:
 * - group_id: Required tenant identifier (must match allura-* pattern)
 */

import { NextRequest, NextResponse } from "next/server"
import { forbiddenResponse, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"
import { readTeams, isTeamsEmpty } from "@/lib/operational-state/sources/teams-source"
import type { TeamsSnapshot } from "@/lib/operational-state/sources/teams-source"
import type { SourceOutcome } from "@/lib/operational-state"

export interface TeamsApiResponse {
  status: "ready" | "empty" | "stale" | "error" | "degraded"
  source: { id: string; systemOfRecord: string }
  fetchedAt: string | null
  ageMs: number | null
  data: TeamsSnapshot | null
  recovery: string | null
  error: string | null
}

/**
 * GET /api/teams
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

    const outcome: SourceOutcome<TeamsSnapshot> = await readTeams(validatedGroupId)
    const now = Date.now()

    if (outcome === null) {
      const response: TeamsApiResponse = {
        status: "degraded",
        source: { id: "teams", systemOfRecord: "manifest+postgres:events" },
        fetchedAt: null,
        ageMs: null,
        data: null,
        recovery: "Check that Postgres is reachable, then retry.",
        error: null,
      }
      return NextResponse.json(response, { status: 503 })
    }

    if (outcome.ok === false) {
      const response: TeamsApiResponse = {
        status: "error",
        source: { id: "teams", systemOfRecord: "manifest+postgres:events" },
        fetchedAt: null,
        ageMs: null,
        data: null,
        recovery: "Teams source reported an error. Retry or inspect source logs.",
        error: outcome.error,
      }
      return NextResponse.json(response, { status: 500 })
    }

    const ageMs = Math.max(0, now - new Date(outcome.fetchedAt).getTime())
    const empty = isTeamsEmpty(outcome.data)

    const response: TeamsApiResponse = {
      status: empty ? "empty" : "ready",
      source: { id: "teams", systemOfRecord: "manifest+postgres:events" },
      fetchedAt: outcome.fetchedAt,
      ageMs,
      data: empty ? null : outcome.data,
      recovery: empty ? "Agent teams exist but have no events in the last 24 hours. Activity will appear once agents begin operating." : null,
      error: null,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    captureException(error, { tags: { route: "/api/teams", method: "GET" } })
    console.error("Failed to fetch teams:", error)
    return NextResponse.json(
      { error: "Failed to fetch teams" },
      { status: 500 },
    )
  }
}