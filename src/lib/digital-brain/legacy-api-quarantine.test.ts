import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn(), health: vi.fn() }))
vi.mock("@/lib/auth/api-auth", () => ({ withPermission: mocks.auth }))
vi.mock("@/lib/brain-client", () => ({ brainClient: { healthReport: mocks.health } }))

import { GET as listMemories } from "@/app/api/brain/memories/route"
import { GET as searchMemories } from "@/app/api/brain/search/route"
import { GET as brainHealth } from "@/app/api/brain/health/route"
import { resolveRouteAuthority } from "@/lib/auth/route-scope-manifest"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: "owner-user" }, groupId: "allura-epic30-local" })
  vi.stubGlobal("fetch", vi.fn())
  vi.stubEnv("ALLURA_BRAIN_URL", "https://mcp.faithmeats.org/mcp")
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("Epic 30 legacy Brain content-route quarantine", () => {
  it.each([
    ["/api/brain/memories", listMemories],
    ["/api/brain/search", searchMemories],
  ])("keeps %s protected but discloses no content for forged selectors", async (path, handler) => {
    expect(resolveRouteAuthority(path)).toMatchObject({ kind: "declared", requiredRole: "viewer" })
    const request = new NextRequest(`http://localhost:3100${path}?user_id=other-user&group_id=allura-other&workspace_id=other&q=private`)
    const response = await handler(request)
    const body = await response.json()
    expect(mocks.auth).toHaveBeenCalledWith(request, "memory:read", "viewer")
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(JSON.stringify(body)).not.toContain("other-user")
    expect(JSON.stringify(body)).not.toContain("private")
    expect(JSON.stringify(body)).not.toContain("allura-other")
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ["/api/brain/memories", listMemories],
    ["/api/brain/search", searchMemories],
  ])("passes authentication denial through on %s", async (path, handler) => {
    mocks.auth.mockResolvedValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    const response = await handler(new NextRequest(`http://localhost:3100${path}`))
    expect(response.status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("keeps public health failures content-free and hides downstream connection errors", async () => {
    mocks.health.mockRejectedValue(new Error("sensitive local endpoint and credential detail"))
    const response = await brainHealth()
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ error: "Brain health check unavailable", overall_status: "unhealthy" })
    expect(mocks.health).toHaveBeenCalledWith("allura-system")
  })

  it("never probes a local or unset Allura endpoint from the public health route", async () => {
    for (const endpoint of [undefined, "http://localhost:5888/mcp", "https://other.example/mcp"]) {
      vi.stubEnv("ALLURA_BRAIN_URL", endpoint)
      const response = await brainHealth()
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: "Brain health check unavailable", overall_status: "unhealthy" })
    }
    expect(mocks.health).not.toHaveBeenCalled()
  })
})
