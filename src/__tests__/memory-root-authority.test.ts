import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ add: vi.fn(), search: vi.fn(), list: vi.fn(), deleted: vi.fn() }))
vi.mock("@/mcp/canonical-tools", () => ({
  memory_add: mocks.add, memory_search: mocks.search, memory_list: mocks.list,
  memory_list_deleted: mocks.deleted, memory_get: vi.fn(), memory_delete: vi.fn(),
}))
vi.mock("@/lib/observability/sentry", () => ({ captureException: vi.fn() }))

import { GET, POST } from "@/app/api/memory/route"

function request(path: string, role: "viewer" | "curator" = "curator", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3100${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-allura-user-id": "owner-user", "x-allura-role": role,
      "x-allura-group-id": "allura-system", "x-allura-workspace-id": "workspace-a",
      "x-allura-session-id": "verified-session", "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.add.mockResolvedValue({ id: "synthetic-memory", stored: "episodic", score: 0.1 })
  mocks.search.mockResolvedValue({ results: [], count: 0 })
  mocks.list.mockResolvedValue({ memories: [], total: 0 })
  mocks.deleted.mockResolvedValue({ memories: [], total: 0 })
})
afterEach(() => vi.unstubAllEnvs())

describe("canonical REST memory authority at the web boundary", () => {
  it("denies a different tenant before any write or read tool call", async () => {
    const write = await POST(request("/api/memory", "curator", {
      group_id: "allura-other", user_id: "owner-user", content: "SYNTHETIC TEST DATA",
    }))
    const read = await GET(request("/api/memory?group_id=allura-other&query=private"))
    expect(write.status).toBe(403)
    expect(read.status).toBe(403)
    expect(await write.json()).toEqual({ error: "TENANT_MISMATCH" })
    expect(mocks.add).not.toHaveBeenCalled()
    expect(mocks.search).not.toHaveBeenCalled()
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it("requires curator authority for write and binds its scope to the verified web user", async () => {
    const viewer = await POST(request("/api/memory", "viewer", {
      group_id: "allura-system", user_id: "owner-user", content: "SYNTHETIC TEST DATA",
    }))
    expect(viewer.status).toBe(403)
    expect(mocks.add).not.toHaveBeenCalled()
    const curator = await POST(request("/api/memory", "curator", {
      group_id: "allura-system", user_id: "owner-user", content: "SYNTHETIC TEST DATA",
      metadata: { source: "manual", agent_id: "forged-actor" },
      scope: { group_id: "allura-other", workspace_id: "forged-workspace", agent_id: "forged-actor" },
    }))
    expect(curator.status).toBe(200)
    expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({
      group_id: "allura-system",
      scope: { group_id: "allura-system", workspace_id: "workspace-a",
        agent_id: "owner-user", session_id: "verified-session" },
      metadata: { source: "manual", agent_id: "owner-user" },
    }))
  })

  it("binds list, search, and deleted-list to the same verified workspace scope", async () => {
    expect((await GET(request("/api/memory?group_id=allura-system"))).status).toBe(200)
    expect((await GET(request("/api/memory?group_id=allura-system&query=sample"))).status).toBe(200)
    expect((await GET(request("/api/memory?group_id=allura-system&status=deleted"))).status).toBe(200)
    const scope = { group_id: "allura-system", workspace_id: "workspace-a",
      agent_id: "owner-user", session_id: "verified-session" }
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ scope }))
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ scope }))
    expect(mocks.deleted).toHaveBeenCalledWith(expect.objectContaining({ scope }))
  })
})
