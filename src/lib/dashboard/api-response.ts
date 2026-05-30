import { NextRequest, NextResponse } from "next/server"

import { forbiddenResponse, getAuthUser, requireRole, unauthorizedResponse } from "@/lib/auth/api-auth"
import { DEFAULT_GROUP_ID } from "@/lib/defaults/scope"
import { GroupIdValidationError, validateGroupId } from "@/lib/validation/group-id"

export type DashboardApiSource = "postgres-events" | "postgres-proposals" | "ruvix-policy" | "empty"

export type DashboardApiEnvelope<T> = {
  data: T
  degraded: boolean
  warnings: string[]
  source: {
    label: DashboardApiSource
    endpoint: string
    trustLevel: "authoritative" | "derived"
  }
  freshness: {
    observedAt: string
    status: "fresh" | "unknown"
    message: string
  }
  groupId: string
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-allura-user-id, x-allura-role, x-allura-group-id",
}

export function optionsResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export function jsonEnvelope<T>(payload: DashboardApiEnvelope<T>, status = 200): NextResponse {
  const headers = new Headers(CORS_HEADERS)
  if (payload.degraded) {
    headers.set("Warning", '299 Allura "partial_data"')
  }

  return NextResponse.json(payload, { status, headers })
}

export function resolveDashboardRequest(
  request: NextRequest,
  requiredRole: "viewer" | "curator" | "admin" = "viewer"
): { ok: true; groupId: string } | { ok: false; response: NextResponse } {
  const roleCheck = requireRole(request, requiredRole)
  if (!roleCheck.user) {
    return { ok: false, response: unauthorizedResponse() }
  }
  if (!roleCheck.allowed) {
    return { ok: false, response: forbiddenResponse(roleCheck) }
  }

  const authUser = getAuthUser(request)
  const { searchParams } = new URL(request.url)
  const rawGroupId =
    request.headers.get("x-allura-group-id") || searchParams.get("group_id") || authUser?.groupId || DEFAULT_GROUP_ID

  try {
    return { ok: true, groupId: validateGroupId(rawGroupId) }
  } catch (error) {
    if (error instanceof GroupIdValidationError) {
      return {
        ok: false,
        response: NextResponse.json({ error: error.message }, { status: 400, headers: CORS_HEADERS }),
      }
    }
    throw error
  }
}

export function emptyEnvelope<T>(
  endpoint: string,
  groupId: string,
  data: T,
  warning: string,
  source: DashboardApiSource = "empty"
): DashboardApiEnvelope<T> {
  return {
    data,
    degraded: true,
    warnings: [warning],
    source: {
      label: source,
      endpoint,
      trustLevel: "derived",
    },
    freshness: {
      observedAt: new Date().toISOString(),
      status: "unknown",
      message: "Brain source could not be read; returned an honest empty shape.",
    },
    groupId,
  }
}
