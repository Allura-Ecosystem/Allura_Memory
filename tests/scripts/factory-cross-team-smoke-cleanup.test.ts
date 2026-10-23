import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MemoryAddRequest } from "@/lib/memory/canonical-contracts"

const fixture = vi.hoisted(() => ({
  pools: [] as Array<{ user: string; endCalls: number; ending: boolean }>,
  failClose: "",
  primary: undefined as Error | undefined,
  absent: false,
  content: "",
  savedId: "11111111-1111-4111-8111-111111111111",
  connections: 0,
}))

// Transport is inert. Singleton ownership and real fixture default wiring remain intact.
vi.mock("pg", () => ({ Pool: class {
  user: string
  endCalls = 0
  ending = false
  constructor(config: { user: string }) { this.user = config.user; fixture.pools.push(this) }
  on(): this { return this }
  connect(): never { fixture.connections++; throw new Error("real DB connections forbidden") }
  async query(): Promise<{ rows: unknown[] }> { return { rows: [] } }
  async end(): Promise<void> {
    this.endCalls++
    if (this.ending) throw new Error("Called end on pool more than once")
    this.ending = true
    if (fixture.failClose === this.user) throw new Error(`close ${this.user} failed`)
  }
} }))

vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({ resetBudgetState: vi.fn() }))
vi.mock("@/mcp/canonical-tools", () => ({
  memory_add: async (request: MemoryAddRequest) => {
    const auth = await import("@/lib/auth/mcp-authenticator")
    expect(auth.requireTransportMemoryAddAuthority(request)).toMatchObject({
      group_id: "allura-factory-smoke-raleigh-loadtest", workspace_id: "ws-allura-factory-smoke-raleigh-loadtest", agent_id: "factory-raleigh-ci",
    })
    // Actual canonical connection aliases the actual upstream app singleton.
    const connection = await import("@/mcp/canonical-tools/connection")
    const postgres = await import("@/lib/postgres/connection")
    expect((await connection.getConnections()).pg).toBe(postgres.getAppPool())
    expect((await connection.getConnections()).neo4j).toBeNull()
    const vector = await import("@/lib/ruvector/connection")
    vector.getRuVectorPool()
    fixture.content = request.content
    return { id: fixture.savedId, stored: "episodic", score: 0.8, created_at: "2026-10-21T03:00:00Z" }
  },
  memory_search: async () => {
    if (fixture.primary) throw fixture.primary
    return { results: fixture.absent ? [] : [{ id: fixture.savedId, content: fixture.content }], count: fixture.absent ? 0 : 1, latency_ms: 0 }
  },
}))

beforeEach(() => {
  vi.resetModules()
  fixture.pools = []; fixture.failClose = ""; fixture.primary = undefined
  fixture.absent = false; fixture.content = ""; fixture.connections = 0
  // Test-only startup fixture; no database roles or service grants are provisioned.
  for (const [key, value] of Object.entries({
    NODE_ENV: "test", ALLURA_ENV: "test", ALLURA_MCP_DEV_AUTH: "false",
    ALLURA_MCP_SERVICE_PRINCIPAL_ID: "factory-raleigh-ci",
    ALLURA_MCP_SERVICE_WORKSPACE_ID: "ws-allura-factory-smoke-raleigh-loadtest",
    ALLURA_MCP_SERVICE_TENANTS: "allura-factory-smoke-raleigh-loadtest",
    ALLURA_MCP_SERVICE_ROLES: "viewer", ALLURA_MCP_SERVICE_SCOPES: "memory:read,memory:write",
    FACTORY_SMOKE_RUN_ID: "123456-1", POSTGRES_USER: "offline-owner", POSTGRES_PASSWORD: "inert",
    POSTGRES_APP_USER: "offline-app", POSTGRES_APP_PASSWORD: "inert", RUVECTOR_USER: "offline-vector",
  })) vi.stubEnv(key, value)
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

function assertDistinctShutdown(): void {
  expect(fixture.pools.map((pool) => pool.user).sort()).toEqual(["offline-app", "offline-owner", "offline-vector"])
  fixture.pools.forEach((pool) => expect(pool.endCalls).toBe(1))
  expect(fixture.connections).toBe(0)
}

describe("default smoke binding lifecycle (inert transport, actual pool ownership)", () => {
  it("finishes exact own discovery and closes each owner/app/vector pool once", async () => {
    const { runTenantSmoke } = await import("../../scripts/factory-cross-team-smoke")
    await expect(runTenantSmoke(["raleigh-write"])).resolves.toBeUndefined()
    assertDistinctShutdown()
    expect(console.error).not.toHaveBeenCalled()
  })

  it("retains a primary search failure and still closes all distinct resources", async () => {
    const { runTenantSmoke } = await import("../../scripts/factory-cross-team-smoke")
    fixture.primary = new Error("primary search failure")
    fixture.failClose = "offline-app"
    await expect(runTenantSmoke(["raleigh-write"])).rejects.toBe(fixture.primary)
    assertDistinctShutdown()
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ["Factory tenant smoke operation or assertion failed"], ["Factory tenant smoke resource cleanup failed"],
    ])
  })

  it.each(["offline-owner", "offline-app", "offline-vector"])("propagates %s close failure and attempts other owners", async (owner) => {
    const { runTenantSmoke } = await import("../../scripts/factory-cross-team-smoke")
    fixture.failClose = owner
    await expect(runTenantSmoke(["raleigh-write"])).rejects.toThrow(`close ${owner} failed`)
    assertDistinctShutdown()
    expect(vi.mocked(console.error).mock.calls).toEqual([["Factory tenant smoke resource cleanup failed"]])
  })

  it("preserves the exact-discovery assertion when cleanup also fails", async () => {
    const { runTenantSmoke } = await import("../../scripts/factory-cross-team-smoke")
    fixture.absent = true
    fixture.failClose = "offline-vector"
    await expect(runTenantSmoke(["raleigh-write"])).rejects.toThrow("exact saved marker was not discoverable")
    assertDistinctShutdown()
  })

  it("returns nonzero on a real owner-composed cleanup failure", async () => {
    const { smokeMain } = await import("../../scripts/factory-cross-team-smoke")
    fixture.failClose = "offline-app"
    expect(await smokeMain(["raleigh-write"])).toBe(1)
    assertDistinctShutdown()
  })
})
