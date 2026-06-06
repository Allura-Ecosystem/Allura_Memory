import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

let mockAuthResult: {
  allowed: boolean
  reason?: string
  requiredRole: string
  actualRole: string
  user: { id: string; email: string; role: string; groupId: string } | null
}

const queryMock = vi.fn()

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => mockAuthResult),
  unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "Authentication required" }, { status: 401 })),
  forbiddenResponse: vi.fn(() => NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })),
}))

vi.mock("@/lib/postgres/connection", () => ({
  getPool: vi.fn(() => ({ query: queryMock })),
}))

import { GET } from "@/app/api/curator/proposals/route"

function makeRequest(): NextRequest {
  return new NextRequest(new URL("/api/curator/proposals?group_id=allura-test&status=approved", "http://localhost:3100"))
}

describe("GET /api/curator/proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthResult = {
      allowed: true,
      requiredRole: "viewer",
      actualRole: "viewer",
      user: {
        id: "viewer-1",
        email: "viewer@example.test",
        role: "viewer",
        groupId: "allura-test",
      },
    }
  })

  it("maps decided proposal append-only events into inspectable decision receipts", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "proposal-1",
            group_id: "allura-test",
            content: "Promote this memory",
            score: "0.91",
            reasoning: "Evidence is sufficient",
            tier: "mainstream",
            status: "approved",
            trace_ref: 42,
            created_at: "2026-06-06T00:00:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_type: "proposal_approved",
            agent_id: "curator-alice",
            created_at: "2026-06-06T00:05:00.000Z",
            metadata: {
              proposal_id: "proposal-1",
              decision: "approved",
              resulting_status: "approved",
              rationale: "Evidence is sufficient",
              memory_id: "mem-proposal-1",
              curator_id: "curator-alice",
              approved_at: "2026-06-06T00:05:00.000Z",
            },
          },
        ],
      })

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(queryMock).toHaveBeenCalledTimes(2)
    expect(body.proposals[0].decision_receipt).toMatchObject({
      proposal_id: "proposal-1",
      actor: "curator-alice",
      rationale: "Evidence is sufficient",
      previous_status: "pending",
      resulting_status: "approved",
      trace_reference: "42",
      promoted_memory_id: "mem-proposal-1",
      receipt_status: "available",
    })
  })

  it("surfaces pending request-evidence receipts instead of hiding them behind pending status", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: "proposal-2",
            group_id: "allura-test",
            content: "Needs more provenance",
            score: "0.72",
            reasoning: "Evidence packet incomplete",
            tier: "adoption",
            status: "pending",
            trace_ref: 43,
            created_at: "2026-06-06T00:10:00.000Z",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            event_type: "proposal_evidence_requested",
            agent_id: "curator-alice",
            created_at: "2026-06-06T00:15:00.000Z",
            metadata: {
              proposal_id: "proposal-2",
              decision: "needs_evidence",
              resulting_status: "pending",
              rationale: "Attach source trace",
              memory_id: "43",
              curator_id: "curator-alice",
              approved_at: "2026-06-06T00:15:00.000Z",
            },
          },
        ],
      })

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.proposals[0].status).toBe("pending")
    expect(body.proposals[0].decision_receipt).toMatchObject({
      proposal_id: "proposal-2",
      decision: "needs_evidence",
      actor: "curator-alice",
      rationale: "Attach source trace",
      previous_status: "pending",
      resulting_status: "pending",
      trace_reference: "43",
      promoted_memory_id: null,
      receipt_status: "available",
    })
  })
})
