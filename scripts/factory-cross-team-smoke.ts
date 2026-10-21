import { authenticateServiceTransport } from "@/lib/auth/mcp-authenticator"
import { guardToolCall } from "@/lib/auth/principal-context"
import type { MemoryAddRequest, MemoryAddResponse, MemorySearchRequest, MemorySearchResponse } from "@/lib/memory/canonical-contracts"

const fixtures = {
  raleigh: { group: "allura-factory-smoke-raleigh-loadtest", actor: "factory-raleigh-ci" },
  charlotte: { group: "allura-factory-smoke-charlotte-loadtest", actor: "factory-charlotte-ci" },
} as const

export interface SmokeBindings {
  seedWorkspace(group: string): Promise<void>
  add(request: MemoryAddRequest): Promise<MemoryAddResponse>
  search(request: MemorySearchRequest): Promise<MemorySearchResponse>
  cleanup: readonly (() => Promise<void>)[]
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function exactList(value: string | undefined, expected: readonly string[]): boolean {
  const values = value?.split(",").map((item) => item.trim()) ?? []
  return values.length === expected.length && [...values].sort().every((item, index) => item === [...expected].sort()[index])
}

function startup(args: readonly string[]) {
  assert(args.length === 1 && /^(raleigh|charlotte)-(write|foreign)$/.test(args[0] ?? ""), "invalid smoke phase")
  const city = args[0]!.startsWith("raleigh-") ? "raleigh" : "charlotte"
  const fixture = fixtures[city]
  const workspace = `ws-${fixture.group}`
  const env = process.env
  assert(env.ALLURA_MCP_SERVICE_PRINCIPAL_ID === fixture.actor, "explicit smoke principal required")
  assert(env.ALLURA_MCP_SERVICE_WORKSPACE_ID === workspace, "exact smoke workspace required")
  assert(exactList(env.ALLURA_MCP_SERVICE_TENANTS, [fixture.group]), "exact smoke tenant required")
  assert(exactList(env.ALLURA_MCP_SERVICE_ROLES, ["viewer"]), "exact smoke viewer role required")
  assert(exactList(env.ALLURA_MCP_SERVICE_SCOPES, ["memory:read", "memory:write"]), "exact smoke scopes required")
  assert(env.ALLURA_MCP_DEV_AUTH !== "true", "dev authentication forbidden for smoke")
  const runId = env.FACTORY_SMOKE_RUN_ID ?? ""
  assert(/^[1-9]\d{0,19}-[1-9]\d{0,5}$/.test(runId), "bounded workflow run-attempt marker required")
  return { city, fixture, workspace, runId, write: args[0]!.endsWith("-write") }
}

async function loadBindings(): Promise<SmokeBindings> {
  const [tools, connections, vector, postgres] = await Promise.all([
    import("@/mcp/canonical-tools"),
    import("@/mcp/canonical-tools/connection"),
    import("@/lib/ruvector/connection"),
    import("@/lib/postgres/connection"),
  ])
  return {
    seedWorkspace: async (group) => {
      await postgres.getPool().query(
        `INSERT INTO workspaces (workspace_id, group_id, name)
         VALUES ($1, $2, 'factory-cross-team-smoke')
         ON CONFLICT (workspace_id, group_id) DO NOTHING`,
        [`ws-${group}`, group],
      )
    },
    add: tools.memory_add,
    search: tools.memory_search,
    cleanup: [connections.closeConnections, vector.closeRuVectorPool, postgres.closePool],
  }
}

/** Offline tests may bind inert storage; authentication and its private issuer stay real. */
export async function runTenantSmoke(args: readonly string[], bind: () => Promise<SmokeBindings> = loadBindings): Promise<void> {
  const plan = startup(args)
  const principal = authenticateServiceTransport(`factory-ci-${plan.runId}-${args[0]}`)
  assert(principal.authMethod === "service_identity" && principal.principalId === plan.fixture.actor &&
    principal.workspaceId === plan.workspace && principal.tenantIds.length === 1 && principal.tenantIds[0] === plan.fixture.group &&
    principal.roles.length === 1 && principal.roles[0] === "viewer" &&
    exactList(principal.scopes.join(","), ["memory:read", "memory:write"]), "resolved smoke authority mismatch")
  const bindings = await bind()
  let failed = false
  let failure: unknown
  try {
    const target = plan.write ? plan.city : plan.city === "raleigh" ? "charlotte" : "raleigh"
    const marker = `${target}-${plan.runId}`
    const content = `factory_ci_smoke ${marker}`
    let savedId: string | undefined
    if (plan.write) {
      await bindings.seedWorkspace(plan.fixture.group)
      const prepared = principal.prepareMemoryAdd({
        group_id: plan.fixture.group,
        content,
        metadata: { source: "manual", agent_id: principal.principalId, conversation_id: `factory-ci-${marker}` },
        threshold: 1,
      })
      const added = await bindings.add(prepared.request)
      assert(added.stored === "episodic", "expected an episodic PostgreSQL write")
      assert(typeof added.id === "string" && added.id.length > 0, "saved memory ID required")
      savedId = added.id
    }
    const guarded = guardToolCall(principal, "memory_search", {
      group_id: plan.fixture.group, query: marker, status: "all", include_global: false, limit: 10,
    })
    // This type conversion follows the actual dispatch guard; it does not issue write authority.
    const result = await bindings.search(guarded.args as unknown as MemorySearchRequest)
    assert(plan.write
      ? result.results.some((item) => item.id === savedId && item.content === content)
      : result.results.every((item) => !String(item.content).includes(marker)),
    plan.write ? "exact saved marker was not discoverable" : "cross-tenant marker leaked into search results")
  } catch (error) {
    failed = true
    failure = error
  } finally {
    for (const close of bindings.cleanup) {
      try { await close() } catch (error) {
        if (!failed) { failed = true; failure = error }
      }
    }
  }
  if (failed) throw failure
}

export async function smokeMain(args: readonly string[], bind?: () => Promise<SmokeBindings>): Promise<number> {
  try {
    await runTenantSmoke(args, bind)
    console.log(JSON.stringify({ ok: true, phase: args[0], run_id: process.env.FACTORY_SMOKE_RUN_ID,
      response_ownership_metadata: "not advertised by the search contract; issued request scope verified" }))
    return 0
  } catch {
    console.error("Factory tenant smoke failed; no isolation success claimed")
    return 1
  }
}

if (import.meta.main) process.exit(await smokeMain(process.argv.slice(2)))
