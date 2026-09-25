import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction }))

import { GET as count } from "@/app/api/memory/count/route"
import { GET as stats } from "@/app/api/memory/stats/route"

function request(path: string, role = "viewer"): NextRequest {
  return new NextRequest(`http://localhost:3100${path}`, {
    headers: {
      "x-allura-user-id": "owner-user",
      "x-allura-role": role,
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

describe("memory aggregate authority", () => {
  it.each([
    ["count", count],
    ["stats", stats],
  ])("denies forged scope before %s query", async (_name, handler) => {
    for (const query of ["group_id=allura-other", "workspace_id=other-workspace"]) {
      expect((await handler(request(`/api/memory/${_name}?${query}`))).status).toBe(403)
    }
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([
    ["count", count],
    ["stats", stats],
  ])("denies a viewer probing another user's %s", async (name, handler) => {
    const response = await handler(request(`/api/memory/${name}?user_id=other-user`))
    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("allows an administrator to select another user's aggregate", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "a" }] })
      .mockResolvedValueOnce({ rows: [] })
    const response = await count(request("/api/memory/count?user_id=other-user", "admin"))
    expect(response.status).toBe(200)
    for (const [, values] of mocks.query.mock.calls)
      expect(values).toEqual(["allura-system", "workspace-a", "other-user"])
  })

  it("counts only through the verified restricted workspace transaction", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }] })
      .mockResolvedValueOnce({ rows: [{ id: "b" }, { id: "c" }] })
    const response = await count(request("/api/memory/count?group_id=allura-system&workspace_id=workspace-a"))
    expect(await response.json()).toEqual({ count: 3 })
    expect(mocks.transaction).toHaveBeenCalledWith(
      { tenantId: "allura-system", workspaceId: "workspace-a", principalId: "owner-user" },
      expect.any(Function)
    )
    for (const [, values] of mocks.query.mock.calls) expect(values).toEqual(["allura-system", "workspace-a", null])
    expect(mocks.query.mock.calls[0][0]).toContain("lifecycle.event_type")
    expect(mocks.query.mock.calls[1][0]).toContain("graph_supersedes")
  })

  it("computes stats only from workspace-filtered rows", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ episodic_count: "2", search_count: "1", last_activity: new Date("2026-09-24T00:00:00Z") }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "a" }, { id: "b" }] })
      .mockResolvedValueOnce({ rows: [{ id: "b" }] })
    const response = await stats(request("/api/memory/stats?user_id=owner-user"))
    expect(await response.json()).toEqual({
      episodic_count: 2,
      semantic_count: 1,
      search_count: 1,
      total_count: 2,
      last_activity: "2026-09-24T00:00:00.000Z",
    })
    for (const [sql, values] of mocks.query.mock.calls) {
      expect(sql).toContain("workspace_id = $2")
      expect(values).toEqual(["allura-system", "workspace-a", "owner-user"])
    }
    expect(mocks.query.mock.calls[0][0]).toContain("lifecycle.event_type")
    expect(mocks.query.mock.calls[1][0]).toContain("lifecycle.event_type")
    expect(mocks.query.mock.calls[2][0]).toContain("graph_supersedes")
  })
})
