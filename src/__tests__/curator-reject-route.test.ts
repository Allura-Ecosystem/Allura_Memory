/**
 * @vitest-environment node
 */
import { NextRequest } from "next/server"
import { createHash } from "crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const queryMock = vi.fn()

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => ({ user: { id: "curator-1" }, allowed: true })),
  unauthorizedResponse: vi.fn(),
  forbiddenResponse: vi.fn(),
}))

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
}))

vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(),
}))

import { POST } from "@/app/api/curator/reject/route"

beforeEach(() => {
  queryMock.mockReset()
})

describe("curator reject route", () => {
  it("returns 400 when rationale is blank", async () => {
    const request = new NextRequest("http://localhost:4748/api/curator/reject", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-1",
        group_id: "allura-test",
        rationale: "   ",
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "rationale is required" })
    expect(queryMock).not.toHaveBeenCalled()
  })

  it("uses the authenticated curator id even if the body is spoofed", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) {
        return {
          rows: [
            {
              id: "proposal-1",
              group_id: "allura-test",
              content: "Reject me",
              score: "0.77",
              reasoning: "Needs more evidence",
              tier: "emerging",
              status: "pending",
              trace_ref: "trace-1",
            },
          ],
        }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/reject", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-1",
        group_id: "allura-test",
        curator_id: "spoofed-curator",
        rationale: "not enough evidence",
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    const decidedAt = body.decided_at as string
    const expectedHash = createHash("shake256", { outputLength: 64 })
      .update(`proposal-1|allura-test|Reject me|0.77|emerging|reject|${decidedAt}|curator-1`)
      .digest("hex")

    const updateCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("UPDATE canonical_proposals"))
    expect(updateCall?.[1]).toEqual([decidedAt, "curator-1", "not enough evidence", expectedHash, "proposal-1"])

    const eventCall = queryMock.mock.calls.find(([, params]) => Array.isArray(params) && params[1] === "proposal_rejected")
    expect(eventCall?.[1]).toEqual([
      "allura-test",
      "proposal_rejected",
      "curator-1",
      "completed",
      JSON.stringify({ proposal_id: "proposal-1", score: "0.77", tier: "emerging", rationale: "not enough evidence" }),
      decidedAt,
    ])
  })
})
