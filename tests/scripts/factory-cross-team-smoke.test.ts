import { afterEach, describe, expect, it, vi } from "vitest"
import { requireTransportMemoryAddAuthority } from "@/lib/auth/mcp-authenticator"
import type { MemoryAddRequest, MemoryId, MemorySearchResponse } from "@/lib/memory/canonical-contracts"
import { runTenantSmoke, type SmokeBindings, smokeMain } from "../../scripts/factory-cross-team-smoke"

// An accidental eager import or fallback to the real storage binding fails offline.
vi.mock("@/mcp/canonical-tools", () => { throw new Error("live memory handlers forbidden in offline fixture tests") })

function configure(city = "raleigh"): void {
  // Test-only explicit process fixtures. Production CLI never switches process identity.
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("ALLURA_ENV", "test")
  vi.stubEnv("ALLURA_MCP_DEV_AUTH", "false")
  vi.stubEnv("ALLURA_MCP_SERVICE_PRINCIPAL_ID", `factory-${city}-ci`)
  vi.stubEnv("ALLURA_MCP_SERVICE_WORKSPACE_ID", `ws-allura-factory-smoke-${city}-loadtest`)
  vi.stubEnv("ALLURA_MCP_SERVICE_TENANTS", `allura-factory-smoke-${city}-loadtest`)
  vi.stubEnv("ALLURA_MCP_SERVICE_ROLES", "viewer")
  vi.stubEnv("ALLURA_MCP_SERVICE_SCOPES", "memory:read,memory:write")
  vi.stubEnv("FACTORY_SMOKE_RUN_ID", "123456-1")
}

function harness(options: { absent?: boolean; differentId?: boolean; differentContent?: boolean; leak?: boolean; stored?: "episodic" | "both" } = {}) {
  const savedId = "11111111-1111-4111-8111-111111111111" as MemoryId
  let content = ""
  const seedWorkspace = vi.fn(async () => undefined)
  const add = vi.fn(async (request: MemoryAddRequest) => {
    // The actual process-private authority seam is never mocked.
    const authority = requireTransportMemoryAddAuthority(request)
    expect(authority).toMatchObject({ group_id: request.group_id, workspace_id: `ws-${request.group_id}`, agent_id: request.user_id })
    expect(Object.isFrozen(request)).toBe(true)
    expect(Object.isFrozen(request.scope)).toBe(true)
    content = request.content
    return { id: savedId, stored: options.stored ?? "episodic", score: 0.8, created_at: "2026-10-21T03:00:00Z" }
  })
  const search = vi.fn(async (request): Promise<MemorySearchResponse> => {
    const principal = request.group_id.includes("raleigh") ? "factory-raleigh-ci" : "factory-charlotte-ci"
    expect(request).toMatchObject({ include_global: false, status: "all", limit: 10,
      workspace_id: `ws-${request.group_id}`, scope: { group_id: request.group_id, workspace_id: `ws-${request.group_id}`, agent_id: principal } })
    const results = options.absent || (!content && !options.leak) ? [] : [{
      id: options.differentId ? "22222222-2222-4222-8222-222222222222" as MemoryId : savedId,
      content: options.leak ? `factory_ci_smoke ${request.query}` : options.differentContent ? `${content} altered` : content,
      score: 0.8, source: "episodic" as const, provenance: "manual" as const,
      created_at: "2026-10-21T03:00:00Z", usage_count: 0,
    }]
    return { results, count: results.length, latency_ms: 0 }
  })
  const cleanup = [vi.fn(async () => undefined), vi.fn(async () => undefined), vi.fn(async () => undefined)]
  const bindings: SmokeBindings = { seedWorkspace, add, search, cleanup }
  const bind = vi.fn(async () => bindings)
  return { bind, bindings, seedWorkspace, add, search, cleanup }
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe("tenant smoke protocol candidate (inert storage, not live isolation)", () => {
  it("rejects the original caller-built write at the real private-authority seam", () => {
    expect(() => requireTransportMemoryAddAuthority({ group_id: "allura-factory-smoke-raleigh-loadtest",
      user_id: "factory-raleigh-ci", content: "marker", scope: { group_id: "allura-factory-smoke-raleigh-loadtest" } } as MemoryAddRequest))
      .toThrow("verified credential-issued write capability")
  })

  it.each(["raleigh", "charlotte"])("uses real configured authority for %s own write and exact discovery", async (city) => {
    configure(city)
    const fixture = harness()
    await runTenantSmoke([`${city}-write`], fixture.bind)
    expect(fixture.seedWorkspace).toHaveBeenCalledTimes(1)
    expect(fixture.seedWorkspace).toHaveBeenCalledWith(`allura-factory-smoke-${city}-loadtest`)
    expect(fixture.add).toHaveBeenCalledTimes(1)
    expect(fixture.search).toHaveBeenCalledTimes(1)
    expect(fixture.search.mock.calls[0]![0].query).toBe(`${city}-123456-1`)
    fixture.cleanup.forEach((close) => expect(close).toHaveBeenCalledTimes(1))
  })

  it.each(["raleigh", "charlotte"])("%s foreign phase does not seed or write", async (city) => {
    configure(city)
    const fixture = harness()
    await runTenantSmoke([`${city}-foreign`], fixture.bind)
    expect(fixture.seedWorkspace).not.toHaveBeenCalled()
    expect(fixture.add).not.toHaveBeenCalled()
    expect(fixture.search.mock.calls[0]![0].query).toBe(`${city === "raleigh" ? "charlotte" : "raleigh"}-123456-1`)
  })

  it.each([
    ["ALLURA_MCP_SERVICE_PRINCIPAL_ID", ""], ["ALLURA_MCP_SERVICE_PRINCIPAL_ID", "factory-charlotte-ci"],
    ["ALLURA_MCP_SERVICE_WORKSPACE_ID", ""], ["ALLURA_MCP_SERVICE_WORKSPACE_ID", "ws-foreign"],
    ["ALLURA_MCP_SERVICE_TENANTS", ""], ["ALLURA_MCP_SERVICE_TENANTS", "*"],
    ["ALLURA_MCP_SERVICE_TENANTS", "allura-factory-smoke-charlotte-loadtest"],
    ["ALLURA_MCP_SERVICE_TENANTS", "allura-factory-smoke-raleigh-loadtest,allura-system"],
    ["ALLURA_MCP_SERVICE_ROLES", ""], ["ALLURA_MCP_SERVICE_ROLES", "admin"],
    ["ALLURA_MCP_SERVICE_ROLES", "viewer,curator"], ["ALLURA_MCP_SERVICE_ROLES", "viewer,unknown-role"],
    ["ALLURA_MCP_SERVICE_ROLES", "viewer,"], ["ALLURA_MCP_SERVICE_ROLES", "viewer,viewer"],
    ["ALLURA_MCP_SERVICE_SCOPES", ""], ["ALLURA_MCP_SERVICE_SCOPES", "memory:read"],
    ["ALLURA_MCP_SERVICE_SCOPES", "memory:read,memory:write,memory:promote"],
    ["ALLURA_MCP_SERVICE_SCOPES", "memory:read,memory:write,"],
    ["ALLURA_MCP_DEV_AUTH", "true"], ["FACTORY_SMOKE_RUN_ID", ""],
    ["FACTORY_SMOKE_RUN_ID", "123-0"], ["FACTORY_SMOKE_RUN_ID", "123-1/foreign"],
    ["FACTORY_SMOKE_RUN_ID", "123456789012345678901-1"],
  ])("refuses raw %s=%s before loading storage", async (key, value) => {
    configure()
    vi.stubEnv(key, value)
    const fixture = harness()
    await expect(runTenantSmoke(["raleigh-write"], fixture.bind)).rejects.toThrow()
    expect(fixture.bind).not.toHaveBeenCalled()
    expect(fixture.seedWorkspace).not.toHaveBeenCalled()
    expect(fixture.add).not.toHaveBeenCalled()
    expect(fixture.search).not.toHaveBeenCalled()
  })

  it("refuses missing service configuration rather than using dev fallback", async () => {
    configure()
    for (const key of ["PRINCIPAL_ID", "WORKSPACE_ID", "TENANTS", "ROLES", "SCOPES"]) vi.stubEnv(`ALLURA_MCP_SERVICE_${key}`, undefined)
    const fixture = harness()
    await expect(runTenantSmoke(["raleigh-write"], fixture.bind)).rejects.toThrow()
    expect(fixture.bind).not.toHaveBeenCalled()
  })

  it.each([[], ["foreign"], ["raleigh-write", "extra"]])("refuses invalid phase %j before storage", async (...args) => {
    configure()
    const fixture = harness()
    await expect(runTenantSmoke(args, fixture.bind)).rejects.toThrow("invalid smoke phase")
    expect(fixture.bind).not.toHaveBeenCalled()
  })

  it.each([{ absent: true }, { differentId: true }, { differentContent: true }])("requires exact saved ID and content: %j", async (options) => {
    configure()
    const fixture = harness(options)
    await expect(runTenantSmoke(["raleigh-write"], fixture.bind)).rejects.toThrow("exact saved marker was not discoverable")
    fixture.cleanup.forEach((close) => expect(close).toHaveBeenCalledTimes(1))
  })

  it("fails on foreign leakage", async () => {
    configure()
    await expect(runTenantSmoke(["raleigh-foreign"], harness({ leak: true }).bind)).rejects.toThrow("cross-tenant marker leaked")
  })

  it("requires an episodic outcome", async () => {
    configure()
    const fixture = harness({ stored: "both" })
    await expect(runTenantSmoke(["raleigh-write"], fixture.bind)).rejects.toThrow("episodic PostgreSQL write")
    expect(fixture.search).not.toHaveBeenCalled()
  })

  it.each(["seedWorkspace", "add", "search"] as const)("preserves %s failure and attempts every cleanup", async (operation) => {
    configure()
    const fixture = harness()
    const failure = new Error("primary operation failure")
    fixture[operation].mockRejectedValueOnce(failure)
    fixture.cleanup[0]!.mockRejectedValueOnce(new Error("secondary close failure"))
    await expect(runTenantSmoke(["raleigh-write"], fixture.bind)).rejects.toBe(failure)
    fixture.cleanup.forEach((close) => expect(close).toHaveBeenCalledTimes(1))
  })

  it("returns nonzero on cleanup failure and attempts later cleanup", async () => {
    configure()
    const fixture = harness()
    fixture.cleanup[0]!.mockRejectedValueOnce(new Error("close failure"))
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(await smokeMain(["raleigh-write"], fixture.bind)).toBe(1)
    fixture.cleanup.forEach((close) => expect(close).toHaveBeenCalledTimes(1))
  })

  it("returns nonzero for startup failure and zero only after verified checks", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    const fixture = harness()
    expect(await smokeMain([], fixture.bind)).toBe(1)
    configure()
    expect(await smokeMain(["raleigh-write"], fixture.bind)).toBe(0)
  })
})
