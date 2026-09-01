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
  // A protocol/policy refusal, not a backend outage: the caller spoke plain
  // HTTP (or an untrusted/absent proxy signal) to an endpoint that requires
  // TLS. 426 Upgrade Required is the precise 4xx for "retry this exact
  // request over HTTPS" -- distinct from 400 (malformed request) and from
  // 503 (transient server failure), so alerting/monitoring on 5xx spikes
  // doesn't page an on-call for what is actually a client misconfiguration.
  BUMBLEBEE_INGEST_HTTPS_REQUIRED: 426,
})

// Shared by the route handlers and the ingest pipeline so the allowlisted
// auth/public-error mapping exists in exactly one place.
export function refusal(error: unknown): Response {
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
  authenticate: (request: Request, audience: "bumblebee_ingest") => Promise<unknown>
  ingest: (request: Request) => Promise<Response>
}) {
  // The route stays thin: it enforces the audience gate before any body bytes
  // can reach the injected pipeline, then delegates. The pipeline independently
  // re-verifies auth on its own seam, so both layers stay testable in
  // isolation and neither can be wired to skip authentication.
  return async function POST(request: Request): Promise<Response> {
    try {
      await deps.authenticate(request, "bumblebee_ingest")
    } catch (error) {
      return refusal(error)
    }
    try {
      return await deps.ingest(request)
    } catch (error) {
      return refusal(error)
    }
  }
}
