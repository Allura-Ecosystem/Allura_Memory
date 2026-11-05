import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  workspaceScopes: [] as Array<{ tenantId: string; workspaceId: string; principalId: string }>,
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  graphHealthy: true,
  supersedesCount: 0,
}))

vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: vi.fn(async () => ({ pg: { query: vi.fn(() => { throw new Error("unscoped pool.query must not be used") }) } })),
}))

vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({
  withCircuitBreaker: vi.fn(async (_store: string, _group: string, _operation: string, work: () => unknown) => work()),
}))

vi.mock("@/lib/db/tenant-transaction", () => ({
  withWorkspaceTransaction: vi.fn(async (
    scope: { tenantId: string; workspaceId: string; principalId: string },
    work: (db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => unknown,
  ) => {
    state.workspaceScopes.push(scope)
    return work({
      query: async (sql: string, params: unknown[] = []) => {
        state.queries.push({ sql, params })
        if (/canonical_proposals/.test(sql) && /status = 'pending'/.test(sql)) return { rows: [{ count: "23" }] }
        if (/graph_supersedes/.test(sql)) return { rows: [{ count: String(state.supersedesCount) }] }
        if (/COUNT\(\*\).*events/s.test(sql)) return { rows: [{ total: "0", count: "0" }] }
        if (/SELECT 1/.test(sql)) return { rows: [{ "?column?": 1 }] }
        return { rows: [] }
      },
    })
  }),
}))

vi.mock("@/lib/graph-adapter", () => ({
  createGraphAdapter: vi.fn(() => ({
    isHealthy: vi.fn(async () => state.graphHealthy),
    getVersioningStatus: vi.fn(async () => ({ supersedesCount: state.supersedesCount })),
  })),
  getGraphBackend: vi.fn(() => "ruvector"),
}))

vi.mock("@/control-plane/syscalls", () => ({ APPROVAL_REQUIRED_KINDS: ["memory_mutation"] }))
vi.mock("@/lib/governance/policies", () => ({
  CANONICAL_POLICIES: [{ id: "pol-007", invariant_key: "approval_required_for_mutations" }],
}))

import type { GroupId } from "@/lib/memory/canonical-contracts"
import {
  audit_health_report,
  audit_invariant_check,
  audit_query_events,
  auditToolContextFromPrincipal,
} from "../audit-tools"

const request = { group_id: "allura-audit-fixture" as GroupId }
const context = {
  workspaceId: "ws_audit_fixture",
  principalId: "fixture-principal",
  registeredToolCount: 24,
}

describe("workspace-scoped audit tools", () => {
  beforeEach(() => {
    state.workspaceScopes.length = 0
    state.queries.length = 0
    state.graphHealthy = true
    state.supersedesCount = 0
  })

  it("fails closed when the authenticated principal has no workspace binding", () => {
    expect(() => auditToolContextFromPrincipal({ principalId: "fixture-principal" })).toThrow(
      /verified workspace binding/i,
    )
  })

  it("reports the workspace curator queue and active RuVector graph health", async () => {
    const report = await audit_health_report(request, context)

    expect(report.subsystems.curator_queue.pending_count).toBe(23)
    expect(report.subsystems.graph.status).toBe("healthy")
    expect(report.subsystems.mcp_tools.tool_count).toBe(24)
    expect((report.subsystems as Record<string, unknown>).neo4j).toBeUndefined()
    expect(state.workspaceScopes).not.toHaveLength(0)
    expect(state.workspaceScopes.every((scope) => scope.workspaceId === context.workspaceId)).toBe(true)
    const queueQuery = state.queries.find(({ sql }) => /canonical_proposals/.test(sql) && /pending/.test(sql))
    expect(queueQuery?.params).toEqual([request.group_id, context.workspaceId])
  })

  it("ignores caller-supplied workspace selectors and remains bound to authenticated context", async () => {
    await audit_query_events(
      { ...request, workspace_id: "ws_other" } as typeof request,
      context,
    )

    expect(state.workspaceScopes.every((scope) => scope.workspaceId === context.workspaceId)).toBe(true)
    expect(state.queries.filter(({ sql }) => /FROM events/.test(sql)).every(({ params }) => params.includes(context.workspaceId))).toBe(true)
    expect(state.queries.some(({ params }) => params.includes("ws_other"))).toBe(false)
  })

  it("checks SUPERSEDES through the active graph adapter without Neo4j", async () => {
    state.supersedesCount = 7
    const report = await audit_invariant_check(request, context)
    const versioning = report.invariants.find(({ key }) => key === "graph_supersedes")

    expect(versioning).toMatchObject({ passed: true, violation_count: 0 })
    expect(versioning?.detail).toContain("7")
    expect(report.invariants.some(({ key }) => key.includes("neo4j"))).toBe(false)
  })
})
