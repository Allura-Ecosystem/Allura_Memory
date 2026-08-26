import { describe, expect, it, vi } from "vitest"

const transactionState = vi.hoisted(() => ({ client: null as unknown }))
vi.mock("@/lib/db/tenant-transaction", () => ({
  withTenantTransaction: vi.fn(async (_scope, callback) => callback(transactionState.client)),
  withWorkspaceTransaction: vi.fn(async (_scope, callback) => callback(transactionState.client)),
}))

import { withWorkspaceTransaction } from "@/lib/db/tenant-transaction"
import { RuVectorGraphAdapter } from "../ruvector-adapter"

describe("RuVectorGraphAdapter workspace authority", () => {
  it.each(["getMemory", "searchMemories", "listMemories"] as const)("workspace-filters %s and excludes quarantine", async (method) => {
    const query = vi.fn(async (...args: unknown[]) => {
      const statement = String(args[0])
      if (statement.includes("COUNT(*)")) return { rows: [{ total: "0" }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    const client = { query, release: vi.fn() }
    transactionState.client = client
    const adapter = new RuVectorGraphAdapter({ connect: vi.fn(async () => client) } as never)
    const base = { group_id: "allura-test" as never, workspace_id: "workspace-a", principal_id: "agent-a" }
    if (method === "getMemory") await adapter.getMemory({ ...base, id: "00000000-0000-4000-8000-000000000001" as never })
    if (method === "searchMemories") await adapter.searchMemories({ ...base, query: "scope", limit: 10 })
    if (method === "listMemories") await adapter.listMemories({ ...base, user_id: null })
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n")
    const params = query.mock.calls.flatMap(([, values]) => values as unknown[])
    expect(sql).toContain("workspace_id")
    expect(sql).toContain("workspace_scope_state='workspace_scoped'")
    expect(sql).toContain("graph_supersedes")
    expect(params).toContain("workspace-a")
  })

  it("creates memories through the app-role workspace transaction", async () => {
    const client = { query: vi.fn(async () => ({ rows: [], rowCount: 1 })) }
    transactionState.client = client
    const adapter = new RuVectorGraphAdapter({ query: vi.fn() } as never)
    await adapter.createMemory({
      id: "memory-a" as never,
      group_id: "allura-test" as never,
      workspace_id: "workspace-a",
      principal_id: "agent-a",
      user_id: "agent-a",
      content: "workspace memory",
      score: 0.9 as never,
      provenance: "manual" as never,
      created_at: new Date(0).toISOString(),
    } as never)
    expect(withWorkspaceTransaction).toHaveBeenCalledWith(
      { tenantId: "allura-test", workspaceId: "workspace-a", principalId: "agent-a" },
      expect.any(Function),
    )
    expect(client.query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO graph_memories[\s\S]*workspace_id[\s\S]*workspace_scope_state/),
      expect.arrayContaining(["workspace-a", "workspace_scoped"]),
    )
  })

  it("supersedes memories inside one workspace-scoped transaction", async () => {
    const client = {
      query: vi.fn(async (sql: string) => sql.includes("SELECT score")
        ? { rows: [{ score: 0.9, provenance: "manual" }], rowCount: 1 }
        : { rows: [], rowCount: 1 }),
    }
    transactionState.client = client
    const adapter = new RuVectorGraphAdapter({ connect: vi.fn() } as never)
    await adapter.supersedesMemory({
      prev_id: "memory-a" as never,
      new_id: "memory-b" as never,
      group_id: "allura-test" as never,
      workspace_id: "workspace-a",
      principal_id: "agent-a",
      user_id: "agent-a",
      content: "workspace memory v2",
      version: 2,
      created_at: new Date(0).toISOString(),
    } as never)
    const sql = client.query.mock.calls.map(([statement]) => String(statement)).join("\n")
    expect(withWorkspaceTransaction).toHaveBeenCalled()
    expect(sql).toContain("workspace_id")
    expect(sql).toContain("workspace_scope_state")
    expect(sql).not.toContain("WHERE id = $1 AND group_id = $2\n")
  })

  it.each([
    ["checkDuplicate", (adapter: RuVectorGraphAdapter) => adapter.checkDuplicate({ group_id:"allura-test" as never, user_id:null, content:"x" })],
    ["softDeleteMemory", (adapter: RuVectorGraphAdapter) => adapter.softDeleteMemory({ id:"memory-a" as never, group_id:"allura-test" as never, deleted_at:new Date(0).toISOString() })],
    ["restoreMemory", (adapter: RuVectorGraphAdapter) => adapter.restoreMemory({ id:"memory-a" as never, group_id:"allura-test" as never, restored_at:new Date(0).toISOString() })],
    ["countMemories", (adapter: RuVectorGraphAdapter) => adapter.countMemories({ group_id:"allura-test" as never, user_id:null })],
    ["checkCanonical", (adapter: RuVectorGraphAdapter) => adapter.checkCanonical({ id:"memory-a" as never, group_id:"allura-test" as never })],
    ["getVersion", (adapter: RuVectorGraphAdapter) => adapter.getVersion({ id:"memory-a" as never, group_id:"allura-test" as never })],
    ["exportMemories", (adapter: RuVectorGraphAdapter) => adapter.exportMemories({ group_id:"allura-test" as never, user_id:null, offset:0, limit:10 })],
    ["getDeprecatedMemories", (adapter: RuVectorGraphAdapter) => adapter.getDeprecatedMemories({ ids:["memory-a"], group_id:"allura-test" as never })],
    ["linkMemoryContext", (adapter: RuVectorGraphAdapter) => adapter.linkMemoryContext({ memory_id:"memory-a" as never, group_id:"allura-test" as never, agent_id:"agent-a", project_id:null })],
  ] as const)("fails closed for retired tenant-only lifecycle method %s", async (_operation, invoke) => {
    const pool = { query: vi.fn(), connect: vi.fn() }
    const adapter = new RuVectorGraphAdapter(pool as never)
    await expect(invoke(adapter)).rejects.toThrow("tenant-only graph lifecycle operation is retired")
    expect(pool.query).not.toHaveBeenCalled()
    expect(pool.connect).not.toHaveBeenCalled()
  })
})