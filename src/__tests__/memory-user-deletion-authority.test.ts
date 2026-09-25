import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn(), delete: vi.fn() }))
vi.mock("@/lib/db/tenant-transaction", () => ({ withWorkspaceTransaction: mocks.transaction }))
vi.mock("@/mcp/canonical-tools", () => ({ memory_delete: mocks.delete }))

import { DELETE } from "@/app/api/memory/user/[userId]/route"

function request(role = "admin"): NextRequest {
  return new NextRequest("http://localhost:3100/api/memory/user/subject-user", {
    method: "DELETE",
    headers: {
      "x-allura-user-id": "verified-admin",
      "x-allura-role": role,
      "x-allura-group-id": "allura-system",
      "x-allura-workspace-id": "workspace-a",
      "x-allura-session-id": "verified-session",
    },
  })
}

const params = { params: Promise.resolve({ userId: "subject-user" }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async (_scope, callback) => callback({ query: mocks.query }))
  mocks.query
    .mockResolvedValueOnce({ rows: [{ memory_id: "memory-1" }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
  mocks.delete.mockResolvedValue({ deleted: true })
})

describe("memory user deletion authority", () => {
  it("requires administrator authority", async () => {
    expect((await DELETE(request("curator"), params)).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it("scans, audits, and deletes only inside the verified workspace", async () => {
    const response = await DELETE(request(), params)
    expect(response.status).toBe(200)
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    for (const [scope] of mocks.transaction.mock.calls)
      expect(scope).toEqual({
        tenantId: "allura-system",
        workspaceId: "workspace-a",
        principalId: "verified-admin",
      })
    const [findSql, findValues] = mocks.query.mock.calls[0]
    expect(findSql).toContain("workspace_id = $2")
    expect(findValues).toEqual(["allura-system", "workspace-a", "subject-user"])
    for (const call of [mocks.query.mock.calls[1], mocks.query.mock.calls[2]]) {
      expect(call[0]).toContain("group_id, workspace_id, event_type, agent_id")
      expect(call[1].slice(0, 4)).toEqual([
        "allura-system",
        "workspace-a",
        expect.stringMatching(/^user_data_deletion_/),
        "verified-admin",
      ])
    }
    expect(mocks.delete).toHaveBeenCalledWith({
      id: "memory-1",
      group_id: "allura-system",
      user_id: "verified-admin",
      scope: {
        group_id: "allura-system",
        workspace_id: "workspace-a",
        agent_id: "verified-admin",
        session_id: "verified-session",
      },
    })
  })

  it("does not expose a canonical deletion failure", async () => {
    mocks.delete.mockRejectedValueOnce(new Error("password=secret"))
    const response = await DELETE(request(), params)
    expect(await response.json()).toMatchObject({ deleted_count: 0, failed_count: 1 })
  })
})
