if (typeof window !== "undefined") throw new Error("server-side only")

import type { BumblebeeTokenAudience, IssueScanLeaseInput } from "./lease-authority"

type Authenticate = (request: Request, audience: BumblebeeTokenAudience) => Promise<{ rawToken: string }>

const PUBLIC_ERRORS: Readonly<Record<string, number>> = Object.freeze({
  BUMBLEBEE_AUTH_INVALID: 401,
  BUMBLEBEE_AUTH_REVOKED: 401,
  BUMBLEBEE_AUTH_EXPIRED: 401,
  BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN: 403,
  BUMBLEBEE_AUTH_CREDENTIAL_CLASS_FORBIDDEN: 403,
  BUMBLEBEE_LEASE_INVALID_DURATION: 400,
  BUMBLEBEE_LEASE_SOURCE_REVISION_MISMATCH: 409,
})

function refusal(error: unknown): Response {
  const candidate = error instanceof Error ? error.message : ""
  const status = PUBLIC_ERRORS[candidate]
  if (status !== undefined) return Response.json({ error: candidate }, { status })
  return Response.json({ error: "BUMBLEBEE_SERVICE_UNAVAILABLE" }, { status: 503 })
}

export function createRunsHandler(deps: {
  authenticate: Authenticate
  issue(input: IssueScanLeaseInput): Promise<unknown>
}) {
  return async function POST(request: Request): Promise<Response> {
    let authority: { rawToken: string }
    try {
      authority = await deps.authenticate(request, "bumblebee_runner")
    } catch (error) {
      return refusal(error)
    }
    let body: { sourceId?: unknown; sourceRevisionId?: unknown; durationSeconds?: unknown }
    try {
      body = await request.json() as typeof body
    } catch {
      return Response.json({ error: "BUMBLEBEE_REQUEST_INVALID" }, { status: 400 })
    }
    if (typeof body.sourceId !== "string" || typeof body.sourceRevisionId !== "string" ||
      typeof body.durationSeconds !== "number") {
      return Response.json({ error: "BUMBLEBEE_REQUEST_INVALID" }, { status: 400 })
    }
    try {
      const lease = await deps.issue({
        runnerToken: authority.rawToken,
        sourceId: body.sourceId,
        sourceRevisionId: body.sourceRevisionId,
        durationSeconds: body.durationSeconds,
      })
      return Response.json(lease, { status: 201 })
    } catch (error) {
      return refusal(error)
    }
  }
}

export function createIngestHandler(deps: {
  authenticate: Authenticate
  ingest?: (request: Request) => Promise<unknown>
}) {
  return async function POST(request: Request): Promise<Response> {
    try {
      await deps.authenticate(request, "bumblebee_ingest")
    } catch (error) {
      return refusal(error)
    }
    // This bounded slice authenticates the lease credential only. It does not
    // consume or accept an ingestion body; NDJSON is deliberately out of scope.
    return Response.json({ error: "BUMBLEBEE_INGEST_NOT_IMPLEMENTED" }, { status: 501 })
  }
}
