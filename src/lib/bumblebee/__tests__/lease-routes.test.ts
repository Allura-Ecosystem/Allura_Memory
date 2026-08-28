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
})
