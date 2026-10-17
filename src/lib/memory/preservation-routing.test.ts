import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GroupId, MemoryId } from "./canonical-contracts"
import { curatorScore } from "@/lib/curator/score"
import * as scoring from "@/lib/curator/score"
import { authenticateServiceTransport } from "@/lib/auth/mcp-authenticator"

const group = "allura-preservation" as GroupId
const scope = { group_id: group, workspace_id: "workspace-one", agent_id: "verified-agent" }
const content = "I always prefer concise technical answers with concrete evidence and clear explanations that preserve human review before any change to canonical knowledge."
const queries: Array<{ sql: string; values?: unknown[] }> = []
let provenance = "manual"
let rowContent = content
let insertError: unknown
let insertAttempts = 0
let winner: Record<string, unknown> | undefined
let visibleInitially = false
let nearDuplicate: string | undefined
const client = {
  query: vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values })
    if (sql.includes("FROM graph_memories")) return { rows: /COUNT/.test(sql) ? [{ total: "0" }] : [], rowCount: 0 }
    if (sql.includes("FROM canonical_proposals")) {
      if (sql.includes("ORDER BY created_at")) return { rows: nearDuplicate ? [{ id: "near-duplicate", status: nearDuplicate, content, score: 0.95, created_at: new Date().toISOString() }] : [], rowCount: 0 }
      return { rows: winner && (visibleInitially || insertAttempts > 0) ? [winner] : [], rowCount: 0 }
    }
    if (sql.includes("INSERT INTO canonical_proposals")) { insertAttempts++; if (insertError) throw insertError; return { rows: [], rowCount: 1 } }
    if (sql.includes("INSERT INTO events")) return { rows: [{ id: "42" }], rowCount: 1 }
    if (sql.includes("COUNT(*)")) return { rows: [{ total_count: "1", count: "0" }], rowCount: 1 }
    if (sql.includes("FROM events")) return { rows: [{ id: "memory-one", event_id: "42", content: rowContent, provenance, user_id: scope.agent_id, created_at: new Date().toISOString(), tags: [] }], rowCount: 1 }
    return { rows: [], rowCount: 0 }
  }), release: vi.fn(),
}
const pool = { query: client.query, connect: vi.fn(async () => client) }
vi.mock("@/mcp/canonical-tools/connection", () => ({ getConnections: async () => ({ pg: pool }), resetConnections: vi.fn() }))
vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({ withCircuitBreaker: async (_s: string, _g: string, _op: string, fn: () => unknown) => fn(), recordToolCall: vi.fn(), checkBudget: async () => ({ allowed: true }) }))
vi.mock("@/lib/ruvector/retrieval-adapter", () => ({ searchWithFeedback: async () => ({ results: [] }) }))
vi.mock("@/lib/ruvector/bridge", () => ({ storeMemory: vi.fn(async () => ({})) }))
import { memory_add, memory_get, memory_list, memory_promote, memory_search } from "@/mcp/canonical-tools"

const request = { id: "memory-one" as MemoryId, group_id: group, user_id: scope.agent_id, scope }
beforeEach(() => {
  queries.length = 0; insertAttempts = 0; insertError = undefined; winner = undefined; visibleInitially = false; provenance = "manual"; rowContent = content; nearDuplicate = undefined
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
function assertNoApprovalWrites() {
  expect(queries.some(({ sql }) => /INSERT INTO (graph_memories|graph_supersedes|governance_receipts)|UPDATE canonical_proposals/.test(sql))).toBe(false)
}
describe("episodic read and human queue preservation", () => {
  it("returns zero for invalid historical content without failing the read batch", async () => {
    rowContent = "x"
    expect((await memory_get(request)).score).toBe(0)
    expect((await memory_list(request)).memories[0]?.score).toBe(0)
    expect((await memory_search({ ...request, query: "x", status: "all" })).results[0]?.score).toBe(0)
  })
  it.each(["get", "list", "search"])("propagates operational scorer errors from %s", async (operation) => {
    const error = new Error("scorer operational failure")
    vi.spyOn(scoring, "curatorScore").mockRejectedValue(error)
    const result = operation === "get" ? memory_get(request) : operation === "list" ? memory_list(request) : memory_search({ ...request, query: "technical", status: "all" })
    await expect(result).rejects.toBe(error)
  })
  it.each(["conversation", "manual"])("recomputes creation-equivalent %s score in get/list/search", async (source) => {
    provenance = source
    const expected = (await curatorScore({ content, source: source === "manual" ? "manually_added" : "conversation", usageCount: 0, daysSinceCreated: 0 })).confidence
    expect((await memory_get(request)).score).toBe(expected)
    expect((await memory_list({ ...request, sort: "score_desc" })).memories[0]?.score).toBe(expected)
    expect((await memory_search({ ...request, query: "technical", status: "all" })).results[0]?.score).toBe(expected)
    expect(queries.some(({ sql }) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false)
  })
  it("preserves manual provenance when scoring a promotion backfill", async () => {
    await memory_promote(request)
    const expected = (await curatorScore({ content, source: "manually_added", usageCount: 0, daysSinceCreated: 0 })).confidence
    expect(queries.find(({ sql }) => sql.includes("INSERT INTO canonical_proposals"))?.values?.[4]).toBe(expected)
    assertNoApprovalWrites()
  })
  it("reconciles only the known unique-source loser with a single scoped winner reread", async () => {
    insertError = Object.assign(new Error("unique source"), { code: "23505", constraint: "idx_canonical_proposals_trace_ref_unique" })
    winner = { id: "winner", status: "pending", group_id: group, workspace_id: scope.workspace_id, trace_ref: "42" }
    const result = await memory_promote({ ...request, user_id: "supplied-user", curator_id: "supplied-curator" })
    expect(result.proposal_id).toBe("winner")
    expect(result.status).toBe("queued")
    expect(insertAttempts).toBe(1)
    const reads = queries.filter(({ sql }) => sql.includes("FROM canonical_proposals") && sql.includes("trace_ref"))
    expect(reads).toHaveLength(2)
    expect(reads.every(({ values }) => values?.includes(group) && values?.includes(scope.workspace_id) && values?.includes("42"))).toBe(true)
    expect(queries.some(({ sql }) => sql.includes("app.current_principal = 'verified-agent'"))).toBe(true)
    expect(JSON.stringify(queries)).not.toMatch(/supplied-user|supplied-curator/)
    assertNoApprovalWrites()
  })
  it.each(["approved", "rejected"])("does not replay a terminal %s source as queued or reinsert", async (status) => {
    visibleInitially = true
    winner = { id: "winner", status, group_id: group, workspace_id: scope.workspace_id, trace_ref: "42" }
    await expect(memory_promote(request)).rejects.toThrow(/existing.*proposal|proposal.*already/i)
    expect(insertAttempts).toBe(0)
    assertNoApprovalWrites()
  })
  it.each(["approved", "rejected"])("does not claim pending when the concurrent winner is %s", async (status) => {
    insertError = Object.assign(new Error("unique source"), { code: "23505", constraint: "idx_canonical_proposals_trace_ref_unique" })
    winner = { id: "winner", status, group_id: group, workspace_id: scope.workspace_id, trace_ref: "42" }
    await expect(memory_promote(request)).rejects.toThrow(/existing.*proposal|proposal.*already/i)
    expect(insertAttempts).toBe(1)
    assertNoApprovalWrites()
  })
  it.each([{ workspace_id: "workspace-two" }, { trace_ref: "43" }, { group_id: "allura-other" }])("rejects a winner outside exact authority: %j", async (mismatch) => {
    insertError = Object.assign(new Error("unique source"), { code: "23505", constraint: "idx_canonical_proposals_trace_ref_unique" })
    winner = { id: "wrong", status: "pending", group_id: group, workspace_id: scope.workspace_id, trace_ref: "42", ...mismatch }
    await expect(memory_promote(request)).rejects.toThrow()
    expect(insertAttempts).toBe(1)
    assertNoApprovalWrites()
  })
  it("fails the known conflict if no scoped winner is visible, without retrying insertion", async () => {
    insertError = Object.assign(new Error("unique source"), { code: "23505", constraint: "idx_canonical_proposals_trace_ref_unique" })
    await expect(memory_promote(request)).rejects.toBe(insertError)
    expect(insertAttempts).toBe(1)
    expect(queries.filter(({ sql }) => sql.includes("FROM canonical_proposals") && sql.includes("trace_ref"))).toHaveLength(2)
  })
  it("does not mislabel an approved near-duplicate as pending or swallow the terminal-state error", async () => {
    nearDuplicate = "approved"
    await expect(memory_promote(request)).rejects.toThrow(/existing.*proposal/i)
    expect(insertAttempts).toBe(0)
    assertNoApprovalWrites()
  })
  it("retains truthful pending near-duplicate queue behavior", async () => {
    nearDuplicate = "pending"
    expect((await memory_promote(request)).proposal_id).toBe("near-duplicate")
    expect(insertAttempts).toBe(0)
    assertNoApprovalWrites()
  })
  it("does not retry unknown uniqueness failures", async () => {
    insertError = Object.assign(new Error("other unique"), { code: "23505", constraint: "other_constraint" })
    await expect(memory_promote(request)).rejects.toBe(insertError)
    expect(insertAttempts).toBe(1)
  })
  it("auto mode still only queues from memory_add and memory_promote", async () => {
    vi.stubEnv("PROMOTION_MODE", "auto")
    vi.stubEnv("ALLURA_MCP_SERVICE_PRINCIPAL_ID", scope.agent_id)
    vi.stubEnv("ALLURA_MCP_SERVICE_WORKSPACE_ID", scope.workspace_id)
    vi.stubEnv("ALLURA_MCP_SERVICE_TENANTS", group)
    vi.stubEnv("ALLURA_MCP_SERVICE_SCOPES", "memory:write")
    const principal = await authenticateServiceTransport("preservation-test")
    const result = await memory_add(principal.prepareMemoryAdd({ group_id: group, user_id: scope.agent_id, content, metadata: { source: "manual" } }).request)
    expect(result.stored).toBe("episodic")
    expect(result.pending_review).toBe(true)
    expect((await memory_promote(request)).status).toBe("queued")
    assertNoApprovalWrites()
  })
})
