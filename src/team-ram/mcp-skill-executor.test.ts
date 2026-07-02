import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createMcpSkillExecutor,
  InProcessSkillExecutor,
  McpClientPool,
  McpSkillExecutor,
  type SkillServerConfig,
} from "./mcp-skill-executor"
import type { SkillCall } from "./orchestrator"

// ── Mock MCP Client ─────────────────────────────────────────────────────

/**
 * Creates a mock MCP callTool result matching the SDK schema:
 * { content: [{ type: "text", text: "..." }], isError?: boolean }
 */
function mockMcpResult(data: unknown, isError = false) {
  const text = typeof data === "string" ? data : JSON.stringify(data)
  return {
    content: [{ type: "text" as const, text }],
    isError,
  }
}

/**
 * Creates a mock Client class that resolves callTool to a given handler.
 */
function createMockClientPool(toolHandler: (name: string, args: Record<string, unknown>) => unknown) {
  const connections: Array<{
    client: { callTool: (params: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>; close: () => Promise<void> }
    transport: Record<string, unknown>
    subprocess: { kill: () => void }
    skillName: string
  }> = []

  const mockPool = {
    getClient: vi.fn(async (skillName: string) => {
      const mockClient = {
        callTool: vi.fn(async (params: { name: string; arguments: Record<string, unknown> }) => {
          const result = toolHandler(params.name, params.arguments)
          return mockMcpResult(result)
        }),
        close: vi.fn(async () => {}),
      }
      const mockSubprocess = { kill: vi.fn() }
      const entry = {
        client: mockClient,
        transport: {},
        subprocess: mockSubprocess,
        skillName,
      }
      connections.push(entry)
      return entry
    }),
    destroy: vi.fn(async () => {
      for (const conn of connections) {
        await conn.client.close()
        conn.subprocess.kill()
      }
      connections.length = 0
    }),
    has: vi.fn((skillName: string) => connections.some((c) => c.skillName === skillName)),
    connectedSkills: vi.fn(() => connections.map((c) => c.skillName)),
    _connections: connections,
  }

  return mockPool
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("McpSkillExecutor", () => {
  it("implements SkillExecutor interface and calls the right tool", async () => {
    const callLog: Array<{ name: string; args: Record<string, unknown> }> = []
    const mockPool = createMockClientPool((name, args) => {
      callLog.push({ name, args })
      return { success: true, result: [{ id: "insight-1", content: "test" }] }
    })

    const executor = new McpSkillExecutor()
    // Inject mock pool
    ;(executor as any).pool = mockPool

    const call: SkillCall = {
      skillName: "skill-neo4j-memory",
      toolName: "recall_insight",
      assignedAgent: "scout",
      input: { query: "architecture decisions", groupId: "allura-test-teamram", limit: 10 },
    }

    const result = await executor.execute(call)

    expect(mockPool.getClient).toHaveBeenCalledWith("skill-neo4j-memory")
    expect(callLog).toHaveLength(1)
    expect(callLog[0].name).toBe("recall_insight")
    expect(callLog[0].args).toEqual({
      query: "architecture decisions",
      groupId: "allura-test-teamram",
      limit: 10,
    })
    expect(result).toEqual([{ id: "insight-1", content: "test" }])
  })

  it("extracts result from skill's { success: true, result: ... } envelope", async () => {
    const mockPool = createMockClientPool(() => ({
      success: true,
      result: { items: ["a", "b"], total: 2 },
    }))

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = mockPool

    const result = await executor.execute({
      skillName: "skill-neo4j-memory",
      toolName: "list_insights",
      assignedAgent: "scout",
      input: { groupId: "allura-test-teamram" },
    })

    expect(result).toEqual({ items: ["a", "b"], total: 2 })
  })

  it("extracts result from skill's { success: true, ...spread } envelope", async () => {
    const mockPool = createMockClientPool(() => ({
      success: true,
      records: [{ n: 1 }],
      fields: ["n"],
    }))

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = mockPool

    const result = await executor.execute({
      skillName: "skill-cypher-query",
      toolName: "execute_cypher",
      assignedAgent: "knuth",
      input: { cypher: "MATCH (n) RETURN n LIMIT 1", groupId: "allura-test-teamram" },
    })

    expect(result).toEqual({ records: [{ n: 1 }], fields: ["n"], success: true })
  })

  it("throws on skill error response", async () => {
    const mockPool = createMockClientPool(() => ({
      success: false,
      error: "Neo4j connection refused",
    }))

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = mockPool

    await expect(
      executor.execute({
        skillName: "skill-neo4j-memory",
        toolName: "recall_insight",
        assignedAgent: "scout",
        input: { query: "test", groupId: "allura-test-teamram" },
      }),
    ).rejects.toThrow("Neo4j connection refused")
  })

  it("throws on MCP isError flag", async () => {
    // Simulate MCP returning isError: true
    const mockClient = {
      callTool: vi.fn(async () => ({
        content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "db unavailable" }) }],
        isError: true,
      })),
      close: vi.fn(async () => {}),
    }
    const mockSubprocess = { kill: vi.fn() }

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = {
      getClient: vi.fn(async () => ({
        client: mockClient,
        transport: {},
        subprocess: mockSubprocess,
        skillName: "skill-database",
      })),
      destroy: vi.fn(async () => {
        await mockClient.close()
        mockSubprocess.kill()
      }),
      has: vi.fn(),
      connectedSkills: vi.fn(() => []),
    }

    await expect(
      executor.execute({
        skillName: "skill-database",
        toolName: "query_traces",
        assignedAgent: "hightower",
        input: { group_id: "allura-test-teamram" },
      }),
    ).rejects.toThrow("db unavailable")
  })

  it("pools connections across multiple calls to the same skill", async () => {
    const mockPool = createMockClientPool(() => ({ success: true, result: [] }))

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = mockPool

    const call: SkillCall = {
      skillName: "skill-neo4j-memory",
      toolName: "recall_insight",
      assignedAgent: "scout",
      input: { query: "test", groupId: "allura-test-teamram" },
    }

    await executor.execute(call)
    await executor.execute(call)

    // getClient should be called twice but the pool handles reuse
    expect(mockPool.getClient).toHaveBeenCalledTimes(2)
  })

  it("cleans up connections on destroy", async () => {
    const mockPool = createMockClientPool(() => ({ success: true, result: [] }))

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = mockPool

    await executor.execute({
      skillName: "skill-neo4j-memory",
      toolName: "recall_insight",
      assignedAgent: "scout",
      input: { query: "test", groupId: "allura-test-teamram" },
    })

    await executor.destroy()

    expect(mockPool.destroy).toHaveBeenCalled()
  })

  it("rejects calls after destroy", async () => {
    const mockPool = createMockClientPool(() => ({ success: true, result: [] }))

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = mockPool

    await executor.destroy()

    await expect(
      executor.execute({
        skillName: "skill-neo4j-memory",
        toolName: "recall_insight",
        assignedAgent: "scout",
        input: { query: "test", groupId: "allura-test-teamram" },
      }),
    ).rejects.toThrow("has been destroyed")
  })
})

describe("McpClientPool", () => {
  it("rejects unknown skill names", async () => {
    const pool = new McpClientPool()
    await expect(pool.getClient("skill-nonexistent")).rejects.toThrow("No server config")
  })

  it("tracks connected skills", () => {
    const pool = new McpClientPool()
    expect(pool.connectedSkills()).toEqual([])
    expect(pool.has("skill-neo4j-memory")).toBe(false)
  })
})

describe("createMcpSkillExecutor", () => {
  it("returns an InProcessSkillExecutor instance", () => {
    const executor = createMcpSkillExecutor()
    expect(executor).toBeInstanceOf(InProcessSkillExecutor)
  })

  it("accepts options without error (options are API-compat; no child processes spawned)", () => {
    // createMcpSkillExecutor no longer spawns child processes. Options accepted
    // for backward-compatible call sites but are not forwarded to a pool.
    const executor = createMcpSkillExecutor({
      extraEnv: { NEO4J_URI: "bolt://custom:7687", CUSTOM_VAR: "yes" },
      cwd: process.cwd(),
      poolConnections: true,
    })
    expect(executor).toBeInstanceOf(InProcessSkillExecutor)
  })
})

describe("McpSkillExecutor + orchestrator integration", () => {
  it("orchestrates a multi-skill task through the real executor interface", async () => {
    const callsLog: Array<{ skillName: string; toolName: string; input: Record<string, unknown> }> = []

    const mockPool = createMockClientPool((toolName, args) => {
      callsLog.push({ skillName: "mock", toolName, input: args })
      if (toolName === "recall_insight") {
        return { success: true, result: [{ id: "i-1", content: "memory hit", confidence: 0.9 }] }
      }
      if (toolName === "execute_cypher") {
        return { success: true, records: [{ n: { label: "Insight" } }], fields: ["n"] }
      }
      if (toolName === "query_traces") {
        return { success: true, rows: [{ event_type: "dispatch" }], total: 1 }
      }
      return { success: true }
    })

    const executor = new McpSkillExecutor()
    ;(executor as any).pool = mockPool

    // Import orchestrateTeamRamTask
    const { orchestrateTeamRamTask } = await import("./orchestrator")

    const result = await orchestrateTeamRamTask(
      {
        goal: "Investigate architecture decisions and recent trace events",
        groupId: "allura-test-teamram",
        cypher: "MATCH (n {group_id: $groupId}) RETURN n LIMIT 5",
        needs: { traces: true },
      },
      executor,
    )

    // Should have selected all 3 skills
    expect(result.plan).toHaveLength(3)
    // Staged routing: memory first, then database (for traces), then cypher (for graph)
    const skillNames = result.plan.map((s) => s.skillName)
    expect(skillNames[0]).toBe("skill-neo4j-memory")
    expect(skillNames).toContain("skill-database")
    expect(skillNames).toContain("skill-cypher-query")

    // All should succeed
    expect(result.results.every((r) => r.ok)).toBe(true)
    expect(result.context.failures).toHaveLength(0)

    // Context should be assembled
    expect(result.context.memories).toHaveLength(1)
    expect(result.context.graph).toHaveLength(1)
    expect(result.context.traces).toHaveLength(1)

    await executor.destroy()
  })
})