import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ read: vi.fn(), withPermission: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/api-auth", () => ({ withPermission: mocks.withPermission }))
vi.mock("@/lib/subgraph/read-service", () => ({
  focusedSubgraphContinuationSecret: () => Buffer.alloc(32, 7),
  FocusedSubgraphReadService: class { read = mocks.read },
}))

import { DELETE, GET, parseFocusedSubgraphQuery } from "@/app/api/memory/graph/route"

const user = {
  id: "verified-user", email: "viewer@example.test", role: "viewer" as const,
  groupId: "allura-system", workspaceId: "workspace-a", sessionId: "verified-session",
}
function request(query = ""): NextRequest { return new NextRequest(`http://localhost:3100/api/memory/graph${query}`) }
function result(state: "empty" | "complete" = "empty") {
  return {
    contractVersion: "2.0", state,
    snapshot: { policyEpoch: 1, graphRevision: 0, capturedAt: "2026-10-12T00:00:00.000Z" },
    budgets: { requested: { nodeLimit: 200, edgeLimit: 400, depth: 0 }, applied: { nodeLimit: 200, edgeLimit: 400, depth: 0 } },
    nodes: [], edges: [], warnings: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withPermission.mockResolvedValue({ user, groupId: user.groupId })
  mocks.read.mockResolvedValue(result())
})

describe("memory graph authority and transport", () => {
  it.each([
    [401, "LOGIN_REQUIRED", "login"],
    [403, "INSUFFICIENT_ROLE", "request_access"],
  ])("converts pre-service auth failure %s to a frozen denied response", async (status, reasonCode, action) => {
    mocks.withPermission.mockResolvedValueOnce(NextResponse.json({ legacy: "do not leak" }, { status }))
    const response = await GET(request())
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ contractVersion: "2.0", state: "denied", reasonCode, action })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it.each([
    "?group_id=allura-other",
    "?workspace_id=workspace-other",
    "?group_id=allura-system&group_id=allura-other",
    "?workspace_id=workspace-a&workspace_id=workspace-other",
  ])("denies forged scope before graph service access: %s", async (query) => {
    const response = await GET(request(query))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ contractVersion: "2.0", state: "denied", reasonCode: "SCOPE_CONFLICT", action: "none" })
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it("parses an authority-free focus request and delegates the server principal", async () => {
    const response = await GET(request("?kind=focus&focusNodeKey=memory%3Aabc&direction=both&depth=2&includeLineage=true&nodeKind=Memory"))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(mocks.read).toHaveBeenCalledWith(user, {
      kind: "focus", focusNodeKey: "memory:abc", direction: "both", depth: 2, includeLineage: true,
      nodeKinds: ["Memory"], relationshipKinds: undefined, nodeLimit: undefined, edgeLimit: undefined, continuation: undefined,
    })
  })

  it.each(["?stats=true", "?kind=overview&depth=1", "?kind=focus", "?nodeLimit=1&nodeLimit=2"])(
    "rejects malformed syntax with 400 and no service access: %s", async (query) => {
      const response = await GET(request(query))
      expect(response.status).toBe(400)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toMatchObject({ state: "error", code: "MALFORMED_QUERY" })
      expect(mocks.read).not.toHaveBeenCalled()
    },
  )

  it.each([
    [{ contractVersion: "2.0", state: "denied", reasonCode: "INSUFFICIENT_ROLE", action: "request_access" }, 403],
    [{ contractVersion: "2.0", state: "error", code: "MALFORMED_CONTINUATION", retryable: false, action: "restart" }, 400],
    [{ contractVersion: "2.0", state: "error", code: "CONTINUATION_CONFLICT", retryable: false, action: "restart" }, 409],
    [{ contractVersion: "2.0", state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" }, 503],
  ])("maps graph truth state to HTTP %s", async (body, status) => {
    mocks.read.mockResolvedValueOnce(body)
    const response = await GET(request())
    expect(response.status).toBe(status)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual(body)
  })

  it("returns a non-contract 405 body with Allow and no-store", async () => {
    const response = await DELETE()
    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("GET")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ error: "method_not_allowed" })
  })

  it("keeps transport parsing free of authority fields", () => {
    expect(() => parseFocusedSubgraphQuery(new URLSearchParams("principalId=forged"))).toThrow()
  })
})
