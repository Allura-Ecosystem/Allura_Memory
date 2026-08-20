import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RuVixControlPlane } from "@/control-plane/ruvix";
import { closePool, getPool } from "./connection";
import {
  countTraces,
  getTraceById,
  getTracesByAgent,
  getTracesByType,
  logTrace,
  type TraceLog,
  TraceValidationError,
} from "./trace-logger";

/**
 * TraceLogger integration tests
 * Requires a running PostgreSQL instance.
 * Run with: RUN_E2E_TESTS=true bun vitest run src/lib/postgres/trace-logger.test.ts
 */
const shouldRunE2E = process.env.RUN_E2E_TESTS === "true";

describe.skipIf(!shouldRunE2E)("TraceLogger", () => {
  const testGroupId = "allura-test";
  const testAgentId = "agent-test-001";
  let originalSecret: string | undefined;

  beforeEach(async () => {
    // ControlPlane proof engine requires RUVIX_CONTROL_PLANE_SECRET
    originalSecret = process.env.RUVIX_CONTROL_PLANE_SECRET;
    process.env.RUVIX_CONTROL_PLANE_SECRET = "test-secret-key-for-ruvix-controlPlane-proof-engine-32chars";
    RuVixControlPlane.initializeControlPlane();

    // Ensure pool is ready
    const pool = getPool();
  });

  afterEach(() => {
    // Restore original RUVIX_CONTROL_PLANE_SECRET
    if (originalSecret !== undefined) {
      process.env.RUVIX_CONTROL_PLANE_SECRET = originalSecret;
    } else {
      delete process.env.RUVIX_CONTROL_PLANE_SECRET;
    }
  });

  afterEach(async () => {
    // Clean up test traces
    const pool = getPool();
    await pool.query(
      "DELETE FROM events WHERE group_id = $1 AND agent_id LIKE $2",
      [testGroupId, `${testAgentId}%`]
    );
  });

  describe("logTrace", () => {
    it("should log a valid trace", async () => {
      const trace: TraceLog = {
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "contribution",
        content: "Test trace content",
        confidence: 0.85,
      };

      const result = await logTrace(trace);

      expect(result.id).toBeDefined();
      expect(result.group_id).toBe(testGroupId);
      expect(result.agent_id).toBe(testAgentId);
      expect(result.event_type).toBe("trace.contribution");
      expect(result.metadata.confidence).toBe(0.85);
      expect(result.status).toBe("completed");
    });

    it("should reject empty group_id", async () => {
      const trace: TraceLog = {
        agent_id: testAgentId,
        group_id: "",
        trace_type: "contribution",
        content: "Test content",
        confidence: 0.9,
      };

      await expect(logTrace(trace)).rejects.toThrow(TraceValidationError);
    });

    it("should reject empty agent_id", async () => {
      const trace: TraceLog = {
        agent_id: "",
        group_id: testGroupId,
        trace_type: "contribution",
        content: "Test content",
        confidence: 0.9,
      };

      await expect(logTrace(trace)).rejects.toThrow(TraceValidationError);
    });

    it("should reject invalid trace_type", async () => {
      const trace = {
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "invalid-type" as any,
        content: "Test content",
        confidence: 0.9,
      };

      await expect(logTrace(trace)).rejects.toThrow(TraceValidationError);
    });

    it("should reject confidence < 0", async () => {
      const trace: TraceLog = {
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "contribution",
        content: "Test content",
        confidence: -0.1,
      };

      await expect(logTrace(trace)).rejects.toThrow(TraceValidationError);
    });

    it("should reject confidence > 1", async () => {
      const trace: TraceLog = {
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "contribution",
        content: "Test content",
        confidence: 1.5,
      };

      await expect(logTrace(trace)).rejects.toThrow(TraceValidationError);
    });

    it("should log all trace types", async () => {
      const traceTypes: Array<"contribution" | "decision" | "learning" | "error"> = [
        "contribution",
        "decision",
        "learning",
        "error",
      ];

      for (const traceType of traceTypes) {
        const trace: TraceLog = {
          agent_id: testAgentId,
          group_id: testGroupId,
          trace_type: traceType,
          content: `Test ${traceType}`,
          confidence: 0.8,
        };

        const result = await logTrace(trace);
        expect(result.event_type).toBe(`trace.${traceType}`);
      }
    });
  });

  describe("getTracesByAgent", () => {
    it("should return traces for specific agent", async () => {
      // Create test traces
      await logTrace({
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "contribution",
        content: "Trace 1",
        confidence: 0.9,
      });

      await logTrace({
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "decision",
        content: "Trace 2",
        confidence: 0.85,
      });

      const results = await getTracesByAgent(testAgentId, testGroupId, 10);

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].agent_id).toBe(testAgentId);
      expect(results.every((r) => r.group_id === testGroupId)).toBe(true);
    });

    it("should respect limit parameter", async () => {
      // Create 5 traces
      for (let i = 0; i < 5; i++) {
        await logTrace({
          agent_id: testAgentId,
          group_id: testGroupId,
          trace_type: "contribution",
          content: `Trace ${i}`,
          confidence: 0.8,
        });
      }

      const results = await getTracesByAgent(testAgentId, testGroupId, 2);
      expect(results.length).toBe(2);
    });

    it("should reject empty group_id", async () => {
      await expect(getTracesByAgent(testAgentId, "", 10)).rejects.toThrow(
        TraceValidationError
      );
    });
  });

  describe("getTracesByType", () => {
    it("should return traces of specific type", async () => {
      await logTrace({
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "decision",
        content: "Decision trace",
        confidence: 0.9,
      });

      await logTrace({
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "error",
        content: "Error trace",
        confidence: 0.5,
      });

      const decisionTraces = await getTracesByType("decision", testGroupId, 10);
      expect(decisionTraces.every((t) => t.event_type === "trace.decision")).toBe(true);
    });
  });

  describe("getTraceById", () => {
    it("should return trace by ID", async () => {
      const created = await logTrace({
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "contribution",
        content: "Test trace",
        confidence: 0.85,
      });

      const retrieved = await getTraceById(created.id, testGroupId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.agent_id).toBe(testAgentId);
    });

    it("should return null for non-existent ID", async () => {
      const result = await getTraceById(999999999, testGroupId);
      expect(result).toBeNull();
    });
  });

  describe("countTraces", () => {
    it("should count traces for group", async () => {
      const initialCount = await countTraces(testGroupId);

      await logTrace({
        agent_id: testAgentId,
        group_id: testGroupId,
        trace_type: "contribution",
        content: "Test",
        confidence: 0.8,
      });

      const newCount = await countTraces(testGroupId);
      expect(newCount).toBe(initialCount + 1);
    });
  });
});