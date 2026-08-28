import { describe, expect, it, vi } from "vitest"

import { createIngestHandler, createRunsHandler } from "../lease-routes"

describe("Story 26.7 Bumblebee route audiences", () => {
  it("authorizes the exact route audience before touching either request body", async () => {
    const runsJson = vi.fn()
    const ingestBytes = vi.fn()
    const denied = new Error("BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN")
    const authenticate = vi.fn(async (_request: Request, _audience: "bumblebee_runner" | "bumblebee_ingest") => { throw denied })
    const issue = vi.fn()
    const ingest = vi.fn()

    const runsResponse = await createRunsHandler({ authenticate, issue })({
      headers: new Headers({ authorization: "Bearer bmb_ingest_abcdefgh_body" }),
      json: runsJson,
    } as unknown as Request)
    const ingestResponse = await createIngestHandler({ authenticate, ingest })({
      headers: new Headers({ authorization: "Bearer bmb_runner_abcdefgh_body" }),
      arrayBuffer: ingestBytes,
    } as unknown as Request)

    expect([runsResponse.status, ingestResponse.status]).toEqual([403, 403])
    expect(runsJson).not.toHaveBeenCalled()
    expect(ingestBytes).not.toHaveBeenCalled()
    expect(issue).not.toHaveBeenCalled()
    expect(ingest).not.toHaveBeenCalled()
    expect(authenticate.mock.calls.map((call) => call[1])).toEqual(["bumblebee_runner", "bumblebee_ingest"])
  })

  it.each([
    [new Error("BUMBLEBEE_AUTH_INVALID"), 401, "BUMBLEBEE_AUTH_INVALID"],
    [new Error("BUMBLEBEE_AUTH_REVOKED"), 401, "BUMBLEBEE_AUTH_REVOKED"],
    [new Error("BUMBLEBEE_AUTH_EXPIRED"), 401, "BUMBLEBEE_AUTH_EXPIRED"],
    [new Error("BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN"), 403, "BUMBLEBEE_AUTH_AUDIENCE_FORBIDDEN"],
    [new Error("BUMBLEBEE_AUTH_CREDENTIAL_CLASS_FORBIDDEN"), 403, "BUMBLEBEE_AUTH_CREDENTIAL_CLASS_FORBIDDEN"],
  ])("returns only allowlisted authentication errors", async (error, status, code) => {
    const response = await createRunsHandler({
      authenticate: async () => { throw error },
      issue: vi.fn(),
    })(new Request("http://localhost/api/plugins/bumblebee/runs", { method: "POST" }))
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: code })
  })

  it.each([
    "BUMBLEBEE_TOKEN_SECRET must be set (>=16 chars)",
    "password authentication failed for user secret_admin",
    "relation private_runner_tokens does not exist",
  ])("sanitizes unknown auth/config/database failures: %s", async (privateMessage) => {
    const response = await createRunsHandler({
      authenticate: async () => { throw new Error(privateMessage) },
      issue: vi.fn(),
    })(new Request("http://localhost/api/plugins/bumblebee/runs", { method: "POST" }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "BUMBLEBEE_SERVICE_UNAVAILABLE" })
  })

  it("maps known lease-domain failures but never discloses unknown issuance internals", async () => {
    const request = () => new Request("http://localhost/api/plugins/bumblebee/runs", {
      method: "POST",
      body: JSON.stringify({ sourceId: "source-1", sourceRevisionId: "revision-1", durationSeconds: 60 }),
    })
    const authenticate = async () => ({ rawToken: "bmb_runner_abcdefgh_body" })
    const mismatch = await createRunsHandler({
      authenticate,
      issue: async () => { throw new Error("BUMBLEBEE_LEASE_SOURCE_REVISION_MISMATCH") },
    })(request())
    const invalidDuration = await createRunsHandler({
      authenticate,
      issue: async () => { throw new Error("BUMBLEBEE_LEASE_INVALID_DURATION") },
    })(request())
    const internal = await createRunsHandler({
      authenticate,
      issue: async () => { throw new Error("duplicate key exposes private_table and digest deadbeef") },
    })(request())

    expect([mismatch.status, invalidDuration.status, internal.status]).toEqual([409, 400, 503])
    expect(await mismatch.json()).toEqual({ error: "BUMBLEBEE_LEASE_SOURCE_REVISION_MISMATCH" })
    expect(await invalidDuration.json()).toEqual({ error: "BUMBLEBEE_LEASE_INVALID_DURATION" })
    expect(await internal.json()).toEqual({ error: "BUMBLEBEE_SERVICE_UNAVAILABLE" })
  })

  it("requires and forwards the complete source identity", async () => {
    const issue = vi.fn(async () => ({ leaseId: "lease-1", generation: 1 }))
    const handler = createRunsHandler({
      authenticate: async () => ({ rawToken: "bmb_runner_abcdefgh_body" }),
      issue,
    })

    const accepted = await handler(new Request("http://localhost/api/plugins/bumblebee/runs", {
      method: "POST",
      body: JSON.stringify({ sourceId: "source-1", sourceRevisionId: "revision-1", durationSeconds: 60 }),
    }))
    const ambiguous = await handler(new Request("http://localhost/api/plugins/bumblebee/runs", {
      method: "POST",
      body: JSON.stringify({ sourceRevisionId: "revision-1", durationSeconds: 60 }),
    }))

    expect(accepted.status).toBe(201)
    expect(ambiguous.status).toBe(400)
    expect(issue).toHaveBeenCalledOnce()
    expect(issue).toHaveBeenCalledWith({
      runnerToken: "bmb_runner_abcdefgh_body",
      sourceId: "source-1",
      sourceRevisionId: "revision-1",
      durationSeconds: 60,
    })
  })
})
