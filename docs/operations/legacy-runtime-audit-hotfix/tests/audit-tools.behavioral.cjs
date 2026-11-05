#!/usr/bin/env node
/* Offline behavioral harness for the frozen export; no DB, network, or secrets. */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const Module = require("node:module")

const ts = process.env.TYPESCRIPT_PATH
  ? require(process.env.TYPESCRIPT_PATH)
  : require("typescript")

const root = path.resolve(__dirname, "..")
const sourcePath = path.join(root, "src/mcp/audit-tools.ts")
const source = fs.readFileSync(sourcePath, "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
  fileName: sourcePath,
  reportDiagnostics: true,
})
const syntaxErrors = (compiled.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error)
assert.equal(syntaxErrors.length, 0, "audit-tools.ts must transpile without syntax errors")

const state = { scopes: [], queries: [], supersedesCount: 7 }
const db = {
  async query(sql, params = []) {
    state.queries.push({ sql, params })
    if (/canonical_proposals/.test(sql) && /status = 'pending'/.test(sql)) return { rows: [{ count: "23" }] }
    if (/COUNT\(\*\) AS total/.test(sql)) return { rows: [{ total: "0" }] }
    if (/COUNT\(\*\) AS count/.test(sql)) return { rows: [{ count: "0" }] }
    if (/SELECT 1/.test(sql)) return { rows: [{ ok: 1 }] }
    return { rows: [] }
  },
}
class DatabaseQueryError extends Error {}
class DatabaseUnavailableError extends Error {}
const graphAdapter = {
  async isHealthy() { return true },
  async getVersioningStatus() { return { supersedesCount: state.supersedesCount } },
}
const mocks = {
  "@/lib/errors/database-errors": {
    classifyPostgresError: (error) => error,
    DatabaseQueryError,
    DatabaseUnavailableError,
  },
  "@/lib/db/tenant-transaction": {
    withWorkspaceTransaction: async (scope, work) => {
      state.scopes.push(scope)
      return work(db)
    },
  },
  "@/lib/graph-adapter": {
    createGraphAdapter: () => graphAdapter,
    getGraphBackend: () => "ruvector",
  },
  "./canonical-tools/validation-utils": {
    validateGroupId: (id) => id,
    baseMeta: (stores) => ({ stores }),
    degradedMeta: (stores) => ({ stores, degraded: true }),
  },
  "./canonical-tools/connection": {
    getConnections: async () => ({ pg: { query() { throw new Error("unscoped pool query") } } }),
  },
  "./canonical-tools/budget-circuit": {
    withCircuitBreaker: async (_store, _group, _op, work) => work(),
  },
  "@/control-plane/syscalls": { APPROVAL_REQUIRED_KINDS: ["memory_mutation"] },
  "@/lib/governance/policies": {
    CANONICAL_POLICIES: [{ id: "pol-007", invariant_key: "approval_required_for_mutations" }],
  },
}
const nativeRequire = Module.createRequire(sourcePath)
function localRequire(id) {
  if (id === "@/lib/memory/canonical-contracts" || id === "@/lib/auth/principal-context") return {}
  if (Object.hasOwn(mocks, id)) return mocks[id]
  return nativeRequire(id)
}
const mod = { exports: {} }
new Function("exports", "require", "module", "__filename", "__dirname", compiled.outputText)(
  mod.exports, localRequire, mod, sourcePath, path.dirname(sourcePath),
)

;(async () => {
  const api = mod.exports
  const request = { group_id: "allura-audit-fixture" }
  const context = { workspaceId: "ws_audit_fixture", principalId: "fixture-principal", registeredToolCount: 24 }

  assert.throws(
    () => api.auditToolContextFromPrincipal({ principalId: "fixture-principal" }),
    /verified workspace binding/i,
  )

  const health = await api.audit_health_report(request, context)
  assert.equal(health.subsystems.curator_queue.pending_count, 23)
  assert.equal(health.subsystems.graph.status, "healthy")
  assert.equal(health.subsystems.mcp_tools.tool_count, 24)
  assert.equal(Object.hasOwn(health.subsystems, "neo4j"), false)
  const queue = state.queries.find((q) => /canonical_proposals/.test(q.sql) && /pending/.test(q.sql))
  assert.deepEqual(queue.params, [request.group_id, context.workspaceId])

  await api.audit_query_events({ ...request, workspace_id: "ws_attacker" }, context)
  assert.equal(state.queries.some((q) => q.params.includes("ws_attacker")), false)
  assert.equal(state.scopes.every((scope) => scope.workspaceId === context.workspaceId), true)
  assert.equal(state.queries.filter((q) => /FROM events/.test(q.sql)).every((q) => q.params.includes(context.workspaceId)), true)

  const invariants = await api.audit_invariant_check(request, context)
  const graph = invariants.invariants.find((item) => item.key === "graph_supersedes")
  assert.equal(graph.passed, true)
  assert.match(graph.detail, /7 workspace-scoped SUPERSEDES/)
  assert.equal(invariants.invariants.some((item) => item.key.includes("neo4j")), false)

  // Exercise the real PostgreSQL/RuVector adapter method, not the audit mock.
  const adapterPath = path.join(root, "src/lib/graph-adapter/ruvector-adapter.ts")
  const adapterCompiled = ts.transpileModule(fs.readFileSync(adapterPath, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: adapterPath,
  })
  class GraphAdapterError extends Error {}
  const adapterModule = { exports: {} }
  const adapterRequire = (id) => {
    if (id === "./types") return { GraphAdapterError }
    if (id === "@/lib/db/tenant-transaction") {
      return {
        withTenantTransaction: async (_scope, work) => work(db),
        withWorkspaceTransaction: async (scope, work) => {
          state.scopes.push(scope)
          return work({ query: async (sql, params) => {
            state.queries.push({ sql, params })
            return { rows: [{ count: "7" }] }
          } })
        },
      }
    }
    if (id === "@/lib/memory/canonical-contracts") return {}
    return Module.createRequire(adapterPath)(id)
  }
  new Function("exports", "require", "module", "__filename", "__dirname", adapterCompiled.outputText)(
    adapterModule.exports, adapterRequire, adapterModule, adapterPath, path.dirname(adapterPath),
  )
  const adapter = new adapterModule.exports.RuVectorGraphAdapter({})
  const adapterStatus = await adapter.getVersioningStatus({
    group_id: request.group_id,
    workspace_id: context.workspaceId,
    principal_id: context.principalId,
  })
  assert.deepEqual(adapterStatus, { supersedesCount: 7 })
  const adapterQuery = state.queries.at(-1)
  assert.match(adapterQuery.sql, /FROM graph_supersedes/)
  assert.deepEqual(adapterQuery.params, [request.group_id, context.workspaceId])

  console.log("PASS audit-tools behavioral regression: 5 cases")
  console.log(`workspace transactions observed: ${state.scopes.length}`)
  console.log(`scoped SQL statements observed: ${state.queries.length}`)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
