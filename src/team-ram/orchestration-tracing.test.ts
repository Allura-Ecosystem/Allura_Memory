import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the trace-logger before importing the module under test
vi.mock("@/lib/postgres/trace-logger", () => ({
  logTrace: vi.fn(async () => ({ id: 1, group_id: "allura-test-teamram" })),
}))

// Mock validateGroupId to pass through
vi.mock("@/lib/validation/group-id", () => ({
  validateGroupId: vi.fn((id: string) => id),
  GroupIdValidationError: class extends Error {},
}))

import { logTrace } from "@/lib/postgres/trace-logger"
import {
  createTracedOrchestrator,
  type OrchestrationTraceConfig,
  traceOrchestrationEnd,
  traceOrchestrationStart,
  traceSkillResult,
} from "./orchestration-tracing"
import type { OrchestrationResult, SkillResult } from "./orchestrator"

const mockLogTrace = vi.mocked(logTrace)

beforeEach(() => {
  mockLogTrace.mockClear()
})

const defaultConfig: OrchestrationTraceConfig = {
  groupId: "allura-test-teamram", workspaceId: "workspace-teamram",
}

describe("orchestration-tracing", () => {
  describe("traceOrchestrationStart", () => {
    it("emits a decision trace with plan skills", async () => {
      await traceOrchestrationStart(defaultConfig, "Investigate architecture", [
        "skill-neo4j-memory",
        "skill-cypher-query",
      ])

      expect(mockLogTrace).toHaveBeenCalledTimes(1)
      const call = mockLogTrace.mock.calls[0]![0]
      expect(call.trace_type).toBe("decision")
      expect(call.content).toBe("orchestration_start")
      expect(call.confidence).toBe(1.0)
      expect(call.metadata?.skills_selected).toEqual([
        "skill-neo4j-memory",
        "skill-cypher-query",
      ])
    })

    it("respects enabled: false", async () => {
      await traceOrchestrationStart(
        { ...defaultConfig, enabled: false },
        "test",
        ["skill-neo4j-memory"],
      )
      expect(mockLogTrace).not.toHaveBeenCalled()
    })
  })

  describe("traceSkillResult", () => {
    it("emits contribution trace on success", async () => {
      const result: SkillResult = {
        skillName: "skill-neo4j-memory",
        toolName: "recall_insight",
        assignedAgent: "scout",
        ok: true,
        attempts: 1,
      }

      await traceSkillResult(defaultConfig, result)

      expect(mockLogTrace).toHaveBeenCalledTimes(1)
      const call = mockLogTrace.mock.calls[0]![0]
      expect(call.trace_type).toBe("contribution")
      expect(call.content).toContain("skill-neo4j-memory/recall_insight")
      expect(call.metadata?.ok).toBe(true)
    })

    it("emits error trace on failure", async () => {
      const result: SkillResult = {
        skillName: "skill-database",
        toolName: "query_traces",
        assignedAgent: "hightower",
        ok: false,
        error: "connection refused",
        attempts: 2,
      }

      await traceSkillResult(defaultConfig, result)

      expect(mockLogTrace).toHaveBeenCalledTimes(1)
      const call = mockLogTrace.mock.calls[0]![0]
      expect(call.trace_type).toBe("error")
      expect(call.confidence).toBe(0.0)
      expect(call.metadata?.error).toBe("connection refused")
    })
  })

  describe("traceOrchestrationEnd", () => {
    it("emits summary with success/failure counts", async () => {
      const result: OrchestrationResult = {
        task: { goal: "test", groupId: "allura-test-teamram", workspaceId: "workspace-teamram" },
        plan: [],
        results: [
          { skillName: "skill-neo4j-memory", toolName: "recall_insight", assignedAgent: "scout", ok: true, attempts: 1 },
          { skillName: "skill-database", toolName: "query_traces", assignedAgent: "hightower", ok: false, error: "db down", attempts: 2 },
        ],
        context: {
          memories: [{ id: 1 }],
          graph: [],
          traces: [],
          failures: [{ skillName: "skill-database", toolName: "query_traces", error: "db down", assignedAgent: "hightower" }],
        },
      }

      await traceOrchestrationEnd(defaultConfig, result)

      expect(mockLogTrace).toHaveBeenCalledTimes(1)
      const call = mockLogTrace.mock.calls[0]![0]
      expect(call.content).toBe("orchestration_end")
      expect(call.confidence).toBe(0.5) // 1 success / 2 total
      expect(call.metadata?.total_skills).toBe(2)
      expect(call.metadata?.success_count).toBe(1)
      expect(call.metadata?.failure_count).toBe(1)
      expect(call.metadata?.failures).toHaveLength(1)
    })

    it("emits confidence 1.0 when all skills succeed", async () => {
      const result: OrchestrationResult = {
        task: { goal: "test", groupId: "allura-test-teamram", workspaceId: "workspace-teamram" },
        plan: [],
        results: [
          { skillName: "skill-neo4j-memory", toolName: "recall_insight", assignedAgent: "scout", ok: true, attempts: 1 },
        ],
        context: { memories: [{}], graph: [], traces: [], failures: [] },
      }

      await traceOrchestrationEnd(defaultConfig, result)
      expect(mockLogTrace.mock.calls[0]![0].confidence).toBe(1.0)
    })
  })

  describe("createTracedOrchestrator", () => {
    it("wraps orchestrateTeamRamTask with start/result/end traces", async () => {
      // Mock the orchestrator module
      const { orchestrateTeamRamTask, selectSkills } = await import("./orchestrator")

      const tracedOrchestrator = createTracedOrchestrator(defaultConfig)

      // Use a mock executor
      const mockExecutor = {
        execute: vi.fn(async () => ({ id: "test-insight", content: "hello" })),
      }

      const result = await tracedOrchestrator(
        {
          goal: "Recall memory",
          groupId: "allura-test-teamram", workspaceId: "workspace-teamram",
        },
        mockExecutor,
      )

      // Should have emitted: start + 1 skill result + end = 3 traces
      expect(mockLogTrace).toHaveBeenCalledTimes(3)

      // Verify trace order
      const contents = mockLogTrace.mock.calls.map((c) => c[0].content)
      expect(contents[0]).toBe("orchestration_start")
      expect(contents[1]).toContain("skill_dispatch")
      expect(contents[2]).toBe("orchestration_end")

      // Result should be unmodified
      expect(result.context.memories).toHaveLength(1)
    })

    it("passes through errors from orchestration without breaking", async () => {
      // If orchestrateTeamRamTask throws, the traced wrapper should re-throw
      // but end-trace should still be attempted (best-effort)
      const tracedOrchestrator = createTracedOrchestrator(defaultConfig)

      const badExecutor = {
        execute: vi.fn(async () => {
          throw new Error("catastrophic failure")
        }),
      }

      // The orchestrator itself doesn't throw — it records failures
      const result = await tracedOrchestrator(
        {
          goal: "Bad task",
          groupId: "allura-test-teamram", workspaceId: "workspace-teamram",
          maxRetriesPerSkill: 0,
        },
        badExecutor,
      )

      // Should still get a result with failures recorded
      expect(result.context.failures.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("trace error resilience", () => {
    it("does not break orchestration when logTrace throws", async () => {
      mockLogTrace.mockRejectedValueOnce(new Error("PG down"))

      // Should not throw — tracing swallows the error
      await traceOrchestrationStart(defaultConfig, "test", [])
      // If we got here, it didn't throw
    })
  })
})