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

vi.mock("@/lib/memory/approval-audit", () => ({
  logApprovalEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/neo4j/queries/insert-insight", () => ({
  createInsight: vi.fn().mockResolvedValue(undefined),
  InsightConflictError: class InsightConflictError extends Error {},
}))

vi.mock("@/lib/neo4j/connection", () => ({
  getDriver: vi.fn(() => ({
    session: vi.fn(),
    close: vi.fn(),
  })),
}))

vi.mock("@/lib/graph-adapter/neo4j-adapter", () => ({
  Neo4jGraphAdapter: class MockNeo4jGraphAdapter {
    async linkMemoryContext() { return { authored_by: null, relates_to: null } }
    async close() {}
  },
}))

vi.mock("@/lib/observability/sentry", () => ({
  captureException: vi.fn(),
}))

import { POST } from "@/app/api/curator/approve/route"
import { logApprovalEvent } from "@/lib/memory/approval-audit"
import { createInsight } from "@/lib/neo4j/queries/insert-insight"

beforeEach(() => {
  queryMock.mockReset()
  ;(logApprovalEvent as any).mockClear()
  ;(createInsight as any).mockClear()
})

describe("curator approve route", () => {
  it("uses the authenticated curator id even if the body is spoofed", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) {
        return {
          rows: [
            {
              id: "proposal-1",
              group_id: "allura-test",
              content: "Promote me",
              score: "0.91",
              reasoning: "Ready",
              tier: "mainstream",
              status: "pending",
              trace_ref: "trace-1",
            },
          ],
        }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-1",
        group_id: "allura-test",
        decision: "approve",
        curator_id: "spoofed-curator",
        rationale: "approved for release",
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(createInsight).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: "curator-1" }),
    )
    expect(logApprovalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ curator_id: "curator-1", decision: "approved" }),
      expect.anything(),
    )

    const body = await response.json()
    const decidedAt = body.decided_at as string
    const expectedHash = createHash("shake256", { outputLength: 64 })
      .update(`proposal-1|allura-test|Promote me|0.91|mainstream|approve|${decidedAt}|curator-1`)
      .digest("hex")

    const updateCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("UPDATE canonical_proposals"))
    expect(updateCall?.[1]).toEqual([decidedAt, "curator-1", "approved for release", expectedHash, "proposal-1"])

    const eventCall = queryMock.mock.calls.find(([, params]) => Array.isArray(params) && params[1] === "proposal_approved")
    const eventParams = eventCall?.[1] as unknown[]
    expect(eventParams).toBeDefined()
    expect(eventParams).toHaveLength(6)
    expect(eventParams[0]).toBe("allura-test")
    expect(eventParams[1]).toBe("proposal_approved")
    expect(eventParams[2]).toBe("curator-1")
    expect(eventParams[3]).toBe("completed")
    expect(eventParams[5]).toBe(decidedAt)
    expect(JSON.parse(String(eventParams[4]))).toMatchObject({
      proposal_id: "proposal-1",
      score: "0.91",
      tier: "mainstream",
      rationale: "approved for release",
    })
    expect(JSON.parse(String(eventParams[4])).memory_id).toEqual(expect.any(String))
  })
})
