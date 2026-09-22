import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ auth: vi.fn() }))
vi.mock("@/lib/auth/api-auth", () => ({ withPermission: mocks.auth }))

import { GET as listMemories } from "@/app/api/brain/memories/route"
import { GET as searchMemories } from "@/app/api/brain/search/route"
import { resolveRouteAuthority } from "@/lib/auth/route-scope-manifest"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: "owner-user" }, groupId: "allura-epic30-local" })
  vi.stubGlobal("fetch", vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

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
})
