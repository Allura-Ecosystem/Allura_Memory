import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  withPermission: vi.fn(), requireRole: vi.fn(),
  read: vi.fn(), search: vi.fn(), health: vi.fn(),
  memoryList: vi.fn(), memoryGet: vi.fn(), queryTraces: vi.fn(), logTrace: vi.fn(),
}))

vi.mock("@/lib/auth/api-auth", () => ({
  withPermission: mocks.withPermission,
  requireRole: mocks.requireRole,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  forbiddenResponse: () => new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
}))
vi.mock("@/lib/auth/dashboard-principal", () => ({
  getDashboardPrincipal: vi.fn().mockResolvedValue({ id: "owner-user", groupId: "allura-epic30-local",
    workspaceId: "epic30-local-workspace", sessionId: "synthetic-session", role: "viewer" }),
}))
vi.mock("@/lib/digital-brain/read-service", () => ({
  readAuthorizedDocuments: mocks.read,
  searchAuthorizedDocuments: mocks.search,
}))
vi.mock("@/lib/brain-client", () => ({ brainClient: { healthReport: mocks.health } }))
vi.mock("@/mcp/canonical-tools", () => ({
  memory_list: mocks.memoryList, memory_get: mocks.memoryGet,
  memory_add: vi.fn(), memory_search: vi.fn(), memory_list_deleted: vi.fn(),
  memory_update: vi.fn(), memory_delete: vi.fn(),
}))
vi.mock("@/lib/postgres/traces", () => ({ queryWorkspaceTraces: mocks.queryTraces }))
vi.mock("@/lib/postgres/trace-logger", () => ({ logTrace: mocks.logTrace }))

import { GET as brainMemories } from "@/app/api/brain/memories/route"
import { GET as brainSearch } from "@/app/api/brain/search/route"
import { GET as brainHealth } from "@/app/api/brain/health/route"
import { GET as memoryRoot } from "@/app/api/memory/route"
import { GET as memoryId } from "@/app/api/memory/[id]/route"
import { GET as memoryTraces, POST as writeMemoryTrace } from "@/app/api/memory/traces/route"

const S = {
  tenant: "allura-epic30-controlled-red-7f2c",
  workspace: "workspace-epic30-controlled-red-7f2c",
  principal: "principal-epic30-controlled-red-7f2c",
  session: "session-epic30-controlled-red-7f2c",
  document: "document-epic30-controlled-red-7f2c",
  title: "title-epic30-controlled-red-7f2c",
  body: "body-epic30-controlled-red-7f2c",
  owner: "owner-epic30-controlled-red-7f2c",
  department: "department-epic30-controlled-red-7f2c",
  backend: "backend-epic30-controlled-red-7f2c",
  receipt: "receipt-epic30-controlled-red-7f2c",
}

function request(path: string, role: "viewer" | "curator" = "viewer", body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3100${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "x-allura-user-id": S.principal, "x-allura-role": role,
      "x-allura-group-id": "allura-system", "x-allura-workspace-id": S.workspace,
      "x-allura-session-id": S.session, "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function jsonText(response: Response): Promise<string> {
  return response.json().then((value) => JSON.stringify(value))
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withPermission.mockResolvedValue({ user: { id: "owner-user" }, groupId: "allura-epic30-local" })
  mocks.requireRole.mockImplementation((request: NextRequest, requiredRole: "viewer" | "curator") => ({
    allowed: requiredRole === "viewer" || request.headers.get("x-allura-role") === "curator",
    user: { id: S.principal, groupId: "allura-system", workspaceId: S.workspace, sessionId: S.session,
      role: request.headers.get("x-allura-role") ?? "viewer" },
  }))
  vi.stubEnv("ALLURA_BRAIN_URL", "https://mcp.faithmeats.org/mcp")
  vi.stubEnv("NODE_ENV", "development")
  vi.stubEnv("ALLURA_EPIC30_LOCAL_DB", "enabled")
  vi.stubEnv("ALLURA_EPIC30_RUN_ID", "a".repeat(32))
  vi.stubEnv("POSTGRES_HOST", "127.0.0.1")
  vi.stubEnv("POSTGRES_PORT", "5444")
  vi.stubEnv("POSTGRES_DB", `allura_epic30_read_${"a".repeat(32)}`)
  vi.stubEnv("POSTGRES_APP_USER", "allura_app")
  vi.stubEnv("POSTGRES_APP_OPTIONS", "")
  mocks.read.mockResolvedValue([])
  mocks.search.mockResolvedValue({ total: 0, hits: [] })
  mocks.health.mockResolvedValue({ overall_status: "healthy", queue_depth: 0 })
  mocks.memoryList.mockResolvedValue({ memories: [], total: 0 })
  mocks.memoryGet.mockResolvedValue({ id: "authorized-memory", content: "authorized" })
  mocks.queryTraces.mockResolvedValue([])
  mocks.logTrace.mockResolvedValue({ id: "authorized-trace" })
})

afterEach(() => vi.unstubAllEnvs())

describe("Epic 30 controlled-red privacy regression", () => {
  it("keeps Brain list/search and health failures generic across forged selectors", async () => {
    mocks.read.mockRejectedValueOnce(new Error(`${S.backend} ${S.receipt} ${S.document} ${S.owner}`))
    mocks.search.mockRejectedValueOnce(new Error(`${S.backend} ${S.receipt} ${S.title} ${S.body}`))
    mocks.health.mockRejectedValueOnce(new Error(`${S.backend} ${S.department}`))

    const responses = await Promise.all([
      brainMemories(request(`/api/brain/memories?tenant=${S.tenant}&workspace_id=${S.workspace}&owner=${S.owner}`)),
      brainSearch(request(`/api/brain/search?q=${S.body}&document_id=${S.document}&department=${S.department}`)),
      brainHealth(),
    ])
    for (const response of responses) {
      const text = await jsonText(response)
      expect(response.status).toBe(503)
      expect(response.headers.get("cache-control")).toBe("no-store")
      for (const sentinel of Object.values(S)) expect(text).not.toContain(sentinel)
    }
  })

  it("rejects forged legacy memory root/id/trace selectors before backend access", async () => {
    const root = await memoryRoot(request(`/api/memory?group_id=${S.tenant}&workspace_id=${S.workspace}&user_id=${S.principal}`))
    const id = await memoryId(request(`/api/memory/forged-${S.document}?group_id=${S.tenant}`),
      { params: Promise.resolve({ id: S.document }) })
    const traceRead = await memoryTraces(request(`/api/memory/traces?group_id=${S.tenant}&workspace_id=${S.workspace}`))
    const traceWrite = await writeMemoryTrace(request("/api/memory/traces", "curator", {
      group_id: S.tenant, workspace_id: S.workspace, content: S.body,
      metadata: { owner: S.owner, department: S.department },
    }))

    for (const response of [root, id, traceRead, traceWrite]) {
      expect(response.status).toBe(403)
      const text = await jsonText(response)
      expect(text).not.toContain(S.tenant)
      expect(text).not.toContain(S.workspace)
      expect(text).not.toContain(S.body)
    }
    expect(mocks.memoryList).not.toHaveBeenCalled()
    expect(mocks.memoryGet).not.toHaveBeenCalled()
    expect(mocks.queryTraces).not.toHaveBeenCalled()
    expect(mocks.logTrace).not.toHaveBeenCalled()
  })

  it("preserves an authorized memory read while redacting raw backend failure details", async () => {
    const success = await memoryId(request("/api/memory/authorized-memory?group_id=allura-system"),
      { params: Promise.resolve({ id: "authorized-memory" }) })
    expect(success.status).toBe(200)
    expect(await success.json()).toEqual({ id: "authorized-memory", content: "authorized" })

    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.memoryGet.mockRejectedValueOnce(new Error(`${S.backend} ${S.receipt} ${S.department}`))
    const failed = await memoryId(request("/api/memory/authorized-memory?group_id=allura-system"),
      { params: Promise.resolve({ id: "authorized-memory" }) })
    expect(failed.status).toBe(500)
    const text = await jsonText(failed)
    expect(text).toBe(JSON.stringify({ error: "Internal server error" }))
    for (const sentinel of Object.values(S)) expect(text).not.toContain(sentinel)
    expect(log).toHaveBeenCalledWith("Memory GET error")
    expect(JSON.stringify(log.mock.calls)).not.toContain(S.backend)
    expect(JSON.stringify(log.mock.calls)).not.toContain(S.receipt)
    expect(JSON.stringify(log.mock.calls)).not.toContain(S.department)
    log.mockRestore()
  })

  it("forbids raw exception arguments across the protected memory route inventory", () => {
    for (const route of [
      "src/app/api/memory/route.ts",
      "src/app/api/memory/[id]/route.ts",
      "src/app/api/memory/count/route.ts",
      "src/app/api/memory/stats/route.ts",
      "src/app/api/memory/traces/route.ts",
      "src/app/api/memory/graph/route.ts",
      "src/app/api/memory/[id]/restore/route.ts",
      "src/app/api/memory/insights/[id]/history/route.ts",
      "src/app/api/memory/user/[userId]/route.ts",
    ]) {
      const source = readFileSync(path.resolve(process.cwd(), route), "utf8")
      expect(source, route).not.toMatch(/console\.(?:error|warn)\([^\n]*,\s*(?:error|err)\s*\)/)
      expect(source, route).not.toMatch(/captureException\(\s*(?:error|err)\b/)
    }
  })
})
