import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GroupId, MemoryId } from "./canonical-contracts"

const queries: Array<{ sql: string; values?: unknown[] }> = []
let failRead = false
let canonical = true
let failAudit = false
let superseded = false
const client = {
  query: vi.fn(async (sql: string, values?: unknown[]) => {
    queries.push({ sql, values })
    if (sql.includes("INSERT INTO events") && failAudit) throw new Error("audit unavailable")
    if (sql.includes("SELECT newer_id FROM graph_supersedes")) return { rows: superseded ? [{ newer_id: "newer" }] : [], rowCount: superseded ? 1 : 0 }
    if (sql.includes("FROM canonical_proposals")) return { rows: [], rowCount: 0 }
    if (sql.includes("graph_memories")) {
      if (failRead) throw new Error("semantic unavailable")
      return { rows: canonical ? [{ id: "mem-a", version: 1, score: 0.9, provenance: "manual", content: "approved", created_at: new Date(), deprecated: false, deleted_at: new Date().toISOString() }] : [], rowCount: canonical ? 1 : 0 }
    }
    if (/SELECT.*id|SELECT metadata/s.test(sql) && sql.includes("FROM events")) return { rows: [{ id: "mem-a", event_id: "42", content: "approved", created_at: new Date().toISOString() }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  }),
  release: vi.fn(),
}
const pool = { query: client.query, connect: vi.fn(async () => client) }
vi.mock("@/mcp/canonical-tools/connection", () => ({ getConnections: vi.fn(async () => ({ pg: pool })), resetConnections: vi.fn() }))
vi.mock("@/lib/postgres/connection", () => ({ getPool: () => pool, getAppPool: () => pool }))
vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({
  withCircuitBreaker: async (_s: string, _g: string, _op: string, fn: () => unknown) => fn(), recordToolCall: vi.fn(),
}))
vi.mock("@/lib/curator/score", () => ({ curatorScore: async () => ({ confidence: 0.9, reasoning: "test", tier: "mainstream" }) }))
import { memory_delete, memory_restore, memory_update, memory_promote } from "@/mcp/canonical-tools"

const request = { id: "mem-a" as MemoryId, group_id: "allura-test-lifecycle" as GroupId, user_id: "actor", scope: { group_id: "allura-test-lifecycle" as GroupId, workspace_id: "workspace-a", agent_id: "actor" } }
describe("canonical lifecycle uses supported workspace authority", () => {
  beforeEach(() => { queries.length = 0; failRead = false; canonical = true; failAudit = false; superseded = false })
  it("updates through real adapter workspace read and SUPERSEDES write", async () => {
    const result = await memory_update({ ...request, content: "revised" })
    expect(result.stored).toBe("semantic")
    expect(result.version).toBe(2)
    expect(queries.some(({ sql }) => sql.includes("INSERT INTO graph_supersedes"))).toBe(true)
  })
  it.each([memory_delete, memory_restore])("does not claim mutation success on semantic failure", async (operation) => {
    failRead = true
    await expect(operation(request)).rejects.toThrow()
    expect(queries.some(({ sql, values }) => sql.includes("INSERT INTO events") && values?.includes("completed"))).toBe(false)
  })
  it("does not convert a semantic update outage into episodic success", async () => {
    failRead = true
    await expect(memory_update({ ...request, content: "revised" })).rejects.toThrow()
  })
  it.each([memory_delete, memory_restore])("mutates with exact workspace/principal and preserves lineage", async (operation) => {
    await operation(request)
    expect(queries.find(({ sql }) => sql.includes("UPDATE graph_memories"))?.values).toEqual(
      ["mem-a", request.group_id, "workspace-a", expect.any(String)],
    )
    expect(queries.some(({ sql }) => sql === "SET LOCAL app.current_principal = 'actor'")).toBe(true)
    expect(queries.some(({ sql }) => /DELETE FROM graph_supersedes|UPDATE events|DELETE FROM events/.test(sql))).toBe(false)
  })
  it("refuses to restore a superseded version", async () => {
    superseded = true
    await expect(memory_restore(request)).rejects.toThrow(/superseded version/)
    expect(queries.some(({ sql }) => sql.includes("UPDATE graph_memories"))).toBe(false)
  })
  it.each([memory_delete, memory_restore])("rolls back lifecycle mutation when its audit insert fails", async (operation) => {
    failAudit = true
    await expect(operation(request)).rejects.toThrow(/audit unavailable/)
    const updateIndex = queries.findIndex(({ sql }) => sql.includes("UPDATE graph_memories"))
    expect(updateIndex).toBeGreaterThanOrEqual(0)
    expect(queries.slice(updateIndex).some(({ sql }) => sql === "ROLLBACK")).toBe(true)
    expect(queries.slice(updateIndex).some(({ sql }) => sql === "COMMIT")).toBe(false)
  })
  it("does not silently mutate PostgreSQL for a different configured backend", async () => {
    const original = process.env.GRAPH_BACKEND
    try {
      process.env.GRAPH_BACKEND = "ruvector-crate"
      await expect(memory_delete(request)).rejects.toThrow(/does not support workspace lifecycle/)
      expect(queries).toEqual([])
    } finally {
      if (original === undefined) delete process.env.GRAPH_BACKEND
      else process.env.GRAPH_BACKEND = original
    }
  })
  it("queues with valid tier/status order after the real canonical lookup", async () => {
    canonical = false
    const result = await memory_promote(request)
    expect(result.status).toBe("queued")
    const insert = queries.find(({ sql }) => sql.includes("INSERT INTO canonical_proposals"))
    expect(insert?.sql).toContain("$6, $7, 'pending', $8, $9")
    expect(insert?.values?.[6]).toBe("mainstream")
  })
  it.each([memory_delete, memory_restore, memory_promote])("requires verified workspace authority", async (operation) => {
    await expect(operation({ ...request, scope: undefined })).rejects.toThrow(/workspace scope/)
    expect(queries).toEqual([])
  })
})
