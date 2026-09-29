import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock("@/mcp/canonical-tools", () => ({
  memory_get: mocks.get, memory_update: mocks.update, memory_delete: mocks.remove,
}))

import { DELETE, GET, PUT } from "@/app/api/memory/[id]/route"

const params = { params: Promise.resolve({ id: "memory-a" }) }
function request(method: "GET" | "PUT" | "DELETE", role: "viewer" | "curator" | "admin",
  query = "group_id=allura-system&user_id=forged-user", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3100/api/memory/memory-a?${query}`, {
    method,
    headers: { "x-allura-user-id": "owner-user", "x-allura-role": role,
      "x-allura-group-id": "allura-system", "x-allura-workspace-id": "workspace-a",
      "x-allura-session-id": "verified-session", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue({ id: "memory-a", content: "SYNTHETIC", score: 1 })
  mocks.update.mockResolvedValue({ id: "memory-b", supersedes: "memory-a" })
  mocks.remove.mockResolvedValue({ id: "memory-a", deleted: true })
})

describe("individual memory REST authority", () => {
  it("denies cross-tenant selectors before every canonical tool", async () => {
    expect((await GET(request("GET", "viewer", "group_id=allura-other"), params)).status).toBe(403)
    expect((await PUT(request("PUT", "curator", "group_id=allura-other", { content: "changed" }), params)).status).toBe(403)
    expect((await DELETE(request("DELETE", "admin", "group_id=allura-other"), params)).status).toBe(403)
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it("binds read scope to the verified principal", async () => {
    expect((await GET(request("GET", "viewer"), params)).status).toBe(200)
    expect(mocks.get).toHaveBeenCalledWith({ id: "memory-a", group_id: "allura-system",
      scope: { group_id: "allura-system", workspace_id: "workspace-a",
        agent_id: "owner-user", session_id: "verified-session" } })
  })

  it("requires curator update and ignores forged user, actor metadata, and body scope", async () => {
    expect((await PUT(request("PUT", "viewer", undefined, { content: "changed" }), params)).status).toBe(403)
    const response = await PUT(request("PUT", "curator", undefined, { content: "changed",
      metadata: { agent_id: "forged-agent", source: "manual" }, scope: { group_id: "allura-other" } }), params)
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "owner-user", metadata: { agent_id: "owner-user", source: "manual" },
      scope: { group_id: "allura-system", workspace_id: "workspace-a",
        agent_id: "owner-user", session_id: "verified-session" },
    }))
  })

  it("requires admin delete and uses the verified actor instead of query user_id", async () => {
    expect((await DELETE(request("DELETE", "curator"), params)).status).toBe(403)
    expect((await DELETE(request("DELETE", "admin"), params)).status).toBe(200)
    expect(mocks.remove).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner-user",
      scope: { group_id: "allura-system", workspace_id: "workspace-a",
        agent_id: "owner-user", session_id: "verified-session" } }))
  })
})
