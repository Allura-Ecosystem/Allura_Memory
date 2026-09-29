import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ queryTraces: vi.fn(), logTrace: vi.fn() }))
vi.mock("@/lib/postgres/traces", () => ({ queryWorkspaceTraces: mocks.queryTraces }))
vi.mock("@/lib/postgres/trace-logger", () => ({ logTrace: mocks.logTrace }))

import { GET, POST } from "@/app/api/memory/traces/route"

function request(path: string, role = "viewer", body?: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost:3100${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      "x-allura-user-id": "verified-user",
      "x-allura-role": role,
      "x-allura-group-id": "allura-system",
      "x-allura-workspace-id": "workspace-a",
      "x-allura-session-id": "verified-session",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryTraces.mockResolvedValue([])
  mocks.logTrace.mockResolvedValue({ id: 7 })
})

describe("memory trace authority", () => {
  it.each(["group_id=allura-other", "workspace_id=workspace-other"])(
    "denies forged GET scope before querying: %s",
    async (selector) => {
      expect((await GET(request(`/api/memory/traces?${selector}`))).status).toBe(403)
      expect(mocks.queryTraces).not.toHaveBeenCalled()
    }
  )

  it("queries only the authenticated workspace", async () => {
    const response = await GET(request("/api/memory/traces?limit=12&offset=3&type=decision"))
    expect(response.status).toBe(200)
    expect(mocks.queryTraces).toHaveBeenCalledWith({
      group_id: "allura-system",
      workspace_id: "workspace-a",
      principal_id: "verified-user",
      limit: 12,
      offset: 3,
      type: "decision",
    })
  })

  it.each(["?limit=0", "?limit=201", "?limit=nope", "?offset=-1", "?type=memory"])(
    "rejects invalid bounded read input: %s",
    async (query) => {
      expect((await GET(request(`/api/memory/traces${query}`))).status).toBe(400)
      expect(mocks.queryTraces).not.toHaveBeenCalled()
    }
  )

  it("requires curator authority for trace writes", async () => {
    expect((await POST(request("/api/memory/traces", "viewer", { content: "blocked" }))).status).toBe(403)
    expect(mocks.logTrace).not.toHaveBeenCalled()
  })

  it.each([
    { group_id: "allura-other", content: "forged" },
    { workspace_id: "workspace-other", content: "forged" },
  ])("denies forged POST scope before logging", async (body) => {
    expect((await POST(request("/api/memory/traces", "curator", body))).status).toBe(403)
    expect(mocks.logTrace).not.toHaveBeenCalled()
  })

  it("binds trace tenant, workspace, and actor to authenticated authority", async () => {
    const response = await POST(
      request("/api/memory/traces", "curator", {
        group_id: "allura-system",
        workspace_id: "workspace-a",
        agent: "forged-agent",
        type: "decision",
        content: "verified content",
        confidence: 0.8,
        metadata: { safe: true },
      })
    )
    expect(response.status).toBe(200)
    expect(mocks.logTrace).toHaveBeenCalledWith({
      agent_id: "verified-user",
      group_id: "allura-system",
      workspace_id: "workspace-a",
      session_id: "verified-session",
      trace_type: "decision",
      content: "verified content",
      confidence: 0.8,
      metadata: { safe: true },
    })
  })

  it("returns content-free backend failures", async () => {
    mocks.logTrace.mockRejectedValueOnce(new Error("password=secret database host leaked"))
    const response = await POST(request("/api/memory/traces", "curator", { content: "safe" }))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Failed to log trace" })
  })
})
