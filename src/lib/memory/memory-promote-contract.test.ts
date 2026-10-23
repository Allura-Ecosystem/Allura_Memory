import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MemoryPromoteRequest } from "./canonical-contracts"

const GROUP_ID = "allura-contract"
const WORKSPACE_ID = "workspace-contract"
const VERIFIED_AGENT_ID = "verified-agent"
const MEMORY_ID = "mem-contract"
const TRACE_REF = "4242"

const mocks = vi.hoisted(() => ({
  tenantQuery: vi.fn(),
  getConnections: vi.fn(),
  getMemory: vi.fn(),
  checkCanonical: vi.fn(),
  createMemory: vi.fn(),
  supersedesMemory: vi.fn(),
  deleteMemory: vi.fn(),
  restoreMemory: vi.fn(),
  curatorScore: vi.fn(),
}))

vi.mock("@/lib/db/tenant-transaction", () => ({ tenantQuery: mocks.tenantQuery }))
vi.mock("@/mcp/canonical-tools/connection", () => ({
  getConnections: mocks.getConnections,
  resetConnections: vi.fn(),
}))
vi.mock("@/lib/graph-adapter", () => ({
  createGraphAdapter: vi.fn(() => ({
    getMemory: mocks.getMemory,
    checkCanonical: mocks.checkCanonical,
    createMemory: mocks.createMemory,
    supersedesMemory: mocks.supersedesMemory,
    deleteMemory: mocks.deleteMemory,
    restoreMemory: mocks.restoreMemory,
  })),
}))
vi.mock("@/lib/curator/score", () => ({ curatorScore: mocks.curatorScore }))
vi.mock("@/lib/dedup/proposal-dedup", () => ({
  createProposalDedupChecker: vi.fn(() => ({
    checkProposals: vi.fn(() => ({ isDuplicate: false, similarity: 0, threshold: 0.95 })),
  })),
  getDedupThreshold: vi.fn(() => 0.95),
}))
vi.mock("@/lib/ruvector/bridge", () => ({ storeMemory: vi.fn() }))
vi.mock("@/lib/ruvector/retrieval-adapter", () => ({ searchWithFeedback: vi.fn() }))
vi.mock("@/lib/auth/mcp-authenticator", () => ({ requireTransportMemoryAddAuthority: vi.fn() }))
vi.mock("@/mcp/canonical-tools/budget-circuit", () => ({
  checkBudget: vi.fn().mockResolvedValue({ allowed: true }),
  ensureSession: vi.fn(),
  getBreakerManager: vi.fn(),
  getBudgetEnforcer: vi.fn(),
  getHaltedSessions: vi.fn(() => []),
  recordToolCall: vi.fn(),
  resetHaltedGroup: vi.fn(),
  withCircuitBreaker: vi.fn((_kind: string, _group: string, _operation: string, fn: () => unknown) => fn()),
}))

const { memory_promote } = await import("@/mcp/canonical-tools")

function request(overrides: Partial<MemoryPromoteRequest> = {}): MemoryPromoteRequest {
  return {
    id: MEMORY_ID as MemoryPromoteRequest["id"],
    group_id: GROUP_ID as MemoryPromoteRequest["group_id"],
    user_id: "spoofed-user" as MemoryPromoteRequest["user_id"],
    curator_id: "spoofed-curator",
    rationale: "human review requested",
    scope: {
      group_id: GROUP_ID as MemoryPromoteRequest["group_id"],
      workspace_id: WORKSPACE_ID,
      agent_id: VERIFIED_AGENT_ID,
    },
    ...overrides,
  }
}

function sqlCalls(): Array<{ scope: unknown; sql: string; values: unknown[] }> {
  return mocks.tenantQuery.mock.calls.map(([scope, sql, values]) => ({
    scope,
    sql: String(sql).replace(/\s+/g, " ").trim(),
    values: values as unknown[],
  }))
}

function isSourceEventQuery(sql: string): boolean {
  return sql.includes("FROM events") && sql.includes("event_type = 'memory_add'")
}

function isExactProposalQuery(sql: string): boolean {
  return sql.includes("FROM canonical_proposals") && sql.includes("workspace_id") && sql.includes("trace_ref")
}

function installQueryPlan(
  options: {
    proposalRows?: Array<Record<string, unknown>>
    insertError?: Error & { code?: string; constraint?: string }
    winnerRows?: Array<Record<string, unknown>>
  } = {}
): void {
  let proposalReads = 0
  mocks.tenantQuery.mockImplementation(async (_scope: unknown, sqlValue: unknown) => {
    const sql = String(sqlValue).replace(/\s+/g, " ").trim()
    if (isSourceEventQuery(sql)) {
      return {
        rows: [{ id: MEMORY_ID, content: "contract memory", provenance: "manual", event_id: TRACE_REF }],
      }
    }
    if (isExactProposalQuery(sql)) {
      proposalReads += 1
      return { rows: proposalReads === 1 ? (options.proposalRows ?? []) : (options.winnerRows ?? []) }
    }
    if (sql.startsWith("INSERT INTO canonical_proposals") && options.insertError) {
      throw options.insertError
    }
    return { rows: [] }
  })
}

describe("memory_promote human-gated contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PROMOTION_MODE
    mocks.getConnections.mockResolvedValue({ pg: {}, neo4j: {} })
    mocks.getMemory.mockResolvedValue({ node: null })
    mocks.checkCanonical.mockResolvedValue({ isCanonical: false })
    mocks.curatorScore.mockResolvedValue({ confidence: 0.91, reasoning: "durable", tier: "mainstream" })
    installQueryPlan()
  })

  afterEach(() => {
    delete process.env.PROMOTION_MODE
  })

  it("requires a verified workspace scope before opening storage connections", async () => {
    await expect(memory_promote(request({ scope: undefined }))).rejects.toThrow(
      "verified MCP workspace scope is required"
    )
    expect(mocks.getConnections).not.toHaveBeenCalled()
  })

  it("uses the authenticated group, workspace, and principal for the canonical lookup", async () => {
    mocks.getMemory.mockResolvedValue({ node: { id: MEMORY_ID } })

    const result = await memory_promote(request())

    expect(mocks.getMemory).toHaveBeenCalledWith({
      id: MEMORY_ID,
      group_id: GROUP_ID,
      workspace_id: WORKSPACE_ID,
      principal_id: VERIFIED_AGENT_ID,
    })
    expect(mocks.checkCanonical).not.toHaveBeenCalled()
    expect(result.status).toBe("already_canonical")
    expect(mocks.tenantQuery).not.toHaveBeenCalled()
  })

  it("propagates graph lookup failures without querying PostgreSQL", async () => {
    const failure = new Error("graph unavailable")
    mocks.getMemory.mockRejectedValue(failure)

    await expect(memory_promote(request())).rejects.toBe(failure)
    expect(mocks.tenantQuery).not.toHaveBeenCalled()
  })

  it("queues with the verified actor and the exact source trace mapping", async () => {
    const result = await memory_promote(request())
    const calls = sqlCalls()
    const insert = calls.find((call) => call.sql.startsWith("INSERT INTO canonical_proposals"))
    const audit = calls.find((call) => call.sql.startsWith("INSERT INTO events"))

    expect(result.status).toBe("queued")
    expect(
      calls.every((call) =>
        expect
          .objectContaining({
            tenantId: GROUP_ID,
            workspaceId: WORKSPACE_ID,
            principalId: VERIFIED_AGENT_ID,
          })
          .asymmetricMatch(call.scope)
      )
    ).toBe(true)
    expect(insert?.sql).toContain("VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)")
    expect(insert?.values.slice(1)).toEqual([
      GROUP_ID,
      WORKSPACE_ID,
      "contract memory",
      0.91,
      "durable",
      "mainstream",
      TRACE_REF,
      expect.any(String),
    ])
    expect(audit?.values[3]).toBe(VERIFIED_AGENT_ID)
    expect(JSON.parse(String(audit?.values[5]))).toMatchObject({
      memory_id: MEMORY_ID,
      proposal_id: result.proposal_id,
    })
    expect(calls.some((call) => call.sql.includes("LIKE") || call.sql.includes("LIMIT 100"))).toBe(false)
  })

  it("reuses only an exact pending workspace and trace proposal", async () => {
    installQueryPlan({
      proposalRows: [
        {
          id: "proposal-pending",
          status: "pending",
          group_id: GROUP_ID,
          workspace_id: WORKSPACE_ID,
          trace_ref: TRACE_REF,
        },
      ],
    })

    const result = await memory_promote(request())
    const calls = sqlCalls()

    expect(result).toMatchObject({ proposal_id: "proposal-pending", status: "queued" })
    expect(calls.filter((call) => isExactProposalQuery(call.sql))).toHaveLength(1)
    expect(calls.some((call) => call.sql.startsWith("INSERT INTO canonical_proposals"))).toBe(false)
    expect(calls.some((call) => call.sql.startsWith("INSERT INTO events"))).toBe(false)
  })

  it.each(["approved", "rejected"])("reports an exact %s proposal as terminal instead of queued", async (status) => {
    installQueryPlan({
      proposalRows: [
        {
          id: `proposal-${status}`,
          status,
          group_id: GROUP_ID,
          workspace_id: WORKSPACE_ID,
          trace_ref: TRACE_REF,
        },
      ],
    })

    await expect(memory_promote(request())).rejects.toThrow(`Existing promotion proposal is ${status}`)
    expect(sqlCalls().some((call) => call.sql.startsWith("INSERT INTO canonical_proposals"))).toBe(false)
  })

  it("resolves only the known source uniqueness race with one exact scoped winner read", async () => {
    const conflict = Object.assign(new Error("duplicate source"), {
      code: "23505",
      constraint: "idx_canonical_proposals_trace_ref_unique",
    })
    installQueryPlan({
      insertError: conflict,
      winnerRows: [
        {
          id: "proposal-winner",
          status: "pending",
          group_id: GROUP_ID,
          workspace_id: WORKSPACE_ID,
          trace_ref: TRACE_REF,
        },
      ],
    })

    const result = await memory_promote(request())
    const exactReads = sqlCalls().filter((call) => isExactProposalQuery(call.sql))

    expect(result).toMatchObject({ proposal_id: "proposal-winner", status: "queued" })
    expect(exactReads).toHaveLength(2)
    expect(exactReads[1].values).toEqual([GROUP_ID, WORKSPACE_ID, TRACE_REF])
    expect(sqlCalls().some((call) => call.sql.startsWith("INSERT INTO events"))).toBe(false)
  })

  it("propagates unknown uniqueness errors without a winner read", async () => {
    const conflict = Object.assign(new Error("different uniqueness failure"), {
      code: "23505",
      constraint: "some_other_unique_constraint",
    })
    installQueryPlan({ insertError: conflict })

    await expect(memory_promote(request())).rejects.toBe(conflict)
    expect(sqlCalls().filter((call) => isExactProposalQuery(call.sql))).toHaveLength(1)
  })

  it("still queues for human review in auto compatibility mode without semantic writes", async () => {
    process.env.PROMOTION_MODE = "auto"

    const result = await memory_promote(request())
    const statements = sqlCalls().map((call) => call.sql)

    expect(result.status).toBe("queued")
    expect(statements.some((sql) => /\bUPDATE\b|\bDELETE\b/.test(sql))).toBe(false)
    expect(statements.some((sql) => sql.includes("status = 'approved'") || sql.includes("proposal_approved"))).toBe(
      false
    )
    expect(mocks.createMemory).not.toHaveBeenCalled()
    expect(mocks.supersedesMemory).not.toHaveBeenCalled()
    expect(mocks.deleteMemory).not.toHaveBeenCalled()
    expect(mocks.restoreMemory).not.toHaveBeenCalled()
  })
})
