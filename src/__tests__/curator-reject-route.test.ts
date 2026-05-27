/**
 * @vitest-environment node
 */
import { NextRequest } from "next/server"
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
    expect(await response.json()).toEqual({ error: "rationale is required for curator decisions" })
    expect(queryMock).not.toHaveBeenCalled()
  })

  it("delegates legacy rejection to the governed decision door", async () => {
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

    expect(body.receipt).toMatchObject({
      proposal_id: "proposal-1",
      group_id: "allura-test",
      decision: "rejected",
      resulting_status: "rejected",
      actor: "curator-1",
      rationale: "not enough evidence",
      notion_sync: "pending",
    })

    const updateCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("UPDATE canonical_proposals"))
    expect(String(updateCall?.[0])).toContain("group_id = $7")
    expect(String(updateCall?.[0])).toContain("status = 'pending'")
    expect(updateCall?.[1]).toEqual(["rejected", decidedAt, "curator-1", "not enough evidence", expect.any(String), "proposal-1", "allura-test"])

    const eventCall = queryMock.mock.calls.find(
      ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "proposal_rejected",
    )
    const metadata = JSON.parse(String((eventCall?.[1] as unknown[])[4]))
    expect(metadata).toMatchObject({
      proposal_id: "proposal-1",
      decision: "rejected",
      resulting_status: "rejected",
      curator_id: "curator-1",
      rationale: "not enough evidence",
    })
  })
})
