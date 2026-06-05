/**
 * memory() wrapper tests
 *
 * Tests the createEntity(), createRelationship(), query(), and search() API surface
 * of the Allura Neo4j write wrapper (src/lib/memory/writer.ts).
 *
 * Strategy: mock neo4j-driver entirely — no live DB required.
 * Each test gets a fresh session mock via the factory.
 *
 * Kernel tests (Task 4): added below to verify syscall routing when
 * MEMORY_BYPASS_KERNEL is not set (default path).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// ── Mock path-mapped imports BEFORE any imports ────────────────────────────

vi.mock("@/lib/validation/group-id", async () => {
  const actual = await vi.importActual("@/lib/validation/group-id")
  return {
    ...(actual as object),
    validateGroupId: vi.fn((groupId: string) => {
      if (!groupId || !groupId.startsWith("allura-")) {
        throw new Error("Invalid group_id: must start with 'allura-'")
      }
      return groupId
    }),
  }
})

// ── Hoist mock refs for external packages ──────────────────────────────────

const { mockSessionRun, mockSessionClose, mockDriver } = vi.hoisted(() => {
  const mockSessionRun = vi.fn()
  const mockSessionClose = vi.fn().mockResolvedValue(undefined)

  /**
   * The real Neo4j session exposes executeRead/executeWrite, which accept a
   * work function and call it with a ManagedTransaction (tx) that has .run().
   * The mock delegates by calling work({ run }) so the transaction body
   * executes against mockSessionRun — matching the production code path
   * through readTransaction/writeTransaction in connection.ts.
   */
  const mockSession = {
    run: mockSessionRun,
    close: mockSessionClose,
    executeRead: vi.fn((work: (tx: { run: typeof mockSessionRun }) => Promise<unknown>) =>
      work({ run: mockSessionRun })
    ),
    executeWrite: vi.fn((work: (tx: { run: typeof mockSessionRun }) => Promise<unknown>) =>
      work({ run: mockSessionRun })
    ),
  }

  const mockDriver = {
    session: vi.fn().mockReturnValue(mockSession),
  }
  return { mockSessionRun, mockSessionClose, mockDriver }
})

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn().mockReturnValue(mockDriver),
    auth: {
      basic: vi.fn().mockReturnValue({ scheme: "basic", principal: "neo4j" }),
    },
  },
}))

// ── Set required env vars before module load ──────────────────────────────────

process.env.NEO4J_URI = "bolt://localhost:7687"
process.env.NEO4J_USER = "neo4j"
process.env.NEO4J_PASSWORD = "test-password"
process.env.RUVIX_KERNEL_SECRET = "test-secret-key-for-ruvix-kernel-proof-engine-32chars"

// ── Import under test (after mocks are in place) ─────────────────────────────

import { validateGroupId } from "@/lib/validation/group-id"
import { memory } from "./writer"

// ─────────────────────────────────────────────────────────────────────────────
// NEO4J FALLBACK TESTS (MEMORY_BYPASS_KERNEL=true)
// These tests exercise the legacy Neo4j backend path.
// ─────────────────────────────────────────────────────────────────────────────

describe("memory() — Neo4j fallback (MEMORY_BYPASS_KERNEL=true)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MEMORY_BYPASS_KERNEL = "true"
    mockSessionRun.mockResolvedValue({ records: [] })
  })

  describe("createEntity()", () => {
    it("returns a node_id when none is provided", async () => {
      const result = await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { goal: "test task", status: "complete" },
      })

      expect(result.node_id).toBeTruthy()
      expect(typeof result.node_id).toBe("string")
      expect(result.node_id.length).toBeGreaterThan(0)
    })

    it("preserves an explicit node_id from props", async () => {
      const id = "explicit-task-id-001"
      const result = await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { node_id: id, goal: "test", status: "complete" },
      })

      expect(result.node_id).toBe(id)
    })

    it("resolves node_id from task_id field", async () => {
      const result = await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { task_id: "task-uuid-xyz", goal: "test" },
      })

      expect(result.node_id).toBe("task-uuid-xyz")
    })

    it("resolves node_id from decision_id field", async () => {
      const result = await memory().createEntity({
        label: "Decision",
        group_id: "allura-system",
        props: { decision_id: "dec-001", choice: "use Neo4j" },
      })

      expect(result.node_id).toBe("dec-001")
    })

    it("resolves node_id from lesson_id field", async () => {
      const result = await memory().createEntity({
        label: "Lesson",
        group_id: "allura-system",
        props: { lesson_id: "lesson-001", learned: "always close sessions" },
      })

      expect(result.node_id).toBe("lesson-001")
    })

    it("calls session.run with MERGE Cypher containing the label", async () => {
      await memory().createEntity({
        label: "Decision",
        group_id: "allura-system",
        props: { decision_id: "d-01", choice: "opus model" },
      })

      const [[cypher]] = mockSessionRun.mock.calls
      expect(cypher).toContain("MERGE")
      expect(cypher).toContain("Decision")
      expect(cypher).toContain("node_id")
    })

    it("injects created_at and updated_at automatically", async () => {
      await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { goal: "check timestamps" },
      })

      const [, params] = mockSessionRun.mock.calls[0]
      expect(params.props.created_at).toBeTruthy()
      expect(params.props.updated_at).toBeTruthy()
    })

    it("preserves caller-supplied created_at", async () => {
      const ts = "2026-01-01T00:00:00.000Z"
      await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { goal: "preserve ts", created_at: ts },
      })

      const [, params] = mockSessionRun.mock.calls[0]
      expect(params.props.created_at).toBe(ts)
    })

    it("always calls session.close() — even on run success", async () => {
      await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { goal: "close test" },
      })

      expect(mockSessionClose).toHaveBeenCalledTimes(1)
    })

    it("calls session.close() even when session.run throws", async () => {
      mockSessionRun.mockRejectedValueOnce(new Error("Neo4j write failed"))

      await expect(
        memory().createEntity({ label: "Task", group_id: "allura-system", props: { goal: "fail" } })
      ).rejects.toThrow("Neo4j write failed")

      expect(mockSessionClose).toHaveBeenCalledTimes(1)
    })

    it("writes relationship cypher when relationships array is provided", async () => {
      await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { task_id: "t-001", goal: "relate test" },
        relationships: [
          {
            type: "CONTRIBUTED",
            targetId: "memory-builder",
            targetLabel: "Person",
          },
        ],
      })

      // First run = MERGE node, second run = MERGE relationship
      expect(mockSessionRun).toHaveBeenCalledTimes(2)
      const [, [relCypher]] = mockSessionRun.mock.calls
      expect(relCypher).toContain("CONTRIBUTED")
      expect(relCypher).toContain("Person")
    })

    it("supports incoming relationship direction", async () => {
      await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { task_id: "t-002", goal: "incoming rel" },
        relationships: [
          {
            type: "INFORMED_BY",
            targetId: "d-001",
            targetLabel: "Decision",
            direction: "in",
          },
        ],
      })

      const [, [relCypher]] = mockSessionRun.mock.calls
      // incoming: (target)-[:REL]->(n)
      expect(relCypher).toMatch(/\(target\)-\[:INFORMED_BY[^\]]*\]->\(n\)/)
    })

    it("supports relationship properties", async () => {
      await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { task_id: "t-003", goal: "rel props" },
        relationships: [
          {
            type: "CONTRIBUTED",
            targetId: "agent-001",
            targetLabel: "Person",
            props: { on: "2026-04-06", result: "complete" },
          },
        ],
      })

      const [, [relCypher, relParams]] = mockSessionRun.mock.calls
      expect(relCypher).toContain("on:")
      expect(relCypher).toContain("result:")
      expect(relParams.rel_on).toBe("2026-04-06")
      expect(relParams.rel_result).toBe("complete")
    })

    it("uses custom targetKey when specified", async () => {
      await memory().createEntity({
        label: "Task",
        group_id: "allura-system",
        props: { task_id: "t-004", goal: "custom key" },
        relationships: [
          {
            type: "PART_OF",
            targetId: "allura-system",
            targetLabel: "Project",
            targetKey: "group_id",
          },
        ],
      })

      const [, [relCypher]] = mockSessionRun.mock.calls
      expect(relCypher).toContain("group_id")
    })
  })

  describe("createRelationship()", () => {
    it("calls session.run with MATCH + MERGE Cypher", async () => {
      await memory().createRelationship({
        fromId: "t-001",
        fromLabel: "Task",
        toId: "d-001",
        toLabel: "Decision",
        type: "INFORMED_BY",
      })

      const [[cypher, params]] = mockSessionRun.mock.calls
      expect(cypher).toContain("MATCH")
      expect(cypher).toContain("MERGE")
      expect(cypher).toContain("INFORMED_BY")
      expect(params.fromId).toBe("t-001")
      expect(params.toId).toBe("d-001")
    })

    it("includes relationship props in Cypher and params", async () => {
      await memory().createRelationship({
        fromId: "agent-001",
        fromLabel: "Person",
        toId: "t-001",
        toLabel: "Task",
        type: "CONTRIBUTED",
        props: { on: "2026-04-06", result: "complete" },
      })

      const [[cypher, params]] = mockSessionRun.mock.calls
      expect(cypher).toContain("on:")
      expect(params.on).toBe("2026-04-06")
      expect(params.result).toBe("complete")
    })

    it("closes session on success", async () => {
      await memory().createRelationship({
        fromId: "a",
        fromLabel: "Task",
        toId: "b",
        toLabel: "Decision",
        type: "INFORMED_BY",
      })

      expect(mockSessionClose).toHaveBeenCalledTimes(1)
    })

    it("closes session even when run throws", async () => {
      mockSessionRun.mockRejectedValueOnce(new Error("relate failed"))

      await expect(
        memory().createRelationship({
          fromId: "a",
          fromLabel: "Task",
          toId: "b",
          toLabel: "Decision",
          type: "INFORMED_BY",
        })
      ).rejects.toThrow("relate failed")

      expect(mockSessionClose).toHaveBeenCalledTimes(1)
    })
  })

  describe("query()", () => {
    it("returns empty array when no records", async () => {
      mockSessionRun.mockResolvedValue({ records: [] })

      const result = await memory().query("MATCH (n:Task) RETURN n LIMIT 0")
      expect(result).toEqual([])
    })

    it("maps record keys to object properties", async () => {
      mockSessionRun.mockResolvedValue({
        records: [
          {
            keys: ["goal", "status"],
            get: (key: string) => (key === "goal" ? "write tests" : "complete"),
          },
        ],
      })

      const result = await memory().query<{ goal: string; status: string }>(
        "MATCH (t:Task) RETURN t.goal AS goal, t.status AS status LIMIT 1"
      )

      expect(result[0].goal).toBe("write tests")
      expect(result[0].status).toBe("complete")
    })

    it("unwraps node .properties when present", async () => {
      mockSessionRun.mockResolvedValue({
        records: [
          {
            keys: ["t"],
            get: () => ({ properties: { goal: "unwrap test", group_id: "allura-system" } }),
          },
        ],
      })

      const result = await memory().query("MATCH (t:Task) RETURN t LIMIT 1")
      expect((result[0] as { t: { goal: string } }).t).toEqual({ goal: "unwrap test", group_id: "allura-system" })
    })

    it("passes Cypher params to session.run", async () => {
      mockSessionRun.mockResolvedValue({ records: [] })

      await memory().query("MATCH (t:Task {goal: \$goal}) RETURN t", { goal: "specific" })

      const [[, params]] = mockSessionRun.mock.calls
      expect(params.goal).toBe("specific")
    })

    it("closes session after read", async () => {
      mockSessionRun.mockResolvedValue({ records: [] })
      await memory().query("MATCH (n) RETURN n LIMIT 0")
      expect(mockSessionClose).toHaveBeenCalledTimes(1)
    })

    it("closes session even when read throws", async () => {
      mockSessionRun.mockRejectedValueOnce(new Error("read failed"))

      await expect(memory().query("MATCH (n) RETURN n")).rejects.toThrow("read failed")

      expect(mockSessionClose).toHaveBeenCalledTimes(1)
    })
  })

  describe("search()", () => {
    it("searches by exact property matches", async () => {
      mockSessionRun.mockResolvedValue({
        records: [
          {
            keys: ["n"],
            get: () => ({ properties: { task_id: "t-001", goal: "test task", status: "complete" } }),
          },
        ],
      })

      const result = await memory().search({
        label: "Task",
        group_id: "allura-system",
        props: { status: "complete" },
      })

      expect(result).toHaveLength(1)
      expect((result[0] as { task_id: string }).task_id).toBe("t-001")
      const [[cypher, params]] = mockSessionRun.mock.calls
      expect(cypher).toContain("group_id = \$group_id")
      expect(cypher).toContain("status = \$status")
      expect(params.status).toBe("complete")
    })

    it("supports text matching with CONTAINS", async () => {
      mockSessionRun.mockResolvedValue({ records: [] })

      await memory().search({
        label: "Task",
        group_id: "allura-system",
        textMatch: { goal: "test" },
      })

      const [[cypher]] = mockSessionRun.mock.calls
      expect(cypher).toContain("CONTAINS")
      expect(cypher).toContain("text_goal")
    })

    it("respects limit parameter", async () => {
      mockSessionRun.mockResolvedValue({ records: [] })

      await memory().search({
        label: "Task",
        group_id: "allura-system",
        limit: 5,
      })

      const [[, params]] = mockSessionRun.mock.calls
      expect(params.limit).toBe(5)
    })

    it("closes session after search", async () => {
      mockSessionRun.mockResolvedValue({ records: [] })
      await memory().search({ label: "Task", group_id: "allura-system" })
      expect(mockSessionClose).toHaveBeenCalledTimes(1)
    })

    it("validates group_id before searching", async () => {
      // Mock the validateGroupId to throw
      const mockedValidateGroupId = vi.mocked(validateGroupId)
      mockedValidateGroupId.mockImplementationOnce(() => {
        throw new Error("Invalid group_id")
      })

      await expect(memory().search({ label: "Task", group_id: "invalid-group" })).rejects.toThrow("Invalid group_id")
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// KERNEL ROUTING TESTS (default path — MEMORY_BYPASS_KERNEL unset)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("@/kernel/syscalls", () => ({
  syscall_mutate: vi.fn().mockResolvedValue({
    success: true,
    data: { affected_rows: 1, auditId: "audit-123" },
  }),
  syscall_query: vi.fn().mockResolvedValue({
    success: true,
    data: [{ node_id: "n1", summary: "test" }],
  }),
}))

import { syscall_mutate, syscall_query } from "@/kernel/syscalls"

describe("memory() — kernel-routed writer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Ensure kernel path is active (default)
    delete process.env.MEMORY_BYPASS_KERNEL
    // Re-stub syscalls after clearAllMocks
    vi.mocked(syscall_mutate).mockResolvedValue({
      success: true,
      data: { affected_rows: 1, auditId: "audit-123" },
    })
    vi.mocked(syscall_query).mockResolvedValue({
      success: true,
      data: [{ node_id: "n1", summary: "test" }],
    })
  })

  describe("createEntity", () => {
    it("should route through syscall_mutate with neo4j:Entity target", async () => {
      const result = await memory().createEntity({
        label: "Insight",
        group_id: "allura-system",
        props: { summary: "Test insight", confidence: 0.9 },
      })

      expect(result.node_id).toBeDefined()
      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "insert",
          target: "neo4j:Entity",
        }),
        expect.objectContaining({ group_id: "allura-system" })
      )
    })

    it("should reject invalid group_id", async () => {
      await expect(
        memory().createEntity({
          label: "Insight",
          group_id: "bad-group",
          props: { summary: "test" },
        })
      ).rejects.toThrow()
    })
  })

  describe("createRelationship", () => {
    it("should route through syscall_mutate with neo4j:Relationship target", async () => {
      await memory().createRelationship({
        fromId: "n1",
        fromLabel: "Agent",
        toId: "n2",
        toLabel: "Insight",
        type: "CONTRIBUTED",
      })

      expect(syscall_mutate).toHaveBeenCalledWith(
        expect.objectContaining({ target: "neo4j:Relationship" }),
        expect.objectContaining({ actor: "system" })
      )
    })
  })

  describe("search", () => {
    it("should route through syscall_query with neo4j:Query target", async () => {
      const results = await memory().search({
        label: "Insight",
        group_id: "allura-system",
        props: { status: "active" },
        limit: 5,
      })

      expect(results).toHaveLength(1)
      expect(syscall_query).toHaveBeenCalledWith(
        expect.objectContaining({ target: "neo4j:Query" }),
        expect.objectContaining({ group_id: "allura-system" })
      )
    })
  })

  describe("query", () => {
    it("should route raw cypher through syscall_query", async () => {
      const results = await memory().query(
        "MATCH (n:Insight) RETURN n LIMIT 5",
        { group_id: "allura-system" }
      )

      expect(results).toHaveLength(1)
      expect(syscall_query).toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("throws when syscall_mutate returns success: false", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: false,
        error: "Kernel policy denied",
      })

      await expect(
        memory().createEntity({
          label: "Insight",
          group_id: "allura-system",
          props: { summary: "test" },
        })
      ).rejects.toThrow("Kernel policy denied")
    })

    it("throws when createRelationship syscall_mutate returns failure", async () => {
      vi.mocked(syscall_mutate).mockResolvedValueOnce({
        success: false,
        error: "Relationship write denied",
      })

      await expect(
        memory().createRelationship({
          fromId: "n1",
          fromLabel: "Agent",
          toId: "n2",
          toLabel: "Insight",
          type: "CONTRIBUTED",
        })
      ).rejects.toThrow("Relationship write denied")
    })
  })
})
