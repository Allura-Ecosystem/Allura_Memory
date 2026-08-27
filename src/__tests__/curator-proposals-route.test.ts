import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

let mockAuthResult: {
  allowed: boolean
  reason?: string
  requiredRole: string
  actualRole: string
  user: { id: string; email: string; role: "viewer"; groupId: string; workspaceId?: string } | null
}

const { queryMock, withWorkspaceTransactionMock } = vi.hoisted(() => {
  const queryMock = vi.fn()
  const withWorkspaceTransactionMock = vi.fn(
    (_scope: unknown, action: (client: { query: typeof queryMock }) => Promise<unknown>) => action({ query: queryMock }),
  )
  return { queryMock, withWorkspaceTransactionMock }
})

vi.mock("@/lib/auth/api-auth", () => ({
  requireRole: vi.fn(() => mockAuthResult),
  unauthorizedResponse: vi.fn(() => NextResponse.json({ error: "Authentication required" }, { status: 401 })),
  forbiddenResponse: vi.fn(() => NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })),
}))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: withWorkspaceTransactionMock }))
vi.mock("@/lib/observability/sentry", () => ({ captureException: vi.fn() }))

import { GET } from "@/app/api/curator/proposals/route"

function makeRequest(query = ""): NextRequest {
  return new NextRequest(new URL(`/api/curator/proposals${query}`, "http://localhost:3100"))
}

function seedReadRows() {
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM canonical_proposals")) {
      return { rows: [{
        id: "proposal-1", group_id: "allura-test", workspace_id: "workspace-test",
        content: "Promote this memory", score: "0.91", reasoning: "Evidence is sufficient",
        tier: "mainstream", status: "approved", trace_ref: 42, created_at: "2026-06-06T00:00:00.000Z",
      }] }
    }
    if (sql.includes("FROM evidence_requests")) {
      return { rows: [{
        id: "evidence-1", proposal_id: "proposal-1", requested_by: "curator-alice",
        requested_at: "2026-06-06T00:01:00.000Z", state: "satisfied", reason: "Attach source trace",
        resolved_at: "2026-06-06T00:02:00.000Z", resolved_by: "reviewer-1", evidence_references: ["event:42"],
      }] }
    }
    if (sql.includes("FROM governance_receipts")) {
      return { rows: [{
        id: "receipt-1", proposal_id: "proposal-1", action: "approve", actor_id: "curator-alice",
        actor_role: "curator", rationale: "Evidence is sufficient", policy_reference: "policy://allura/curator-decision",
        policy_version: "25.2a/v1", memory_id: "memory-1", result_ref: null, outbox_state: "queued",
        evidence_request_id: null, evidence_references: ["event:42"], occurred_at: "2026-06-06T00:05:00.000Z",
      }] }
    }
    throw new Error(`unexpected query: ${sql}`)
  })
}

describe("GET /api/curator/proposals", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthResult = {
      allowed: true, requiredRole: "viewer", actualRole: "viewer",
      user: { id: "viewer-1", email: "viewer@example.test", role: "viewer", groupId: "allura-test", workspaceId: "workspace-test" },
    }
  })

  it("derives tenant and workspace from the authenticated principal, not URL selectors", async () => {
    seedReadRows()

    const response = await GET(makeRequest("?group_id=allura-test&workspace_id=workspace-test&status=approved"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(withWorkspaceTransactionMock).toHaveBeenCalledWith(
      { tenantId: "allura-test", workspaceId: "workspace-test", principalId: "viewer-1" }, expect.any(Function),
    )
    expect(body.proposals[0]).toMatchObject({
      id: "proposal-1",
      evidence: [expect.objectContaining({ id: "evidence-1", state: "satisfied" })],
      decision_receipt: expect.objectContaining({ id: "receipt-1", action: "approve", actor_id: "curator-alice" }),
    })
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("FROM events"))).toBe(false)
  })

  it("rejects forged tenant or workspace selectors before opening a transaction", async () => {
    for (const selector of ["?group_id=allura-forged", "?workspace_id=workspace-forged"]) {
      const response = await GET(makeRequest(selector))
      expect(response.status, selector).toBe(403)
    }
    expect(withWorkspaceTransactionMock).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it("fails closed when authenticated workspace authority is missing", async () => {
    mockAuthResult.user = { ...mockAuthResult.user!, workspaceId: undefined }

    const response = await GET(makeRequest())

    expect(response.status).toBe(403)
    expect(withWorkspaceTransactionMock).not.toHaveBeenCalled()
    expect(queryMock).not.toHaveBeenCalled()
  })

  it("uses both effective tenant and workspace predicates for every proposal, evidence, and receipt read", async () => {
    seedReadRows()

    const response = await GET(makeRequest())

    expect(response.status).toBe(200)
    const scopedQueries = queryMock.mock.calls.map(([sql, params]) => [String(sql), params] as const)
    expect(scopedQueries).toHaveLength(3)
    for (const [sql, params] of scopedQueries) {
      expect(sql).toContain("group_id = $1")
      expect(sql).toContain("workspace_id = $2")
      expect(params).toEqual(expect.arrayContaining(["allura-test", "workspace-test"]))
    }
  })

  it("keeps dashboard/curator as the only future registry host while 25.3b is blocked", async () => {
    const fs = await import("node:fs")
    const root = process.cwd()
    const routeSource = await (await import("node:fs/promises")).readFile(`${root}/src/app/api/curator/proposals/route.ts`, "utf8")

    expect(routeSource).toContain("withWorkspaceTransaction")
    expect(routeSource).toContain("FROM evidence_requests")
    expect(routeSource).toContain("FROM governance_receipts")
    expect(routeSource).not.toContain("getPool")
    expect(routeSource).not.toContain("FROM events")
    expect(routeSource).not.toContain("buildCuratorDecisionReceipt")
    expect(fs.existsSync(`${root}/src/app/dashboard/curator/page.tsx`)).toBe(true)
    expect(fs.existsSync(`${root}/src/app/dashboard/bumblebee/page.tsx`)).toBe(false)
  })
})
