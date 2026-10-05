import { NextRequest, NextResponse } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), health: vi.fn(), principal: vi.fn(), search: vi.fn(), read: vi.fn(),
  searchPage: vi.fn(), readPage: vi.fn(),
}))
vi.mock("@/lib/auth/api-auth", () => ({ withPermission: mocks.auth }))
vi.mock("@/lib/auth/dashboard-principal", () => ({ getDashboardPrincipal: mocks.principal }))
vi.mock("@/lib/digital-brain/read-service", () => ({
  searchAuthorizedDocuments: mocks.search,
  readAuthorizedDocuments: mocks.read,
  searchAuthorizedDocumentsPage: mocks.searchPage,
  readAuthorizedDocumentsPage: mocks.readPage,
}))
vi.mock("@/lib/brain-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/brain-client")>()),
  brainClient: { healthReport: mocks.health },
}))

import { GET as listMemories } from "@/app/api/brain/memories/route"
import { GET as searchMemories } from "@/app/api/brain/search/route"
import { GET as brainHealth } from "@/app/api/brain/health/route"
import { resolveRouteAuthority } from "@/lib/auth/route-scope-manifest"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: { id: "owner-user" }, groupId: "allura-epic30-local" })
  mocks.principal.mockResolvedValue({ id: "owner-user", groupId: "allura-epic30-local",
    workspaceId: "epic30-local-workspace", sessionId: "synthetic-session", role: "viewer" })
  mocks.search.mockResolvedValue({ total: 1, hits: [{ documentId: "synthetic-owner-note", title: "Synthetic note",
    snippet: "SYNTHETIC TEST DATA", updatedAt: new Date("2026-09-17T00:00:00Z") }] })
  mocks.read.mockResolvedValue([{ id: "synthetic-owner-note", title: "Synthetic note",
    content: "SYNTHETIC TEST DATA", updatedAt: new Date("2026-09-17T00:00:00Z") }])
  mocks.searchPage.mockResolvedValue({ total: 2, hits: [{ documentId: "synthetic-owner-note", title: "Synthetic note",
    snippet: "SYNTHETIC TEST DATA", updatedAt: new Date("2026-09-17T00:00:00Z") }],
    nextCursor: "opaque-search-next", hasMore: true })
  mocks.readPage.mockResolvedValue({ documents: [{ id: "synthetic-owner-note", title: "Synthetic note",
    content: "SYNTHETIC TEST DATA", updatedAt: new Date("2026-09-17T00:00:00Z") }],
    nextCursor: "opaque-read-next", hasMore: true })
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

  it("keeps successful canonical Brain health responses non-cacheable", async () => {
    mocks.health.mockResolvedValueOnce({ overall_status: "healthy", queue_depth: 0 })
    const response = await brainHealth()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ overall_status: "healthy" })
    expect(mocks.health).toHaveBeenCalledWith("allura-system")
  })

  it("publishes only the allowlisted overall_status from a trusted report, never the raw MCP payload", async () => {
    mocks.health.mockResolvedValueOnce({
      overall_status: "degraded",
      checked_at: "2026-10-04T00:00:00Z",
      queue_depth: 3,
      meta: { secret_token: "sentinel-top-level-meta-secret", db_url: "sentinel-meta-db-url" },
      subsystems: {
        postgres: { status: "degraded", latency_ms: 42, detail: "sentinel-postgres-exception-detail" },
        mcp_tools: { status: "healthy", latency_ms: 0, tool_count: 6420, detail: "sentinel-mcp-tool-name" },
      },
      unknown_extra_field: "sentinel-unknown-field",
    })
    const response = await brainHealth()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    const body = await response.json()
    expect(body).toEqual({ overall_status: "degraded" })
    const text = JSON.stringify(body)
    for (const sentinel of [
      "sentinel-top-level-meta-secret", "sentinel-meta-db-url",
      "sentinel-postgres-exception-detail", "sentinel-mcp-tool-name",
      "sentinel-unknown-field", "queue_depth", "checked_at", "subsystems", "meta",
      "latency_ms", "tool_count",
    ]) {
      expect(text).not.toContain(sentinel)
    }
    expect(mocks.health).toHaveBeenCalledWith("allura-system")
  })

  it.each(["healthy", "degraded", "unavailable", "unhealthy"])(
    "returns 200 with a bounded body for exact allowlisted status %s", async (status) => {
      mocks.health.mockResolvedValueOnce({ overall_status: status, subsystems: { postgres: { status, detail: "sentinel-postgres-exception-detail" } } })
      const response = await brainHealth()
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ overall_status: status })
    },
  )

  it.each([
    ["near-miss case", "Healthy"],
    ["trailing space", "healthy "],
    ["unknown value", "mostly-healthy"],
    ["empty string", ""],
  ])("keeps a non-allowlisted string status (%s) behind the generic 503", async (_label, status) => {
    mocks.health.mockResolvedValueOnce({ overall_status: status })
    const response = await brainHealth()
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ error: "Brain health check unavailable", overall_status: "unhealthy" })
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

  it("serves the exact internal MCP endpoint from the public health route", async () => {
    vi.stubEnv("ALLURA_BRAIN_URL", "http://allura-memory-mcp:3201/mcp")
    mocks.health.mockResolvedValueOnce({ overall_status: "healthy", queue_depth: 0 })
    const response = await brainHealth()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ overall_status: "healthy" })
    expect(mocks.health).toHaveBeenCalledWith("allura-system")
  })

  it("probes the configured ALLURA_BRAIN_PROBE_GROUP_ID when set", async () => {
    vi.stubEnv("ALLURA_BRAIN_PROBE_GROUP_ID", "allura-faithmeats")
    mocks.health.mockResolvedValueOnce({ overall_status: "healthy", checked_at: "2026-10-04T00:00:00Z", meta: {}, subsystems: {} })
    const response = await brainHealth()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(mocks.health).toHaveBeenCalledWith("allura-faithmeats")
    expect(mocks.health).not.toHaveBeenCalledWith("allura-system")
  })

  it("preserves the allura-system default probe group when the env is missing", async () => {
    mocks.health.mockResolvedValueOnce({ overall_status: "healthy" })
    const response = await brainHealth()
    expect(response.status).toBe(200)
    expect(mocks.health).toHaveBeenCalledTimes(1)
    expect(mocks.health).toHaveBeenCalledWith("allura-system")
  })

  it.each([
    ["uppercase", "Allura-Faithmeats"],
    ["wrong prefix", "roninclaw-faithmeats"],
    ["empty", ""],
    ["whitespace-only", "   "],
    ["trailing hyphen", "allura-faithmeats-"],
    ["embedded space", "allura-faith meats"],
    ["nullish text", "null"],
  ])("fails closed with 503 and no brain call for invalid probe group (%s)", async (_label, value) => {
    vi.stubEnv("ALLURA_BRAIN_PROBE_GROUP_ID", value)
    const response = await brainHealth()
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ error: "Brain health check unavailable", overall_status: "unhealthy" })
    expect(mocks.health).not.toHaveBeenCalled()
  })

  it("returns a generic 503, never a false 200, for error-shaped tool results", async () => {
    mocks.health.mockResolvedValueOnce({
      error: { code: "TENANT_MISMATCH", message: "token tenant does not match requested group allura-system" },
    })
    const response = await brainHealth()
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ error: "Brain health check unavailable", overall_status: "unhealthy" })
    expect(mocks.health).toHaveBeenCalledWith("allura-system")
  })

  it("returns a generic 503 when the report lacks a valid string overall_status", async () => {
    for (const report of [undefined, {}, { overall_status: null }, { overall_status: 200 }, { checked_at: "2026-10-04T00:00:00Z", subsystems: {} }]) {
      mocks.health.mockResolvedValueOnce(report)
      const response = await brainHealth()
      expect(response.status).toBe(503)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(await response.json()).toEqual({ error: "Brain health check unavailable", overall_status: "unhealthy" })
    }
    expect(mocks.health).toHaveBeenCalledTimes(5)
  })

  it("never probes a near-miss internal endpoint from the public health route", async () => {
    for (const endpoint of [
      "http://allura-memory-mcp:3201",
      "http://allura-memory-mcp:3200/mcp",
      "http://localhost:6477/mcp",
    ]) {
      vi.stubEnv("ALLURA_BRAIN_URL", endpoint)
      const response = await brainHealth()
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ error: "Brain health check unavailable", overall_status: "unhealthy" })
    }
    expect(mocks.health).not.toHaveBeenCalled()
  })

  it("runs search only under the exact synthetic target and server-owned scope", async () => {
    const run = "a".repeat(32)
    for (const [key, value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
      ALLURA_EPIC30_RUN_ID: run, POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444",
      POSTGRES_DB: `allura_epic30_read_${run}`, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "" })) {
      vi.stubEnv(key, value)
    }
    const request = new NextRequest("http://localhost:3100/api/brain/search?q=synthetic&user_id=other-user&workspace_id=other")
    const response = await searchMemories(request)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(mocks.search).toHaveBeenCalledWith({ tenantId: "allura-epic30-local",
      workspaceId: "epic30-local-workspace", principalId: "owner-user" }, "synthetic")
    expect(JSON.stringify(await response.json())).not.toContain("other-user")
  })

  it("lists only receipt-gated synthetic documents from server-owned scope", async () => {
    const run = "a".repeat(32)
    for (const [key, value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
      ALLURA_EPIC30_RUN_ID: run, POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444",
      POSTGRES_DB: `allura_epic30_read_${run}`, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "" })) {
      vi.stubEnv(key, value)
    }
    const request = new NextRequest("http://localhost:3100/api/brain/memories?user_id=other-user&group_id=allura-other")
    const response = await listMemories(request)
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(mocks.read).toHaveBeenCalledWith({ tenantId: "allura-epic30-local",
      workspaceId: "epic30-local-workspace", principalId: "owner-user" })
    const body = await response.json()
    expect(body).toEqual({ memories: [{ id: "synthetic-owner-note", title: "Synthetic note",
      content: "SYNTHETIC TEST DATA", updated_at: "2026-09-17T00:00:00.000Z" }], total: 1, has_more: false })
    expect(JSON.stringify(body)).not.toContain("other-user")
  })

  it("paginates only the exact synthetic routes with server-owned scope", async () => {
    const run = "a".repeat(32)
    for (const [key, value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
      ALLURA_EPIC30_RUN_ID: run, POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444",
      POSTGRES_DB: `allura_epic30_read_${run}`, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "" })) {
      vi.stubEnv(key, value)
    }
    const expectedScope = { tenantId: "allura-epic30-local", workspaceId: "epic30-local-workspace", principalId: "owner-user" }

    const listResponse = await listMemories(new NextRequest(
      "http://localhost:3100/api/brain/memories?cursor=opaque-read-in&limit=1&user_id=other-user",
    ))
    expect(listResponse.status).toBe(200)
    expect(mocks.readPage).toHaveBeenCalledWith(expectedScope, { cursor: "opaque-read-in", pageSize: 1 })
    expect(await listResponse.json()).toEqual({
      memories: [{ id: "synthetic-owner-note", title: "Synthetic note", content: "SYNTHETIC TEST DATA",
        updated_at: "2026-09-17T00:00:00.000Z" }],
      total: 1, has_more: true, next_cursor: "opaque-read-next",
    })

    const searchResponse = await searchMemories(new NextRequest(
      "http://localhost:3100/api/brain/search?q=synthetic&cursor=opaque-search-in&limit=1&workspace_id=other",
    ))
    expect(searchResponse.status).toBe(200)
    expect(mocks.searchPage).toHaveBeenCalledWith(expectedScope, "synthetic", {
      cursor: "opaque-search-in", pageSize: 1,
    })
    const searchBody = await searchResponse.json()
    expect(searchBody).toMatchObject({ count: 2, has_more: true, next_cursor: "opaque-search-next" })
    expect(JSON.stringify(searchBody)).not.toContain("other-user")
    expect(JSON.stringify(searchBody)).not.toContain("workspace_id")
  })

  it.each([
    ["/api/brain/memories", listMemories],
    ["/api/brain/search", searchMemories],
  ])("keeps production pagination quarantined on %s", async (path, handler) => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("ALLURA_EPIC30_LOCAL_DB", "enabled")
    const query = path.endsWith("/search") ? "?q=synthetic&cursor=opaque&limit=1" : "?cursor=opaque&limit=1"

    const response = await handler(new NextRequest(`http://localhost:3100${path}${query}`))
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(JSON.stringify(body)).not.toContain("opaque")
    expect(path.endsWith("/search") ? mocks.searchPage : mocks.readPage).not.toHaveBeenCalled()
  })

  it("keeps a synthetic list receipt outage content-free", async () => {
    const run = "a".repeat(32)
    for (const [key, value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
      ALLURA_EPIC30_RUN_ID: run, POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444",
      POSTGRES_DB: `allura_epic30_read_${run}`, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "" })) {
      vi.stubEnv(key, value)
    }
    mocks.read.mockRejectedValueOnce(new Error("synthetic-session secret sink detail"))
    const response = await listMemories(new NextRequest("http://localhost:3100/api/brain/memories"))
    expect(response.status).toBe(503)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(JSON.stringify(await response.json())).not.toContain("synthetic-session")
  })

  it("fails closed without leaking backend or session details when synthetic search fails", async () => {
    const run = "a".repeat(32)
    for (const [key, value] of Object.entries({ NODE_ENV: "development", ALLURA_EPIC30_LOCAL_DB: "enabled",
      ALLURA_EPIC30_RUN_ID: run, POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "5444",
      POSTGRES_DB: `allura_epic30_read_${run}`, POSTGRES_APP_USER: "allura_app", POSTGRES_APP_OPTIONS: "" })) {
      vi.stubEnv(key, value)
    }
    mocks.search.mockRejectedValueOnce(new Error("synthetic-session secret sink detail"))
    const response = await searchMemories(new NextRequest("http://localhost:3100/api/brain/search?q=private"))
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain("synthetic-session")
    mocks.principal.mockResolvedValueOnce({ id: "other-user", groupId: "allura-epic30-local",
      workspaceId: "epic30-local-workspace", sessionId: "other-session", role: "viewer" })
    const mismatch = await searchMemories(new NextRequest("http://localhost:3100/api/brain/search?q=private"))
    expect(mismatch.status).toBe(503)
    expect(mocks.search).toHaveBeenCalledTimes(1)
  })
})
