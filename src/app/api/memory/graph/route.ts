import { NextRequest, NextResponse } from "next/server"
import { withPermission } from "@/lib/auth/api-auth"
import { captureException } from "@/lib/observability/sentry"
import type { SubgraphQuery, SubgraphResponse } from "@/lib/subgraph/contract"
import { focusedSubgraphContinuationSecret, FocusedSubgraphReadService } from "@/lib/subgraph/read-service"

const ALLOWED_QUERY_PARAMS = new Set([
  "kind", "focusNodeKey", "direction", "depth", "includeLineage", "nodeKinds", "nodeKind",
  "relationshipKinds", "relationshipKind", "nodeLimit", "edgeLimit", "continuation", "group_id", "workspace_id",
])

function one(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name)
  if (values.length > 1) throw new Error("duplicate parameter")
  return values[0]
}

function integer(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!/^[0-9]+$/.test(value)) throw new Error("invalid integer")
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error("invalid integer")
  return parsed
}

function boolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (value === "true") return true
  if (value === "false") return false
  throw new Error("invalid boolean")
}

function list(params: URLSearchParams, singular: string, plural: string): string[] | undefined {
  if (params.has(singular) && params.has(plural)) throw new Error("conflicting list parameters")
  const values = params.has(singular) ? params.getAll(singular) : params.getAll(plural).flatMap((value) => value.split(","))
  const normalized = values.map((value) => value.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}

export function parseFocusedSubgraphQuery(params: URLSearchParams): SubgraphQuery {
  for (const name of params.keys()) if (!ALLOWED_QUERY_PARAMS.has(name)) throw new Error("unknown parameter")
  const kind = one(params, "kind") ?? (params.has("focusNodeKey") ? "focus" : "overview")
  const common = {
    nodeKinds: list(params, "nodeKind", "nodeKinds"),
    relationshipKinds: list(params, "relationshipKind", "relationshipKinds"),
    nodeLimit: integer(one(params, "nodeLimit")),
    edgeLimit: integer(one(params, "edgeLimit")),
    continuation: one(params, "continuation"),
  }
  if (kind === "overview") {
    if (params.has("focusNodeKey") || params.has("direction") || params.has("depth") || params.has("includeLineage")) throw new Error("focus parameter on overview")
    return { kind, ...common }
  }
  if (kind !== "focus") throw new Error("invalid kind")
  const focusNodeKey = one(params, "focusNodeKey")
  if (!focusNodeKey) throw new Error("missing focus key")
  const direction = one(params, "direction")
  if (direction !== undefined && direction !== "incoming" && direction !== "outgoing" && direction !== "both") throw new Error("invalid direction")
  return {
    kind,
    focusNodeKey,
    ...(direction ? { direction } : {}),
    depth: integer(one(params, "depth")) as 0 | 1 | 2 | undefined,
    includeLineage: boolean(one(params, "includeLineage")),
    ...common,
  }
}

function responseStatus(result: SubgraphResponse): number {
  if (result.state === "denied") return result.reasonCode === "LOGIN_REQUIRED" ? 401 : 403
  if (result.state === "error") {
    if (result.code === "MALFORMED_QUERY" || result.code === "MALFORMED_CONTINUATION") return 400
    if (result.code === "CONTINUATION_CONFLICT" || result.code === "SNAPSHOT_CONFLICT") return 409
    return 503
  }
  return 200
}

function graphJson(body: unknown, status: number, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } })
}

function malformed() {
  return graphJson(
    { contractVersion: "2.0", state: "error", code: "MALFORMED_QUERY", retryable: false, action: "none" },
    400,
  )
}

export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID()
  const permission = await withPermission(request, "memory:read")
  if (permission instanceof NextResponse) {
    return permission.status === 401
      ? graphJson({ contractVersion: "2.0", state: "denied", reasonCode: "LOGIN_REQUIRED", action: "login" }, 401)
      : graphJson({ contractVersion: "2.0", state: "denied", reasonCode: "INSUFFICIENT_ROLE", action: "request_access" }, 403)
  }
  const { user, groupId } = permission
  if (!user.workspaceId || !user.sessionId) {
    return graphJson(
      { contractVersion: "2.0", state: "denied", reasonCode: "LOGIN_REQUIRED", action: "login" },
      401,
    )
  }

  const params = new URL(request.url).searchParams
  const groupAssertions = params.getAll("group_id")
  const workspaceAssertions = params.getAll("workspace_id")
  if (groupAssertions.some((value) => value !== groupId) ||
      workspaceAssertions.some((value) => value !== user.workspaceId)) {
    return graphJson(
      { contractVersion: "2.0", state: "denied", reasonCode: "SCOPE_CONFLICT", action: "none" },
      403,
    )
  }
  if (groupAssertions.length > 1 || workspaceAssertions.length > 1) return malformed()

  let query: SubgraphQuery
  try {
    query = parseFocusedSubgraphQuery(params)
  } catch {
    return malformed()
  }

  try {
    const service = new FocusedSubgraphReadService({
      continuationSecret: focusedSubgraphContinuationSecret(),
      onUnavailable: (error, context) => {
        captureException(error, {
          tags: { route: "/api/memory/graph", method: "GET", event: "focused_subgraph_unavailable" },
          extra: { correlationId, queryKind: context.queryKind, continuation: context.continuation },
        })
        console.error(JSON.stringify({ event: "focused_subgraph_unavailable", correlationId, ...context }))
      },
    })
    const result = await service.read(user, query)
    return graphJson(result, responseStatus(result), { "X-Request-Id": correlationId })
  } catch (error) {
    captureException(error, { tags: { route: "/api/memory/graph", method: "GET", event: "focused_subgraph_route_failure" }, extra: { correlationId } })
    console.error(JSON.stringify({ event: "focused_subgraph_route_failure", correlationId }))
    return graphJson(
      { contractVersion: "2.0", state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" },
      503,
      { "X-Request-Id": correlationId },
    )
  }
}

function methodNotAllowed() {
  return graphJson({ error: "method_not_allowed" }, 405, { Allow: "GET" })
}

export async function POST() { return methodNotAllowed() }
export async function PUT() { return methodNotAllowed() }
export async function PATCH() { return methodNotAllowed() }
export async function DELETE() { return methodNotAllowed() }
