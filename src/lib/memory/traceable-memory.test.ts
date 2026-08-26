/**
 * Traceable Memory Tests - Story 1.2
 *
 * Tests for the TraceMiddleware + memory() integration.
 * Verifies that all Neo4j operations are automatically traced to PostgreSQL.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TraceMiddleware } from "@/lib/mcp/trace-middleware";
import { createTraceableMemory, type TraceableMemoryConfig } from "./traceable-memory";
import { memory, type MemoryAPI } from "./writer";

// Mock dependencies
vi.mock("@/lib/mcp/trace-middleware", () => ({
  TraceMiddleware: vi.fn().mockImplementation(() => ({
    callTool: vi.fn().mockResolvedValue({ success: true }),
    startSession: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    logDecision: vi.fn().mockResolvedValue(undefined),
    logLearning: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("./writer", () => ({
  memory: vi.fn().mockImplementation(() => ({
    createEntity: vi.fn().mockResolvedValue({ node_id: "test-node-123" }),
    createRelationship: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([{ id: "1", name: "Test" }]),
    search: vi.fn().mockResolvedValue([{ id: "1", name: "Test" }]),
  })),
}));

describe("TraceableMemory", () => {
  let mockTraceMiddleware: {
    callTool: ReturnType<typeof vi.fn>;
    startSession: ReturnType<typeof vi.fn>;
    endSession: ReturnType<typeof vi.fn>;
    logDecision: ReturnType<typeof vi.fn>;
    logLearning: ReturnType<typeof vi.fn>;
    flush: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };

  let mockMemory: {
    createEntity: ReturnType<typeof vi.fn>;
    createRelationship: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };

  const validConfig: TraceableMemoryConfig = {
    agentId: "brooks",
    groupId: "allura-test",
    workflowId: "workflow-123",
    stepId: "step-456",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTraceMiddleware = {
      callTool: vi.fn().mockResolvedValue({ success: true }),
      startSession: vi.fn().mockResolvedValue(undefined),
      endSession: vi.fn().mockResolvedValue(undefined),
      logDecision: vi.fn().mockResolvedValue(undefined),
      logLearning: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    mockMemory = {
      createEntity: vi.fn().mockResolvedValue({ node_id: "test-node-123" }),
      createRelationship: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue([{ id: "1", name: "Test" }]),
      search: vi.fn().mockResolvedValue([{ id: "1", name: "Test" }]),
    };

    (TraceMiddleware as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => mockTraceMiddleware
    );

    (memory as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockMemory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Configuration Tests
  // =========================================================================

  describe("configuration", () => {
    it("should create traceable memory with valid config", () => {
      const traceableMemory = createTraceableMemory(validConfig);
      expect(traceableMemory).toBeDefined();
      expect(TraceMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: validConfig.agentId,
          groupId: validConfig.groupId,
          workflowId: validConfig.workflowId,
          stepId: validConfig.stepId,
        })
      );
    });

    it("should pass flushIntervalMs to TraceMiddleware", () => {
      createTraceableMemory({
        ...validConfig,
        flushIntervalMs: 5000,
      });

      expect(TraceMiddleware).toHaveBeenCalledWith(
        expect.objectContaining({
          flushIntervalMs: 5000,
        })
      );
    });

    it("should require agentId", () => {
      expect(() =>
        createTraceableMemory({
          ...validConfig,
          agentId: "",
        })
      ).toThrow();
    });

    it("should require groupId", () => {
      expect(() =>
        createTraceableMemory({
          ...validConfig,
          groupId: "",
        })
      ).toThrow();
    });
  });

  // =========================================================================
  // 2. createEntity Tracing Tests
  // =========================================================================

  describe("createEntity tracing", () => {
    it("should trace successful createEntity calls", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      const input = {
        label: "Task" as const,
        props: { title: "Test Task" },
        group_id: "allura-test",
      };

      const result = await traceableMemory.createEntity(input);

      expect(mockMemory.createEntity).toHaveBeenCalledWith(input);
      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.createEntity",
        expect.objectContaining({
          label: "Task",
          group_id: "allura-test",
          node_id: "test-node-123",
          success: true,
          duration_ms: expect.any(Number),
        })
      );
      expect(result.node_id).toBe("test-node-123");
    });

    it("should trace failed createEntity calls", async () => {
      mockMemory.createEntity.mockRejectedValue(new Error("Neo4j connection failed"));

      const traceableMemory = createTraceableMemory(validConfig);

      await expect(
        traceableMemory.createEntity({
          label: "Task" as const,
          props: { title: "Test" },
          group_id: "allura-test",
        })
      ).rejects.toThrow("Neo4j connection failed");

      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.createEntity",
        expect.objectContaining({
          success: false,
          error: "Neo4j connection failed",
          duration_ms: expect.any(Number),
        })
      );
    });
  });

  // =========================================================================
  // 3. createRelationship Tracing Tests
  // =========================================================================

  describe("createRelationship tracing", () => {
    it("should trace successful createRelationship calls", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      const input = {
        fromId: "node-1",
        fromLabel: "Task" as const,
        toId: "node-2",
        toLabel: "Decision" as const,
        type: "INFORMED_BY" as const,
      };

      await traceableMemory.createRelationship(input);

      expect(mockMemory.createRelationship).toHaveBeenCalledWith(input);
      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.createRelationship",
        expect.objectContaining({
          type: "INFORMED_BY",
          fromId: "node-1",
          toId: "node-2",
          success: true,
          duration_ms: expect.any(Number),
        })
      );
    });

    it("should trace failed createRelationship calls", async () => {
      mockMemory.createRelationship.mockRejectedValue(new Error("Relationship validation failed"));

      const traceableMemory = createTraceableMemory(validConfig);

      await expect(
        traceableMemory.createRelationship({
          fromId: "node-1",
          fromLabel: "Task" as const,
          toId: "node-2",
          toLabel: "Decision" as const,
          type: "INFORMED_BY" as const,
        })
      ).rejects.toThrow("Relationship validation failed");

      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.createRelationship",
        expect.objectContaining({
          success: false,
          error: "Relationship validation failed",
        })
      );
    });
  });

  // =========================================================================
  // 4. query Tracing Tests
  // =========================================================================

  describe("query tracing", () => {
    it("should trace successful query calls", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      const cypher = "MATCH (n:Task) RETURN n LIMIT 10";
      const results = await traceableMemory.query(cypher);

      expect(mockMemory.query).toHaveBeenCalledWith(cypher, undefined);
      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.query",
        expect.objectContaining({
          cypher: "MATCH (n:Task) RETURN n LIMIT 10",
          result_count: 1,
          success: true,
          duration_ms: expect.any(Number),
        })
      );
      expect(results).toHaveLength(1);
    });

    it("should truncate long cypher queries in traces", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      const longCypher = "MATCH (n) ".repeat(100);
      await traceableMemory.query(longCypher);

      const callArgs = mockTraceMiddleware.callTool.mock.calls[0];
      expect(callArgs[1].cypher.length).toBeLessThanOrEqual(500);
    });

    it("should trace failed query calls", async () => {
      mockMemory.query.mockRejectedValue(new Error("Invalid Cypher syntax"));

      const traceableMemory = createTraceableMemory(validConfig);

      await expect(traceableMemory.query("INVALID CYPHER")).rejects.toThrow(
        "Invalid Cypher syntax"
      );

      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.query",
        expect.objectContaining({
          success: false,
          error: "Invalid Cypher syntax",
        })
      );
    });
  });

  // =========================================================================
  // 5. search Tracing Tests
  // =========================================================================

  describe("search tracing", () => {
    it("should trace successful search calls", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      const input = {
        label: "Task" as const,
        group_id: "allura-test",
        workspace_id: "workspace-test",
        principal_id: "agent-test",
        props: { status: "complete" },
      };

      const results = await traceableMemory.search(input);

      expect(mockMemory.search).toHaveBeenCalledWith(input);
      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.search",
        expect.objectContaining({
          label: "Task",
          group_id: "allura-test",
          result_count: 1,
          success: true,
          duration_ms: expect.any(Number),
        })
      );
      expect(results).toHaveLength(1);
    });

    it("should trace failed search calls", async () => {
      mockMemory.search.mockRejectedValue(new Error("Search index unavailable"));

      const traceableMemory = createTraceableMemory(validConfig);

      await expect(
        traceableMemory.search({
          label: "Task" as const,
          group_id: "allura-test",
          workspace_id: "workspace-test",
          principal_id: "agent-test",
        })
      ).rejects.toThrow("Search index unavailable");

      expect(mockTraceMiddleware.callTool).toHaveBeenCalledWith(
        "memory.search",
        expect.objectContaining({
          success: false,
          error: "Search index unavailable",
        })
      );
    });
  });

  // =========================================================================
  // 6. Session Lifecycle Tests
  // =========================================================================

  describe("session lifecycle", () => {
    it("should delegate startSession to TraceMiddleware", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.startSession("custom-workflow");

      expect(mockTraceMiddleware.startSession).toHaveBeenCalledWith("custom-workflow");
    });

    it("should use config workflowId when startSession called without arg", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.startSession();

      expect(mockTraceMiddleware.startSession).toHaveBeenCalledWith(validConfig.workflowId);
    });

    it("should delegate endSession to TraceMiddleware", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.endSession();

      expect(mockTraceMiddleware.endSession).toHaveBeenCalled();
    });

    it("should delegate logDecision to TraceMiddleware", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.logDecision("Made an architectural decision", 0.95);

      expect(mockTraceMiddleware.logDecision).toHaveBeenCalledWith(
        "Made an architectural decision",
        0.95
      );
    });

    it("should delegate logLearning to TraceMiddleware", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.logLearning("Learned about tracing patterns", 0.9);

      expect(mockTraceMiddleware.logLearning).toHaveBeenCalledWith(
        "Learned about tracing patterns",
        0.9
      );
    });

    it("should delegate flush to TraceMiddleware", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.flush();

      expect(mockTraceMiddleware.flush).toHaveBeenCalled();
    });

    it("should delegate destroy to TraceMiddleware", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.destroy();

      expect(mockTraceMiddleware.destroy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 7. Integration Tests
  // =========================================================================

  describe("integration", () => {
    it("should maintain correct call order for multiple operations", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.startSession();
      await traceableMemory.createEntity({
        label: "Task" as const,
        props: { title: "Task 1" },
        group_id: "allura-test",
      });
      await traceableMemory.createEntity({
        label: "Task" as const,
        props: { title: "Task 2" },
        group_id: "allura-test",
      });
      await traceableMemory.logDecision("Completed batch", 1.0);
      await traceableMemory.endSession();

      expect(mockTraceMiddleware.startSession).toHaveBeenCalledTimes(1);
      expect(mockMemory.createEntity).toHaveBeenCalledTimes(2);
      expect(mockTraceMiddleware.logDecision).toHaveBeenCalledTimes(1);
      expect(mockTraceMiddleware.endSession).toHaveBeenCalledTimes(1);
    });

    it("should include duration_ms in all operation traces", async () => {
      const traceableMemory = createTraceableMemory(validConfig);

      await traceableMemory.createEntity({
        label: "Task" as const,
        props: { title: "Test" },
        group_id: "allura-test",
      });

      const callArgs = mockTraceMiddleware.callTool.mock.calls[0];
      expect(callArgs[1].duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof callArgs[1].duration_ms).toBe("number");
    });
  });
});
