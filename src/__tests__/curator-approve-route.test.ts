/**
 * @vitest-environment node
 */
import { readFileSync } from "fs"
import { NextRequest } from "next/server"
import { createHash } from "crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const queryMock = vi.fn()

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => ({ user: { id: "curator-1", role: "curator" }, allowed: true })),
  unauthorizedResponse: vi.fn(),
  forbiddenResponse: vi.fn(),
}))

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
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
import { requireRole } from "@/lib/auth/api-auth"
import { createInsight } from "@/lib/neo4j/queries/insert-insight"
import { getPool } from "@/lib/postgres/connection"

beforeEach(() => {
  queryMock.mockReset()
  ;(createInsight as any).mockClear()
    ;(requireRole as any).mockReturnValue({ user: { id: "curator-1", role: "curator" }, allowed: true })
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

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
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
    expect(createInsight).not.toHaveBeenCalled()
    const body = await response.json()
    const decidedAt = body.decided_at as string
    expect(body.receipt).toMatchObject({
      proposal_id: "proposal-1",
      group_id: "allura-test",
      decision: "approved",
      resulting_status: "approved",
      actor: "curator-1",
      rationale: "approved for release",
      notion_sync: "pending",
    })
    expect(body.receipt.decided_at).toBe(decidedAt)
    const expectedHash = createHash("shake256", { outputLength: 64 })
      .update(`proposal-1|allura-test|Promote me|0.91|mainstream|approve|${decidedAt}|curator-1`)
      .digest("hex")

    const updateCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("UPDATE canonical_proposals"))
    expect(String(updateCall?.[0])).toContain("group_id = $7")
    expect(String(updateCall?.[0])).toContain("status = 'pending'")
    expect(updateCall?.[1]).toEqual(["approved", decidedAt, "curator-1", "approved for release", expectedHash, "proposal-1", "allura-test"])

    const eventCall = queryMock.mock.calls.find(
      ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "proposal_approved",
    )
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
      requested_by: "agent-woz",
      curator_id: "curator-1",
      decision_actor_role: "curator",
      score: 0.91,
      tier: "mainstream",
      rationale: "approved for release",
    })
    expect(JSON.parse(String(eventParams[4])).memory_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const promotionCall = queryMock.mock.calls.find(
      ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "promotion_sync_pending",
    )
    expect(promotionCall).toBeDefined()
    expect(JSON.parse(String((promotionCall?.[1] as unknown[])[4]))).toMatchObject({
      proposal_id: "proposal-1",
      curator_id: "curator-1",
      requested_by: "agent-woz",
      rationale: "approved for release",
    })
  })

  it("fails closed when approving a proposal without requester provenance", async () => {
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
              trace_ref: "missing-trace",
            },
          ],
        }
      }

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [] }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({ proposal_id: "proposal-1", group_id: "allura-test", decision: "approve", rationale: "Approve with provenance" }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toMatch(/requester provenance/i)
    expect(createInsight).not.toHaveBeenCalled()
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("UPDATE canonical_proposals"))).toBe(false)
  })

  it("requires a human rationale before approving or rejecting a proposal", async () => {
    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({ proposal_id: "proposal-1", group_id: "allura-test", decision: "reject" }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/rationale/i)
    expect(queryMock).not.toHaveBeenCalled()
    expect(createInsight).not.toHaveBeenCalled()
  })

  it("rejects proposals with append-only audit and without deleting source evidence or promoting to Neo4j", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) {
        return {
          rows: [
            {
              id: "proposal-1",
              group_id: "allura-test",
              content: "Do not promote me",
              score: "0.42",
              reasoning: "Weak evidence",
              tier: "emerging",
              status: "pending",
              trace_ref: "trace-1",
            },
          ],
        }
      }

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-1",
        group_id: "allura-test",
        decision: "reject",
        rationale: "Insufficient evidence for semantic promotion",
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, notion_sync: "pending" })
    expect(createInsight).not.toHaveBeenCalled()

    const updateCall = queryMock.mock.calls.find(([sql]) => String(sql).includes("UPDATE canonical_proposals"))
    expect(String(updateCall?.[0])).toContain("SET status = $1")
    expect(String(updateCall?.[0])).toContain("group_id = $7")
    expect(String(updateCall?.[0])).toContain("status = 'pending'")
    expect(updateCall?.[1]).toEqual(["rejected", body.decided_at, "curator-1", "Insufficient evidence for semantic promotion", expect.any(String), "proposal-1", "allura-test"])

    const eventCall = queryMock.mock.calls.find(
      ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "proposal_rejected",
    )
    expect(eventCall).toBeDefined()
    expect(JSON.parse(String((eventCall?.[1] as unknown[])[4]))).toMatchObject({
      proposal_id: "proposal-1",
      requested_by: "agent-woz",
      curator_id: "curator-1",
      decision: "rejected",
      rationale: "Insufficient evidence for semantic promotion",
      score: 0.42,
      tier: "emerging",
    })

    const allSql = queryMock.mock.calls.map(([sql]) => String(sql)).join("\n")
    expect(allSql).not.toMatch(/DELETE FROM events|DELETE FROM canonical_proposals/i)
  })

  it("records request-evidence without inventing an unsupported proposal status or promoting to Neo4j", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) {
        return {
          rows: [
            {
              id: "proposal-3",
              group_id: "allura-test",
              content: "Needs proof",
              score: "0.71",
              reasoning: "Evidence gap",
              tier: "adoption",
              status: "pending",
              trace_ref: "trace-3",
            },
          ],
        }
      }

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-3",
        group_id: "allura-test",
        decision: "request_evidence",
        rationale: "Attach the source trace before promotion review",
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(createInsight).not.toHaveBeenCalled()
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("UPDATE canonical_proposals"))).toBe(false)
    expect(queryMock.mock.calls.some(([sql]) => String(sql).match(/DELETE\s+FROM/i))).toBe(false)

    const eventCall = queryMock.mock.calls.find(
      ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "proposal_evidence_requested",
    )
    expect(eventCall).toBeDefined()
    const metadata = JSON.parse(String((eventCall?.[1] as unknown[])[4]))
    expect(metadata).toMatchObject({
      proposal_id: "proposal-3",
      requested_by: "agent-woz",
      curator_id: "curator-1",
      decision_actor_role: "curator",
      decision: "needs_evidence",
      resulting_status: "pending",
      rationale: "Attach the source trace before promotion review",
    })
    expect(body.receipt).toMatchObject({
      proposal_id: "proposal-3",
      group_id: "allura-test",
      decision: "needs_evidence",
      previous_status: "pending",
      resulting_status: "pending",
      promoted_memory_id: null,
      actor: "curator-1",
      rationale: "Attach the source trace before promotion review",
      notion_sync: "pending",
    })
  })

  it("passes source trace requester into approval audit for segregation-of-duties enforcement", async () => {
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

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({ proposal_id: "proposal-1", group_id: "allura-test", decision: "approve", rationale: "Curator rationale" }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    const eventCall = queryMock.mock.calls.find(
      ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "proposal_approved",
    )
    const metadata = JSON.parse(String((eventCall?.[1] as unknown[])[4]))
    expect(metadata).toMatchObject({ requested_by: "agent-woz", curator_id: "curator-1", decision_actor_role: "curator" })
  })

  it("does not fabricate authored-by provenance from the curator when proposal creator is missing", () => {
    const source = readFileSync("src/app/api/curator/approve/route.ts", "utf8")

    expect(source).toContain("const agentId = proposalRequester ?? null")
    expect(source).toContain("agent_id: proposalRequester ?? null")
    expect(source).not.toContain("proposal.created_by ?? curatorId")
  })

  it("rejects a proposal with an audit receipt and without deleting source evidence or promoting to Neo4j", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) {
        return {
          rows: [
            {
              id: "proposal-2",
              group_id: "allura-test",
              content: "Reject me",
              score: "0.42",
              reasoning: "Too vague",
              tier: "emerging",
              status: "pending",
              trace_ref: "trace-2",
            },
          ],
        }
      }

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-2",
        group_id: "allura-test",
        decision: "reject",
        rationale: "Needs stronger evidence",
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(createInsight).not.toHaveBeenCalled()
    expect(queryMock.mock.calls.some(([sql]) => String(sql).match(/DELETE\s+FROM/i))).toBe(false)
    expect(body.receipt).toMatchObject({
      proposal_id: "proposal-2",
      group_id: "allura-test",
      decision: "rejected",
      resulting_status: "rejected",
      actor: "curator-1",
      rationale: "Needs stronger evidence",
      notion_sync: "pending",
    })

    const eventCall = queryMock.mock.calls.find(
      ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "proposal_rejected",
    )
    const metadata = JSON.parse(String((eventCall?.[1] as unknown[])[4]))
    expect(metadata).toMatchObject({
      proposal_id: "proposal-2",
      requested_by: "agent-woz",
      curator_id: "curator-1",
      decision_actor_role: "curator",
      decision: "rejected",
      resulting_status: "rejected",
      rationale: "Needs stronger evidence",
    })
  })

  it("does not emit audit or promotion when the pending proposal transition loses a race", async () => {
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

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }

      if (sql.includes("UPDATE canonical_proposals")) {
        return { rows: [], rowCount: 0 }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-1",
        group_id: "allura-test",
        decision: "approve",
        rationale: "Approve with race guard",
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(/no longer pending/i)
    expect(createInsight).not.toHaveBeenCalled()
    expect(
      queryMock.mock.calls.some(
        ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "proposal_approved",
      ),
    ).toBe(false)
  })

  it("rolls back approval when the durable promotion outbox cannot be written", async () => {
    const clientQueryMock = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("UPDATE canonical_proposals")) return { rows: [], rowCount: 1 }
      if (sql.includes("SELECT id") && sql.includes("event_type")) return { rows: [], rowCount: 0 }
      if (sql.includes("INSERT INTO events") && params?.[1] === "promotion_sync_pending") throw new Error("outbox unavailable")
      if (sql.includes("INSERT INTO events")) return { rows: [{ id: 999 }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    const releaseMock = vi.fn()
    ;(getPool as any).mockReturnValueOnce({
      query: queryMock,
      connect: vi.fn(async () => ({ query: clientQueryMock, release: releaseMock })),
    })
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

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-1",
        group_id: "allura-test",
        decision: "approve",
        rationale: "Approve only with durable promotion outbox",
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toMatch(/failed to process curator decision/i)
    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql) === "ROLLBACK")).toBe(true)
    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql) === "COMMIT")).toBe(false)
    expect(releaseMock).toHaveBeenCalled()
    expect(createInsight).not.toHaveBeenCalled()
    expect(
      clientQueryMock.mock.calls.some(
        ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "notion_sync_pending",
      ),
    ).toBe(false)
  })

  it("rolls back request-evidence audit when the durable Notion outbox cannot be written", async () => {
    // NOTION_SYNC_ENABLED=true: testing flag-on behavior (sunset ADR 2026-07-02)
    process.env.NOTION_SYNC_ENABLED = "true"
    const clientQueryMock = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT INTO events") && params?.[1] === "notion_sync_pending") throw new Error("notion outbox unavailable")
      if (sql.includes("INSERT INTO events")) return { rows: [{ id: 999 }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    const releaseMock = vi.fn()
    ;(getPool as any).mockReturnValueOnce({
      query: queryMock,
      connect: vi.fn(async () => ({ query: clientQueryMock, release: releaseMock })),
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) {
        return {
          rows: [
            {
              id: "proposal-3",
              group_id: "allura-test",
              content: "Needs evidence",
              score: "0.71",
              reasoning: "Evidence gap",
              tier: "adoption",
              status: "pending",
              trace_ref: "trace-3",
            },
          ],
        }
      }

      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }

      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-3",
        group_id: "allura-test",
        decision: "request_evidence",
        rationale: "Need source packet before approval",
      }),
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body.error).toMatch(/failed to process curator decision/i)
    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql) === "ROLLBACK")).toBe(true)
    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql) === "COMMIT")).toBe(false)
    expect(releaseMock).toHaveBeenCalled()

    delete process.env.NOTION_SYNC_ENABLED
  })

  it("does not emit notion_sync_pending when NOTION_SYNC_ENABLED is unset (sunset ADR 2026-07-02)", async () => {
    delete process.env.NOTION_SYNC_ENABLED
    const clientQueryMock = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("UPDATE canonical_proposals")) return { rows: [], rowCount: 1 }
      if (sql.includes("INSERT INTO events")) return { rows: [{ id: 999 }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    const releaseMock = vi.fn()
    ;(getPool as any).mockReturnValueOnce({
      query: queryMock,
      connect: vi.fn(async () => ({ query: clientQueryMock, release: releaseMock })),
    })
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM canonical_proposals")) {
        return {
          rows: [
            {
              id: "proposal-nosync",
              group_id: "allura-test",
              content: "No notion sync",
              score: "0.72",
              reasoning: "Flag off",
              tier: "adoption",
              status: "pending",
              trace_ref: "trace-nosync",
            },
          ],
        }
      }
      if (sql.includes("FROM events") && sql.includes("agent_id")) {
        return { rows: [{ agent_id: "agent-woz" }] }
      }
      return { rows: [] }
    })

    const request = new NextRequest("http://localhost:4748/api/curator/approve", {
      method: "POST",
      body: JSON.stringify({
        proposal_id: "proposal-nosync",
        group_id: "allura-test",
        decision: "request_evidence",
        rationale: "Notion sync disabled",
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(
      clientQueryMock.mock.calls.some(
        ([sql, params]) => String(sql).includes("INSERT INTO events") && Array.isArray(params) && params[1] === "notion_sync_pending",
      ),
    ).toBe(false)
  })
})
