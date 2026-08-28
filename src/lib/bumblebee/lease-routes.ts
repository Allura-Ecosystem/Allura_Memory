if (typeof window !== "undefined") throw new Error("server-side only")

import type { BumblebeeTokenAudience, IssueScanLeaseInput } from "./lease-authority"

type Authenticate = (request: Request, audience: BumblebeeTokenAudience) => Promise<{ rawToken: string }>

function refusal(error: unknown): Response {
  const code = error instanceof Error ? error.message : "BUMBLEBEE_AUTH_INVALID"
  const status = code.includes("AUDIENCE") || code.includes("CREDENTIAL_CLASS") ? 403 : 401
  return Response.json({ error: code }, { status })
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
    let body: { sourceRevisionId?: unknown; durationSeconds?: unknown }
    try {
      body = await request.json() as typeof body
    } catch {
      return Response.json({ error: "BUMBLEBEE_REQUEST_INVALID" }, { status: 400 })
    }
    if (typeof body.sourceRevisionId !== "string" || typeof body.durationSeconds !== "number") {
      return Response.json({ error: "BUMBLEBEE_REQUEST_INVALID" }, { status: 400 })
    }
    try {
      const lease = await deps.issue({
        runnerToken: authority.rawToken,
        sourceRevisionId: body.sourceRevisionId,
        durationSeconds: body.durationSeconds,
      })
      return Response.json(lease, { status: 201 })
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "BUMBLEBEE_LEASE_REFUSED" }, { status: 409 })
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
