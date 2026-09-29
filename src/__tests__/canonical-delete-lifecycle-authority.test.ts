import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  tenantQuery: vi.fn(),
  softDelete: vi.fn(),
}))

vi.mock("@/lib/db/tenant-transaction", () => ({ tenantQuery: mocks.tenantQuery }))
vi.mock("@/lib/graph-adapter", () => ({
  createGraphAdapter: () => ({ softDeleteMemory: mocks.softDelete }),
}))
vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: async () => ({ pg: {}, neo4j: null }),
  resetConnections: vi.fn(),
}))
vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({
  checkBudget: vi.fn(),
  ensureSession: vi.fn(),
  getBreakerManager: vi.fn(),
  getBudgetEnforcer: vi.fn(),
  getHaltedSessions: vi.fn(),
  recordToolCall: vi.fn(),
  resetHaltedGroup: vi.fn(),
  withCircuitBreaker: async (_store: string, _group: string, _operation: string, fn: () => Promise<unknown>) => fn(),
}))

import { MemoryNotFoundError } from "@/lib/memory/canonical-contracts"
import { memory_delete } from "@/mcp/canonical-tools"

const request = {
  id: "00000000-0000-4000-8000-000000000001" as never,
  group_id: "allura-system" as never,
  user_id: "subject-user" as never,
  scope: {
    group_id: "allura-system" as never,
    workspace_id: "workspace-a",
    agent_id: "verified-admin",
    session_id: "verified-session",
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tenantQuery.mockResolvedValue({ rows: [], rowCount: 1 })
})

describe("canonical delete lifecycle authority", () => {
  it("does not publish a tombstone when neither store contains the memory", async () => {
    mocks.tenantQuery.mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
    mocks.softDelete.mockResolvedValueOnce({ deleted: false })

    await expect(memory_delete(request)).rejects.toBeInstanceOf(MemoryNotFoundError)
    expect(mocks.tenantQuery).toHaveBeenCalledTimes(1)
  })

  it("explicitly permits an episodic-only deletion", async () => {
    mocks.tenantQuery
      .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    mocks.softDelete.mockResolvedValueOnce({ deleted: false })

    await expect(memory_delete(request)).resolves.toMatchObject({ deleted: true })
    expect(mocks.tenantQuery.mock.calls[1][1]).toContain("INSERT INTO events")
  })

  it("permits graph-only deletion only when the scoped adapter applied it", async () => {
    mocks.tenantQuery
      .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    mocks.softDelete.mockResolvedValueOnce({ deleted: true })

    await expect(memory_delete(request)).resolves.toMatchObject({ deleted: true })
  })
})
