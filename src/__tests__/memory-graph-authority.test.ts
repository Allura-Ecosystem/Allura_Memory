import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction }))

import { GET } from "@/app/api/memory/graph/route"

function request(query = ""): NextRequest {
  return new NextRequest(`http://localhost:3100/api/memory/graph${query}`, {
    headers: {
      "x-allura-user-id": "verified-user",
      "x-allura-role": "viewer",
      "x-allura-group-id": "allura-system",
      "x-allura-workspace-id": "workspace-a",
      "x-allura-session-id": "verified-session",
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
})

describe("memory graph authority", () => {
  it.each(["?group_id=allura-other", "?workspace_id=workspace-other"])(
    "denies forged scope before querying: %s",
    async (query) => {
      expect((await GET(request(query))).status).toBe(403)
      expect(mocks.transaction).not.toHaveBeenCalled()
    }
  )

  it("loads graph stats through the verified restricted workspace", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ total: "3" }] }).mockResolvedValueOnce({ rows: [{ total: "4" }] })
    const response = await GET(request("?stats=true&group_id=allura-system&workspace_id=workspace-a"))
    expect(await response.json()).toEqual({ nodes: [], edges: [], node_count: 3, total_edges: 4 })
    expect(mocks.transaction).toHaveBeenCalledWith(
      { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "verified-user" },
      expect.any(Function)
    )
    for (const [sql, values] of mocks.query.mock.calls) {
      expect(sql).toContain("workspace_id = $2")
      expect(values).toEqual(["allura-system", "workspace-a"])
    }
  })

  it("uses canonical structural-edge columns and workspace-bound joins", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ total: "0" }] })
    expect((await GET(request())).status).toBe(200)
    const [edgeSql, edgeValues] = mocks.query.mock.calls[0]
    expect(edgeSql).toContain("e.from_id")
    expect(edgeSql).toContain("e.to_id")
    expect(edgeSql).toContain("e.rel_type")
    expect(edgeSql).toContain("sn.workspace_id = e.workspace_id")
    expect(edgeValues).toEqual(["allura-system", "workspace-a"])
  })

  it("keeps the degraded event fallback inside the same verified scope", async () => {
    mocks.transaction
      .mockRejectedValueOnce(new Error("password=secret"))
      .mockImplementationOnce(async (_scope, callback) => callback({ query: mocks.query }))
    mocks.query.mockResolvedValueOnce({ rows: [] })
    const response = await GET(request())
    expect(await response.json()).toMatchObject({ degraded: true, source: "postgres_events" })
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    const [sql, values] = mocks.query.mock.calls[0]
    expect(sql).toContain("workspace_id = $2")
    expect(values).toEqual(["allura-system", "workspace-a"])
  })

  it("does not expose backend details when both graph reads fail", async () => {
    mocks.transaction.mockRejectedValue(new Error("password=secret"))
    const response = await GET(request())
    expect(await response.json()).toEqual({
      nodes: [],
      edges: [],
      total_edges: 0,
      degraded: true,
      error: "Graph data is temporarily unavailable",
    })
  })
})
