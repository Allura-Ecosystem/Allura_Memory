import type { PoolClient } from "pg"
import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))

import { FocusedSubgraphReadService } from "./read-service"

const principal = {
  id: "viewer-a", email: "viewer@example.test", role: "viewer" as const,
  groupId: "allura-system", workspaceId: "workspace-a", sessionId: "session-a",
}
const node = {
  key: "memory:a", entityType: "memory" as const, kind: { classification: "product" as const, name: "Memory" as const },
  label: "Memory a", source: { kind: "record" as const, recordType: "graph_memories", recordKey: "a" },
  freshness: { state: "current" as const, observedAt: "2026-10-12T00:00:00.000Z" }, evidence: { state: "absent" as const },
  version: { version: 1, deprecated: false }, order: { distance: 0, kindRank: 0 },
}
const secondNode = { ...node, key: "memory:b" as const, label: "Memory b", source: { ...node.source, recordKey: "b" } }
const completePage = { nodes: [node], edges: [], ambiguous: false, hasMoreNodes: false, hasMoreEdges: false, boundary: null }
const partialPage = {
  ...completePage, nodes: [node, secondNode], hasMoreNodes: true,
  boundary: { node: { distance: 0, kindRank: 0, freshnessAt: node.freshness.observedAt, nodeKey: secondNode.key }, edge: null },
}

function harness(options: {
  authority?: boolean; authorityRole?: string; revision?: number; repositoryRead?: ReturnType<typeof vi.fn>; transactionError?: Error
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("set_config('statement_timeout'")) return { rows: [{ set_config: "5000ms" }] }
    if (sql.includes("brain_workspace_memberships")) return { rows: options.authority === false ? [] : [{ policy_epoch: 3, role: options.authorityRole ?? "viewer" }] }
    if (sql.includes("graph_scope_revisions")) return { rows: [{ graph_revision: options.revision ?? 7 }] }
    throw new Error(`unexpected service SQL: ${sql.slice(0, 80)}`)
  })
  const transaction = vi.fn(async (_scope, callback) => {
    if (options.transactionError) throw options.transactionError
    return callback({ query } as unknown as PoolClient)
  })
  const repositoryRead = options.repositoryRead ?? vi.fn().mockResolvedValue(completePage)
  const service = new FocusedSubgraphReadService({
    continuationSecret: Buffer.alloc(32, 21), transaction, repositoryFactory: () => ({ read: repositoryRead }),
    rolloutValue: () => "true", now: () => new Date("2026-10-12T00:05:00.000Z"),
  })
  return { service, transaction, query, repositoryRead }
}

beforeEach(() => vi.clearAllMocks())

describe("FocusedSubgraphReadService", () => {
  it("fails closed before a transaction while rollout is disabled", async () => {
    const transaction = vi.fn()
    const service = new FocusedSubgraphReadService({ continuationSecret: Buffer.alloc(32), transaction, rolloutValue: () => undefined })
    await expect(service.read(principal, { kind: "overview" })).resolves.toMatchObject({ state: "degraded", reasonCode: "GRAPH_V2_UNAVAILABLE" })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("maps an invalid principal inside the service boundary", async () => {
    const { service, transaction } = harness()
    await expect(service.read({ ...principal, sessionId: "" }, { kind: "overview" })).resolves.toEqual({
      contractVersion: "2.0", state: "denied", reasonCode: "INSUFFICIENT_ROLE", action: "request_access",
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("requires the authenticated role to agree with relational authority", async () => {
    const { service, repositoryRead } = harness({ authorityRole: "curator" })
    await expect(service.read(principal, { kind: "overview" })).resolves.toMatchObject({ state: "denied" })
    expect(repositoryRead).not.toHaveBeenCalled()
  })

  it("proves relational membership and emits a revision-bound complete page", async () => {
    const { service, transaction, query } = harness()
    const result = await service.read(principal, { kind: "overview", nodeLimit: 10, edgeLimit: 20 })
    expect(result).toMatchObject({ state: "complete", snapshot: { policyEpoch: 3, graphRevision: 7 }, nodes: [{ key: "memory:a" }] })
    expect(transaction).toHaveBeenCalledWith({ tenantId: "allura-system", workspaceId: "workspace-a", principalId: "viewer-a" }, expect.any(Function))
    expect(query.mock.calls[0]).toEqual(["SELECT set_config('statement_timeout',$1,true)", ["5000ms"]])
  })

  it("denies when active relational membership cannot be proven", async () => {
    const { service, repositoryRead } = harness({ authority: false })
    await expect(service.read(principal, { kind: "overview" })).resolves.toMatchObject({ state: "denied" })
    expect(repositoryRead).not.toHaveBeenCalled()
  })

  it("maps backend failures to the sanitized unavailable contract", async () => {
    const onUnavailable = vi.fn()
    const transactionError = new Error("postgres password=secret host=db.internal")
    const { transaction } = harness({ transactionError })
    const service = new FocusedSubgraphReadService({
      continuationSecret: Buffer.alloc(32, 21), transaction, rolloutValue: () => "true", onUnavailable,
    })
    const result = await service.read(principal, { kind: "overview" })
    expect(result).toEqual({ contractVersion: "2.0", state: "error", code: "UNAVAILABLE", retryable: true, action: "retry" })
    expect(JSON.stringify(result)).not.toMatch(/password|internal|postgres/i)
    expect(onUnavailable).toHaveBeenCalledWith(transactionError, { queryKind: "overview", continuation: false })
  })

  it("maps a real repository closure contradiction to MALFORMED_QUERY", async () => {
    const edgeRow = {
      edge_id: "edge-ab", from_id: "a", from_kind: "structural", to_id: "b", to_kind: "structural",
      rel_type: "RELATES_TO", created_at: node.freshness.observedAt, source_table: "graph_structural_edges",
      edge_depth: 0, traversal_direction: "outgoing", from_distance: 0, to_distance: 0,
    }
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("set_config('statement_timeout'")) return { rows: [{ set_config: "5000ms" }] }
      if (sql.includes("brain_workspace_memberships")) return { rows: [{ policy_epoch: 3, role: "viewer" }] }
      if (sql.includes("graph_scope_revisions")) return { rows: [{ graph_revision: 7 }] }
      if (sql.includes("endpoint_state IN")) return { rows: [{ present: false }] }
      if (sql.includes("WITH node_catalog AS")) return { rows: [edgeRow] }
      throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`)
    })
    const transaction = vi.fn(async (_scope, callback) => callback({ query } as unknown as PoolClient))
    const service = new FocusedSubgraphReadService({
      continuationSecret: Buffer.alloc(32, 21), transaction, rolloutValue: () => "true",
    })
    await expect(service.read(principal, { kind: "overview", nodeLimit: 1 })).resolves.toEqual({
      contractVersion: "2.0", state: "error", code: "MALFORMED_QUERY", retryable: false, action: "none",
    })
  })

  it.each([
    ["focus key", { focusNodeKey: "memory:b" }],
    ["node filter", { nodeKinds: ["Project"] }],
    ["relationship filter", { relationshipKinds: ["MEMBER_OF"] }],
    ["direction", { direction: "incoming" }],
    ["depth", { depth: 1 }],
    ["node budget", { nodeLimit: 3 }],
    ["edge budget", { edgeLimit: 3 }],
  ])("rejects %s continuation drift before repository access", async (_label, drift) => {
    const repositoryRead = vi.fn().mockResolvedValue(partialPage)
    const { service } = harness({ repositoryRead })
    const base = {
      kind: "focus" as const, focusNodeKey: "memory:a", nodeKinds: ["Memory"], relationshipKinds: ["RELATES_TO"],
      direction: "outgoing" as const, depth: 2 as const, nodeLimit: 2, edgeLimit: 2,
    }
    const first = await service.read(principal, base)
    if (first.state !== "partial") throw new Error("expected partial")
    repositoryRead.mockClear()
    await expect(service.read(principal, { ...base, ...drift, continuation: first.continuation })).resolves.toMatchObject({
      state: "error", code: "CONTINUATION_CONFLICT", action: "restart",
    })
    expect(repositoryRead).not.toHaveBeenCalled()
  })

  it("rejects revision drift with snapshot restart semantics", async () => {
    const repositoryRead = vi.fn().mockResolvedValue({ ...partialPage, nodes: [node], boundary: {
      node: { distance: 0, kindRank: 0, freshnessAt: node.freshness.observedAt, nodeKey: node.key }, edge: null,
    } })
    const first = harness({ revision: 7, repositoryRead })
    const firstPage = await first.service.read(principal, { kind: "overview", nodeLimit: 1 })
    if (firstPage.state !== "partial") throw new Error("expected partial")
    const secondRead = vi.fn()
    const second = harness({ revision: 8, repositoryRead: secondRead })
    await expect(second.service.read(principal, { kind: "overview", nodeLimit: 1, continuation: firstPage.continuation }))
      .resolves.toMatchObject({ state: "error", code: "SNAPSHOT_CONFLICT", action: "restart" })
    expect(secondRead).not.toHaveBeenCalled()
  })
})
